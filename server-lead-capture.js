/**
 * TLC Lead Capture Voice Agent Server
 * 
 * Deterministic conversation flow with LLM-powered extraction.
 * Uses ConversationController for flow control, LLM only for data extraction.
 */

import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import fastifyFormBody from "@fastify/formbody";
import OpenAI from "openai";
import dotenv from "dotenv";

// Core modules
import { 
  createSessionState, 
  advancePhase, 
  handleInterruption as handleStateInterruption,
  getSessionSummary,
  setFieldValue,
  confirmField,
  PHASES,
} from "./lib/state-machine.js";
import { TOOLS } from "./lib/tools.js";
import { processToolCalls } from "./lib/tool-executor.js";
import { buildSystemPrompt, getWelcomeGreeting, getClosingMessage } from "./lib/prompts.js";
import { ConversationController } from "./lib/conversation-controller.js";
import { determineAttribution } from "./lib/attribution.js";
import { createHestiaClient } from "./api/hestia-client.js";
import { 
  createTurnMetrics, 
  calculateTurnLatency, 
  logTurnMetrics, 
  logSessionSummary,
  getAggregateMetrics,
  LATENCY_TARGETS,
} from "./lib/metrics.js";

dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "localhost";
const DOMAIN = process.env.NGROK_URL || process.env.DOMAIN || "localhost:8080";
const WS_URL = `wss://${DOMAIN}/ws`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-nano";

const WELCOME_GREETING = process.env.WELCOME_GREETING || 
  "Hey there! This is TLC's virtual assistant - we help folks get financing for manufactured homes. Do you have a couple minutes to chat?";

const TTS_PROVIDER = process.env.TTS_PROVIDER || "google";
const TTS_VOICE = process.env.TTS_VOICE || "en-US-Journey-F";
const TTS_LANGUAGE = process.env.TTS_LANGUAGE || "en-US";
const STT_PROVIDER = process.env.STT_PROVIDER || "deepgram";
const STT_LANGUAGE = process.env.STT_LANGUAGE || "en-US";

const SPEECH_HINTS = process.env.SPEECH_HINTS || 
  "manufactured,modular,single wide,double wide,mobile home,HUD,septic,foundation,TLC,prequalified,prequalification";

const HESTIA_MODE = process.env.HESTIA_MODE || "mock";

// =============================================================================
// INITIALIZATION
// =============================================================================

const sessions = new Map();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const hestiaClient = createHestiaClient({ mode: HESTIA_MODE, verbose: true });
const controller = new ConversationController();

// =============================================================================
// CONVERSATION FLOW
// =============================================================================

/**
 * Process a conversation turn using the deterministic controller
 */
async function processConversationTurn(userMessage, state, ws, turnMetrics) {
  // Initialize conversation history if needed
  if (!state.collectedData._conversationHistory) {
    state.collectedData._conversationHistory = [];
  }
  
  // Get the pending confirmation if any
  const pendingConfirmation = state._pendingConfirmation || null;
  
  // Add user message to history
  state.collectedData._conversationHistory.push({
    role: "user",
    content: userMessage,
  });
  
  state.questionsAsked++;
  
  // Step 1: Get what the controller says we should do
  let nextAction = controller.getNextAction(state);
  
  // Step 2: Call LLM to extract data from user message
  const systemPrompt = buildSystemPrompt(state, nextAction);
  
  const extractionResult = await extractWithLLM(
    systemPrompt, 
    state.collectedData._conversationHistory,
    turnMetrics
  );
  
  // Step 3: Process any tool calls (extractions)
  let infoResponse = null;
  let rejectedField = null;
  
  if (extractionResult.toolCalls && extractionResult.toolCalls.length > 0) {
    const toolResult = await processToolCalls(
      extractionResult.toolCalls,
      state,
      { hestiaClient, pendingConfirmation, currentAction: nextAction }
    );
    
    state = toolResult.state;
    infoResponse = toolResult.infoResponse;
    rejectedField = toolResult.rejectedField;
    
    // Track extracted fields
    turnMetrics.fieldsCollected = toolResult.fieldsExtracted.map(f => f.field);
    
    // Handle end call
    if (toolResult.shouldEndCall) {
      const closingMessage = getClosingMessage(state);
      sendMessage(ws, closingMessage, true);
      
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "end" }));
      }, 5000);
      
      return { state, ended: true };
    }
    
    // Add tool results to conversation history
    state.collectedData._conversationHistory.push({
      role: "assistant",
      content: null,
      tool_calls: extractionResult.toolCalls,
    });
    
    for (const result of toolResult.results) {
      state.collectedData._conversationHistory.push({
        role: "tool",
        tool_call_id: result.tool_call_id,
        content: result.output,
      });
    }
  }
  
  // Step 4: Advance phase if needed
  state = advancePhase(state);
  
  // Step 5: Get the NEXT action after processing
  nextAction = controller.getNextAction(state);
  
  // Step 6: Send the appropriate message(s)
  
  // 6a: If there's an info response (user asked a question), speak it first
  if (infoResponse) {
    sendMessage(ws, infoResponse, false);
    
    // Add to conversation history
    state.collectedData._conversationHistory.push({
      role: "assistant",
      content: infoResponse,
    });
    
    // Small pause, then continue with the question
  }
  
  // 6b: If user rejected a confirmation, send an apology
  if (rejectedField) {
    const apology = "Oh, sorry about that! Let me get that right.";
    sendMessage(ws, apology, false);
    
    state.collectedData._conversationHistory.push({
      role: "assistant",
      content: apology,
    });
  }
  
  // 6c: Handle completion
  if (nextAction.type === 'complete') {
    // Prequalification complete!
    sendMessage(ws, nextAction.message, true);
    
    // Mark prequalified and sync
    state.prequalified = true;
    state.prequalifiedAt = Date.now();
    state.phase = PHASES.PREQUALIFIED;
    
    if (hestiaClient && state.leadId) {
      await hestiaClient.setStatus(state.leadId, 'prequalified');
      await hestiaClient.logEvent(state.leadId, {
        event_type: 'voice_intake_completed',
        actor_type: 'ai',
        payload_json: {
          prequalified: true,
          fieldsCollected: state.fieldsCollected,
          fieldsConfirmed: state.fieldsConfirmed,
          duration_ms: Date.now() - state.startTime,
        },
      });
      
      // Trigger routing
      try {
        const routeResult = await hestiaClient.routeLead(state.leadId);
        if (routeResult?.success) {
          state.routed = true;
          state.assignedDealerId = routeResult.assigned_dealer_id;
        }
      } catch (e) {
        console.error('[HESTIA] Routing error:', e);
      }
    }
    
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "end" }));
    }, 5000);
    
    return { state, ended: true };
  }
  
  // 6d: Handle end call
  if (nextAction.type === 'end_call') {
    sendMessage(ws, nextAction.message, true);
    
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "end" }));
    }, 3000);
    
    return { state, ended: true };
  }
  
  // 6e: For 'confirm' or 'ask' actions, send the message
  sendMessage(ws, nextAction.message, true);
  
  // Track pending confirmation for next turn
  if (nextAction.type === 'confirm') {
    state._pendingConfirmation = {
      field: nextAction.field,
      value: nextAction.value,
    };
  } else {
    state._pendingConfirmation = null;
  }
  
  // Add assistant message to history
  state.collectedData._conversationHistory.push({
    role: "assistant",
    content: nextAction.message,
  });
  
  return { state, ended: false };
}

/**
 * Extract data from user message using LLM
 */
async function extractWithLLM(systemPrompt, conversationHistory, turnMetrics) {
  turnMetrics.llmRequestStartedAt = Date.now();
  
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
      tools: TOOLS,
      tool_choice: "required",  // Force LLM to always call a tool
      temperature: 0.3,  // Slight temperature for more natural responses
      max_tokens: 300,
    });
    
    turnMetrics.llmCompleteAt = Date.now();
    turnMetrics.totalTokens = response.usage?.total_tokens || 0;
    
    const message = response.choices[0]?.message;
    
    return {
      content: message?.content || null,
      toolCalls: message?.tool_calls || [],
    };
  } catch (error) {
    console.error("[LLM] Extraction error:", error);
    turnMetrics.llmCompleteAt = Date.now();
    turnMetrics.error = error.message;
    
    return {
      content: null,
      toolCalls: [],
      error: error.message,
    };
  }
}

/**
 * Send a text message to the WebSocket
 */
function sendMessage(ws, text, isLast = false) {
  ws.send(JSON.stringify({
    type: "text",
    token: text,
    last: isLast,
  }));
}

// =============================================================================
// INTERRUPTION HANDLING
// =============================================================================

function handleInterrupt(callSid, utteranceUntilInterrupt, durationMs) {
  const sessionData = sessions.get(callSid);
  if (!sessionData) return;
  
  sessionData.metrics.interruptions++;
  handleStateInterruption(sessionData.state, utteranceUntilInterrupt);
  
  const currentTurn = sessionData.metrics.turns[sessionData.metrics.turns.length - 1];
  if (currentTurn) {
    currentTurn.interrupted = true;
    currentTurn.interruptedAt = Date.now();
    currentTurn.utteranceUntilInterrupt = utteranceUntilInterrupt;
  }
  
  sessions.set(callSid, sessionData);
  console.log(`[INTERRUPT] Handled. Phase: ${sessionData.state.phase}`);
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const fastify = Fastify({ logger: false });
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

// =============================================================================
// HTTP ROUTES
// =============================================================================

fastify.get("/health", async () => ({
  status: "ok",
  mode: "lead_capture_v2",
  timestamp: new Date().toISOString(),
  hestiaMode: HESTIA_MODE,
  activeSessions: sessions.size,
}));

fastify.get("/metrics", async () => {
  const aggregates = getAggregateMetrics();
  const activeSessions = [];
  
  for (const [callSid, sessionData] of sessions) {
    const { state, metrics } = sessionData;
    activeSessions.push({
      callSid,
      phase: state?.phase,
      prequalified: state?.prequalified || false,
      fieldsCollected: state?.fieldsCollected || 0,
      fieldsConfirmed: state?.fieldsConfirmed || 0,
      turns: metrics?.turns?.length || 0,
    });
  }
  
  return { ...aggregates, active_sessions: activeSessions };
});

fastify.get("/debug/leads", async () => {
  if (HESTIA_MODE !== "mock") {
    return { error: "Only available in mock mode" };
  }
  return {
    leads: hestiaClient.getAllLeads(),
    stats: hestiaClient.getStats(),
  };
});

fastify.all("/twiml", async (request, reply) => {
  console.log("[TWIML] Generating TwiML response");
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay 
      url="${WS_URL}" 
      welcomeGreeting="${WELCOME_GREETING}"
      ttsProvider="${TTS_PROVIDER}"
      voice="${TTS_VOICE}"
      ttsLanguage="${TTS_LANGUAGE}"
      transcriptionProvider="${STT_PROVIDER}"
      transcriptionLanguage="${STT_LANGUAGE}"
      interruptible="true"
      dtmfDetection="true"
      speechHints="${SPEECH_HINTS}"
    />
  </Connect>
</Response>`;
  
  reply.type("text/xml").send(twiml);
});

fastify.all("/voice", async (request, reply) => {
  return reply.redirect("/twiml");
});

// =============================================================================
// WEBSOCKET HANDLER
// =============================================================================

fastify.register(async function (fastify) {
  fastify.get("/ws", { websocket: true }, (ws, request) => {
    console.log("[WS] New connection");
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case "setup": {
            const callSid = message.callSid;
            console.log("\n" + "═".repeat(60));
            console.log("📞 NEW LEAD CAPTURE CALL (V2)");
            console.log("═".repeat(60));
            console.log(`   CallSid: ${callSid}`);
            console.log(`   From:    ${message.from}`);
            console.log(`   To:      ${message.to}`);
            
            const attribution = await determineAttribution(message.to, hestiaClient);
            console.log(`   Entry:   ${attribution.entrypoint}`);
            console.log("═".repeat(60) + "\n");
            
            const state = createSessionState(callSid, {
              from: message.from,
              to: message.to,
              direction: message.direction,
              entrypoint: attribution.entrypoint,
              tracking: attribution.tracking,
              customParameters: message.customParameters,
            });
            
            ws.callSid = callSid;
            sessions.set(callSid, {
              state,
              metadata: {
                from: message.from,
                to: message.to,
                direction: message.direction,
                startTime: Date.now(),
              },
              metrics: {
                turns: [],
                interruptions: 0,
                errors: [],
              },
            });
            break;
          }
          
          case "prompt": {
            const promptTime = Date.now();
            console.log(`[PROMPT] "${message.voicePrompt}"`);
            
            const sessionData = sessions.get(ws.callSid);
            if (!sessionData) {
              console.error("[ERROR] No session for:", ws.callSid);
              break;
            }
            
            const turnMetrics = createTurnMetrics();
            turnMetrics.promptReceivedAt = promptTime;
            turnMetrics.userInput = message.voicePrompt;
            
            const { state: newState, ended } = await processConversationTurn(
              message.voicePrompt,
              sessionData.state,
              ws,
              turnMetrics
            );
            
            sessionData.state = newState;
            
            const latencyResults = calculateTurnLatency(turnMetrics);
            turnMetrics.latency = latencyResults;
            logTurnMetrics(ws.callSid, turnMetrics, latencyResults);
            
            sessionData.metrics.turns.push(turnMetrics);
            sessions.set(ws.callSid, sessionData);
            
            const summary = getSessionSummary(newState);
            console.log(`[STATE] Phase: ${summary.phase}, Collected: ${summary.fieldsCollected}, Confirmed: ${summary.fieldsConfirmed}, Prequalified: ${summary.prequalified}`);
            break;
          }
          
          case "interrupt": {
            console.log(`[INTERRUPT] "${message.utteranceUntilInterrupt}"`);
            handleInterrupt(ws.callSid, message.utteranceUntilInterrupt, message.durationUntilInterruptMs);
            break;
          }
          
          case "dtmf": {
            console.log(`[DTMF] ${message.digit}`);
            const sessionData = sessions.get(ws.callSid);
            
            if (message.digit === "0") {
              const closingMessage = sessionData?.state 
                ? getClosingMessage(sessionData.state)
                : "Thank you for calling. Goodbye!";
              sendMessage(ws, closingMessage, true);
              setTimeout(() => ws.send(JSON.stringify({ type: "end" })), 4000);
            }
            break;
          }
          
          case "error": {
            console.error("[ERROR]", message.description);
            const sessionData = sessions.get(ws.callSid);
            if (sessionData) {
              sessionData.metrics.errors.push({
                timestamp: Date.now(),
                description: message.description,
              });
            }
            break;
          }
          
          default:
            console.log("[UNKNOWN]", message.type);
        }
      } catch (error) {
        console.error("[ERROR] Message processing:", error);
      }
    });
    
    ws.on("close", () => {
      console.log("[WS] Closed:", ws.callSid);
      
      if (ws.callSid) {
        const sessionData = sessions.get(ws.callSid);
        if (sessionData) {
          logSessionSummary(ws.callSid, sessionData);
          
          if (sessionData.state?.leadId && hestiaClient) {
            const state = sessionData.state;
            
            hestiaClient.logEvent(state.leadId, {
              event_type: 'voice_call_ended',
              actor_type: 'system',
              payload_json: {
                final_phase: state.phase,
                prequalified: state.prequalified,
                fieldsCollected: state.fieldsCollected,
                fieldsConfirmed: state.fieldsConfirmed,
                duration_ms: Date.now() - state.startTime,
              },
            });
            
            if (state.prequalified && !state.routed) {
              hestiaClient.setStatus(state.leadId, 'prequalified').catch(console.error);
            }
          }
        }
        
        sessions.delete(ws.callSid);
      }
    });
    
    ws.on("error", (error) => {
      console.error("[WS] Error:", error);
    });
  });
});

// =============================================================================
// START SERVER
// =============================================================================

const start = async () => {
  if (!OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY required");
    process.exit(1);
  }
  
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  
  console.log("\n" + "═".repeat(60));
  console.log("🏠 TLC Lead Capture V2 - Deterministic Flow");
  console.log("═".repeat(60));
  console.log(`\n📡 Server: http://${HOST}:${PORT}`);
  console.log(`   WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`   Metrics: http://${HOST}:${PORT}/metrics`);
  console.log(`\n🔗 Webhook: https://${DOMAIN}/twiml`);
  console.log(`\n⚙️  Config:`);
  console.log(`   Hestia: ${HESTIA_MODE}`);
  console.log(`   LLM: ${OPENAI_MODEL}`);
  console.log(`   TTS: ${TTS_PROVIDER}/${TTS_VOICE}`);
  console.log(`   STT: ${STT_PROVIDER}`);
  console.log("\n" + "═".repeat(60) + "\n");
};

start();
