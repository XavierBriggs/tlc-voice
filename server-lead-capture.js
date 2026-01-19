/**
 * TLC Lead Capture Voice Agent Server
 * 
 * Enhanced ConversationRelay server for manufactured home financing lead capture.
 * Integrates:
 * - Conversation state machine for guided flow
 * - OpenAI function calling for structured data extraction
 * - Hestia API integration for lead management
 * - Extended metrics for lead capture analytics
 */

import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import fastifyFormBody from "@fastify/formbody";
import OpenAI from "openai";
import dotenv from "dotenv";

// Lead capture modules
import { 
  createSessionState, 
  advancePhase, 
  handleInterruption as handleStateInterruption,
  getSessionSummary,
  PHASES,
} from "./lib/state-machine.js";
import { TOOLS, getToolsForPhase } from "./lib/tools.js";
import { processToolCalls } from "./lib/tool-executor.js";
import { buildSystemPrompt, getWelcomeGreeting, getClosingMessage } from "./lib/prompts.js";
import { determineAttribution, buildSourceFromCall } from "./lib/attribution.js";
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

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-nano";

// Voice Agent Configuration for Lead Capture
const WELCOME_GREETING = process.env.WELCOME_GREETING || 
  "Hi there! This is TLC's virtual assistant thank you for calling about manufactured home financing. Is now a good time to chat for a few minutes?";

// TTS/STT Configuration
const TTS_PROVIDER = process.env.TTS_PROVIDER || "google";
const TTS_VOICE = process.env.TTS_VOICE || "en-US-Journey-F";
const TTS_LANGUAGE = process.env.TTS_LANGUAGE || "en-US";
const STT_PROVIDER = process.env.STT_PROVIDER || "deepgram";
const STT_LANGUAGE = process.env.STT_LANGUAGE || "en-US";

// Speech hints for manufactured home terminology
const SPEECH_HINTS = process.env.SPEECH_HINTS || 
  "manufactured,modular,single wide,double wide,mobile home,HUD,septic,foundation,TLC,prequalified,prequalification";

// Hestia API Configuration
const HESTIA_MODE = process.env.HESTIA_MODE || "mock"; // 'mock' or 'live'

// =============================================================================
// INITIALIZATION
// =============================================================================

const sessions = new Map();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const hestiaClient = createHestiaClient({ mode: HESTIA_MODE, verbose: true });

// =============================================================================
// OPENAI INTEGRATION WITH FUNCTION CALLING
// =============================================================================

/**
 * Get AI response with streaming and function calling support
 */
async function streamAIResponseWithTools(state, ws, turnMetrics) {
  try {
    // Build the dynamic system prompt based on current state
    const systemPrompt = buildSystemPrompt(state);
    
    // Build conversation with system prompt and history
    const conversation = [
      { role: "system", content: systemPrompt },
      ...state.collectedData._conversationHistory || [],
    ];
    
    // Get tools relevant to current phase
    const phaseTools = getToolsForPhase(state.phase);
    
    turnMetrics.llmRequestStartedAt = Date.now();
    
    const requestParams = {
      model: OPENAI_MODEL,
      messages: conversation,
      stream: true,
      max_tokens: 500,
      temperature: 0,
    };
    
    // Add tools if available for this phase
    if (phaseTools.length > 0) {
      requestParams.tools = phaseTools;
      requestParams.tool_choice = "auto";
    }
    
    const stream = await openai.chat.completions.create(requestParams);
    
    let fullResponse = "";
    let tokenBuffer = "";
    let isFirstToken = true;
    let toolCalls = [];
    let currentToolCall = null;
    
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;
      
      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            if (!toolCalls[toolCallDelta.index]) {
              toolCalls[toolCallDelta.index] = {
                id: toolCallDelta.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              };
            }
            if (toolCallDelta.function?.name) {
              toolCalls[toolCallDelta.index].function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              toolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }
      
      // Handle content streaming
      if (delta?.content) {
        if (isFirstToken) {
          turnMetrics.llmFirstTokenAt = Date.now();
          isFirstToken = false;
        }
        
        fullResponse += delta.content;
        tokenBuffer += delta.content;
        turnMetrics.totalTokens++;
        
        // Stream at natural boundaries for low latency
        if (
          tokenBuffer.includes(".") ||
          tokenBuffer.includes("!") ||
          tokenBuffer.includes("?") ||
          tokenBuffer.includes(",") ||
          tokenBuffer.length > 8
        ) {
          if (!turnMetrics.firstTokenSentAt) {
            turnMetrics.firstTokenSentAt = Date.now();
          }
          
          ws.send(JSON.stringify({
            type: "text",
            token: tokenBuffer,
            last: false,
          }));
          
          tokenBuffer = "";
        }
      }
      
      // Handle finish
      if (finishReason === "stop" || finishReason === "tool_calls") {
        turnMetrics.llmCompleteAt = Date.now();
        
        // If there are tool calls, process them
        if (toolCalls.length > 0 && finishReason === "tool_calls") {
          turnMetrics.toolCalls = toolCalls.map(tc => tc.function.name);
          return { 
            type: "tool_calls", 
            toolCalls, 
            response: fullResponse,
            tokenBuffer,
          };
        }
        
        // Send remaining buffer
        if (tokenBuffer.length > 0) {
          if (!turnMetrics.firstTokenSentAt) {
            turnMetrics.firstTokenSentAt = Date.now();
          }
          ws.send(JSON.stringify({
            type: "text",
            token: tokenBuffer,
            last: true,
          }));
        } else {
          ws.send(JSON.stringify({
            type: "text",
            token: "",
            last: true,
          }));
        }
      }
    }
    
    return { type: "complete", response: fullResponse };
    
  } catch (error) {
    console.error("[ERROR] OpenAI streaming error:", error);
    turnMetrics.llmCompleteAt = Date.now();
    turnMetrics.error = error.message;
    
    ws.send(JSON.stringify({
      type: "text",
      token: "I'm sorry, I encountered an error. Could you please repeat that?",
      last: true,
    }));
    
    return { type: "error", error: error.message };
  }
}

/**
 * Process a conversation turn with tool calling loop
 */
async function processConversationTurn(userMessage, state, ws, turnMetrics) {
  // Initialize conversation history if not exists
  if (!state.collectedData._conversationHistory) {
    state.collectedData._conversationHistory = [];
  }
  
  // IMPORTANT: Advance phase at START of turn if current phase is complete
  // This ensures we don't get stuck in phases with no tools (like welcome)
  state = advancePhase(state);
  console.log(`[PHASE] Current phase: ${state.phase}`);
  
  // Add user message to history
  state.collectedData._conversationHistory.push({
    role: "user",
    content: userMessage,
  });
  
  // Track questions asked
  state.questionsAsked++;
  
  let result = await streamAIResponseWithTools(state, ws, turnMetrics);
  let loopCount = 0;
  const maxLoops = 5; // Prevent infinite tool call loops
  
  // Tool calling loop
  while (result.type === "tool_calls" && loopCount < maxLoops) {
    loopCount++;
    console.log(`[TOOL-LOOP] Processing ${result.toolCalls.length} tool calls (loop ${loopCount})`);
    
    // Process tool calls
    const { state: newState, results, responseHint, shouldEndCall } = 
      await processToolCalls(result.toolCalls, state, hestiaClient);
    
    state = newState;
    
    // Track fields collected
    for (const tc of result.toolCalls) {
      turnMetrics.fieldsCollected.push(tc.function.name);
    }
    
    // Add tool results to conversation
    state.collectedData._conversationHistory.push({
      role: "assistant",
      content: result.response || null,
      tool_calls: result.toolCalls,
    });
    
    // Add tool results
    for (const toolResult of results) {
      state.collectedData._conversationHistory.push({
        role: "tool",
        tool_call_id: toolResult.tool_call_id,
        content: toolResult.output,
      });
    }
    
    // Handle end of call
    if (shouldEndCall) {
      const closingMessage = getClosingMessage(state);
      
      // Send any buffered content first
      if (result.tokenBuffer) {
        ws.send(JSON.stringify({
          type: "text",
          token: result.tokenBuffer + " " + closingMessage,
          last: true,
        }));
      } else {
        ws.send(JSON.stringify({
          type: "text",
          token: closingMessage,
          last: true,
        }));
      }
      
      // Schedule call end
      setTimeout(() => {
        ws.send(JSON.stringify({ type: "end" }));
      }, 5000);
      
      return { state, ended: true };
    }
    
    // Advance phase if needed
    state = advancePhase(state);
    
    // Get next response (may trigger more tool calls)
    result = await streamAIResponseWithTools(state, ws, turnMetrics);
  }
  
  // Add final response to history
  if (result.response) {
    state.collectedData._conversationHistory.push({
      role: "assistant",
      content: result.response,
    });
  }
  
  return { state, ended: false };
}

// =============================================================================
// INTERRUPTION HANDLING
// =============================================================================

function handleInterrupt(callSid, utteranceUntilInterrupt, durationMs) {
  const sessionData = sessions.get(callSid);
  if (!sessionData) return;
  
  // Track interruption in metrics
  sessionData.metrics.interruptions++;
  
  // Update state machine
  handleStateInterruption(sessionData.state, utteranceUntilInterrupt);
  
  // Mark current turn as interrupted
  const currentTurn = sessionData.metrics.turns[sessionData.metrics.turns.length - 1];
  if (currentTurn) {
    currentTurn.interrupted = true;
    currentTurn.interruptedAt = Date.now();
    currentTurn.utteranceUntilInterrupt = utteranceUntilInterrupt;
    currentTurn.durationUntilInterruptMs = durationMs;
  }
  
  // Truncate conversation history
  const history = sessionData.state.collectedData._conversationHistory;
  if (history && history.length > 0) {
    const lastAssistantIndex = history.findLastIndex(msg => msg.role === "assistant");
    if (lastAssistantIndex !== -1 && history[lastAssistantIndex].content) {
      const content = history[lastAssistantIndex].content;
      const interruptPos = content.indexOf(utteranceUntilInterrupt);
      if (interruptPos !== -1) {
        history[lastAssistantIndex].content = content.substring(
          0, 
          interruptPos + utteranceUntilInterrupt.length
        );
      }
    }
  }
  
  sessions.set(callSid, sessionData);
  console.log(`[INTERRUPT] Gracefully handled. Phase: ${sessionData.state.phase}`);
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

fastify.get("/health", async (request, reply) => {
  return {
    status: "ok",
    mode: "lead_capture",
    timestamp: new Date().toISOString(),
    hestiaMode: HESTIA_MODE,
    activeSessions: sessions.size,
  };
});

fastify.get("/metrics", async (request, reply) => {
  // Get aggregate metrics
  const aggregates = getAggregateMetrics();
  
  // Get active session metrics
  const activeSessions = [];
  for (const [callSid, sessionData] of sessions) {
    const { state, metrics, metadata } = sessionData;
    const duration = Date.now() - (metadata?.startTime || state?.startTime || Date.now());
    
    activeSessions.push({
      callSid,
      phase: state?.phase,
      prequalified: state?.prequalified || false,
      fieldsCollected: state?.fieldsCollected || 0,
      questionsAsked: state?.questionsAsked || 0,
      duration: Math.round(duration / 1000),
      turns: metrics?.turns?.length || 0,
      entrypoint: state?.collectedData?.source?.entrypoint,
    });
  }
  
  return {
    ...aggregates,
    active_sessions: activeSessions,
  };
});

// Debug endpoint for Hestia data
fastify.get("/debug/leads", async (request, reply) => {
  if (HESTIA_MODE !== "mock") {
    return { error: "Only available in mock mode" };
  }
  
  return {
    leads: hestiaClient.getAllLeads(),
    stats: hestiaClient.getStats(),
  };
});

// TwiML endpoint
fastify.all("/twiml", async (request, reply) => {
  console.log("[TWIML] Generating lead capture TwiML response");
  
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
    console.log("[WS] New WebSocket connection established");
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          // =================================================================
          // SETUP - Initialize session with state machine
          // =================================================================
          case "setup": {
            const callSid = message.callSid;
            console.log("\n" + "═".repeat(60));
            console.log("📞 NEW LEAD CAPTURE CALL");
            console.log("═".repeat(60));
            console.log(`   CallSid:    ${callSid}`);
            console.log(`   From:       ${message.from}`);
            console.log(`   To:         ${message.to}`);
            console.log(`   Direction:  ${message.direction}`);
            
            // Determine attribution from dialed number
            const attribution = await determineAttribution(message.to, hestiaClient);
            console.log(`   Entrypoint: ${attribution.entrypoint}`);
            if (attribution.dealer_id) {
              console.log(`   Dealer:     ${attribution.dealer_id}`);
            }
            console.log("═".repeat(60) + "\n");
            
            // Create session state
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
            
            // NOTE: Lead creation is deferred until minimum fields are collected
            // (consent, name, phone, email, preferred_contact)
            // This happens in syncLeadToHestia() after collect_preferred_contact
            // The voice_call_started event will be logged along with partial_lead_created
            break;
          }
          
          // =================================================================
          // PROMPT - Process user speech with tool calling
          // =================================================================
          case "prompt": {
            const promptTime = Date.now();
            console.log(`[PROMPT] User said: "${message.voicePrompt}"`);
            
            const sessionData = sessions.get(ws.callSid);
            if (!sessionData) {
              console.error("[ERROR] No session found for callSid:", ws.callSid);
              break;
            }
            
            // Create turn metrics
            const turnMetrics = createTurnMetrics();
            turnMetrics.promptReceivedAt = promptTime;
            turnMetrics.userInput = message.voicePrompt;
            
            // Process the conversation turn
            const { state: newState, ended } = await processConversationTurn(
              message.voicePrompt,
              sessionData.state,
              ws,
              turnMetrics
            );
            
            sessionData.state = newState;
            
            // Calculate and log latency
            const latencyResults = calculateTurnLatency(turnMetrics);
            turnMetrics.latency = latencyResults;
            logTurnMetrics(ws.callSid, turnMetrics, latencyResults);
            
            // Store turn metrics
            sessionData.metrics.turns.push(turnMetrics);
            sessions.set(ws.callSid, sessionData);
            
            // Log state summary
            const summary = getSessionSummary(newState);
            console.log(`[STATE] Phase: ${summary.phase}, Fields: ${summary.fieldsCollected}, Prequalified: ${summary.prequalified}`);
            break;
          }
          
          // =================================================================
          // INTERRUPT - Handle graceful abort
          // =================================================================
          case "interrupt": {
            console.log(`[INTERRUPT] User interrupted at: "${message.utteranceUntilInterrupt}"`);
            console.log(`[INTERRUPT] Duration: ${message.durationUntilInterruptMs}ms`);
            handleInterrupt(
              ws.callSid,
              message.utteranceUntilInterrupt,
              message.durationUntilInterruptMs
            );
            break;
          }
          
          // =================================================================
          // DTMF - Handle keypad input
          // =================================================================
          case "dtmf": {
            console.log(`[DTMF] User pressed: ${message.digit}`);
            
            const sessionData = sessions.get(ws.callSid);
            
            // 0 = End call
            if (message.digit === "0") {
              const closingMessage = sessionData?.state 
                ? getClosingMessage(sessionData.state)
                : "Thank you for calling. Goodbye!";
              
              ws.send(JSON.stringify({
                type: "text",
                token: closingMessage,
                last: true,
              }));
              
              setTimeout(() => {
                ws.send(JSON.stringify({ type: "end" }));
              }, 4000);
            }
            
            // 9 = Transfer to agent (placeholder)
            if (message.digit === "9") {
              ws.send(JSON.stringify({
                type: "text",
                token: "I'll transfer you to a loan officer now. Please hold.",
                last: true,
              }));
              
              // Log transfer event
              if (sessionData?.state?.leadId && hestiaClient) {
                hestiaClient.logEvent(sessionData.state.leadId, {
                  event_type: 'voice_transfer_requested',
                  actor_type: 'applicant',
                  payload_json: { method: 'dtmf' },
                });
              }
            }
            break;
          }
          
          // =================================================================
          // ERROR - Log errors
          // =================================================================
          case "error": {
            console.error("[ERROR] ConversationRelay error:", message.description);
            
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
            console.log("[UNKNOWN] Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[ERROR] Error processing message:", error);
      }
    });
    
    ws.on("close", () => {
      console.log("[WS] Connection closed for call:", ws.callSid);
      
      if (ws.callSid) {
        const sessionData = sessions.get(ws.callSid);
        if (sessionData) {
          // Log session summary with lead metrics
          logSessionSummary(ws.callSid, sessionData);
          
          // Final Hestia sync
          if (sessionData.state?.leadId && hestiaClient) {
            const state = sessionData.state;
            
            // Log call end event
            hestiaClient.logEvent(state.leadId, {
              event_type: 'voice_call_ended',
              actor_type: 'system',
              payload_json: {
                final_phase: state.phase,
                prequalified: state.prequalified,
                fields_collected: state.fieldsCollected,
                questions_asked: state.questionsAsked,
                duration_ms: Date.now() - state.startTime,
              },
            });
            
            // Route lead if prequalified
            if (state.prequalified) {
              hestiaClient.routeLead(state.leadId).then(result => {
                if (result.success) {
                  console.log(`[HESTIA] Lead ${state.leadId} routed to dealer ${result.assigned_dealer_id}`);
                  
                  // Attempt delivery
                  hestiaClient.deliverLead(state.leadId).then(deliveryResult => {
                    if (deliveryResult.success) {
                      console.log(`[HESTIA] Lead ${state.leadId} delivered successfully`);
                    }
                  });
                }
              });
            }
          }
        }
        
        sessions.delete(ws.callSid);
      }
    });
    
    ws.on("error", (error) => {
      console.error("[WS] WebSocket error:", error);
    });
  });
});

// =============================================================================
// START SERVER
// =============================================================================

const start = async () => {
  try {
    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY is required. Set it in your .env file.");
      process.exit(1);
    }
    
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    
    console.log("\n" + "═".repeat(60));
    console.log("🏠 TLC Lead Capture Voice Agent Started!");
    console.log("═".repeat(60));
    console.log(`\n📡 Server running at:`);
    console.log(`   Local:     http://${HOST}:${PORT}`);
    console.log(`   WebSocket: ws://${HOST}:${PORT}/ws`);
    console.log(`   Metrics:   http://${HOST}:${PORT}/metrics`);
    console.log(`\n🔗 Configure your Twilio phone number webhook to:`);
    console.log(`   https://${DOMAIN}/twiml`);
    console.log(`\n⚙️  Configuration:`);
    console.log(`   Mode:         Lead Capture`);
    console.log(`   Hestia:       ${HESTIA_MODE}`);
    console.log(`   LLM:          ${OPENAI_MODEL}`);
    console.log(`   TTS:          ${TTS_PROVIDER} / ${TTS_VOICE}`);
    console.log(`   STT:          ${STT_PROVIDER}`);
    console.log(`\n📊 Latency Targets:`);
    console.log(`   LLM TTFT:     ${LATENCY_TARGETS.llmTTFT.target}ms (upper: ${LATENCY_TARGETS.llmTTFT.upperLimit}ms)`);
    console.log(`   Platform Gap: ${LATENCY_TARGETS.platformTurnGap.target}ms`);
    console.log("\n" + "═".repeat(60) + "\n");
    
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();
