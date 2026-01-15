# 🧪 tests/ - Test Suite

Automated tests for the lead capture voice agent.

## 📁 Files

| File | Purpose |
|------|---------|
| `conversation-flow.test.js` | Core module tests |

---

## ▶️ Running Tests

```bash
npm test
```

**Output:**
```
📋 State Machine Tests
  ✅ createSessionState creates valid initial state
  ✅ setFieldValue updates applicant fields
  ✅ advancePhase moves from welcome to consent_check
  ✅ isPrequalificationReady returns true when all required fields collected

🔧 Tools Tests
  ✅ TOOLS array is not empty
  ✅ getToolsForPhase returns tools for consent_check
  ✅ each tool has required function properties

📝 Prompts Tests
  ✅ buildSystemPrompt returns non-empty string
  ✅ buildSystemPrompt includes phase-specific context

❓ Questions Tests
  ✅ QUESTIONS object has expected questions
  ✅ getNextQuestion returns correct question for phase

🏛️ Mock Hestia Tests
  ✅ MockHestiaClient creates lead with idempotency
  ✅ MockHestiaClient updates lead
  ✅ MockHestiaClient logs events

══════════════════════════════════════════════════
📊 Test Results: 22 passed, 0 failed
══════════════════════════════════════════════════
```

---

## 🧪 Test Categories

### State Machine Tests

Tests conversation state management:

```javascript
test('isPrequalificationReady returns true when all required fields collected', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe');
  setFieldValue(state, 'phone_e164', '+15551234567');
  setFieldValue(state, 'property_zip', '63110');
  setFieldValue(state, 'property_state', 'MO');
  setFieldValue(state, 'land_status', 'own');
  setFieldValue(state, 'home_type', 'manufactured');
  setFieldValue(state, 'timeline', '0_3_months');
  setFieldValue(state, 'contact_consent', true);
  setFieldValue(state, 'tcpa_disclosure_ack', true);
  
  assertTrue(isPrequalificationReady(state));
});
```

### Tools Tests

Validates OpenAI function definitions:

```javascript
test('each tool has required function properties', () => {
  for (const tool of TOOLS) {
    assertEqual(tool.type, 'function');
    assertTrue(!!tool.function.name);
    assertTrue(!!tool.function.description);
    assertTrue(!!tool.function.parameters);
  }
});
```

### Mock Hestia Tests

Tests API client with idempotency:

```javascript
test('MockHestiaClient creates lead with idempotency', async () => {
  const result1 = await client.createLead(state);
  const result2 = await client.createLead(state);
  
  assertEqual(result2.lead_id, result1.lead_id);
  assertEqual(result2.created, false);
});
```

---

## ➕ Adding Tests

```javascript
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

// Add your test
test('my new feature works', () => {
  const result = myFunction();
  assertEqual(result, expectedValue);
});
```
