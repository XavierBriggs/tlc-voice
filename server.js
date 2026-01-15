import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import fastifyFormBody from "@fastify/formbody";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "localhost";

// Your public URL (use ngrok or similar for local development)
const DOMAIN = process.env.NGROK_URL || process.env.DOMAIN || "localhost:8080";
const WS_URL = `wss://${DOMAIN}/ws`;

// OpenAI Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Use gpt-4o-mini for low latency - optimized for TTFT as per best practices
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Voice Agent Configuration
const WELCOME_GREETING =
  process.env.WELCOME_GREETING ||
  "Hello! I'm your TLC AI assistant. How can I help you today?";

const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  `You are a helpful, friendly AI voice assistant. 
Keep your responses concise and conversational - this is a phone call, not a text chat.
Aim for responses that are 1-3 sentences when possible.
Be natural and warm in your tone.
If you don't understand something, ask for clarification.`;

// TTS Configuration (Google is default, options: google, amazon, elevenlabs)
const TTS_PROVIDER = process.env.TTS_PROVIDER || "google";
const TTS_VOICE = process.env.TTS_VOICE || "en-US-Journey-F";
const TTS_LANGUAGE = process.env.TTS_LANGUAGE || "en-US";

// STT Configuration (deepgram recommended for better accuracy in noisy environments)
const STT_PROVIDER = process.env.STT_PROVIDER || "deepgram";
const STT_LANGUAGE = process.env.STT_LANGUAGE || "en-US";

// =============================================================================
// LATENCY TARGETS (from Twilio Best Practices Guide)
// https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents
// These are the target benchmarks for a well-optimized voice agent
// =============================================================================
const LATENCY_TARGETS = {
  // End-to-end targets
  mouthToEar: { target: 1115, upperLimit: 1400 }, // ms
  platformTurnGap: { target: 885, upperLimit: 1100 }, // ms

  // Component targets
  stt: { target: 350, upperLimit: 500 }, // ms
  llmTTFT: { target: 375, upperLimit: 750 }, // ms - Time to First Token
  ttsTTFB: { target: 100, upperLimit: 250 }, // ms - Time to First Byte
};

// =============================================================================
// SESSION & METRICS MANAGEMENT
// =============================================================================

// Store conversation history and metrics per call
const sessions = new Map();

/**
 * Initialize metrics tracking for a new turn
 */
function createTurnMetrics() {
  return {
    turnId: Date.now(),
    promptReceivedAt: null, // When we received the user's speech
    llmRequestStartedAt: null, // When we sent request to LLM
    llmFirstTokenAt: null, // When we received first token (TTFT)
    llmCompleteAt: null, // When LLM finished streaming
    firstTokenSentAt: null, // When we sent first token to TTS/Twilio
    totalTokens: 0,
    interrupted: false,
    interruptedAt: null,
  };
}

/**
 * Calculate and log latency metrics for a turn
 */
function calculateTurnLatency(metrics) {
  const results = {};

  // LLM Time to First Token (TTFT) - Critical metric
  if (metrics.llmRequestStartedAt && metrics.llmFirstTokenAt) {
    results.llmTTFT = metrics.llmFirstTokenAt - metrics.llmRequestStartedAt;
  }

  // LLM Total Generation Time
  if (metrics.llmRequestStartedAt && metrics.llmCompleteAt) {
    results.llmTotalTime = metrics.llmCompleteAt - metrics.llmRequestStartedAt;
  }

  // Time from prompt received to first token sent (our processing time)
  if (metrics.promptReceivedAt && metrics.firstTokenSentAt) {
    results.processingTime = metrics.firstTokenSentAt - metrics.promptReceivedAt;
  }

  // Platform Turn Gap estimate (prompt received to first audio would start)
  // Note: Actual TTS TTFB happens on Twilio's side with ConversationRelay
  if (metrics.promptReceivedAt && metrics.firstTokenSentAt) {
    results.estimatedPlatformGap = metrics.firstTokenSentAt - metrics.promptReceivedAt;
  }

  return results;
}

/**
 * Log latency metrics with target comparison
 */
function logLatencyMetrics(callSid, turnMetrics, latencyResults) {
  const { llmTTFT, processingTime } = latencyResults;

  console.log("\n" + "─".repeat(60));
  console.log(`📊 LATENCY METRICS - Turn ${turnMetrics.turnId}`);
  console.log("─".repeat(60));

  // LLM TTFT
  if (llmTTFT !== undefined) {
    const ttftStatus = getLatencyStatus(llmTTFT, LATENCY_TARGETS.llmTTFT);
    console.log(
      `   LLM TTFT:        ${llmTTFT}ms ${ttftStatus.emoji} (target: ${LATENCY_TARGETS.llmTTFT.target}ms)`
    );
  }

  // Processing Time
  if (processingTime !== undefined) {
    console.log(`   Processing:      ${processingTime}ms`);
  }

  // Token count
  console.log(`   Tokens:          ${turnMetrics.totalTokens}`);

  // Interruption status
  if (turnMetrics.interrupted) {
    console.log(`   ⚠️  Turn was interrupted by user`);
  }

  console.log("─".repeat(60) + "\n");

  return latencyResults;
}

/**
 * Get status emoji and level based on latency vs targets
 */
function getLatencyStatus(value, targets) {
  if (value <= targets.target) {
    return { emoji: "✅", level: "good" };
  } else if (value <= targets.upperLimit) {
    return { emoji: "⚠️", level: "warning" };
  } else {
    return { emoji: "❌", level: "critical" };
  }
}

/**
 * Aggregate and log session-level metrics when call ends
 */
function logSessionSummary(callSid, sessionData) {
  const { metrics, metadata } = sessionData;
  const turnMetrics = metrics.turns;

  if (turnMetrics.length === 0) return;

  // Calculate aggregates
  const llmTTFTs = turnMetrics
    .map((t) => t.latency?.llmTTFT)
    .filter((v) => v !== undefined);

  const processingTimes = turnMetrics
    .map((t) => t.latency?.processingTime)
    .filter((v) => v !== undefined);

  console.log("\n" + "═".repeat(60));
  console.log(`📈 SESSION SUMMARY - ${callSid}`);
  console.log("═".repeat(60));

  // Duration
  const duration = Date.now() - metadata.startTime;
  console.log(`   Duration:        ${Math.round(duration / 1000)}s`);
  console.log(`   Total Turns:     ${turnMetrics.length}`);
  console.log(`   Interruptions:   ${metrics.interruptions}`);

  // LLM TTFT Statistics
  if (llmTTFTs.length > 0) {
    const sorted = [...llmTTFTs].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    const avg = Math.round(llmTTFTs.reduce((a, b) => a + b, 0) / llmTTFTs.length);

    console.log(`\n   LLM TTFT Stats:`);
    console.log(`     Average:       ${avg}ms`);
    console.log(`     P50:           ${p50}ms`);
    console.log(`     P95:           ${p95}ms`);
    console.log(`     Target:        ${LATENCY_TARGETS.llmTTFT.target}ms`);
  }

  // Processing Time Statistics
  if (processingTimes.length > 0) {
    const sorted = [...processingTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    const avg = Math.round(
      processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
    );

    console.log(`\n   Processing Stats:`);
    console.log(`     Average:       ${avg}ms`);
    console.log(`     P50:           ${p50}ms`);
    console.log(`     P95:           ${p95}ms`);
  }

  console.log("═".repeat(60) + "\n");
}

// =============================================================================
// OPENAI INTEGRATION WITH LATENCY TRACKING
// =============================================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/**
 * Get AI response with streaming for lower latency
 * Tracks TTFT and other metrics per best practices
 */
async function streamAIResponse(conversation, ws, turnMetrics) {
  try {
    // Record when we start the LLM request
    turnMetrics.llmRequestStartedAt = Date.now();

    const stream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: conversation,
      stream: true,
      max_tokens: 500,
      temperature: 0.7,
    });

    let fullResponse = "";
    let tokenBuffer = "";
    let isFirstToken = true;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      const finishReason = chunk.choices[0]?.finish_reason;

      if (content) {
        // Track first token timing (TTFT - critical metric)
        if (isFirstToken) {
          turnMetrics.llmFirstTokenAt = Date.now();
          isFirstToken = false;
        }

        fullResponse += content;
        tokenBuffer += content;
        turnMetrics.totalTokens++;

        // Best Practice: Stream tokens immediately for lower latency
        // Send at natural boundaries or when buffer has enough content
        if (
          tokenBuffer.includes(".") ||
          tokenBuffer.includes("!") ||
          tokenBuffer.includes("?") ||
          tokenBuffer.includes(",") ||
          tokenBuffer.length > 15
        ) {
          // Track when we send the first token to Twilio
          if (!turnMetrics.firstTokenSentAt) {
            turnMetrics.firstTokenSentAt = Date.now();
          }

          ws.send(
            JSON.stringify({
              type: "text",
              token: tokenBuffer,
              last: false,
            })
          );

          tokenBuffer = "";
        }
      }

      // When stream is complete, send final token with last: true
      if (finishReason === "stop") {
        turnMetrics.llmCompleteAt = Date.now();

        if (tokenBuffer.length > 0) {
          if (!turnMetrics.firstTokenSentAt) {
            turnMetrics.firstTokenSentAt = Date.now();
          }
          ws.send(
            JSON.stringify({
              type: "text",
              token: tokenBuffer,
              last: true,
            })
          );
        } else {
          // Send empty last token to signal completion
          ws.send(
            JSON.stringify({
              type: "text",
              token: "",
              last: true,
            })
          );
        }
      }
    }

    return fullResponse;
  } catch (error) {
    console.error("[ERROR] OpenAI streaming error:", error);

    // Track error timing
    turnMetrics.llmCompleteAt = Date.now();
    turnMetrics.error = error.message;

    ws.send(
      JSON.stringify({
        type: "text",
        token: "I'm sorry, I encountered an error. Could you please repeat that?",
        last: true,
      })
    );
    return null;
  }
}

// =============================================================================
// INTERRUPTION HANDLING (Best Practice: Graceful Aborts)
// =============================================================================

/**
 * Handle when user interrupts the AI mid-speech
 * Best Practice: Truncate conversation history to what was actually heard
 */
function handleInterrupt(callSid, utteranceUntilInterrupt, durationMs) {
  const sessionData = sessions.get(callSid);
  if (!sessionData) return;

  // Track interruption in metrics
  sessionData.metrics.interruptions++;

  // Mark current turn as interrupted
  const currentTurn = sessionData.metrics.turns[sessionData.metrics.turns.length - 1];
  if (currentTurn) {
    currentTurn.interrupted = true;
    currentTurn.interruptedAt = Date.now();
    currentTurn.utteranceUntilInterrupt = utteranceUntilInterrupt;
    currentTurn.durationUntilInterruptMs = durationMs;
  }

  const conversation = sessionData.conversation;

  // Find the last assistant message that contains the interrupted text
  const interruptedIndex = conversation.findLastIndex(
    (msg) =>
      msg.role === "assistant" && msg.content.includes(utteranceUntilInterrupt)
  );

  if (interruptedIndex !== -1) {
    // Truncate the message to what was actually spoken
    const interruptedMessage = conversation[interruptedIndex];
    const interruptPosition =
      interruptedMessage.content.indexOf(utteranceUntilInterrupt);
    const truncatedContent = interruptedMessage.content.substring(
      0,
      interruptPosition + utteranceUntilInterrupt.length
    );

    conversation[interruptedIndex] = {
      ...interruptedMessage,
      content: truncatedContent,
    };

    // Remove any assistant messages after the interruption point
    sessionData.conversation = conversation.filter(
      (msg, index) => !(index > interruptedIndex && msg.role === "assistant")
    );

    sessions.set(callSid, sessionData);
    console.log(
      `[INTERRUPT] Gracefully aborted. Truncated at: "${truncatedContent.slice(-50)}..."`
    );
  }
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const fastify = Fastify({
  logger: false, // We handle our own logging for latency metrics
});

// Register plugins
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);

// =============================================================================
// HTTP ROUTES
// =============================================================================

/**
 * Health check endpoint with latency targets info
 */
fastify.get("/health", async (request, reply) => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    latencyTargets: LATENCY_TARGETS,
    activeSessions: sessions.size,
  };
});

/**
 * Metrics endpoint - returns aggregate metrics from active sessions
 */
fastify.get("/metrics", async (request, reply) => {
  const sessionMetrics = [];

  for (const [callSid, sessionData] of sessions) {
    const { metrics, metadata } = sessionData;
    const duration = Date.now() - metadata.startTime;

    const llmTTFTs = metrics.turns
      .map((t) => t.latency?.llmTTFT)
      .filter((v) => v !== undefined);

    sessionMetrics.push({
      callSid,
      duration: Math.round(duration / 1000),
      turns: metrics.turns.length,
      interruptions: metrics.interruptions,
      avgLlmTTFT: llmTTFTs.length
        ? Math.round(llmTTFTs.reduce((a, b) => a + b, 0) / llmTTFTs.length)
        : null,
    });
  }

  return {
    activeSessions: sessions.size,
    sessions: sessionMetrics,
    targets: LATENCY_TARGETS,
  };
});

/**
 * TwiML endpoint - returns instructions for Twilio to connect to ConversationRelay
 * Best Practices applied:
 * - interruptible="true" for natural conversation flow
 * - dtmfDetection for handling keypad input
 * - Optimized provider selection
 */
fastify.all("/twiml", async (request, reply) => {
  console.log("[TWIML] Generating TwiML response");

  // Best Practice: Use speech hints for domain-specific terminology
  const speechHints = process.env.SPEECH_HINTS || "";

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
      ${speechHints ? `speechHints="${speechHints}"` : ""}
    />
  </Connect>
</Response>`;

  reply.type("text/xml").send(twiml);
});

/**
 * Alternative voice endpoint for Twilio webhook
 */
fastify.all("/voice", async (request, reply) => {
  return reply.redirect("/twiml");
});

// =============================================================================
// WEBSOCKET HANDLER WITH LATENCY TRACKING
// =============================================================================

fastify.register(async function (fastify) {
  fastify.get("/ws", { websocket: true }, (ws, request) => {
    console.log("[WS] New WebSocket connection established");

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          // =================================================================
          // SETUP - Initialize session with metrics tracking
          // =================================================================
          case "setup":
            const callSid = message.callSid;
            console.log("\n" + "═".repeat(60));
            console.log("📞 NEW CALL INITIALIZED");
            console.log("═".repeat(60));
            console.log(`   CallSid:    ${callSid}`);
            console.log(`   From:       ${message.from}`);
            console.log(`   To:         ${message.to}`);
            console.log(`   Direction:  ${message.direction}`);
            console.log("═".repeat(60) + "\n");

            ws.callSid = callSid;
            sessions.set(callSid, {
              conversation: [{ role: "system", content: SYSTEM_PROMPT }],
              metadata: {
                from: message.from,
                to: message.to,
                direction: message.direction,
                startTime: Date.now(),
                customParameters: message.customParameters,
              },
              metrics: {
                turns: [],
                interruptions: 0,
              },
            });
            break;

          // =================================================================
          // PROMPT - Track latency from prompt receipt through response
          // =================================================================
          case "prompt":
            const promptTime = Date.now();
            console.log(`[PROMPT] User said: "${message.voicePrompt}"`);

            const sessionData = sessions.get(ws.callSid);
            if (!sessionData) {
              console.error("[ERROR] No session found for callSid:", ws.callSid);
              break;
            }

            // Create metrics for this turn
            const turnMetrics = createTurnMetrics();
            turnMetrics.promptReceivedAt = promptTime;
            turnMetrics.userInput = message.voicePrompt;

            // Add user message to conversation history
            sessionData.conversation.push({
              role: "user",
              content: message.voicePrompt,
            });

            // Stream AI response with latency tracking
            const response = await streamAIResponse(
              sessionData.conversation,
              ws,
              turnMetrics
            );

            if (response) {
              // Store assistant response in conversation history
              sessionData.conversation.push({
                role: "assistant",
                content: response,
              });

              // Calculate and log latency metrics
              const latencyResults = calculateTurnLatency(turnMetrics);
              turnMetrics.latency = latencyResults;
              logLatencyMetrics(ws.callSid, turnMetrics, latencyResults);

              // Store turn metrics
              sessionData.metrics.turns.push(turnMetrics);
              sessions.set(ws.callSid, sessionData);
            }
            break;

          // =================================================================
          // INTERRUPT - Handle graceful abort per best practices
          // =================================================================
          case "interrupt":
            console.log(
              `[INTERRUPT] User interrupted at: "${message.utteranceUntilInterrupt}"`
            );
            console.log(
              `[INTERRUPT] Duration until interrupt: ${message.durationUntilInterruptMs}ms`
            );
            handleInterrupt(
              ws.callSid,
              message.utteranceUntilInterrupt,
              message.durationUntilInterruptMs
            );
            break;

          // =================================================================
          // DTMF - Handle keypad input
          // =================================================================
          case "dtmf":
            console.log(`[DTMF] User pressed: ${message.digit}`);

            // Example: Press 0 to end call
            if (message.digit === "0") {
              ws.send(
                JSON.stringify({
                  type: "text",
                  token: "Thank you for calling. Goodbye!",
                  last: true,
                })
              );
              setTimeout(() => {
                ws.send(JSON.stringify({ type: "end" }));
              }, 3000);
            }
            break;

          // =================================================================
          // ERROR - Log errors for debugging
          // =================================================================
          case "error":
            console.error(
              "[ERROR] ConversationRelay error:",
              message.description
            );

            // Track error in session metrics
            const errorSession = sessions.get(ws.callSid);
            if (errorSession) {
              if (!errorSession.metrics.errors) {
                errorSession.metrics.errors = [];
              }
              errorSession.metrics.errors.push({
                timestamp: Date.now(),
                description: message.description,
              });
            }
            break;

          default:
            console.log("[UNKNOWN] Unknown message type:", message.type);
        }
      } catch (error) {
        console.error("[ERROR] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("[WS] WebSocket connection closed for call:", ws.callSid);

      // Log session summary with latency metrics
      if (ws.callSid) {
        const sessionData = sessions.get(ws.callSid);
        if (sessionData) {
          logSessionSummary(ws.callSid, sessionData);
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
    // Validate required configuration
    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY is required. Set it in your .env file.");
      process.exit(1);
    }

    await fastify.listen({ port: PORT, host: "0.0.0.0" });

    console.log("\n" + "═".repeat(60));
    console.log("🚀 Twilio ConversationRelay Voice Agent Started!");
    console.log("═".repeat(60));
    console.log(`\n📡 Server running at:`);
    console.log(`   Local:     http://${HOST}:${PORT}`);
    console.log(`   WebSocket: ws://${HOST}:${PORT}/ws`);
    console.log(`   Metrics:   http://${HOST}:${PORT}/metrics`);
    console.log(`\n🔗 Configure your Twilio phone number webhook to:`);
    console.log(`   https://${DOMAIN}/twiml`);
    console.log(`\n📊 Latency Targets (from Twilio Best Practices):`);
    console.log(`   LLM TTFT:     ${LATENCY_TARGETS.llmTTFT.target}ms (upper: ${LATENCY_TARGETS.llmTTFT.upperLimit}ms)`);
    console.log(`   TTS TTFB:     ${LATENCY_TARGETS.ttsTTFB.target}ms (upper: ${LATENCY_TARGETS.ttsTTFB.upperLimit}ms)`);
    console.log(`   Platform Gap: ${LATENCY_TARGETS.platformTurnGap.target}ms (upper: ${LATENCY_TARGETS.platformTurnGap.upperLimit}ms)`);
    console.log("\n" + "═".repeat(60) + "\n");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();
