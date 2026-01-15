/**
 * Conversation Flow Tests
 * 
 * Basic tests for the lead capture conversation flow.
 * Run with: node tests/conversation-flow.test.js
 */

import { 
  createSessionState, 
  advancePhase, 
  setFieldValue, 
  isPrequalificationReady,
  getNextFieldToCollect,
  PHASES,
  REQUIRED_FIELDS,
} from '../lib/state-machine.js';

import { TOOLS, getToolsForPhase } from '../lib/tools.js';
import { buildSystemPrompt } from '../lib/prompts.js';
import { QUESTIONS, getNextQuestion } from '../config/questions.js';
import { MockHestiaClient } from '../api/mock-hestia.js';

// Simple test runner
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
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
  assertTrue(state.requiredFieldsRemaining.length > 0);
});

test('setFieldValue updates applicant fields', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'full_name', 'John Doe');
  assertEqual(state.collectedData.applicant.full_name, 'John Doe');
});

test('setFieldValue updates consent fields', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'contact_consent', true);
  assertEqual(state.collectedData.consents.contact_consent, true);
});

test('setFieldValue updates home_and_site fields', () => {
  const state = createSessionState('CA123', {});
  
  setFieldValue(state, 'property_zip', '63110');
  setFieldValue(state, 'property_state', 'MO');
  
  assertEqual(state.collectedData.home_and_site.property_zip, '63110');
  assertEqual(state.collectedData.home_and_site.property_state, 'MO');
});

test('advancePhase moves from welcome to consent_check', () => {
  const state = createSessionState('CA123', {});
  assertEqual(state.phase, PHASES.WELCOME);
  
  const advanced = advancePhase(state);
  assertEqual(advanced.phase, PHASES.CONSENT_CHECK);
});

test('isPrequalificationReady returns false when fields missing', () => {
  const state = createSessionState('CA123', {});
  assertFalse(isPrequalificationReady(state));
});

test('isPrequalificationReady returns true when all required fields collected', () => {
  const state = createSessionState('CA123', {});
  
  // Set all required fields
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

// =============================================================================
// TOOLS TESTS
// =============================================================================

console.log('\n🔧 Tools Tests\n');

test('TOOLS array is not empty', () => {
  assertTrue(TOOLS.length > 0);
});

test('getToolsForPhase returns tools for consent_check', () => {
  const tools = getToolsForPhase('consent_check');
  assertTrue(tools.length > 0);
  
  const hasCollectConsent = tools.some(t => t.function.name === 'collect_consent');
  assertTrue(hasCollectConsent, 'Should include collect_consent tool');
});

test('getToolsForPhase returns tools for contact_info', () => {
  const tools = getToolsForPhase('contact_info');
  assertTrue(tools.length > 0);
  
  const hasCollectName = tools.some(t => t.function.name === 'collect_name');
  assertTrue(hasCollectName, 'Should include collect_name tool');
});

test('each tool has required function properties', () => {
  for (const tool of TOOLS) {
    assertEqual(tool.type, 'function');
    assertTrue(!!tool.function.name, `Tool should have name`);
    assertTrue(!!tool.function.description, `Tool ${tool.function.name} should have description`);
    assertTrue(!!tool.function.parameters, `Tool ${tool.function.name} should have parameters`);
  }
});

// =============================================================================
// PROMPTS TESTS
// =============================================================================

console.log('\n📝 Prompts Tests\n');

test('buildSystemPrompt returns non-empty string', () => {
  const state = createSessionState('CA123', {});
  const prompt = buildSystemPrompt(state);
  
  assertTrue(prompt.length > 100, 'Prompt should be substantial');
  assertTrue(prompt.includes('TLC'), 'Prompt should mention TLC');
});

test('buildSystemPrompt includes phase-specific context', () => {
  const state = createSessionState('CA123', {});
  state.phase = PHASES.CONSENT_CHECK;
  
  const prompt = buildSystemPrompt(state);
  assertTrue(prompt.includes('Consent'), 'Should include consent phase context');
});

test('buildSystemPrompt includes collected data summary', () => {
  const state = createSessionState('CA123', {});
  setFieldValue(state, 'full_name', 'John Doe');
  
  const prompt = buildSystemPrompt(state);
  assertTrue(prompt.includes('John Doe'), 'Should include collected name');
});

// =============================================================================
// QUESTIONS TESTS
// =============================================================================

console.log('\n❓ Questions Tests\n');

test('QUESTIONS object has expected questions', () => {
  assertTrue(!!QUESTIONS.contact_consent, 'Should have contact_consent question');
  assertTrue(!!QUESTIONS.full_name, 'Should have full_name question');
  assertTrue(!!QUESTIONS.property_zip, 'Should have property_zip question');
});

test('each question has required properties', () => {
  for (const [id, question] of Object.entries(QUESTIONS)) {
    assertTrue(!!question.id, `Question ${id} should have id`);
    assertTrue(!!question.phase, `Question ${id} should have phase`);
    assertTrue(!!question.question, `Question ${id} should have question`);
    assertTrue(!!question.spoken, `Question ${id} should have spoken version`);
  }
});

test('getNextQuestion returns correct question for phase', () => {
  const state = createSessionState('CA123', {});
  state.phase = PHASES.CONSENT_CHECK;
  
  const question = getNextQuestion(state);
  assertTrue(!!question, 'Should return a question');
  assertEqual(question.phase, PHASES.CONSENT_CHECK);
});

// =============================================================================
// MOCK HESTIA TESTS
// =============================================================================

console.log('\n🏛️ Mock Hestia Tests\n');

test('MockHestiaClient creates lead with idempotency', async () => {
  const client = new MockHestiaClient({ verbose: false });
  client.clearAll();
  
  const state = createSessionState('CA123', {});
  setFieldValue(state, 'full_name', 'John Doe');
  setFieldValue(state, 'phone_e164', '+15551234567');
  
  const result1 = await client.createLead(state);
  assertTrue(!!result1.lead_id, 'Should return lead_id');
  assertEqual(result1.created, true, 'Should be newly created');
  
  const result2 = await client.createLead(state);
  assertEqual(result2.lead_id, result1.lead_id, 'Same idempotency key should return same lead');
  assertEqual(result2.created, false, 'Should not be newly created');
});

test('MockHestiaClient updates lead', async () => {
  const client = new MockHestiaClient({ verbose: false });
  client.clearAll();
  
  const state = createSessionState('CA456', {});
  setFieldValue(state, 'full_name', 'Jane Doe');
  setFieldValue(state, 'phone_e164', '+15559999999');
  
  const result = await client.createLead(state);
  
  setFieldValue(state, 'property_zip', '90210');
  await client.updateLead(result.lead_id, state);
  
  const lead = await client.getLead(result.lead_id);
  assertEqual(lead.home_and_site.property_zip, '90210');
});

test('MockHestiaClient sets status', async () => {
  const client = new MockHestiaClient({ verbose: false });
  client.clearAll();
  
  const state = createSessionState('CA789', {});
  setFieldValue(state, 'full_name', 'Test User');
  setFieldValue(state, 'phone_e164', '+15551111111');
  
  const result = await client.createLead(state);
  await client.setStatus(result.lead_id, 'prequalified');
  
  const lead = await client.getLead(result.lead_id);
  assertEqual(lead.status, 'prequalified');
});

test('MockHestiaClient logs events', async () => {
  const client = new MockHestiaClient({ verbose: false });
  client.clearAll();
  
  const state = createSessionState('CA111', {});
  setFieldValue(state, 'full_name', 'Event User');
  setFieldValue(state, 'phone_e164', '+15552222222');
  
  const result = await client.createLead(state);
  await client.logEvent(result.lead_id, {
    event_type: 'test_event',
    actor_type: 'system',
    payload_json: { test: true },
  });
  
  const events = await client.getEvents(result.lead_id);
  assertTrue(events.length > 0, 'Should have events');
  
  const testEvent = events.find(e => e.event_type === 'test_event');
  assertTrue(!!testEvent, 'Should find test event');
});

test('MockHestiaClient looks up dealer by tracking number', async () => {
  const client = new MockHestiaClient({ verbose: false });
  
  const result = await client.lookupDealerByTrackingNumber('+18005551234');
  assertTrue(!!result, 'Should find dealer');
  assertEqual(result.dealer_id, 'dlr_12345');
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('\n' + '═'.repeat(50));
console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('═'.repeat(50) + '\n');

if (testsFailed > 0) {
  process.exit(1);
}
