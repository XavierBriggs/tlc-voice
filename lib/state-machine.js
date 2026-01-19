/**
 * Conversation State Machine for Lead Capture
 * 
 * Manages the flow of conversation through phases matching the Hestia Voice Questions.
 * Tracks collected data, required fields, and determines next actions.
 */

// Import PHASES from dedicated file (avoids circular dependency)
import { PHASES } from '../config/phases.js';
// Import QUESTIONS to derive REQUIRED_FIELDS (single source of truth)
import { QUESTIONS } from '../config/questions.js';

// Re-export PHASES for backwards compatibility
export { PHASES };

// Derive REQUIRED_FIELDS from questions.js (single source of truth)
// This ensures questions.js is the only place you need to update required: true/false
export const REQUIRED_FIELDS = Object.values(QUESTIONS)
  .filter(q => q.required && q.field)
  .map(q => q.field)
  .filter((field, index, self) => self.indexOf(field) === index); // dedupe

// Optional fields that add value
export const OPTIONAL_FIELDS = [
  'best_time_to_contact',
  'is_new_home_purchase',
  'land_value_band',
  'home_price_estimate_usd',
  'site_work_needed',
  'site_work_budget_estimate_usd',
  'monthly_income_estimate_usd',
  'has_recent_bankruptcy',
  'notes_free_text',
];

// Minimum fields required to create a partial lead in Hestia
// These represent the minimum contactable lead - consent + contact info
export const MINIMUM_LEAD_FIELDS = [
  'contact_consent',           // Legal requirement - must have permission to contact
  'full_name',                 // Who the lead is
  'phone_e164',                // Primary contact method
  'email',                     // Secondary contact method (always collected)
  'preferred_contact_method',  // How they prefer to be reached
];

// Phase to field mapping - which fields are collected in each phase
export const PHASE_FIELDS = {
  [PHASES.CONSENT_CHECK]: ['contact_consent', 'tcpa_disclosure_ack', 'privacy_policy_ack'],
  [PHASES.CONTACT_INFO]: ['full_name', 'phone_e164', 'email', 'preferred_contact_method'],
  [PHASES.PROPERTY_LOCATION]: ['property_zip', 'property_state'],
  [PHASES.LAND_SITUATION]: ['land_status', 'land_value_band'],
  [PHASES.HOME_BASICS]: ['home_type', 'is_new_home_purchase'],
  [PHASES.TIMELINE]: ['timeline'],
  [PHASES.FINANCIAL_SNAPSHOT]: ['credit_band_self_reported', 'monthly_income_estimate_usd', 'has_recent_bankruptcy'],
  [PHASES.OPTIONAL_QUESTIONS]: ['home_price_estimate_usd', 'site_work_needed', 'site_work_budget_estimate_usd', 'best_time_to_contact', 'notes_free_text'],
};

/**
 * Create a new session state
 */
export function createSessionState(callSid, metadata = {}) {
  return {
    callSid,
    leadId: null,
    phase: PHASES.WELCOME,
    collectedData: {
      source: {
        channel: 'voice',
        session_id: callSid,
        entrypoint: metadata.entrypoint || 'lender_global_phone',
        tracking: metadata.tracking || null,
      },
      applicant: {},
      consents: {},
      home_and_site: {},
      financial_snapshot: {},
      notes: {},
    },
    requiredFieldsRemaining: [...REQUIRED_FIELDS],
    pendingQuestion: null,
    pendingField: null,
    retryCount: 0,
    maxRetries: 2,
    prequalified: false,
    doNotContact: false,
    startTime: Date.now(),
    metadata: {
      from: metadata.from,
      to: metadata.to,
      direction: metadata.direction,
      customParameters: metadata.customParameters,
    },
    events: [],
    questionsAsked: 0,
    fieldsCollected: 0,
  };
}

/**
 * Get the next phase based on current state
 */
export function getNextPhase(state) {
  const phaseOrder = [
    PHASES.WELCOME,
    PHASES.CONSENT_CHECK,
    PHASES.CONTACT_INFO,
    PHASES.PROPERTY_LOCATION,
    PHASES.LAND_SITUATION,
    PHASES.HOME_BASICS,
    PHASES.TIMELINE,
    PHASES.FINANCIAL_SNAPSHOT,
    PHASES.OPTIONAL_QUESTIONS,
    PHASES.PREQUALIFIED,
  ];

  // Special case: no consent means end call
  if (state.doNotContact) {
    return PHASES.END_CALL;
  }

  const currentIndex = phaseOrder.indexOf(state.phase);
  
  // If we're at the end, stay there
  if (currentIndex >= phaseOrder.length - 1) {
    return state.phase;
  }

  // Check if current phase is complete
  if (isPhaseComplete(state, state.phase)) {
    return phaseOrder[currentIndex + 1];
  }

  return state.phase;
}

/**
 * Check if a phase is complete (all required fields for that phase collected)
 */
export function isPhaseComplete(state, phase) {
  const phaseFields = PHASE_FIELDS[phase];
  
  if (!phaseFields) {
    // Welcome phase is complete after greeting
    if (phase === PHASES.WELCOME) return true;
    // Prequalified and end_call are terminal
    if (phase === PHASES.PREQUALIFIED || phase === PHASES.END_CALL) return true;
    return true;
  }

  // For consent phase, we need at least contact_consent
  if (phase === PHASES.CONSENT_CHECK) {
    return state.collectedData.consents.contact_consent !== undefined;
  }

  // For other phases, check if we have the required fields from that phase
  const requiredInPhase = phaseFields.filter(f => REQUIRED_FIELDS.includes(f));
  
  return requiredInPhase.every(field => {
    return getFieldValue(state, field) !== undefined;
  });
}

/**
 * Get a field value from the collected data structure
 */
export function getFieldValue(state, fieldName) {
  const { collectedData } = state;
  
  // Consent fields
  if (['contact_consent', 'tcpa_disclosure_ack', 'privacy_policy_ack'].includes(fieldName)) {
    return collectedData.consents[fieldName];
  }
  
  // Applicant fields
  if (['full_name', 'phone_e164', 'email', 'preferred_contact_method', 'best_time_to_contact'].includes(fieldName)) {
    return collectedData.applicant[fieldName];
  }
  
  // Home and site fields
  if (['property_zip', 'property_state', 'land_status', 'land_value_band', 'home_type', 
       'is_new_home_purchase', 'home_price_estimate_usd', 'site_work_needed', 
       'site_work_budget_estimate_usd', 'timeline'].includes(fieldName)) {
    return collectedData.home_and_site[fieldName];
  }
  
  // Financial snapshot fields
  if (['credit_band_self_reported', 'monthly_income_estimate_usd', 'has_recent_bankruptcy'].includes(fieldName)) {
    return collectedData.financial_snapshot[fieldName];
  }
  
  // Notes
  if (fieldName === 'notes_free_text') {
    return collectedData.notes.free_text;
  }
  
  return undefined;
}

/**
 * Set a field value in the collected data structure
 */
export function setFieldValue(state, fieldName, value) {
  const { collectedData } = state;
  
  // Consent fields
  if (['contact_consent', 'tcpa_disclosure_ack', 'privacy_policy_ack'].includes(fieldName)) {
    collectedData.consents[fieldName] = value;
    if (fieldName === 'contact_consent') {
      collectedData.consents.consented_at = new Date().toISOString();
      collectedData.consents.consent_language_version = '2026_01_01';
    }
  }
  // Applicant fields
  else if (['full_name', 'phone_e164', 'email', 'preferred_contact_method', 'best_time_to_contact'].includes(fieldName)) {
    collectedData.applicant[fieldName] = value;
  }
  // Home and site fields
  else if (['property_zip', 'property_state', 'land_status', 'land_value_band', 'home_type', 
            'is_new_home_purchase', 'home_price_estimate_usd', 'site_work_needed', 
            'site_work_budget_estimate_usd', 'timeline'].includes(fieldName)) {
    collectedData.home_and_site[fieldName] = value;
  }
  // Financial snapshot fields
  else if (['credit_band_self_reported', 'monthly_income_estimate_usd', 'has_recent_bankruptcy'].includes(fieldName)) {
    collectedData.financial_snapshot[fieldName] = value;
  }
  // Notes
  else if (fieldName === 'notes_free_text') {
    collectedData.notes.free_text = value;
  }
  
  // Update remaining required fields
  const idx = state.requiredFieldsRemaining.indexOf(fieldName);
  if (idx > -1) {
    state.requiredFieldsRemaining.splice(idx, 1);
  }
  
  // Track fields collected
  state.fieldsCollected++;
  
  return state;
}

/**
 * Check if the lead is ready for prequalification
 */
export function isPrequalificationReady(state) {
  return state.requiredFieldsRemaining.length === 0 && 
         state.collectedData.consents.contact_consent === true;
}

/**
 * Check if minimum lead fields are collected (for partial lead creation)
 * 
 * Minimum lead = consent + contact info (name, phone, email, preferred contact)
 * This allows us to create a lead early so we don't lose contactable leads if the call drops.
 */
export function isMinimumLeadReady(state) {
  const { collectedData } = state;
  
  return (
    // Must have consent to contact
    collectedData.consents.contact_consent === true &&
    // Must have name
    collectedData.applicant.full_name &&
    // Must have phone
    collectedData.applicant.phone_e164 &&
    // Must have email (now always collected)
    collectedData.applicant.email &&
    // Must have preferred contact method
    collectedData.applicant.preferred_contact_method
  );
}

/**
 * Advance the state machine to the next phase
 */
export function advancePhase(state) {
  const nextPhase = getNextPhase(state);
  
  if (nextPhase !== state.phase) {
    state.events.push({
      type: 'phase_transition',
      from: state.phase,
      to: nextPhase,
      timestamp: Date.now(),
    });
    state.phase = nextPhase;
  }
  
  // Check for prequalification - ALWAYS sync when in PREQUALIFIED phase
  if (isPrequalificationReady(state)) {
    state.prequalified = true;
    state.prequalifiedAt = state.prequalifiedAt || Date.now();
    if (state.phase !== PHASES.PREQUALIFIED) {
      state.phase = PHASES.PREQUALIFIED;
    }
  }
  
  return state;
}

/**
 * Handle a do-not-contact response
 */
export function handleDoNotContact(state, reason = 'user_declined') {
  state.doNotContact = true;
  state.phase = PHASES.END_CALL;
  state.events.push({
    type: 'do_not_contact',
    reason,
    timestamp: Date.now(),
  });
  return state;
}

/**
 * Get the next field to collect based on current phase
 */
export function getNextFieldToCollect(state) {
  const phaseFields = PHASE_FIELDS[state.phase];
  
  if (!phaseFields) {
    return null;
  }
  
  // First, check required fields in this phase
  for (const field of phaseFields) {
    if (REQUIRED_FIELDS.includes(field) && getFieldValue(state, field) === undefined) {
      return field;
    }
  }
  
  // For optional questions phase, check optional fields
  if (state.phase === PHASES.OPTIONAL_QUESTIONS) {
    for (const field of phaseFields) {
      if (getFieldValue(state, field) === undefined) {
        return field;
      }
    }
  }
  
  return null;
}

/**
 * Handle an interruption during data collection
 */
export function handleInterruption(state, utteranceUntilInterrupt) {
  state.events.push({
    type: 'interruption',
    phase: state.phase,
    pendingField: state.pendingField,
    utterance: utteranceUntilInterrupt,
    timestamp: Date.now(),
  });
  
  // Reset retry count when interrupted
  state.retryCount = 0;
  
  return state;
}

/**
 * Increment retry count and check if max retries exceeded
 */
export function handleRetry(state) {
  state.retryCount++;
  
  if (state.retryCount > state.maxRetries) {
    // Skip this field and move on
    state.events.push({
      type: 'field_skipped',
      field: state.pendingField,
      reason: 'max_retries_exceeded',
      timestamp: Date.now(),
    });
    state.pendingField = null;
    state.retryCount = 0;
    return { state, skipField: true };
  }
  
  return { state, skipField: false };
}

/**
 * Record that a question was asked
 */
export function recordQuestionAsked(state, field) {
  state.questionsAsked++;
  state.pendingField = field;
  state.pendingQuestion = {
    field,
    askedAt: Date.now(),
  };
  return state;
}

/**
 * Get summary of the session for logging/debugging
 */
export function getSessionSummary(state) {
  return {
    callSid: state.callSid,
    leadId: state.leadId,
    phase: state.phase,
    prequalified: state.prequalified,
    doNotContact: state.doNotContact,
    fieldsCollected: state.fieldsCollected,
    questionsAsked: state.questionsAsked,
    requiredFieldsRemaining: state.requiredFieldsRemaining.length,
    duration: Date.now() - state.startTime,
    eventCount: state.events.length,
  };
}

/**
 * Build the lead payload for Hestia API
 */
export function buildLeadPayload(state) {
  const { collectedData, callSid } = state;
  
  return {
    application_version: '2.0',
    idempotency_key: `voice_${callSid}`,
    source: {
      channel: 'voice',
      entrypoint: collectedData.source.entrypoint,
      session_id: callSid,
      tracking: collectedData.source.tracking,
    },
    applicant: {
      full_name: collectedData.applicant.full_name,
      phone_e164: collectedData.applicant.phone_e164,
      email: collectedData.applicant.email || null,
      preferred_contact_method: collectedData.applicant.preferred_contact_method || 'phone',
      best_time_to_contact: collectedData.applicant.best_time_to_contact || null,
      consents: {
        contact_consent: collectedData.consents.contact_consent,
        tcpa_disclosure_ack: collectedData.consents.tcpa_disclosure_ack,
        privacy_policy_ack: collectedData.consents.privacy_policy_ack || false,
        consent_language_version: collectedData.consents.consent_language_version,
      },
    },
    home_and_site: {
      property_zip: collectedData.home_and_site.property_zip,
      property_state: collectedData.home_and_site.property_state,
      land_status: collectedData.home_and_site.land_status,
      land_value_band: collectedData.home_and_site.land_value_band || null,
      home_type: collectedData.home_and_site.home_type,
      is_new_home_purchase: collectedData.home_and_site.is_new_home_purchase || null,
      home_price_estimate_usd: collectedData.home_and_site.home_price_estimate_usd || null,
      site_work_needed: collectedData.home_and_site.site_work_needed || null,
      site_work_budget_estimate_usd: collectedData.home_and_site.site_work_budget_estimate_usd || null,
      timeline: collectedData.home_and_site.timeline,
    },
    financial_snapshot: {
      credit_band_self_reported: collectedData.financial_snapshot.credit_band_self_reported || null,
      monthly_income_estimate_usd: collectedData.financial_snapshot.monthly_income_estimate_usd || null,
      has_recent_bankruptcy: collectedData.financial_snapshot.has_recent_bankruptcy || null,
    },
    notes: {
      free_text: collectedData.notes.free_text || null,
    },
    anti_abuse: {
      ip_address: null, // Not available for voice
      user_agent: null,
      captcha_passed: null,
    },
  };
}
