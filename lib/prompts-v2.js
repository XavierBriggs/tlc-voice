/**
 * Optimized Prompt System for Lead Capture Voice Agent (V2)
 * 
 * Redesigned for lower latency with ~65% fewer tokens than v1:
 * - Tier 1: Core prompt (~150 tokens) - always included
 * - Tier 2: Voice rules (~100 tokens) - first turn only
 * - Tier 3: Phase context (~40 tokens) - condensed, dynamic
 * - Tier 4: Working memory (~20 tokens) - minimal dynamic state
 * 
 * Expected TTFT improvement: 50-150ms per turn
 */

import { PHASES, getFieldValue, getNextFieldToCollect } from './state-machine.js';
import { formatEnumForSpeech } from '../config/enums.js';

// =============================================================================
// TIER 1: CORE PROMPT - Always included (~150 tokens)
// =============================================================================

export const CORE_PROMPT = `You are TLC's voice AI for manufactured home financing prequalification.

RULES:
- Be warm but brief (1-3 sentences max)
- Ask ONE question, wait for answer
- ALWAYS use tools to capture data—never just acknowledge verbally:
  name→collect_name, phone→collect_phone, ZIP→collect_property_location,
  land status→collect_land_status, home type→collect_home_type,
  timeline→collect_timeline, credit→collect_credit_band, consent→collect_consent
- Spell numbers as words ("twenty five thousand" not "$25,000")
- No markdown, bullets, or emojis
- If they decline contact, respect immediately`;

// =============================================================================
// TIER 2: VOICE RULES - First turn only (~100 tokens)
// =============================================================================

const VOICE_RULES = `VOICE OUTPUT FORMAT:
- Spell ALL numbers as words (say "five eighty" not "580")
- Spell dates fully ("January fifteenth" not "1/15")
- Say "zip code" not "ZIP", full state names not abbreviations
- Natural conversational phone call tone
- Keep responses to 1-3 sentences`;

// =============================================================================
// TIER 3: CONDENSED PHASE PROMPTS (~30-60 tokens each)
// =============================================================================

const PHASE_PROMPTS_COMPACT = {
  [PHASES.WELCOME]: `PHASE: Welcome
Greeting played. Wait for response, then ask about consent to continue.`,

  [PHASES.CONSENT_CHECK]: `PHASE: Consent
Ask if OK to contact by phone/email about financing.
YES→collect_consent(true), proceed. NO→collect_consent(false), thank them, end.`,

  [PHASES.CONTACT_INFO]: `PHASE: Contact Info
Collect: name, phone (can confirm caller ID), contact preference (phone/email).
If email preferred, also get email address.`,

  [PHASES.PROPERTY_LOCATION]: `PHASE: Property Location
Get 5-digit ZIP code where home will be placed, then confirm state.`,

  [PHASES.LAND_SITUATION]: `PHASE: Land Status
Ask if they own the land.
Values: own, buying, family_land, gifted_land, renting_lot, not_sure.
If own/buying/family, ask land value band.`,

  [PHASES.HOME_BASICS]: `PHASE: Home Type
Ask type: manufactured, modular, single_wide, double_wide, mobile_pre_hud, not_sure.
Also ask if new purchase.`,

  [PHASES.TIMELINE]: `PHASE: Timeline
Ask when moving forward: 0_3_months, 3_6_months, 6_12_months, 12_plus, not_sure.`,

  [PHASES.FINANCIAL_SNAPSHOT]: `PHASE: Financial (be gentle)
Ask: credit range (under_580 to 720_plus or prefer_not_to_say), 
monthly income estimate (optional), recent bankruptcy (yes/no/prefer_not_to_say).`,

  [PHASES.OPTIONAL_QUESTIONS]: `PHASE: Optional
Can ask: home price estimate, site work needed, best contact time.
These are optional—skip if caller is rushed. Then check_prequalification.`,

  [PHASES.PREQUALIFIED]: `PHASE: Complete!
Thank caller warmly. Loan officer will reach out soon. End positively.`,

  [PHASES.END_CALL]: `PHASE: Ending
Thank caller politely regardless of outcome.`,
};

// =============================================================================
// TIER 4: WORKING MEMORY - Minimal dynamic context (~20-40 tokens)
// =============================================================================

function buildWorkingMemory(state) {
  const parts = [];
  
  // Caller name for personalization
  const name = getFieldValue(state, 'full_name');
  if (name) {
    parts.push(`Caller: ${name}`);
  }
  
  // Caller ID for phone confirmation
  if (state.metadata?.from && !getFieldValue(state, 'phone_e164')) {
    parts.push(`Caller ID: ${state.metadata.from}`);
  }
  
  // What to collect next (just the next field, not all remaining)
  const nextField = getNextFieldToCollect(state);
  if (nextField) {
    parts.push(`Collect next: ${nextField}`);
  } else if (state.requiredFieldsRemaining?.length === 0) {
    parts.push(`All required collected. Ready to close.`);
  }
  
  // Retry hint if applicable
  if (state.retryCount > 0) {
    parts.push(`Retry ${state.retryCount}: ask more clearly or rephrase.`);
  }
  
  return parts.length > 0 ? `STATE: ${parts.join(' | ')}` : null;
}

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build the optimized system prompt for the current conversation state
 * 
 * @param {object} state - Current session state
 * @param {object} options - Build options
 * @param {boolean} options.isFirstTurn - Whether this is the first turn (includes voice rules)
 * @returns {string} - The assembled system prompt
 */
export function buildSystemPrompt(state, options = {}) {
  const { isFirstTurn = false } = options;
  const parts = [CORE_PROMPT];
  
  // Only include verbose voice rules on first turn
  if (isFirstTurn) {
    parts.push(VOICE_RULES);
  }
  
  // Condensed phase prompt
  const phasePrompt = PHASE_PROMPTS_COMPACT[state.phase];
  if (phasePrompt) {
    parts.push(phasePrompt);
  }
  
  // Minimal working memory
  const memory = buildWorkingMemory(state);
  if (memory) {
    parts.push(memory);
  }
  
  return parts.join('\n\n');
}

/**
 * Get the welcome greeting message
 */
export function getWelcomeGreeting() {
  return "Hi there! This is TLC's virtual assistant calling about manufactured home financing. Is now a good time to chat for a few minutes?";
}

/**
 * Get a closing message based on outcome
 */
export function getClosingMessage(state) {
  if (state.prequalified) {
    const name = getFieldValue(state, 'full_name')?.split(' ')[0] || 'there';
    const bestTime = getFieldValue(state, 'best_time_to_contact');
    const timePhrase = bestTime ? ` ${formatEnumForSpeech('best_time_to_contact', bestTime)}` : ' soon';
    
    return `Thank you so much ${name}! You're all set. One of our loan officers will be reaching out${timePhrase} to discuss your options. Have a wonderful day!`;
  }
  
  if (state.doNotContact) {
    return "No problem at all. Thank you for your time today. Take care!";
  }
  
  return "Thank you for calling TLC. Have a great day!";
}

// =============================================================================
// METRICS HELPERS
// =============================================================================

/**
 * Get approximate token count for the prompt (for metrics)
 * Rough estimate: 1 token ≈ 4 characters
 */
export function estimatePromptTokens(prompt) {
  return Math.ceil(prompt.length / 4);
}

/**
 * Get prompt version identifier
 */
export function getPromptVersion() {
  return 'v2-compact';
}
