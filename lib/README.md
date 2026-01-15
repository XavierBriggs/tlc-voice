# 🧩 lib/ - Core Modules

Business logic for the lead capture voice agent.

## 📁 Files

| File | Purpose |
|------|---------|
| `state-machine.js` | Conversation flow management |
| `tools.js` | OpenAI function definitions |
| `tool-executor.js` | Tool execution & state updates |
| `prompts.js` | Dynamic prompt generation |
| `attribution.js` | Dealer tracking number lookup |
| `metrics.js` | Latency & lead metrics |

---

## 🔄 state-machine.js

Manages conversation phases and tracks collected data.

```javascript
import { createSessionState, advancePhase, setFieldValue, PHASES } from './state-machine.js';

// Create new session
const state = createSessionState('CA123', { from: '+15551234567' });
// state.phase === PHASES.WELCOME

// Collect data
setFieldValue(state, 'full_name', 'John Doe');
setFieldValue(state, 'property_zip', '63110');

// Advance phase when complete
advancePhase(state);
```

**Phases:**
```
WELCOME → CONSENT_CHECK → CONTACT_INFO → PROPERTY_LOCATION → 
LAND_SITUATION → HOME_BASICS → TIMELINE → FINANCIAL_SNAPSHOT → 
OPTIONAL_QUESTIONS → PREQUALIFIED
```

**Key Functions:**
| Function | Description |
|----------|-------------|
| `createSessionState(callSid, metadata)` | Initialize new session |
| `setFieldValue(state, field, value)` | Store collected data |
| `advancePhase(state)` | Move to next phase |
| `isPrequalificationReady(state)` | Check if requirements met |
| `buildLeadPayload(state)` | Generate Hestia API payload |

---

## 🔧 tools.js

OpenAI function calling tool definitions.

```javascript
import { TOOLS, getToolsForPhase } from './tools.js';

// Get tools for current phase
const tools = getToolsForPhase('contact_info');
// Returns: collect_name, collect_phone, collect_email, etc.

// Use in OpenAI request
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [...],
  tools: tools,
  tool_choice: 'auto'
});
```

**Tool Categories:**

| Category | Tools |
|----------|-------|
| 📋 Data Collection | `collect_consent`, `collect_name`, `collect_phone`, `collect_email`, `collect_property_location`, `collect_land_status`, `collect_home_type`, `collect_timeline`, `collect_credit_band` |
| 🎮 Conversation Control | `check_prequalification`, `skip_optional_questions`, `end_conversation`, `request_clarification` |

---

## ⚡ tool-executor.js

Executes tool calls and updates state.

```javascript
import { executeTool, processToolCalls } from './tool-executor.js';

// Process multiple tool calls from LLM response
const { state, results, shouldEndCall } = await processToolCalls(
  toolCalls,      // From OpenAI response
  currentState,   // Session state
  hestiaClient    // API client
);
```

**Flow:**
```
Tool Call → Validate Args → Update State → Sync to Hestia → Return Result
```

---

## 📝 prompts.js

Builds dynamic system prompts based on conversation state.

```javascript
import { buildSystemPrompt, getWelcomeGreeting, getClosingMessage } from './prompts.js';

// Generate context-aware prompt
const systemPrompt = buildSystemPrompt(state);
// Includes: base personality + phase context + collected data + next question
```

**Prompt Layers:**
```
┌─────────────────────────────────────┐
│  Base System Prompt                 │  ← Personality, compliance, voice rules
├─────────────────────────────────────┤
│  Phase Context                      │  ← Current phase instructions
├─────────────────────────────────────┤
│  Collected Data Summary             │  ← What we know so far
├─────────────────────────────────────┤
│  Question Directive                 │  ← Next question to ask
└─────────────────────────────────────┘
```

---

## 🏪 attribution.js

Determines dealer ownership from tracking numbers.

```javascript
import { determineAttribution } from './attribution.js';

const attribution = await determineAttribution('+18005551234', hestiaClient);
// {
//   entrypoint: 'dealer_phone',
//   dealer_id: 'dlr_12345',
//   locked: true
// }
```

**Entrypoints:**
| Value | Meaning |
|-------|---------|
| `dealer_phone` | Caller dialed dealer tracking number |
| `lender_global_phone` | Caller dialed main TLC number |

---

## 📊 metrics.js

Tracks latency and lead capture metrics.

```javascript
import { 
  createTurnMetrics, 
  logSessionSummary, 
  getAggregateMetrics 
} from './metrics.js';

// Track individual turn
const turnMetrics = createTurnMetrics();
turnMetrics.promptReceivedAt = Date.now();
// ... process turn ...
turnMetrics.llmFirstTokenAt = Date.now();

// Get aggregate stats
const stats = getAggregateMetrics();
// {
//   calls: { total: 150, prequalified: 89 },
//   rates: { prequalification_rate: "59.3%" },
//   drop_off_by_phase: { consent_check: 12 }
// }
```

**Tracked Metrics:**
| Metric | Description |
|--------|-------------|
| `llmTTFT` | Time to first token from LLM |
| `processingTime` | Total turn processing time |
| `prequalification_rate` | % of calls reaching prequalified |
| `drop_off_by_phase` | Where callers abandon |
