/**
 * Tool Executor for Lead Capture
 * 
 * Executes tool calls from OpenAI, updates conversation state,
 * and interacts with the Hestia API.
 */

import {
  setFieldValue,
  advancePhase,
  handleDoNotContact,
  isPrequalificationReady,
  isMinimumLeadReady,
  recordQuestionAsked,
  handleRetry,
  getNextFieldToCollect,
  PHASES,
  MINIMUM_LEAD_FIELDS,
} from './state-machine.js';

import { TOOL_TO_FIELD_MAP } from './tools.js';
import { 
  isValidZipCode, 
  isValidE164Phone, 
  isValidEmail, 
  normalizeToE164,
  isValidEnum,
  US_STATES,
} from '../config/enums.js';

/**
 * Execute a tool call and update state
 * 
 * @param {string} toolName - Name of the tool to execute
 * @param {object} args - Arguments passed to the tool
 * @param {object} state - Current session state
 * @param {object} hestiaClient - Hestia API client
 * @returns {object} - { state, result, shouldRespond, responseHint }
 */
export async function executeTool(toolName, args, state, hestiaClient) {
  console.log(`[TOOL] Executing: ${toolName}`, JSON.stringify(args));
  
  try {
    switch (toolName) {
      // =============================================================================
      // DATA COLLECTION TOOLS
      // =============================================================================
      case 'collect_consent':
        return handleCollectConsent(args, state, hestiaClient);
      
      case 'collect_name':
        return handleCollectName(args, state, hestiaClient);
      
      case 'collect_phone':
        return handleCollectPhone(args, state, hestiaClient);
      
      case 'collect_email':
        return handleCollectEmail(args, state, hestiaClient);
      
      case 'collect_preferred_contact':
        return handleCollectPreferredContact(args, state, hestiaClient);
      
      case 'collect_property_location':
        return handleCollectPropertyLocation(args, state, hestiaClient);
      
      case 'collect_land_status':
        return handleCollectLandStatus(args, state, hestiaClient);
      
      case 'collect_land_value':
        return handleCollectLandValue(args, state, hestiaClient);
      
      case 'collect_home_type':
        return handleCollectHomeType(args, state, hestiaClient);
      
      case 'collect_timeline':
        return handleCollectTimeline(args, state, hestiaClient);
      
      case 'collect_home_price':
        return handleCollectHomePrice(args, state, hestiaClient);
      
      case 'collect_site_work':
        return handleCollectSiteWork(args, state, hestiaClient);
      
      case 'collect_credit_band':
        return handleCollectCreditBand(args, state, hestiaClient);
      
      case 'collect_income':
        return handleCollectIncome(args, state, hestiaClient);
      
      case 'collect_bankruptcy':
        return handleCollectBankruptcy(args, state, hestiaClient);
      
      case 'collect_best_time':
        return handleCollectBestTime(args, state, hestiaClient);
      
      case 'collect_notes':
        return handleCollectNotes(args, state, hestiaClient);
      
      // =============================================================================
      // CONVERSATION CONTROL TOOLS
      // =============================================================================
      case 'check_prequalification':
        return handleCheckPrequalification(state, hestiaClient);
      
      case 'skip_optional_questions':
        return handleSkipOptionalQuestions(args, state);
      
      case 'end_conversation':
        return handleEndConversation(args, state, hestiaClient);
      
      case 'request_clarification':
        return handleRequestClarification(args, state);
      
      default:
        console.warn(`[TOOL] Unknown tool: ${toolName}`);
        return {
          state,
          result: { success: false, error: 'Unknown tool' },
          shouldRespond: false,
        };
    }
  } catch (error) {
    console.error(`[TOOL] Error executing ${toolName}:`, error);
    return {
      state,
      result: { success: false, error: error.message },
      shouldRespond: false,
    };
  }
}

// =============================================================================
// DATA COLLECTION HANDLERS
// =============================================================================

async function handleCollectConsent(args, state, hestiaClient) {
  const { contact_consent, tcpa_disclosure_ack = contact_consent } = args;
  
  setFieldValue(state, 'contact_consent', contact_consent);
  setFieldValue(state, 'tcpa_disclosure_ack', tcpa_disclosure_ack);
  
  if (!contact_consent) {
    handleDoNotContact(state, 'user_declined_consent');
    
    // Log event to Hestia
    if (hestiaClient && state.leadId) {
      await hestiaClient.logEvent(state.leadId, {
        event_type: 'do_not_contact_set',
        actor_type: 'ai',
        payload_json: { reason: 'user_declined_consent', phase: state.phase },
      });
    }
    
    return {
      state,
      result: { success: true, do_not_contact: true },
      shouldRespond: true,
      responseHint: 'Thank the caller politely and end the call since they declined contact.',
    };
  }
  
  // Consent received, advance phase
  state = advancePhase(state);
  
  return {
    state,
    result: { success: true, consent_received: true },
    shouldRespond: true,
    responseHint: 'Consent received. Proceed to ask for the caller name.',
  };
}

async function handleCollectName(args, state, hestiaClient) {
  const { full_name, confidence = 1, needs_confirmation = false } = args;
  
  if (!full_name || full_name.trim().length < 2) {
    return {
      state,
      result: { success: false, error: 'Invalid name' },
      shouldRespond: true,
      responseHint: 'Ask for the name again, the response was unclear.',
    };
  }
  
  setFieldValue(state, 'full_name', full_name.trim());
  state.pendingField = null;
  state.retryCount = 0;
  
  // Don't sync to Hestia yet - wait until all minimum fields are collected (after preferred_contact)
  
  if (needs_confirmation || confidence < 0.8) {
    return {
      state,
      result: { success: true, needs_confirmation: true, value: full_name },
      shouldRespond: true,
      responseHint: `YOU MUST CONFIRM: Say "I have your name as ${full_name}. Is that correct?" Wait for yes/no before proceeding.`,
    };
  }
  
  return {
    state,
    result: { success: true, value: full_name },
    shouldRespond: true,
    responseHint: 'Name collected. Ask for the best phone number to reach them, or confirm the caller ID.',
  };
}

async function handleCollectPhone(args, state, hestiaClient) {
  const { phone_e164, confirmed_caller_id = false } = args;
  
  // Normalize phone number
  const normalizedPhone = normalizeToE164(phone_e164);
  
  if (!normalizedPhone) {
    return {
      state,
      result: { success: false, error: 'Invalid phone number format' },
      shouldRespond: true,
      responseHint: 'The phone number was not clear. Ask them to repeat it slowly.',
    };
  }
  
  setFieldValue(state, 'phone_e164', normalizedPhone);
  state.pendingField = null;
  state.retryCount = 0;
  
  // Don't sync to Hestia yet - wait until all minimum fields are collected (after preferred_contact)
  
  return {
    state,
    result: { success: true, value: normalizedPhone, confirmed_caller_id },
    shouldRespond: true,
    responseHint: 'Phone number collected. Ask for their email address.',
  };
}

async function handleCollectEmail(args, state, hestiaClient) {
  const { email, needs_confirmation = true } = args;
  
  if (!isValidEmail(email)) {
    return {
      state,
      result: { success: false, error: 'Invalid email format' },
      shouldRespond: true,
      responseHint: 'The email address was not clear. Ask them to spell it out.',
    };
  }
  
  setFieldValue(state, 'email', email.toLowerCase());
  state.pendingField = null;
  
  // Don't sync to Hestia yet - wait until all minimum fields are collected (after preferred_contact)
  
  if (needs_confirmation) {
    return {
      state,
      result: { success: true, needs_confirmation: true, value: email },
      shouldRespond: true,
      responseHint: `Spell back the email to confirm: ${email}`,
    };
  }
  
  return {
    state,
    result: { success: true, value: email },
    shouldRespond: true,
    responseHint: 'Email collected. Ask if they prefer to be contacted by phone or email.',
  };
}

async function handleCollectPreferredContact(args, state, hestiaClient) {
  const { preferred_contact_method } = args;
  
  if (!isValidEnum('preferred_contact_method', preferred_contact_method)) {
    return {
      state,
      result: { success: false, error: 'Invalid contact method' },
      shouldRespond: true,
      responseHint: 'Ask if they prefer phone or email contact.',
    };
  }
  
  setFieldValue(state, 'preferred_contact_method', preferred_contact_method);
  state.pendingField = null;
  
  // This is the last of the minimum lead fields - sync to create the partial lead
  // Email is now always collected before preferred_contact, so we have all minimum fields
  await syncLeadToHestia(state, hestiaClient);
  
  state = advancePhase(state);
  
  return {
    state,
    result: { success: true, value: preferred_contact_method },
    shouldRespond: true,
    responseHint: 'Contact preference collected. Move on to ask about the property ZIP code.',
  };
}

async function handleCollectPropertyLocation(args, state, hestiaClient) {
  const { property_zip, property_state, needs_confirmation = false } = args;
  
  // Validate ZIP
  const cleanZip = property_zip?.replace(/\D/g, '').slice(0, 5);
  if (!cleanZip || cleanZip.length !== 5) {
    return {
      state,
      result: { success: false, error: 'Invalid ZIP code' },
      shouldRespond: true,
      responseHint: 'The ZIP code was not clear. Ask them to repeat the five digit ZIP code.',
    };
  }
  
  setFieldValue(state, 'property_zip', cleanZip);
  
  // Set state if provided and valid
  if (property_state && US_STATES.includes(property_state.toUpperCase())) {
    setFieldValue(state, 'property_state', property_state.toUpperCase());
  }
  
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  // Check if we need to ask for state
  if (!state.collectedData.home_and_site.property_state) {
    return {
      state,
      result: { success: true, value: cleanZip, needs_state: true },
      shouldRespond: true,
      responseHint: 'ZIP code collected. Ask what state that is in.',
    };
  }
  
  state = advancePhase(state);
  
  return {
    state,
    result: { success: true, value: cleanZip },
    shouldRespond: true,
    responseHint: 'Property location collected. Ask if they own the land where the home will go.',
  };
}

async function handleCollectLandStatus(args, state, hestiaClient) {
  const { land_status } = args;
  
  if (!isValidEnum('land_status', land_status)) {
    return {
      state,
      result: { success: false, error: 'Invalid land status' },
      shouldRespond: true,
      responseHint: 'The response was unclear. Ask if they own the land, are buying it, or something else.',
    };
  }
  
  setFieldValue(state, 'land_status', land_status);
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  // If they own land or are buying, we should ask about land value
  const shouldAskLandValue = ['own', 'buying', 'family_land', 'gifted_land'].includes(land_status);
  
  if (shouldAskLandValue) {
    return {
      state,
      result: { success: true, value: land_status, should_ask_land_value: true },
      shouldRespond: true,
      responseHint: 'Good. Ask if they have a rough idea of what the land is worth.',
    };
  }
  
  state = advancePhase(state);
  
  return {
    state,
    result: { success: true, value: land_status },
    shouldRespond: true,
    responseHint: 'Land status collected. Move on to ask about the type of home.',
  };
}

async function handleCollectLandValue(args, state, hestiaClient) {
  const { land_value_band } = args;
  
  if (!isValidEnum('land_value_band', land_value_band)) {
    return {
      state,
      result: { success: false, error: 'Invalid land value band' },
      shouldRespond: true,
      responseHint: 'Ask for a rough estimate: under twenty five thousand, twenty five to fifty thousand, and so on.',
    };
  }
  
  setFieldValue(state, 'land_value_band', land_value_band);
  state.pendingField = null;
  state = advancePhase(state);
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: land_value_band },
    shouldRespond: true,
    responseHint: 'Land value collected. Now ask about the type of home they are interested in.',
  };
}

async function handleCollectHomeType(args, state, hestiaClient) {
  const { home_type, is_new_home_purchase } = args;
  
  if (!isValidEnum('home_type', home_type)) {
    return {
      state,
      result: { success: false, error: 'Invalid home type' },
      shouldRespond: true,
      responseHint: 'Ask if it is a manufactured home, modular, single wide, double wide, or if they are not sure.',
    };
  }
  
  setFieldValue(state, 'home_type', home_type);
  
  if (is_new_home_purchase !== undefined) {
    setFieldValue(state, 'is_new_home_purchase', is_new_home_purchase);
  }
  
  state.pendingField = null;
  state = advancePhase(state);
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: home_type },
    shouldRespond: true,
    responseHint: 'Home type collected. Ask about their timeline - when are they hoping to move forward?',
  };
}

async function handleCollectTimeline(args, state, hestiaClient) {
  const { timeline } = args;
  
  if (!isValidEnum('timeline', timeline)) {
    return {
      state,
      result: { success: false, error: 'Invalid timeline' },
      shouldRespond: true,
      responseHint: 'Ask if they are looking at zero to three months, three to six months, six to twelve months, or longer.',
    };
  }
  
  setFieldValue(state, 'timeline', timeline);
  state.pendingField = null;
  state = advancePhase(state);
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: timeline },
    shouldRespond: true,
    responseHint: 'Timeline collected. Now ask about their credit score range.',
  };
}

async function handleCollectHomePrice(args, state, hestiaClient) {
  const { home_price_estimate_usd } = args;
  
  if (!home_price_estimate_usd || home_price_estimate_usd < 10000) {
    return {
      state,
      result: { success: false, error: 'Invalid price' },
      shouldRespond: true,
      responseHint: 'Ask for a rough estimate of the home price they are considering.',
    };
  }
  
  setFieldValue(state, 'home_price_estimate_usd', home_price_estimate_usd);
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: home_price_estimate_usd },
    shouldRespond: true,
    responseHint: 'Price estimate collected. Ask if they expect any site work to be needed.',
  };
}

async function handleCollectSiteWork(args, state, hestiaClient) {
  const { site_work_needed, site_work_budget_estimate_usd } = args;
  
  if (site_work_needed && Array.isArray(site_work_needed)) {
    setFieldValue(state, 'site_work_needed', site_work_needed);
  }
  
  if (site_work_budget_estimate_usd) {
    setFieldValue(state, 'site_work_budget_estimate_usd', site_work_budget_estimate_usd);
  }
  
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: site_work_needed },
    shouldRespond: true,
    responseHint: 'Site work info collected. Ask about the best time for a loan officer to reach them.',
  };
}

async function handleCollectCreditBand(args, state, hestiaClient) {
  const { credit_band_self_reported } = args;
  
  if (!isValidEnum('credit_band_self_reported', credit_band_self_reported)) {
    return {
      state,
      result: { success: false, error: 'Invalid credit band' },
      shouldRespond: true,
      responseHint: 'Ask which range fits best: under five eighty, five eighty to six nineteen, six twenty to six seventy nine, six eighty to seven nineteen, or seven twenty plus.',
    };
  }
  
  setFieldValue(state, 'credit_band_self_reported', credit_band_self_reported);
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: credit_band_self_reported },
    shouldRespond: true,
    responseHint: 'Credit range collected. Ask for an estimate of their monthly household income.',
  };
}

async function handleCollectIncome(args, state, hestiaClient) {
  const { monthly_income_estimate_usd } = args;
  
  if (monthly_income_estimate_usd && monthly_income_estimate_usd > 0) {
    setFieldValue(state, 'monthly_income_estimate_usd', monthly_income_estimate_usd);
  }
  
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: monthly_income_estimate_usd },
    shouldRespond: true,
    responseHint: 'Income estimate collected. Ask if they have had a bankruptcy recently.',
  };
}

async function handleCollectBankruptcy(args, state, hestiaClient) {
  const { has_recent_bankruptcy } = args;
  
  setFieldValue(state, 'has_recent_bankruptcy', has_recent_bankruptcy);
  state.pendingField = null;
  state = advancePhase(state);
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: has_recent_bankruptcy },
    shouldRespond: true,
    responseHint: 'Financial snapshot complete. Check if they are prequalified or ask optional questions.',
  };
}

async function handleCollectBestTime(args, state, hestiaClient) {
  const { best_time_to_contact } = args;
  
  if (!isValidEnum('best_time_to_contact', best_time_to_contact)) {
    return {
      state,
      result: { success: false, error: 'Invalid time preference' },
      shouldRespond: true,
      responseHint: 'Ask if mornings, afternoons, evenings, or weekends work best.',
    };
  }
  
  setFieldValue(state, 'best_time_to_contact', best_time_to_contact);
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: best_time_to_contact },
    shouldRespond: true,
    responseHint: 'Best time collected. Ask if there are any other details they want to share.',
  };
}

async function handleCollectNotes(args, state, hestiaClient) {
  const { notes_free_text } = args;
  
  if (notes_free_text) {
    setFieldValue(state, 'notes_free_text', notes_free_text);
  }
  
  state.pendingField = null;
  
  await syncLeadToHestia(state, hestiaClient);
  
  return {
    state,
    result: { success: true, value: notes_free_text },
    shouldRespond: true,
    responseHint: 'Notes captured. Check if prequalification is complete.',
  };
}

// =============================================================================
// CONVERSATION CONTROL HANDLERS
// =============================================================================

async function handleCheckPrequalification(state, hestiaClient) {
  const ready = isPrequalificationReady(state);
  
  if (ready) {
    state.prequalified = true;
    state.prequalifiedAt = Date.now();
    state.phase = PHASES.PREQUALIFIED;
    
    // Update lead status and trigger routing in Hestia
    if (hestiaClient && state.leadId) {
      // 1. Set status to prequalified
      await hestiaClient.setStatus(state.leadId, 'prequalified');
      
      // 2. Log voice intake completed event
      await hestiaClient.logEvent(state.leadId, {
        event_type: 'voice_intake_completed',
        actor_type: 'ai',
        payload_json: {
          prequalified: true,
          fields_collected: state.fieldsCollected,
          questions_asked: state.questionsAsked,
          duration_ms: Date.now() - state.startTime,
        },
      });
      
      // 3. Trigger dealer routing now that lead is prequalified
      try {
        const routeResult = await hestiaClient.routeLead(state.leadId);
        if (routeResult && routeResult.success) {
          state.routed = true;
          state.assignedDealerId = routeResult.assigned_dealer_id;
          console.log(`[HESTIA] Lead routed to dealer: ${routeResult.assigned_dealer_id}`);
        } else {
          console.warn('[HESTIA] Lead routing returned no dealer:', routeResult?.error);
        }
      } catch (routeError) {
        console.error('[HESTIA] Error routing lead:', routeError);
        // Non-fatal - lead is still prequalified, just not routed yet
      }
    }
    
    return {
      state,
      result: { 
        success: true, 
        prequalified: true,
        routed: state.routed || false,
        assigned_dealer_id: state.assignedDealerId || null,
      },
      shouldRespond: true,
      responseHint: 'The caller is prequalified! Thank them warmly and let them know a loan officer will be in touch soon.',
    };
  }
  
  return {
    state,
    result: { 
      success: true, 
      prequalified: false, 
      missing_fields: state.requiredFieldsRemaining,
    },
    shouldRespond: true,
    responseHint: `Still need: ${state.requiredFieldsRemaining.join(', ')}. Continue collecting information.`,
  };
}

async function handleSkipOptionalQuestions(args, state) {
  const { reason = 'user_requested' } = args;
  
  state.events.push({
    type: 'optional_questions_skipped',
    reason,
    timestamp: Date.now(),
  });
  
  // Check if we can still prequalify
  if (isPrequalificationReady(state)) {
    state.prequalified = true;
    state.phase = PHASES.PREQUALIFIED;
  }
  
  return {
    state,
    result: { success: true, skipped: true },
    shouldRespond: true,
    responseHint: 'Wrap up the call politely.',
  };
}

async function handleEndConversation(args, state, hestiaClient) {
  const { reason, transfer_to } = args;
  
  state.phase = PHASES.END_CALL;
  state.events.push({
    type: 'conversation_ended',
    reason,
    transfer_to,
    timestamp: Date.now(),
  });
  
  // Log final event to Hestia
  if (hestiaClient && state.leadId) {
    await hestiaClient.logEvent(state.leadId, {
      event_type: reason === 'transfer_requested' ? 'voice_transfer_requested' : 'voice_call_ended',
      actor_type: 'ai',
      payload_json: {
        reason,
        transfer_to,
        final_phase: state.phase,
        prequalified: state.prequalified,
        fields_collected: state.fieldsCollected,
        duration_ms: Date.now() - state.startTime,
      },
    });
  }
  
  return {
    state,
    result: { success: true, reason, should_end: true },
    shouldRespond: true,
    responseHint: reason === 'prequalified_complete' 
      ? 'Thank them for their time and confirm a loan officer will reach out soon.'
      : 'End the call politely.',
    shouldEndCall: true,
  };
}

async function handleRequestClarification(args, state) {
  const { field, issue } = args;
  
  const { state: newState, skipField } = handleRetry(state);
  
  if (skipField) {
    return {
      state: newState,
      result: { success: false, skipped: true, field },
      shouldRespond: true,
      responseHint: 'Unable to collect this field after multiple attempts. Move on to the next question.',
    };
  }
  
  const hints = {
    unclear_audio: 'Ask them to repeat more slowly and clearly.',
    invalid_value: 'The value provided does not match expected format. Ask again with an example.',
    ambiguous_response: 'The response could mean multiple things. Ask for clarification.',
    incomplete: 'The response was incomplete. Ask for the full information.',
  };
  
  return {
    state: newState,
    result: { success: false, retry: true, field, issue },
    shouldRespond: true,
    responseHint: hints[issue] || 'Ask for clarification.',
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sync the current lead data to Hestia API
 * 
 * Lead creation strategy:
 * - Only create a lead once minimum fields are collected (consent + contact info)
 * - This ensures we capture contactable leads even if the call drops early
 * - Subsequent field collections PATCH the existing lead
 */
async function syncLeadToHestia(state, hestiaClient) {
  if (!hestiaClient) return;
  
  try {
    if (!state.leadId) {
      // Check if minimum requirements are met before creating
      if (!isMinimumLeadReady(state)) {
        console.log('[HESTIA] Minimum lead fields not ready yet, skipping create');
        return;
      }
      
      // Create new partial lead
      const result = await hestiaClient.createLead(state);
      if (result && result.lead_id) {
        state.leadId = result.lead_id;
        console.log(`[HESTIA] Created partial lead: ${state.leadId}`);
        
        // Log voice_call_started event (deferred from call setup)
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
        
        // Log partial_lead_created event to distinguish from complete leads
        await hestiaClient.logEvent(state.leadId, {
          event_type: 'partial_lead_created',
          actor_type: 'ai',
          payload_json: {
            fields_collected: MINIMUM_LEAD_FIELDS,
            phase_at_creation: state.phase,
            call_sid: state.callSid,
            elapsed_ms: Date.now() - state.startTime,
          },
        });
      }
    } else {
      // Update existing lead with new data
      await hestiaClient.updateLead(state.leadId, state);
      console.log(`[HESTIA] Updated lead: ${state.leadId}`);
    }
  } catch (error) {
    console.error('[HESTIA] Error syncing lead:', error);
  }
}

/**
 * Process multiple tool calls from a single LLM response
 */
export async function processToolCalls(toolCalls, state, hestiaClient) {
  const results = [];
  let currentState = state;
  let finalResponseHint = null;
  let shouldEndCall = false;
  
  for (const toolCall of toolCalls) {
    const { name, arguments: argsString } = toolCall.function;
    
    let args;
    try {
      args = JSON.parse(argsString);
    } catch (e) {
      console.error(`[TOOL] Failed to parse arguments for ${name}:`, e);
      continue;
    }
    
    const result = await executeTool(name, args, currentState, hestiaClient);
    currentState = result.state;
    results.push({
      tool_call_id: toolCall.id,
      output: JSON.stringify(result.result),
    });
    
    if (result.responseHint) {
      finalResponseHint = result.responseHint;
    }
    
    if (result.shouldEndCall) {
      shouldEndCall = true;
    }
  }
  
  return {
    state: currentState,
    results,
    responseHint: finalResponseHint,
    shouldEndCall,
  };
}
