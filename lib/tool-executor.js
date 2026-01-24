/**
 * Tool Executor for Lead Capture
 * 
 * Processes the unified extract_fields tool calls and updates conversation state.
 * Works with the ConversationController for deterministic flow.
 */

import {
  setFieldValue,
  confirmField,
  advancePhase,
  handleDoNotContact,
  isMinimumLeadReady,
  PHASES,
} from './state-machine.js';

import { EXTRACTION_TO_STATE_FIELD_MAP } from './tools.js';
import { 
  isValidZipCode, 
  isValidE164Phone, 
  isValidEmail, 
  normalizeToE164,
  isValidEnum,
  US_STATES,
} from '../config/enums.js';

// =============================================================================
// MAIN EXECUTOR
// =============================================================================

/**
 * Execute a tool call and update state
 * 
 * @param {string} toolName - Name of the tool
 * @param {object} args - Tool arguments
 * @param {object} state - Current session state
 * @param {object} context - Additional context { hestiaClient, pendingConfirmation, currentAction }
 * @returns {object} - { state, result, fieldsExtracted, needsSync }
 */
export async function executeTool(toolName, args, state, context = {}) {
  const { hestiaClient, pendingConfirmation, currentAction } = context;
  
  console.log(`[TOOL] Executing: ${toolName}`, JSON.stringify(args));
  
  try {
    switch (toolName) {
      case 'extract_fields':
        return await handleExtractFields(args, state, pendingConfirmation, hestiaClient, currentAction);
      
      case 'provide_info':
        return handleProvideInfo(args, state);
      
      case 'request_clarification':
        return handleRequestClarification(args, state);
      
      case 'end_call':
        return await handleEndCall(args, state, hestiaClient);
        
      default:
        console.warn(`[TOOL] Unknown tool: ${toolName}`);
        return {
          state,
          result: { success: false, error: 'Unknown tool' },
          fieldsExtracted: [],
          needsSync: false,
        };
    }
  } catch (error) {
    console.error(`[TOOL] Error executing ${toolName}:`, error);
    return {
      state,
      result: { success: false, error: error.message },
      fieldsExtracted: [],
      needsSync: false,
    };
  }
}

// =============================================================================
// EXTRACT FIELDS HANDLER
// =============================================================================

/**
 * Handle the unified extract_fields tool
 */
async function handleExtractFields(args, state, pendingConfirmation, hestiaClient, currentAction) {
  const fieldsExtracted = [];
  const validationErrors = [];
  let needsSync = false;
  let confirmationHandled = false;
  
  // Track which field was just confirmed so we don't re-extract it
  let justConfirmedField = null;
  
  // List of boolean fields where yes/no answers the question directly
  const BOOLEAN_FIELDS = ['has_recent_bankruptcy', 'contact_consent'];
  
  // Handle confirmation response first
  if (args.confirmation !== undefined) {
    if (pendingConfirmation) {
      // There's a pending confirmation to respond to
      confirmationHandled = true;
      
      if (args.confirmation === true) {
        // User confirmed - mark the field as confirmed
        state = confirmField(state, pendingConfirmation.field);
        justConfirmedField = pendingConfirmation.field;
        fieldsExtracted.push({
          field: pendingConfirmation.field,
          action: 'confirmed',
        });
        needsSync = true;
      } else {
        // User said no - they might provide a correction in the same response
        // Don't mark as confirmed, let the correction be processed below
        fieldsExtracted.push({
          field: pendingConfirmation.field,
          action: 'rejected',
        });
      }
    } else if (args.confirmation === true && 
               (state.phase === PHASES.CONSENT_CHECK || state.phase === PHASES.WELCOME)) {
      // Special case: User says "Yes" to welcome greeting without pending confirmation
      // This is their consent to be contacted
      console.log('[TOOL] Treating "Yes" as contact_consent in welcome/consent_check phase');
      args.contact_consent = true;
    } else if (currentAction?.type === 'ask' && BOOLEAN_FIELDS.includes(currentAction.field)) {
      // Special case: We're asking a boolean question and LLM sent confirmation response
      // Treat "Yes"/"No" as the actual answer to the boolean field
      const boolField = currentAction.field;
      const boolValue = args.confirmation;
      
      // Check if no other data was extracted (just confirmation)
      const hasOtherData = Object.keys(args).some(k => k !== 'confirmation' && args[k] !== null && args[k] !== undefined);
      
      if (!hasOtherData) {
        console.log(`[TOOL] Treating confirmation=${boolValue} as ${boolField}=${boolValue} (boolean question)`);
        args[boolField] = boolValue;
      }
    }
  }
  
  // Process each extracted field
  for (const [extractedField, value] of Object.entries(args)) {
    // Skip the confirmation flag itself
    if (extractedField === 'confirmation') continue;
    
    // Skip null/undefined values
    if (value === null || value === undefined) continue;
    
    // Map to state field name
    const stateField = EXTRACTION_TO_STATE_FIELD_MAP[extractedField];
    if (!stateField) {
      console.warn(`[TOOL] Unknown extraction field: ${extractedField}`);
      continue;
    }
    
    // Skip if we just confirmed this field (don't overwrite with unconfirmed)
    if (stateField === justConfirmedField) {
      console.log(`[TOOL] Skipping ${extractedField} - just confirmed`);
      continue;
    }
    
    // Validate and normalize the value
    const { valid, normalizedValue, error } = validateAndNormalize(stateField, value);
    
    if (!valid) {
      validationErrors.push({ field: stateField, error });
      continue;
    }
    
    // Set the field value (unconfirmed)
    state = setFieldValue(state, stateField, normalizedValue, false);
    needsSync = true;
    
    fieldsExtracted.push({
      field: stateField,
      value: normalizedValue,
      action: 'extracted',
    });
    
    console.log(`[TOOL] Extracted ${stateField}: ${JSON.stringify(normalizedValue)}`);
  }
  
  // Check for special consent handling
  if (args.contact_consent === false) {
    state = handleDoNotContact(state, 'user_declined_consent');
  }
  
  // Sync to Hestia if we have minimum fields
  if (needsSync && hestiaClient) {
  await syncLeadToHestia(state, hestiaClient);
  }
  
  // Advance phase if appropriate
  state = advancePhase(state);
  
  return {
    state,
    result: {
      success: true,
      fieldsExtracted: fieldsExtracted.length,
      validationErrors,
    },
    fieldsExtracted,
    needsSync,
    confirmationHandled,
  };
}

// =============================================================================
// VALIDATION AND NORMALIZATION
// =============================================================================

/**
 * Validate and normalize a field value
 */
function validateAndNormalize(field, value) {
  switch (field) {
    case 'contact_consent':
      return { valid: true, normalizedValue: Boolean(value) };
      
    case 'full_name':
      if (!value || String(value).trim().length < 2) {
        return { valid: false, error: 'Name too short' };
      }
      return { valid: true, normalizedValue: String(value).trim() };
      
    case 'phone_e164':
      const normalized = normalizeToE164(String(value));
      if (!normalized) {
        return { valid: false, error: 'Invalid phone number' };
      }
      return { valid: true, normalizedValue: normalized };
      
    case 'email':
      const email = String(value).toLowerCase().trim();
      if (!isValidEmail(email)) {
        return { valid: false, error: 'Invalid email format' };
      }
      return { valid: true, normalizedValue: email };
      
    case 'preferred_contact_method':
      if (!isValidEnum('preferred_contact_method', value)) {
        return { valid: false, error: 'Invalid contact method' };
      }
      return { valid: true, normalizedValue: value };
      
    case 'property_zip':
      const cleanZip = String(value).replace(/\D/g, '').slice(0, 5);
      if (cleanZip.length !== 5) {
        return { valid: false, error: 'Invalid ZIP code' };
      }
      return { valid: true, normalizedValue: cleanZip };
      
    case 'property_state':
      const stateUpper = String(value).toUpperCase().trim();
      // Convert full state names to abbreviations
      const stateAbbrev = STATE_NAME_TO_ABBREV[stateUpper] || stateUpper;
      if (!US_STATES.includes(stateAbbrev)) {
        return { valid: false, error: 'Invalid state' };
      }
      return { valid: true, normalizedValue: stateAbbrev };
      
    case 'land_status':
      if (!isValidEnum('land_status', value)) {
        return { valid: false, error: 'Invalid land status' };
      }
      return { valid: true, normalizedValue: value };
      
    case 'land_value':
      // Raw value - state machine will compute band
      const landVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,$]/g, ''));
      if (isNaN(landVal) || landVal < 0) {
        return { valid: false, error: 'Invalid land value' };
      }
      return { valid: true, normalizedValue: landVal };
      
    case 'home_type':
      if (!isValidEnum('home_type', value)) {
        return { valid: false, error: 'Invalid home type' };
      }
      return { valid: true, normalizedValue: value };
      
    case 'timeline':
      // Raw value - state machine will compute band
      return { valid: true, normalizedValue: String(value) };
      
    case 'credit':
      // Raw credit score - state machine will compute band
      const creditVal = typeof value === 'number' ? value : parseInt(String(value).replace(/\D/g, ''), 10);
      if (isNaN(creditVal) || creditVal < 300 || creditVal > 850) {
        return { valid: false, error: 'Invalid credit score' };
      }
      return { valid: true, normalizedValue: creditVal };
      
    case 'monthly_income':
      const income = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,$]/g, ''));
      if (isNaN(income) || income < 0) {
        return { valid: false, error: 'Invalid income' };
      }
      return { valid: true, normalizedValue: income };
      
    case 'has_recent_bankruptcy':
      if (value === null || value === 'prefer_not_to_say') {
        return { valid: true, normalizedValue: null };
      }
      return { valid: true, normalizedValue: Boolean(value) };
      
    case 'best_time_to_contact':
      // Accept raw string - state machine will compute band
      return { valid: true, normalizedValue: String(value) };
      
    case 'home_price':
      const price = typeof value === 'number' ? value : parseFloat(String(value).replace(/[,$]/g, ''));
      if (isNaN(price) || price < 0) {
        return { valid: false, error: 'Invalid price' };
      }
      return { valid: true, normalizedValue: price };
      
    case 'site_work':
      if (!Array.isArray(value)) {
        return { valid: true, normalizedValue: [value] };
      }
      return { valid: true, normalizedValue: value };
      
    case 'notes_free_text':
      return { valid: true, normalizedValue: String(value) };
      
    default:
      return { valid: true, normalizedValue: value };
  }
}

/**
 * State name to abbreviation mapping
 */
const STATE_NAME_TO_ABBREV = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
  'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
  'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
  'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
  'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
  'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
  'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
  'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
  'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC',
};

// =============================================================================
// OTHER TOOL HANDLERS
// =============================================================================

/**
 * Handle request_clarification tool
 */
function handleRequestClarification(args, state) {
  const { reason } = args;
  
  state.retryCount = (state.retryCount || 0) + 1;
  
  state.events.push({
    type: 'clarification_requested',
    reason,
    retryCount: state.retryCount,
    timestamp: Date.now(),
  });
  
  return {
    state,
    result: { success: true, reason, retryCount: state.retryCount },
    fieldsExtracted: [],
    needsSync: false,
  };
}

/**
 * Handle provide_info tool - when the agent explains something to the caller
 */
function handleProvideInfo(args, state) {
  const { topic, response, follow_up_with_question = true } = args;
  
  console.log(`[TOOL] Providing info on: ${topic}`);
  
  // Track that we provided info (useful for analytics)
  state.events.push({
    type: 'info_provided',
    topic,
    timestamp: Date.now(),
  });
  
  // Reset retry count since this isn't a failed attempt
  state.retryCount = 0;
  
  return {
    state,
    result: { 
      success: true, 
      topic, 
      response,
      followUpWithQuestion: follow_up_with_question,
    },
    fieldsExtracted: [],
    needsSync: false,
    infoResponse: response,  // Pass this to be spoken
    shouldRepeatQuestion: follow_up_with_question,
  };
}

/**
 * Handle end_call tool
 */
async function handleEndCall(args, state, hestiaClient) {
  const { reason } = args;
  
  if (reason === 'do_not_contact') {
    state = handleDoNotContact(state, 'user_requested');
  } else {
  state.phase = PHASES.END_CALL;
  }
  
  state.events.push({
    type: 'call_ended',
    reason,
    timestamp: Date.now(),
  });
  
  // Final sync
  if (hestiaClient && state.leadId) {
    await hestiaClient.logEvent(state.leadId, {
      event_type: 'voice_call_ended',
      actor_type: 'ai',
      payload_json: {
        reason,
        phase: state.phase,
        prequalified: state.prequalified,
        fieldsCollected: state.fieldsCollected,
        fieldsConfirmed: state.fieldsConfirmed,
      },
    });
  }
  
  return {
    state,
    result: { success: true, reason, shouldEnd: true },
    fieldsExtracted: [],
    needsSync: false,
    shouldEndCall: true,
  };
}

// =============================================================================
// HESTIA SYNC
// =============================================================================

/**
 * Sync lead data to Hestia API
 */
async function syncLeadToHestia(state, hestiaClient) {
  if (!hestiaClient) return;
  
  try {
    if (!state.leadId) {
      // Only create lead when minimum fields are ready
      if (!isMinimumLeadReady(state)) {
        console.log('[HESTIA] Minimum lead fields not ready yet');
        return;
      }
      
      const result = await hestiaClient.createLead(state);
      if (result && result.lead_id) {
        state.leadId = result.lead_id;
        console.log(`[HESTIA] Created lead: ${state.leadId}`);
        
        // Log events
        await hestiaClient.logEvent(state.leadId, {
          event_type: 'voice_call_started',
          actor_type: 'system',
          payload_json: {
            call_sid: state.callSid,
            from: state.metadata?.from,
            to: state.metadata?.to,
            entrypoint: state.collectedData?.source?.entrypoint,
          },
        });
      }
    } else {
      // Update existing lead
      await hestiaClient.updateLead(state.leadId, state);
      console.log(`[HESTIA] Updated lead: ${state.leadId}`);
    }
  } catch (error) {
    console.error('[HESTIA] Sync error:', error);
  }
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Process multiple tool calls from a single LLM response
 */
export async function processToolCalls(toolCalls, state, context = {}) {
  const results = [];
  let currentState = state;
  let allFieldsExtracted = [];
  let shouldEndCall = false;
  let infoResponse = null;
  let shouldRepeatQuestion = false;
  let rejectedField = null;
  
  for (const toolCall of toolCalls) {
    const { name, arguments: argsString } = toolCall.function;
    
    let args;
    try {
      args = JSON.parse(argsString);
    } catch (e) {
      console.error(`[TOOL] Failed to parse arguments for ${name}:`, e);
      continue;
    }
    
    const result = await executeTool(name, args, currentState, context);
    currentState = result.state;
    
    results.push({
      tool_call_id: toolCall.id,
      output: JSON.stringify(result.result),
    });
    
    if (result.fieldsExtracted) {
      allFieldsExtracted.push(...result.fieldsExtracted);
      
      // Check for rejected fields (user said "No" to confirmation)
      const rejected = result.fieldsExtracted.find(f => f.action === 'rejected');
      if (rejected) {
        rejectedField = rejected.field;
      }
    }
    
    if (result.shouldEndCall) {
      shouldEndCall = true;
    }
    
    // Capture info response from provide_info tool
    if (result.infoResponse) {
      infoResponse = result.infoResponse;
      shouldRepeatQuestion = result.shouldRepeatQuestion !== false;
    }
  }
  
  return {
    state: currentState,
    results,
    fieldsExtracted: allFieldsExtracted,
    shouldEndCall,
    infoResponse,
    shouldRepeatQuestion,
    rejectedField,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  executeTool,
  processToolCalls,
};
