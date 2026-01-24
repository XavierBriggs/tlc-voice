/**
 * Conversation Flow Tests - V2 Architecture
 * 
 * Tests for the deterministic conversation flow with:
 * - ConversationController for flow control
 * - Unified extract_fields tool
 * - Confirmation tracking for ALL fields
 * - Raw + band storage
 * 
 * Run with: node tests/conversation-flow.test.js
 */

import { 
  createSessionState, 
  advancePhase, 
  setFieldValue, 
  confirmField,
  isFieldConfirmed,
  getFieldValue,
  getRawValue,
  isPrequalificationReady,
  isMinimumLeadReady,
  getNextFieldToCollect,
  getUnconfirmedFields,
  PHASES,
  REQUIRED_FIELDS,
  FIELD_ORDER,
} from '../lib/state-machine.js';

import { TOOLS, EXTRACTION_TO_STATE_FIELD_MAP } from '../lib/tools.js';
import { buildSystemPrompt } from '../lib/prompts.js';
import { ConversationController } from '../lib/conversation-controller.js';
import { 
  computeLandValueBand, 
  computeCreditBand, 
  computeTimelineBand,
  parseNumericValue,
} from '../lib/value-normalizers.js';
import { MockHestiaClient } from '../api/mock-hestia.js';
import { executeTool, processToolCalls } from '../lib/tool-executor.js';

// Simple test runner
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`  ✅ ${name}`);
        testsPassed++;
      }).catch(error => {
        console.log(`  ❌ ${name}`);
        console.log(`     Error: ${error.message}`);
        testsFailed++;
      });
    } else {
      console.log(`  ✅ ${name}`);
      testsPassed++;
    }
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(`${message} Expected true, got ${value}`);
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(`${message} Expected false, got ${value}`);
  }
}

// =============================================================================
// STATE MACHINE TESTS
// =============================================================================

console.log('\n📋 State Machine Tests\n');

test('createSessionState creates valid initial state', () => {
  const state = createSessionState('CA123', { from: '+15551234567', to: '+15559876543' });
  
  assertEqual(state.callSid, 'CA123');
  assertEqual(state.phase, PHASES.WELCOME);
  assertEqual(state.prequalified, false);
  assertEqual(state.fieldsCollected, 0);
  assertEqual(state.fieldsConfirmed, 0);
});

test('setFieldValue stores value as unconfirmed by default', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe');
  assertEqual(getFieldValue(state, 'full_name'), 'John Doe');
  assertFalse(isFieldConfirmed(state, 'full_name'), 'Should not be confirmed');
});

test('setFieldValue with confirmed=true marks field as confirmed', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe', true);
  assertEqual(getFieldValue(state, 'full_name'), 'John Doe');
  assertTrue(isFieldConfirmed(state, 'full_name'), 'Should be confirmed');
});

test('confirmField marks an existing field as confirmed', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe', false);
  assertFalse(isFieldConfirmed(state, 'full_name'));
  
  confirmField(state, 'full_name');
  assertTrue(isFieldConfirmed(state, 'full_name'));
});

test('setFieldValue computes band from raw value for land_value', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'land_value', 75000);
  
  assertEqual(getRawValue(state, 'land_value'), 75000, 'Raw value should be stored');
  assertEqual(getFieldValue(state, 'land_value'), '50k_100k', 'Band should be computed');
});

test('setFieldValue computes band from raw value for credit', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'credit', 650);
  
  assertEqual(getRawValue(state, 'credit'), 650, 'Raw score should be stored');
  assertEqual(getFieldValue(state, 'credit'), '620_679', 'Band should be computed');
});

test('setFieldValue computes band from raw value for timeline', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'timeline', 'April');
  
  assertEqual(getRawValue(state, 'timeline'), 'April', 'Raw value should be stored');
  // Band depends on current date, just check it exists
  assertTrue(getFieldValue(state, 'timeline') !== undefined);
});

test('getUnconfirmedFields returns fields with values but not confirmed', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe', false);
  setFieldValue(state, 'email', 'john@example.com', true); // Confirmed
  
  const unconfirmed = getUnconfirmedFields(state);
  assertEqual(unconfirmed.length, 1, 'Should have 1 unconfirmed field');
  assertEqual(unconfirmed[0].field, 'full_name');
});

test('isPrequalificationReady requires all fields collected AND confirmed', () => {
  const state = createSessionState('CA123', {});
  
  // Set all required fields but DON'T confirm them
  setFieldValue(state, 'contact_consent', true, false);
  setFieldValue(state, 'full_name', 'John Doe', false);
  setFieldValue(state, 'phone_e164', '+15551234567', false);
  setFieldValue(state, 'email', 'john@example.com', false);
  setFieldValue(state, 'preferred_contact_method', 'phone', false);
  setFieldValue(state, 'property_zip', '63110', false);
  setFieldValue(state, 'property_state', 'MO', false);
  setFieldValue(state, 'land_status', 'own', false);
  setFieldValue(state, 'home_type', 'manufactured', false);
  setFieldValue(state, 'timeline', '3 months', false);
  setFieldValue(state, 'credit', 650, false);
  setFieldValue(state, 'best_time_to_contact', 'morning', false);
  
  assertFalse(isPrequalificationReady(state), 'Not ready - fields not confirmed');
  
  // Now confirm all
  for (const field of REQUIRED_FIELDS) {
    confirmField(state, field);
  }
  
  assertTrue(isPrequalificationReady(state), 'Ready - all fields collected and confirmed');
});

// =============================================================================
// VALUE NORMALIZER TESTS
// =============================================================================

console.log('\n🔢 Value Normalizer Tests\n');

test('computeLandValueBand calculates correct bands', () => {
  assertEqual(computeLandValueBand(20000).band, '0_25k');
  assertEqual(computeLandValueBand(40000).band, '25k_50k');
  assertEqual(computeLandValueBand(75000).band, '50k_100k');
  assertEqual(computeLandValueBand(150000).band, '100k_200k');
  assertEqual(computeLandValueBand(250000).band, '200k_plus');
});

test('computeCreditBand calculates correct bands', () => {
  assertEqual(computeCreditBand(550).band, 'under_580');
  assertEqual(computeCreditBand(600).band, '580_619');
  assertEqual(computeCreditBand(650).band, '620_679');
  assertEqual(computeCreditBand(700).band, '680_719');
  assertEqual(computeCreditBand(750).band, '720_plus');
});

test('computeTimelineBand handles month names', () => {
  // Create a fixed date for testing - January 15, 2026
  const testDate = new Date(2026, 0, 15);
  
  // April is 3 months out from January
  const result = computeTimelineBand('April', testDate);
  assertEqual(result.band, '0_3_months');
  assertEqual(result.raw, 'April');
});

test('computeTimelineBand handles relative terms', () => {
  const result1 = computeTimelineBand('soon');
  assertEqual(result1.band, '0_3_months');
  
  const result2 = computeTimelineBand('next year');
  assertEqual(result2.band, '12_plus');
});

test('parseNumericValue handles word numbers', () => {
  assertEqual(parseNumericValue('forty thousand'), 40000);
  assertEqual(parseNumericValue('six fifty'), 650);
  assertEqual(parseNumericValue('seventy five thousand'), 75000);
});

test('parseNumericValue handles plain numbers', () => {
  assertEqual(parseNumericValue('40000'), 40000);
  assertEqual(parseNumericValue('$75,000'), 75000);
  assertEqual(parseNumericValue(650), 650);
});

// =============================================================================
// CONVERSATION CONTROLLER TESTS
// =============================================================================

console.log('\n🎮 Conversation Controller Tests\n');

test('getNextAction returns confirm action for unconfirmed fields', () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  
  // Set a field but don't confirm
  setFieldValue(state, 'contact_consent', true, false);
  
  const action = controller.getNextAction(state);
  assertEqual(action.type, 'confirm');
  assertEqual(action.field, 'contact_consent');
});

test('getNextAction returns ask action when no unconfirmed fields', () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  state.phase = PHASES.CONSENT_CHECK;
  
  const action = controller.getNextAction(state);
  assertEqual(action.type, 'ask');
  assertEqual(action.field, 'contact_consent');
});

test('getNextAction returns complete when all required fields collected and confirmed', () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  
  // Set and confirm all required fields
  setFieldValue(state, 'contact_consent', true, true);
  setFieldValue(state, 'full_name', 'John Doe', true);
  setFieldValue(state, 'phone_e164', '+15551234567', true);
  setFieldValue(state, 'email', 'john@example.com', true);
  setFieldValue(state, 'preferred_contact_method', 'phone', true);
  setFieldValue(state, 'property_zip', '63110', true);
  setFieldValue(state, 'property_state', 'MO', true);
  setFieldValue(state, 'land_status', 'own', true);
  setFieldValue(state, 'home_type', 'manufactured', true);
  setFieldValue(state, 'timeline', '3 months', true);
  setFieldValue(state, 'credit', 650, true);
  setFieldValue(state, 'best_time_to_contact', 'morning', true);
  
  const action = controller.getNextAction(state);
  assertEqual(action.type, 'complete');
});

test('getNextAction returns end_call for do_not_contact', () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  state.doNotContact = true;
  
  const action = controller.getNextAction(state);
  assertEqual(action.type, 'end_call');
});

test('controller confirms fields in correct order', () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  
  // Set multiple fields out of order
  setFieldValue(state, 'email', 'john@example.com', false);
  setFieldValue(state, 'full_name', 'John Doe', false);
  setFieldValue(state, 'contact_consent', true, false);
  
  // First confirmation should be contact_consent (earlier in FIELD_ORDER)
  const action1 = controller.getNextAction(state);
  assertEqual(action1.field, 'contact_consent', 'Should confirm consent first');
  
  confirmField(state, 'contact_consent');
  
  // Next should be full_name
  const action2 = controller.getNextAction(state);
  assertEqual(action2.field, 'full_name', 'Should confirm name second');
});

// =============================================================================
// TOOLS TESTS
// =============================================================================

console.log('\n🔧 Tools Tests\n');

test('TOOLS array includes extract_fields tool', () => {
  const extractTool = TOOLS.find(t => t.function.name === 'extract_fields');
  assertTrue(!!extractTool, 'Should have extract_fields tool');
});

test('extract_fields tool has all expected parameters', () => {
  const extractTool = TOOLS.find(t => t.function.name === 'extract_fields');
  const params = extractTool.function.parameters.properties;
  
  assertTrue(!!params.confirmation, 'Should have confirmation param');
  assertTrue(!!params.full_name, 'Should have full_name param');
  assertTrue(!!params.phone_e164, 'Should have phone_e164 param');
  assertTrue(!!params.email, 'Should have email param');
  assertTrue(!!params.land_value_raw, 'Should have land_value_raw param');
  assertTrue(!!params.credit_raw, 'Should have credit_raw param');
  assertTrue(!!params.timeline_raw, 'Should have timeline_raw param');
});

test('EXTRACTION_TO_STATE_FIELD_MAP maps raw fields correctly', () => {
  assertEqual(EXTRACTION_TO_STATE_FIELD_MAP.land_value_raw, 'land_value');
  assertEqual(EXTRACTION_TO_STATE_FIELD_MAP.credit_raw, 'credit');
  assertEqual(EXTRACTION_TO_STATE_FIELD_MAP.timeline_raw, 'timeline');
});

// =============================================================================
// TOOL EXECUTOR TESTS
// =============================================================================

console.log('\n⚡ Tool Executor Tests\n');

test('executeTool extracts multiple fields at once', async () => {
  const state = createSessionState('CA123', {});
  
  const result = await executeTool('extract_fields', {
    full_name: 'John Doe',
    home_type: 'double_wide',
  }, state, {});
  
  assertEqual(result.fieldsExtracted.length, 2);
  assertEqual(getFieldValue(result.state, 'full_name'), 'John Doe');
  assertEqual(getFieldValue(result.state, 'home_type'), 'double_wide');
});

test('executeTool handles confirmation responses', async () => {
  const state = createSessionState('CA123', {});
  setFieldValue(state, 'full_name', 'John Doe', false);
  
  const pendingConfirmation = { field: 'full_name', value: 'John Doe' };
  
  const result = await executeTool('extract_fields', {
    confirmation: true,
  }, state, { pendingConfirmation });
  
  assertTrue(isFieldConfirmed(result.state, 'full_name'), 'Field should be confirmed');
});

test('executeTool validates phone numbers', async () => {
  const state = createSessionState('CA123', {});
  
  const result = await executeTool('extract_fields', {
    phone_e164: '5551234567',
  }, state, {});
  
  assertEqual(getFieldValue(result.state, 'phone_e164'), '+15551234567');
});

test('executeTool computes bands from raw values', async () => {
  const state = createSessionState('CA123', {});
  
  const result = await executeTool('extract_fields', {
    land_value_raw: 75000,
    credit_raw: 680,
  }, state, {});
  
  assertEqual(getFieldValue(result.state, 'land_value'), '50k_100k');
  assertEqual(getRawValue(result.state, 'land_value'), 75000);
  assertEqual(getFieldValue(result.state, 'credit'), '680_719');
  assertEqual(getRawValue(result.state, 'credit'), 680);
});

test('executeTool treats "Yes" as consent in consent_check phase without pending confirmation', async () => {
  const state = createSessionState('CA123', {});
  state.phase = PHASES.CONSENT_CHECK;
  
  // No pendingConfirmation - this simulates the first response to welcome greeting
  const result = await executeTool('extract_fields', {
    confirmation: true,
  }, state, { pendingConfirmation: null });
  
  // Should have treated confirmation as contact_consent
  assertEqual(getFieldValue(result.state, 'contact_consent'), true);
  assertTrue(result.fieldsExtracted.some(f => f.field === 'contact_consent'), 'Should have extracted contact_consent');
});

test('executeTool treats "Yes" as consent in WELCOME phase without pending confirmation', async () => {
  const state = createSessionState('CA123', {});
  // State starts in WELCOME phase by default
  assertEqual(state.phase, PHASES.WELCOME);
  
  // No pendingConfirmation - this simulates the first response to welcome greeting
  const result = await executeTool('extract_fields', {
    confirmation: true,
  }, state, { pendingConfirmation: null });
  
  // Should have treated confirmation as contact_consent
  assertEqual(getFieldValue(result.state, 'contact_consent'), true);
  assertTrue(result.fieldsExtracted.some(f => f.field === 'contact_consent'), 'Should have extracted contact_consent');
});

// =============================================================================
// PROMPTS TESTS
// =============================================================================

console.log('\n📝 Prompts Tests\n');

test('buildSystemPrompt returns extraction-focused prompt', () => {
  const state = createSessionState('CA123', {});
  const prompt = buildSystemPrompt(state, null);
  
  assertTrue(prompt.includes('extract'), 'Should mention extraction');
  assertTrue(prompt.includes('extract_fields'), 'Should mention the tool');
  assertTrue(prompt.includes('provide_info'), 'Should mention provide_info for explanations');
  assertTrue(prompt.includes('HOME TYPES'), 'Should include option details');
  assertTrue(prompt.length < 4000, 'Should be reasonably sized for voice context');
});

test('buildSystemPrompt includes action context', () => {
  const state = createSessionState('CA123', {});
  const action = { 
    type: 'confirm', 
    field: 'full_name', 
    message: 'I have your name as John. Is that correct?' 
  };
  
  const prompt = buildSystemPrompt(state, action);
  assertTrue(prompt.includes('Confirming'), 'Should include confirm context');
  assertTrue(prompt.includes('full_name'), 'Should include field name');
});

// =============================================================================
// MOCK HESTIA TESTS
// =============================================================================

console.log('\n🏛️ Mock Hestia Tests\n');

test('MockHestiaClient stores raw values in lead payload', async () => {
  const client = new MockHestiaClient({ verbose: false });
  client.clearAll();
  
  const state = createSessionState('CA123', {});
  setFieldValue(state, 'contact_consent', true, true);
  setFieldValue(state, 'full_name', 'John Doe', true);
  setFieldValue(state, 'phone_e164', '+15551234567', true);
  setFieldValue(state, 'email', 'john@example.com', true);
  setFieldValue(state, 'preferred_contact_method', 'phone', true);
  setFieldValue(state, 'property_zip', '63110', true);
  setFieldValue(state, 'property_state', 'MO', true);
  setFieldValue(state, 'land_status', 'own', true);
  setFieldValue(state, 'land_value', 75000, true);
  setFieldValue(state, 'home_type', 'double_wide', true);
  setFieldValue(state, 'timeline', 'April', true);
  setFieldValue(state, 'credit', 680, true);
  setFieldValue(state, 'best_time_to_contact', 'morning', true);
  
  const result = await client.createLead(state);
  const lead = await client.getLead(result.lead_id);
  
  // Check raw values are stored
  assertEqual(lead.home_and_site.land_value_raw, 75000);
  assertEqual(lead.home_and_site.land_value_band, '50k_100k');
  assertTrue(!!lead.home_and_site.timeline_raw); // "April"
  assertEqual(lead.financial_snapshot.credit_raw, 680);
  assertEqual(lead.financial_snapshot.credit_band_self_reported, '680_719');
});

// =============================================================================
// INTEGRATION TEST
// =============================================================================

console.log('\n🔄 Integration Tests\n');

test('full conversation flow extracts and confirms multiple fields', async () => {
  const controller = new ConversationController();
  const state = createSessionState('CA123', {});
  state.phase = PHASES.CONSENT_CHECK;
  
  // Simulate: "Yes, my name is James and I want a double wide"
  await executeTool('extract_fields', {
    contact_consent: true,
    full_name: 'James',
    home_type: 'double_wide',
  }, state, {});
  
  // Controller should want to confirm consent first
  let action = controller.getNextAction(state);
  assertEqual(action.type, 'confirm');
  assertEqual(action.field, 'contact_consent');
  
  // Simulate confirmation
  await executeTool('extract_fields', {
    confirmation: true,
  }, state, { pendingConfirmation: { field: 'contact_consent' } });
  
  // Now should want to confirm full_name
  action = controller.getNextAction(state);
  assertEqual(action.type, 'confirm');
  assertEqual(action.field, 'full_name');
  
  // User corrects: "Actually it's James Smith"
  await executeTool('extract_fields', {
    confirmation: false,
    full_name: 'James Smith',
  }, state, { pendingConfirmation: { field: 'full_name' } });
  
  // Should still want to confirm the updated name
  action = controller.getNextAction(state);
  assertEqual(action.type, 'confirm');
  assertEqual(action.field, 'full_name');
  assertEqual(getFieldValue(state, 'full_name'), 'James Smith');
});

test('executeTool handles "No" to boolean questions correctly', async () => {
  // Simulate asking for has_recent_bankruptcy
  const currentAction = {
    type: 'ask',
    field: 'has_recent_bankruptcy',
    message: 'Have you had any bankruptcies in recent years?'
  };
  
  let state = createSessionState('test-123', '+15551234567', 'test_source');
  state.phase = 'optional_questions';
  
  // User says "No" - LLM interprets as confirmation: false, but we're asking a boolean question
  const result = await executeTool('extract_fields', {
    confirmation: false,
  }, state, { currentAction });
  
  // Should have extracted has_recent_bankruptcy: false, not treated as rejection
  const extracted = result.fieldsExtracted.find(f => f.field === 'has_recent_bankruptcy');
  assertTrue(!!extracted, 'has_recent_bankruptcy should be extracted');
  
  // Value should be false
  assertEqual(getFieldValue(result.state, 'has_recent_bankruptcy'), false, 'has_recent_bankruptcy should be false');
});

test('executeTool handles "Yes" to boolean questions correctly', async () => {
  // Simulate asking for has_recent_bankruptcy
  const currentAction = {
    type: 'ask',
    field: 'has_recent_bankruptcy',
    message: 'Have you had any bankruptcies in recent years?'
  };
  
  let state = createSessionState('test-123', '+15551234567', 'test_source');
  state.phase = 'optional_questions';
  
  // User says "Yes" - LLM interprets as confirmation: true
  const result = await executeTool('extract_fields', {
    confirmation: true,
  }, state, { currentAction });
  
  // Should have extracted has_recent_bankruptcy: true
  const extracted = result.fieldsExtracted.find(f => f.field === 'has_recent_bankruptcy');
  assertTrue(!!extracted, 'has_recent_bankruptcy should be extracted');
  
  // Value should be true
  assertEqual(getFieldValue(result.state, 'has_recent_bankruptcy'), true, 'has_recent_bankruptcy should be true');
});

// =============================================================================
// SUMMARY
// =============================================================================

// Wait for async tests to complete
setTimeout(() => {
  console.log('\n' + '═'.repeat(50));
  console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═'.repeat(50) + '\n');
  
  if (testsFailed > 0) {
    process.exit(1);
  }
}, 1000);
