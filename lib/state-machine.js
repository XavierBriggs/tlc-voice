/**
 * Conversation State Machine for Lead Capture
 * 
 * Manages the flow of conversation through phases matching the Hestia Voice Questions.
 * Tracks collected data, confirmation status, and determines next actions.
 * 
 * Key features:
 * - Every field must be confirmed before moving on
 * - Supports both raw values and enum bands for land_value, credit, timeline
 * - Deterministic field ordering
 */

// Import PHASES from dedicated file (avoids circular dependency)
import { PHASES } from '../config/phases.js';
import { 
  computeLandValueBand, 
  computeCreditBand, 
  computeTimelineBand,
  computeBestTimeToContactBand,
} from './value-normalizers.js';

// Re-export PHASES for backwards compatibility
export { PHASES };

// =============================================================================
// FIELD DEFINITIONS
// =============================================================================

/**
 * Strict field ordering - this is the exact order fields will be collected and confirmed
 */
export const FIELD_ORDER = [
  'contact_consent',
  'full_name',
  'phone_e164',
  'email',
  'preferred_contact_method',
  'property_zip',
  'property_state',
  'land_status',
  'land_value',           // Stores land_value_raw + land_value_band
  'home_type',
  'timeline',             // Stores timeline_raw + timeline (band)
  'credit',               // Stores credit_raw + credit_band_self_reported
  'monthly_income',
  'has_recent_bankruptcy',
  'best_time_to_contact',
  'home_price',
  'site_work',
  'notes_free_text',
];

/**
 * Required fields for prequalification (must be collected AND confirmed)
 */
export const REQUIRED_FIELDS = [
  'contact_consent',
  'full_name',
  'phone_e164',
  'email',
  'preferred_contact_method',
  'property_zip',
  'property_state',
  'land_status',
  'home_type',
  'timeline',
  'credit',
  'best_time_to_contact',
];

/**
 * Optional fields (nice to have but not required for prequalification)
 */
export const OPTIONAL_FIELDS = [
  'land_value',
  'monthly_income',
  'has_recent_bankruptcy',
  'home_price',
  'site_work',
  'notes_free_text',
];

/**
 * Minimum fields required to create a partial lead in Hestia
 */
export const MINIMUM_LEAD_FIELDS = [
  'contact_consent',
  'full_name',
  'phone_e164',
  'email',
  'preferred_contact_method',
];

/**
 * Phase to field mapping - which fields are collected in each phase
 */
export const PHASE_FIELDS = {
  [PHASES.CONSENT_CHECK]: ['contact_consent'],
  [PHASES.CONTACT_INFO]: ['full_name', 'phone_e164', 'email', 'preferred_contact_method'],
  [PHASES.PROPERTY_LOCATION]: ['property_zip', 'property_state'],
  [PHASES.LAND_SITUATION]: ['land_status', 'land_value'],
  [PHASES.HOME_BASICS]: ['home_type'],
  [PHASES.TIMELINE]: ['timeline'],
  [PHASES.FINANCIAL_SNAPSHOT]: ['credit', 'monthly_income', 'has_recent_bankruptcy'],
  [PHASES.OPTIONAL_QUESTIONS]: ['home_price', 'site_work', 'best_time_to_contact', 'notes_free_text'],
};

/**
 * Fields that should skip land_value question if land_status is these values
 */
export const LAND_VALUE_APPLICABLE_STATUSES = ['own', 'buying', 'family_land', 'gifted_land'];

// =============================================================================
// STATE CREATION
// =============================================================================

/**
 * Create a new session state
 * 
 * Schema aligned with TLC Firestore Schemas V1
 */
export function createSessionState(callSid, metadata = {}) {
  return {
    callSid,
    leadId: null,
    phase: PHASES.WELCOME,
    
    // Collected data with confirmation tracking
    // Structure matches TLC Firestore Schemas V1
    collectedData: {
      // Source metadata - how the lead originated
      source: {
        channel: 'voice',
        session_id: callSid,
        entrypoint: metadata.entrypoint || 'tlc_phone',
        referrer_url: null,
        landing_url: null,
        ip_hash: null,
        user_agent: null,
        
        // Attribution - dealer locking and tracking
        attribution: {
          utm: {
            utm_source: null,
            utm_medium: null,
            utm_campaign: null,
            utm_term: null,
            utm_content: null,
          },
          referral_code: null,
          dealer_id_from_referral: null,
          inbound_dealer_number: metadata.attribution?.inbound_dealer_number || null,
          attribution_token: null,
          locked_dealer_id: metadata.attribution?.locked_dealer_id || null,
          locked_reason: metadata.attribution?.locked_reason || null,
          locked_at: metadata.attribution?.locked_at || null,
          lock_expires_at: null,
        },
      },
      
      // Consent fields (root level per TLC schema)
      consents: {
        contact_consent: null,
        contact_consent_confirmed: false,
        tcpa_disclosure_ack: null,
        privacy_policy_ack: null,
        consent_language_version: null,
        consent_capture_method: 'voice_yes',  // Default for voice channel
        consented_at: null,
      },
      
      // Applicant PII (no longer contains consents)
      applicant: {
        full_name: null,
        full_name_confirmed: false,
        phone_e164: null,
        phone_e164_confirmed: false,
        email: null,
        email_confirmed: false,
        preferred_contact_method: null,
        preferred_contact_method_confirmed: false,
        best_time_to_contact: null,
        best_time_to_contact_raw: null,
        best_time_to_contact_confirmed: false,
      },
      
      // Home and site information
      home_and_site: {
        property_zip: null,
        property_zip_confirmed: false,
        property_state: null,
        property_state_confirmed: false,
        land_status: null,
        land_status_confirmed: false,
        land_value_raw: null,
        land_value_band: null,
        land_value_confirmed: false,
        home_type: null,
        home_type_confirmed: false,
        is_new_home_purchase: null,
        home_price_estimate_usd: null,
        home_price_confirmed: false,
        site_work_needed: null,
        site_work_confirmed: false,
        timeline_raw: null,
        timeline: null,
        timeline_confirmed: false,
      },
      
      // Financial snapshot
      financial_snapshot: {
        credit_raw: null,
        credit_band_self_reported: null,
        credit_confirmed: false,
        monthly_income_estimate_usd: null,
        monthly_income_confirmed: false,
        has_recent_bankruptcy: null,
        has_recent_bankruptcy_confirmed: false,
      },
      
      // Notes
      notes: {
        free_text: null,
        free_text_confirmed: false,
      },
      
      // Internal conversation history (not sent to Firestore)
      _conversationHistory: [],
    },
    
    // Tracking
    pendingQuestion: null,
    pendingField: null,
    retryCount: 0,
    maxRetries: 2,
    prequalified: false,
    doNotContact: false,
    startTime: Date.now(),
    
    // Call metadata
    metadata: {
      from: metadata.from,
      to: metadata.to,
      direction: metadata.direction,
      customParameters: metadata.customParameters,
    },
    
    // Event log
    events: [],
    
    // Metrics
    questionsAsked: 0,
    fieldsCollected: 0,
    fieldsConfirmed: 0,
  };
}

// =============================================================================
// FIELD VALUE GETTERS AND SETTERS
// =============================================================================

/**
 * Get a field value from the collected data structure
 * 
 * @param {object} state - Session state
 * @param {string} fieldName - Field name (e.g., 'full_name', 'land_value', 'credit')
 * @returns {*} - Field value or undefined
 */
export function getFieldValue(state, fieldName) {
  const { collectedData } = state;
  
  // Consent fields
  if (fieldName === 'contact_consent') {
    return collectedData.consents.contact_consent;
  }
  
  // Applicant fields
  if (['full_name', 'phone_e164', 'email', 'preferred_contact_method', 'best_time_to_contact'].includes(fieldName)) {
    return collectedData.applicant[fieldName];
  }
  
  // Property location
  if (['property_zip', 'property_state'].includes(fieldName)) {
    return collectedData.home_and_site[fieldName];
  }
  
  // Land status
  if (fieldName === 'land_status') {
    return collectedData.home_and_site.land_status;
  }
  
  // Land value - return the band (the value that matters for prequalification)
  if (fieldName === 'land_value') {
    return collectedData.home_and_site.land_value_band;
  }
  
  // Home type
  if (fieldName === 'home_type') {
    return collectedData.home_and_site.home_type;
  }
  
  // Home price
  if (fieldName === 'home_price') {
    return collectedData.home_and_site.home_price_estimate_usd;
  }
  
  // Site work
  if (fieldName === 'site_work') {
    return collectedData.home_and_site.site_work_needed;
  }
  
  // Timeline - return the band
  if (fieldName === 'timeline') {
    return collectedData.home_and_site.timeline;
  }
  
  // Credit - return the band
  if (fieldName === 'credit') {
    return collectedData.financial_snapshot.credit_band_self_reported;
  }
  
  // Monthly income
  if (fieldName === 'monthly_income') {
    return collectedData.financial_snapshot.monthly_income_estimate_usd;
  }
  
  // Bankruptcy
  if (fieldName === 'has_recent_bankruptcy') {
    return collectedData.financial_snapshot.has_recent_bankruptcy;
  }
  
  // Notes
  if (fieldName === 'notes_free_text') {
    return collectedData.notes.free_text;
  }
  
  return undefined;
}

/**
 * Get the raw value for a field (for confirmation speech)
 * 
 * @param {object} state - Session state
 * @param {string} fieldName - Field name
 * @returns {*} - Raw value or the regular value
 */
export function getRawValue(state, fieldName) {
  const { collectedData } = state;
  
  // Land value - return raw dollar amount
  if (fieldName === 'land_value') {
    return collectedData.home_and_site.land_value_raw;
  }
  
  // Timeline - return raw string (e.g., "April")
  if (fieldName === 'timeline') {
    return collectedData.home_and_site.timeline_raw;
  }
  
  // Credit - return raw score
  if (fieldName === 'credit') {
    return collectedData.financial_snapshot.credit_raw;
  }
  
  // Best time to contact - return raw string (e.g., "mornings work best")
  if (fieldName === 'best_time_to_contact') {
    return collectedData.applicant.best_time_to_contact_raw;
  }
  
  // For other fields, return the regular value
  return getFieldValue(state, fieldName);
}

/**
 * Check if a field has been confirmed
 * 
 * @param {object} state - Session state
 * @param {string} fieldName - Field name
 * @returns {boolean} - Whether the field is confirmed
 */
export function isFieldConfirmed(state, fieldName) {
  const { collectedData } = state;
  
  // Map field name to confirmed flag location
  const confirmFlagMap = {
    contact_consent: () => collectedData.consents.contact_consent_confirmed,
    full_name: () => collectedData.applicant.full_name_confirmed,
    phone_e164: () => collectedData.applicant.phone_e164_confirmed,
    email: () => collectedData.applicant.email_confirmed,
    preferred_contact_method: () => collectedData.applicant.preferred_contact_method_confirmed,
    best_time_to_contact: () => collectedData.applicant.best_time_to_contact_confirmed,
    property_zip: () => collectedData.home_and_site.property_zip_confirmed,
    property_state: () => collectedData.home_and_site.property_state_confirmed,
    land_status: () => collectedData.home_and_site.land_status_confirmed,
    land_value: () => collectedData.home_and_site.land_value_confirmed,
    home_type: () => collectedData.home_and_site.home_type_confirmed,
    home_price: () => collectedData.home_and_site.home_price_confirmed,
    site_work: () => collectedData.home_and_site.site_work_confirmed,
    timeline: () => collectedData.home_and_site.timeline_confirmed,
    credit: () => collectedData.financial_snapshot.credit_confirmed,
    monthly_income: () => collectedData.financial_snapshot.monthly_income_confirmed,
    has_recent_bankruptcy: () => collectedData.financial_snapshot.has_recent_bankruptcy_confirmed,
    notes_free_text: () => collectedData.notes.free_text_confirmed,
  };
  
  const getter = confirmFlagMap[fieldName];
  return getter ? getter() === true : false;
}

/**
 * Set a field value in the collected data structure
 * Also computes and stores bands for fields that have raw + band pairs
 * 
 * @param {object} state - Session state
 * @param {string} fieldName - Field name
 * @param {*} value - Field value (raw value for land_value, credit, timeline)
 * @param {boolean} confirmed - Whether the value is confirmed (default false)
 * @returns {object} - Updated state
 */
export function setFieldValue(state, fieldName, value, confirmed = false) {
  const { collectedData } = state;
  
  // Consent fields
  if (fieldName === 'contact_consent') {
    collectedData.consents.contact_consent = value;
    collectedData.consents.contact_consent_confirmed = confirmed;
    if (value) {
      collectedData.consents.consented_at = new Date().toISOString();
      collectedData.consents.consent_language_version = '2026_01_01';
      collectedData.consents.tcpa_disclosure_ack = true;
    }
  }
  
  // Applicant fields
  else if (fieldName === 'full_name') {
    collectedData.applicant.full_name = value;
    collectedData.applicant.full_name_confirmed = confirmed;
  }
  else if (fieldName === 'phone_e164') {
    collectedData.applicant.phone_e164 = value;
    collectedData.applicant.phone_e164_confirmed = confirmed;
  }
  else if (fieldName === 'email') {
    collectedData.applicant.email = value;
    collectedData.applicant.email_confirmed = confirmed;
  }
  else if (fieldName === 'preferred_contact_method') {
    collectedData.applicant.preferred_contact_method = value;
    collectedData.applicant.preferred_contact_method_confirmed = confirmed;
  }
  else if (fieldName === 'best_time_to_contact') {
    // Compute band from raw value
    const { raw, band } = computeBestTimeToContactBand(value);
    collectedData.applicant.best_time_to_contact_raw = raw;
    collectedData.applicant.best_time_to_contact = band;
    collectedData.applicant.best_time_to_contact_confirmed = confirmed;
  }
  
  // Property location
  else if (fieldName === 'property_zip') {
    collectedData.home_and_site.property_zip = value;
    collectedData.home_and_site.property_zip_confirmed = confirmed;
  }
  else if (fieldName === 'property_state') {
    collectedData.home_and_site.property_state = value;
    collectedData.home_and_site.property_state_confirmed = confirmed;
  }
  
  // Land status
  else if (fieldName === 'land_status') {
    collectedData.home_and_site.land_status = value;
    collectedData.home_and_site.land_status_confirmed = confirmed;
  }
  
  // Land value - compute band from raw value
  else if (fieldName === 'land_value') {
    const { raw, band } = computeLandValueBand(value);
    collectedData.home_and_site.land_value_raw = raw;
    collectedData.home_and_site.land_value_band = band;
    collectedData.home_and_site.land_value_confirmed = confirmed;
  }
  
  // Home type
  else if (fieldName === 'home_type') {
    collectedData.home_and_site.home_type = value;
    collectedData.home_and_site.home_type_confirmed = confirmed;
  }
  
  // Home price
  else if (fieldName === 'home_price') {
    collectedData.home_and_site.home_price_estimate_usd = value;
    collectedData.home_and_site.home_price_confirmed = confirmed;
  }
  
  // Site work
  else if (fieldName === 'site_work') {
    collectedData.home_and_site.site_work_needed = value;
    collectedData.home_and_site.site_work_confirmed = confirmed;
  }
  
  // Timeline - compute band from raw value
  else if (fieldName === 'timeline') {
    const { raw, band } = computeTimelineBand(value);
    collectedData.home_and_site.timeline_raw = raw;
    collectedData.home_and_site.timeline = band;
    collectedData.home_and_site.timeline_confirmed = confirmed;
  }
  
  // Credit - compute band from raw value
  else if (fieldName === 'credit') {
    const { raw, band } = computeCreditBand(value);
    collectedData.financial_snapshot.credit_raw = raw;
    collectedData.financial_snapshot.credit_band_self_reported = band;
    collectedData.financial_snapshot.credit_confirmed = confirmed;
  }
  
  // Monthly income
  else if (fieldName === 'monthly_income') {
    collectedData.financial_snapshot.monthly_income_estimate_usd = value;
    collectedData.financial_snapshot.monthly_income_confirmed = confirmed;
  }
  
  // Bankruptcy
  else if (fieldName === 'has_recent_bankruptcy') {
    collectedData.financial_snapshot.has_recent_bankruptcy = value;
    collectedData.financial_snapshot.has_recent_bankruptcy_confirmed = confirmed;
  }
  
  // Notes
  else if (fieldName === 'notes_free_text') {
    collectedData.notes.free_text = value;
    collectedData.notes.free_text_confirmed = confirmed;
  }
  
  // Track metrics
  state.fieldsCollected++;
  if (confirmed) {
    state.fieldsConfirmed++;
  }
  
  return state;
}

/**
 * Mark a field as confirmed
 * 
 * @param {object} state - Session state
 * @param {string} fieldName - Field name
 * @returns {object} - Updated state
 */
export function confirmField(state, fieldName) {
  const { collectedData } = state;
  
  const confirmSetterMap = {
    contact_consent: () => { collectedData.consents.contact_consent_confirmed = true; },
    full_name: () => { collectedData.applicant.full_name_confirmed = true; },
    phone_e164: () => { collectedData.applicant.phone_e164_confirmed = true; },
    email: () => { collectedData.applicant.email_confirmed = true; },
    preferred_contact_method: () => { collectedData.applicant.preferred_contact_method_confirmed = true; },
    best_time_to_contact: () => { collectedData.applicant.best_time_to_contact_confirmed = true; },
    property_zip: () => { collectedData.home_and_site.property_zip_confirmed = true; },
    property_state: () => { collectedData.home_and_site.property_state_confirmed = true; },
    land_status: () => { collectedData.home_and_site.land_status_confirmed = true; },
    land_value: () => { collectedData.home_and_site.land_value_confirmed = true; },
    home_type: () => { collectedData.home_and_site.home_type_confirmed = true; },
    home_price: () => { collectedData.home_and_site.home_price_confirmed = true; },
    site_work: () => { collectedData.home_and_site.site_work_confirmed = true; },
    timeline: () => { collectedData.home_and_site.timeline_confirmed = true; },
    credit: () => { collectedData.financial_snapshot.credit_confirmed = true; },
    monthly_income: () => { collectedData.financial_snapshot.monthly_income_confirmed = true; },
    has_recent_bankruptcy: () => { collectedData.financial_snapshot.has_recent_bankruptcy_confirmed = true; },
    notes_free_text: () => { collectedData.notes.free_text_confirmed = true; },
  };
  
  const setter = confirmSetterMap[fieldName];
  if (setter) {
    setter();
    state.fieldsConfirmed++;
    
    state.events.push({
      type: 'field_confirmed',
      field: fieldName,
      timestamp: Date.now(),
    });
  }
  
  return state;
}

// =============================================================================
// PHASE MANAGEMENT
// =============================================================================

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

  // Check if current phase is complete (all fields collected AND confirmed)
  if (isPhaseComplete(state, state.phase)) {
    return phaseOrder[currentIndex + 1];
  }

  return state.phase;
}

/**
 * Check if a phase is complete
 * A phase is complete when all its required fields are collected AND confirmed
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

  // Check each field in the phase
  for (const field of phaseFields) {
    // Skip optional fields
    if (OPTIONAL_FIELDS.includes(field)) continue;
    
    // Skip land_value if land_status doesn't require it
    if (field === 'land_value') {
      const landStatus = getFieldValue(state, 'land_status');
      if (!LAND_VALUE_APPLICABLE_STATUSES.includes(landStatus)) continue;
    }
    
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    // Field must exist AND be confirmed
    if (value === undefined || !confirmed) {
      return false;
    }
  }
  
  return true;
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
  
  // Check for prequalification
  if (isPrequalificationReady(state)) {
    state.prequalified = true;
    state.prequalifiedAt = state.prequalifiedAt || Date.now();
    if (state.phase !== PHASES.PREQUALIFIED) {
      state.phase = PHASES.PREQUALIFIED;
    }
  }
  
  return state;
}

// =============================================================================
// PREQUALIFICATION CHECKS
// =============================================================================

/**
 * Check if the lead is ready for prequalification
 * All required fields must be collected AND confirmed
 */
export function isPrequalificationReady(state) {
  // Must have consent
  if (!state.collectedData.consents.contact_consent) {
    return false;
  }
  
  // Check all required fields
  for (const field of REQUIRED_FIELDS) {
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    if (value === undefined || !confirmed) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if minimum lead fields are collected (for partial lead creation)
 * Minimum fields must be collected AND confirmed
 */
export function isMinimumLeadReady(state) {
  for (const field of MINIMUM_LEAD_FIELDS) {
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    if (value === undefined || !confirmed) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get list of fields that have values but are not yet confirmed
 */
export function getUnconfirmedFields(state) {
  const unconfirmed = [];
  
  for (const field of FIELD_ORDER) {
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    // Skip land_value if not applicable
    if (field === 'land_value') {
      const landStatus = getFieldValue(state, 'land_status');
      if (!LAND_VALUE_APPLICABLE_STATUSES.includes(landStatus)) continue;
    }
    
    if (value !== undefined && !confirmed) {
      unconfirmed.push({
        field,
        value,
        rawValue: getRawValue(state, field),
      });
    }
  }
  
  return unconfirmed;
}

/**
 * Get the next field to collect (first uncollected required field in order)
 */
export function getNextFieldToCollect(state) {
  for (const field of FIELD_ORDER) {
    // Skip optional fields unless we're in optional questions phase
    if (OPTIONAL_FIELDS.includes(field) && state.phase !== PHASES.OPTIONAL_QUESTIONS) {
      continue;
    }
    
    // Skip land_value if not applicable
    if (field === 'land_value') {
      const landStatus = getFieldValue(state, 'land_status');
      if (!LAND_VALUE_APPLICABLE_STATUSES.includes(landStatus)) continue;
    }
    
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    // Need to collect if value is missing OR not confirmed
    if (value === undefined) {
      return field;
    }
    
    // Skip if confirmed
    if (confirmed) {
      continue;
    }
    
    // Has value but not confirmed - will be handled by confirmation flow
  }
  
  return null;
}

/**
 * Get remaining required fields that need to be collected or confirmed
 */
export function getRemainingRequiredFields(state) {
  const remaining = [];
  
  for (const field of REQUIRED_FIELDS) {
    const value = getFieldValue(state, field);
    const confirmed = isFieldConfirmed(state, field);
    
    if (value === undefined || !confirmed) {
      remaining.push(field);
    }
  }
  
  return remaining;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

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
  
  state.retryCount = 0;
  return state;
}

/**
 * Increment retry count and check if max retries exceeded
 */
export function handleRetry(state) {
  state.retryCount++;
  
  if (state.retryCount > state.maxRetries) {
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

// =============================================================================
// UTILITIES
// =============================================================================

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
    fieldsConfirmed: state.fieldsConfirmed,
    questionsAsked: state.questionsAsked,
    remainingRequired: getRemainingRequiredFields(state).length,
    unconfirmed: getUnconfirmedFields(state).length,
    duration: Date.now() - state.startTime,
    eventCount: state.events.length,
  };
}

/**
 * Build the lead payload for Firestore
 * 
 * Schema aligned with TLC Firestore Schemas V1
 * Includes all objects: source, consents, applicant, home_and_site, 
 * financial_snapshot, notes, assignment, delivery, human, flags
 */
export function buildLeadPayload(state) {
  const { collectedData, callSid } = state;
  
  return {
    // Identity and version
    schema_version: 1,
    
    // Status - voice agent creates leads in 'collecting' status
    status: 'collecting',
    status_reason: null,
    
    // Source metadata
    source: {
      channel: 'voice',
      session_id: callSid,
      entrypoint: collectedData.source.entrypoint,
      referrer_url: null,
      landing_url: null,
      ip_hash: null,
      user_agent: null,
      
      // Attribution - dealer locking
      attribution: {
        utm: {
          utm_source: collectedData.source.attribution?.utm?.utm_source || null,
          utm_medium: collectedData.source.attribution?.utm?.utm_medium || null,
          utm_campaign: collectedData.source.attribution?.utm?.utm_campaign || null,
          utm_term: collectedData.source.attribution?.utm?.utm_term || null,
          utm_content: collectedData.source.attribution?.utm?.utm_content || null,
        },
        referral_code: collectedData.source.attribution?.referral_code || null,
        dealer_id_from_referral: collectedData.source.attribution?.dealer_id_from_referral || null,
        inbound_dealer_number: collectedData.source.attribution?.inbound_dealer_number || null,
        attribution_token: collectedData.source.attribution?.attribution_token || null,
        locked_dealer_id: collectedData.source.attribution?.locked_dealer_id || null,
        locked_reason: collectedData.source.attribution?.locked_reason || null,
        locked_at: collectedData.source.attribution?.locked_at || null,
        lock_expires_at: collectedData.source.attribution?.lock_expires_at || null,
      },
    },
    
    // Consents (root level per TLC schema)
    consents: {
      contact_consent: collectedData.consents.contact_consent ?? null,
      tcpa_disclosure_ack: collectedData.consents.tcpa_disclosure_ack ?? null,
      privacy_policy_ack: collectedData.consents.privacy_policy_ack ?? null,
      consent_language_version: collectedData.consents.consent_language_version || null,
      consent_capture_method: collectedData.consents.consent_capture_method || 'voice_yes',
      consented_at: collectedData.consents.consented_at || null,
    },
    
    // Applicant (no longer contains consents)
    applicant: {
      full_name: collectedData.applicant.full_name || null,
      phone_e164: collectedData.applicant.phone_e164 || null,
      email: collectedData.applicant.email || null,
      preferred_contact_method: collectedData.applicant.preferred_contact_method || null,
      best_time_to_contact: collectedData.applicant.best_time_to_contact || null,
    },
    
    // Home and site
    home_and_site: {
      property_zip: collectedData.home_and_site.property_zip || null,
      property_state: collectedData.home_and_site.property_state || null,
      land_status: collectedData.home_and_site.land_status || null,
      land_value_band: collectedData.home_and_site.land_value_band || null,
      home_type: collectedData.home_and_site.home_type || null,
      is_new_home_purchase: collectedData.home_and_site.is_new_home_purchase ?? null,
      timeline: collectedData.home_and_site.timeline || null,
      site_work_needed: collectedData.home_and_site.site_work_needed || null,
      home_price_estimate_usd: collectedData.home_and_site.home_price_estimate_usd ?? null,
    },
    
    // Financial snapshot
    financial_snapshot: {
      credit_band_self_reported: collectedData.financial_snapshot.credit_band_self_reported || null,
      monthly_income_estimate_usd: collectedData.financial_snapshot.monthly_income_estimate_usd ?? null,
      has_recent_bankruptcy: collectedData.financial_snapshot.has_recent_bankruptcy ?? null,
    },
    
    // Notes
    notes: {
      free_text: collectedData.notes.free_text || null,
    },
    
    // Assignment (routing) - initialized empty, populated by cloud function
    assignment: {
      assigned_dealer_id: null,
      assignment_type: null,
      assignment_reason: null,
      routing_version: 1,
      routed_at: null,
      routing_attempt_count: 0,
      routing_last_attempt_at: null,
      routing_last_error: null,
    },
    
    // Delivery (notifications) - initialized pending
    delivery: {
      status: 'pending',
      dealer_delivery_enabled: false,
      tlc_team_notified: false,
      attempts: 0,
      last_attempt_at: null,
      delivered_at: null,
      last_error: null,
    },
    
    // Human workflow - initialized unclaimed
    human: {
      state: 'unclaimed',
      owner_user_id: null,
      owner_name: null,
      claimed_at: null,
      last_touched_at: null,
      first_contacted_at: null,
      last_contact_attempt_at: null,
      contact_attempts: 0,
      outcome: null,
      outcome_notes: null,
      next_follow_up_at: null,
    },
    
    // Flags
    flags: {
      test_lead: false,
      duplicate_of_lead_id: null,
    },
  };
}

/**
 * Build update payload for an existing lead
 * Only includes fields that have changed (non-null values)
 */
export function buildLeadUpdatePayload(state) {
  const { collectedData } = state;
  
  // Only include fields with actual values
  const update = {};
  
  // Consents
  if (collectedData.consents.contact_consent !== null) {
    update.consents = {
      contact_consent: collectedData.consents.contact_consent,
      tcpa_disclosure_ack: collectedData.consents.tcpa_disclosure_ack,
      privacy_policy_ack: collectedData.consents.privacy_policy_ack,
      consent_language_version: collectedData.consents.consent_language_version,
      consent_capture_method: collectedData.consents.consent_capture_method,
      consented_at: collectedData.consents.consented_at,
    };
  }
  
  // Applicant
  const applicantFields = ['full_name', 'phone_e164', 'email', 'preferred_contact_method', 'best_time_to_contact'];
  const applicantUpdate = {};
  for (const field of applicantFields) {
    if (collectedData.applicant[field] !== null) {
      applicantUpdate[field] = collectedData.applicant[field];
    }
  }
  if (Object.keys(applicantUpdate).length > 0) {
    update.applicant = applicantUpdate;
  }
  
  // Home and site
  const homeFields = ['property_zip', 'property_state', 'land_status', 'land_value_band', 
                      'home_type', 'is_new_home_purchase', 'timeline', 'site_work_needed', 
                      'home_price_estimate_usd'];
  const homeUpdate = {};
  for (const field of homeFields) {
    if (collectedData.home_and_site[field] !== null && collectedData.home_and_site[field] !== undefined) {
      homeUpdate[field] = collectedData.home_and_site[field];
    }
  }
  if (Object.keys(homeUpdate).length > 0) {
    update.home_and_site = homeUpdate;
  }
  
  // Financial snapshot
  const finFields = ['credit_band_self_reported', 'monthly_income_estimate_usd', 'has_recent_bankruptcy'];
  const finUpdate = {};
  for (const field of finFields) {
    if (collectedData.financial_snapshot[field] !== null && collectedData.financial_snapshot[field] !== undefined) {
      finUpdate[field] = collectedData.financial_snapshot[field];
    }
  }
  if (Object.keys(finUpdate).length > 0) {
    update.financial_snapshot = finUpdate;
  }
  
  // Notes
  if (collectedData.notes.free_text) {
    update.notes = { free_text: collectedData.notes.free_text };
  }
  
  return update;
}
