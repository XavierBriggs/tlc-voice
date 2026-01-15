/**
 * Extended Metrics Collector for Lead Capture Voice Agent
 * 
 * Builds on the existing latency tracking to add lead-specific metrics:
 * - Prequalification rate
 * - Drop-off by phase
 * - Questions asked per call
 * - Fields collected per call
 * - Entrypoint distribution
 */

import { PHASES } from './state-machine.js';

// =============================================================================
// LATENCY TARGETS (from Twilio Best Practices)
// =============================================================================

export const LATENCY_TARGETS = {
  mouthToEar: { target: 1115, upperLimit: 1400 },
  platformTurnGap: { target: 885, upperLimit: 1100 },
  stt: { target: 350, upperLimit: 500 },
  llmTTFT: { target: 375, upperLimit: 750 },
  ttsTTFB: { target: 100, upperLimit: 250 },
};

// =============================================================================
// AGGREGATE METRICS STORAGE
// =============================================================================

const aggregateMetrics = {
  // Session-level aggregates
  totalCalls: 0,
  completedCalls: 0,
  prequalifiedCalls: 0,
  doNotContactCalls: 0,
  
  // Phase drop-off tracking
  dropOffByPhase: {},
  
  // Entrypoint distribution
  callsByEntrypoint: {},
  
  // Field collection stats
  totalQuestionsAsked: 0,
  totalFieldsCollected: 0,
  
  // Timing metrics
  callDurations: [],
  timeToPrequalification: [],
  
  // Latency aggregates
  llmTTFTs: [],
  processingTimes: [],
  
  // Hourly buckets for time-series
  hourlyStats: {},
  
  // Reset timestamp
  resetAt: Date.now(),
};

// =============================================================================
// TURN METRICS
// =============================================================================

/**
 * Create metrics tracking for a new conversation turn
 */
export function createTurnMetrics() {
  return {
    turnId: Date.now(),
    promptReceivedAt: null,
    llmRequestStartedAt: null,
    llmFirstTokenAt: null,
    llmCompleteAt: null,
    firstTokenSentAt: null,
    totalTokens: 0,
    interrupted: false,
    interruptedAt: null,
    toolCalls: [],
    fieldsCollected: [],
  };
}

/**
 * Calculate latency metrics for a turn
 */
export function calculateTurnLatency(metrics) {
  const results = {};
  
  if (metrics.llmRequestStartedAt && metrics.llmFirstTokenAt) {
    results.llmTTFT = metrics.llmFirstTokenAt - metrics.llmRequestStartedAt;
  }
  
  if (metrics.llmRequestStartedAt && metrics.llmCompleteAt) {
    results.llmTotalTime = metrics.llmCompleteAt - metrics.llmRequestStartedAt;
  }
  
  if (metrics.promptReceivedAt && metrics.firstTokenSentAt) {
    results.processingTime = metrics.firstTokenSentAt - metrics.promptReceivedAt;
  }
  
  if (metrics.promptReceivedAt && metrics.firstTokenSentAt) {
    results.estimatedPlatformGap = metrics.firstTokenSentAt - metrics.promptReceivedAt;
  }
  
  return results;
}

/**
 * Get status indicator based on latency vs targets
 */
export function getLatencyStatus(value, targets) {
  if (value <= targets.target) {
    return { emoji: '✅', level: 'good' };
  } else if (value <= targets.upperLimit) {
    return { emoji: '⚠️', level: 'warning' };
  } else {
    return { emoji: '❌', level: 'critical' };
  }
}

// =============================================================================
// SESSION METRICS
// =============================================================================

/**
 * Create session-level metrics structure
 */
export function createSessionMetrics() {
  return {
    turns: [],
    interruptions: 0,
    errors: [],
    questionsAsked: 0,
    fieldsCollected: 0,
    toolCallCount: 0,
    entrypoint: null,
    finalPhase: null,
    prequalified: false,
    doNotContact: false,
  };
}

/**
 * Record session completion and update aggregates
 */
export function recordSessionComplete(sessionData) {
  const { metrics, metadata, state } = sessionData;
  
  // Increment counters
  aggregateMetrics.totalCalls++;
  aggregateMetrics.completedCalls++;
  
  if (state?.prequalified) {
    aggregateMetrics.prequalifiedCalls++;
  }
  
  if (state?.doNotContact) {
    aggregateMetrics.doNotContactCalls++;
  }
  
  // Track drop-off phase
  const finalPhase = state?.phase || 'unknown';
  if (!state?.prequalified && finalPhase !== PHASES.END_CALL) {
    aggregateMetrics.dropOffByPhase[finalPhase] = 
      (aggregateMetrics.dropOffByPhase[finalPhase] || 0) + 1;
  }
  
  // Track entrypoint
  const entrypoint = state?.collectedData?.source?.entrypoint || 'unknown';
  aggregateMetrics.callsByEntrypoint[entrypoint] = 
    (aggregateMetrics.callsByEntrypoint[entrypoint] || 0) + 1;
  
  // Track field/question counts
  if (state?.questionsAsked) {
    aggregateMetrics.totalQuestionsAsked += state.questionsAsked;
  }
  if (state?.fieldsCollected) {
    aggregateMetrics.totalFieldsCollected += state.fieldsCollected;
  }
  
  // Track timing
  const duration = Date.now() - (metadata?.startTime || Date.now());
  aggregateMetrics.callDurations.push(duration);
  
  if (state?.prequalified && state?.prequalifiedAt && state?.startTime) {
    aggregateMetrics.timeToPrequalification.push(state.prequalifiedAt - state.startTime);
  }
  
  // Track latencies
  if (metrics?.turns) {
    for (const turn of metrics.turns) {
      if (turn.latency?.llmTTFT) {
        aggregateMetrics.llmTTFTs.push(turn.latency.llmTTFT);
      }
      if (turn.latency?.processingTime) {
        aggregateMetrics.processingTimes.push(turn.latency.processingTime);
      }
    }
  }
  
  // Track hourly bucket
  const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  if (!aggregateMetrics.hourlyStats[hourKey]) {
    aggregateMetrics.hourlyStats[hourKey] = {
      calls: 0,
      prequalified: 0,
      doNotContact: 0,
    };
  }
  aggregateMetrics.hourlyStats[hourKey].calls++;
  if (state?.prequalified) {
    aggregateMetrics.hourlyStats[hourKey].prequalified++;
  }
  if (state?.doNotContact) {
    aggregateMetrics.hourlyStats[hourKey].doNotContact++;
  }
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Log latency metrics for a turn
 */
export function logTurnMetrics(callSid, turnMetrics, latencyResults) {
  const { llmTTFT, processingTime } = latencyResults;
  
  console.log('\n' + '─'.repeat(60));
  console.log(`📊 LATENCY METRICS - Turn ${turnMetrics.turnId}`);
  console.log('─'.repeat(60));
  
  if (llmTTFT !== undefined) {
    const status = getLatencyStatus(llmTTFT, LATENCY_TARGETS.llmTTFT);
    console.log(`   LLM TTFT:        ${llmTTFT}ms ${status.emoji} (target: ${LATENCY_TARGETS.llmTTFT.target}ms)`);
  }
  
  if (processingTime !== undefined) {
    console.log(`   Processing:      ${processingTime}ms`);
  }
  
  console.log(`   Tokens:          ${turnMetrics.totalTokens}`);
  
  if (turnMetrics.toolCalls?.length > 0) {
    console.log(`   Tool Calls:      ${turnMetrics.toolCalls.join(', ')}`);
  }
  
  if (turnMetrics.fieldsCollected?.length > 0) {
    console.log(`   Fields:          ${turnMetrics.fieldsCollected.join(', ')}`);
  }
  
  if (turnMetrics.interrupted) {
    console.log(`   ⚠️  Turn was interrupted by user`);
  }
  
  console.log('─'.repeat(60) + '\n');
  
  return latencyResults;
}

/**
 * Log session summary when call ends
 */
export function logSessionSummary(callSid, sessionData) {
  const { metrics, metadata, state } = sessionData;
  const turnMetrics = metrics?.turns || [];
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📈 SESSION SUMMARY - ${callSid}`);
  console.log('═'.repeat(60));
  
  // Duration
  const duration = Date.now() - (metadata?.startTime || state?.startTime || Date.now());
  console.log(`   Duration:        ${Math.round(duration / 1000)}s`);
  console.log(`   Total Turns:     ${turnMetrics.length}`);
  console.log(`   Interruptions:   ${metrics?.interruptions || 0}`);
  
  // Lead capture stats
  console.log(`\n   Lead Capture:`);
  console.log(`     Questions:     ${state?.questionsAsked || 0}`);
  console.log(`     Fields:        ${state?.fieldsCollected || 0}`);
  console.log(`     Prequalified:  ${state?.prequalified ? 'Yes ✅' : 'No'}`);
  console.log(`     Phase:         ${state?.phase || 'unknown'}`);
  
  if (state?.doNotContact) {
    console.log(`     ⚠️  Do Not Contact: Yes`);
  }
  
  // Entrypoint
  const entrypoint = state?.collectedData?.source?.entrypoint || 'unknown';
  console.log(`     Entrypoint:    ${entrypoint}`);
  
  // LLM TTFT statistics
  const llmTTFTs = turnMetrics
    .map(t => t.latency?.llmTTFT)
    .filter(v => v !== undefined);
  
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
  
  console.log('═'.repeat(60) + '\n');
  
  // Record to aggregates
  recordSessionComplete(sessionData);
}

// =============================================================================
// AGGREGATE METRICS API
// =============================================================================

/**
 * Get aggregate metrics for the /metrics endpoint
 */
export function getAggregateMetrics() {
  const uptime = Date.now() - aggregateMetrics.resetAt;
  
  // Calculate rates
  const prequalificationRate = aggregateMetrics.completedCalls > 0
    ? (aggregateMetrics.prequalifiedCalls / aggregateMetrics.completedCalls * 100).toFixed(1)
    : 0;
  
  const doNotContactRate = aggregateMetrics.completedCalls > 0
    ? (aggregateMetrics.doNotContactCalls / aggregateMetrics.completedCalls * 100).toFixed(1)
    : 0;
  
  // Calculate averages
  const avgQuestionsPerCall = aggregateMetrics.completedCalls > 0
    ? (aggregateMetrics.totalQuestionsAsked / aggregateMetrics.completedCalls).toFixed(1)
    : 0;
  
  const avgFieldsPerCall = aggregateMetrics.completedCalls > 0
    ? (aggregateMetrics.totalFieldsCollected / aggregateMetrics.completedCalls).toFixed(1)
    : 0;
  
  // Calculate percentiles
  const llmTTFTPercentiles = calculatePercentiles(aggregateMetrics.llmTTFTs);
  const durationPercentiles = calculatePercentiles(aggregateMetrics.callDurations);
  const timeToPrequalPercentiles = calculatePercentiles(aggregateMetrics.timeToPrequalification);
  
  return {
    uptime_seconds: Math.round(uptime / 1000),
    reset_at: new Date(aggregateMetrics.resetAt).toISOString(),
    
    // Call counts
    calls: {
      total: aggregateMetrics.totalCalls,
      completed: aggregateMetrics.completedCalls,
      prequalified: aggregateMetrics.prequalifiedCalls,
      do_not_contact: aggregateMetrics.doNotContactCalls,
    },
    
    // Rates
    rates: {
      prequalification_rate: `${prequalificationRate}%`,
      do_not_contact_rate: `${doNotContactRate}%`,
    },
    
    // Averages
    averages: {
      questions_per_call: parseFloat(avgQuestionsPerCall),
      fields_per_call: parseFloat(avgFieldsPerCall),
    },
    
    // Distribution by phase
    drop_off_by_phase: aggregateMetrics.dropOffByPhase,
    
    // Distribution by entrypoint
    calls_by_entrypoint: aggregateMetrics.callsByEntrypoint,
    
    // Latency percentiles
    latency: {
      llm_ttft: {
        p50: llmTTFTPercentiles.p50,
        p95: llmTTFTPercentiles.p95,
        p99: llmTTFTPercentiles.p99,
        target: LATENCY_TARGETS.llmTTFT.target,
        samples: aggregateMetrics.llmTTFTs.length,
      },
    },
    
    // Duration percentiles
    call_duration: {
      p50_seconds: Math.round((durationPercentiles.p50 || 0) / 1000),
      p95_seconds: Math.round((durationPercentiles.p95 || 0) / 1000),
      samples: aggregateMetrics.callDurations.length,
    },
    
    // Time to prequalification
    time_to_prequalification: {
      p50_seconds: Math.round((timeToPrequalPercentiles.p50 || 0) / 1000),
      p95_seconds: Math.round((timeToPrequalPercentiles.p95 || 0) / 1000),
      samples: aggregateMetrics.timeToPrequalification.length,
    },
    
    // Targets reference
    targets: LATENCY_TARGETS,
  };
}

/**
 * Get hourly statistics
 */
export function getHourlyStats() {
  return aggregateMetrics.hourlyStats;
}

/**
 * Reset aggregate metrics
 */
export function resetAggregateMetrics() {
  aggregateMetrics.totalCalls = 0;
  aggregateMetrics.completedCalls = 0;
  aggregateMetrics.prequalifiedCalls = 0;
  aggregateMetrics.doNotContactCalls = 0;
  aggregateMetrics.dropOffByPhase = {};
  aggregateMetrics.callsByEntrypoint = {};
  aggregateMetrics.totalQuestionsAsked = 0;
  aggregateMetrics.totalFieldsCollected = 0;
  aggregateMetrics.callDurations = [];
  aggregateMetrics.timeToPrequalification = [];
  aggregateMetrics.llmTTFTs = [];
  aggregateMetrics.processingTimes = [];
  aggregateMetrics.hourlyStats = {};
  aggregateMetrics.resetAt = Date.now();
  
  console.log('[METRICS] Aggregate metrics reset');
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate percentiles from an array of values
 */
function calculatePercentiles(values) {
  if (values.length === 0) {
    return { p50: null, p95: null, p99: null };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    p99: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1],
  };
}

export default {
  // Turn metrics
  createTurnMetrics,
  calculateTurnLatency,
  getLatencyStatus,
  logTurnMetrics,
  
  // Session metrics
  createSessionMetrics,
  logSessionSummary,
  recordSessionComplete,
  
  // Aggregate metrics
  getAggregateMetrics,
  getHourlyStats,
  resetAggregateMetrics,
  
  // Constants
  LATENCY_TARGETS,
};
