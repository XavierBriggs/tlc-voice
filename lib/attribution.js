/**
 * Dealer Attribution Logic
 * 
 * Determines the entrypoint and dealer attribution based on the dialed number.
 * Implements the rules from Hestia API Schema V2.
 */

/**
 * Determine the source entrypoint and dealer attribution from the dialed number
 * 
 * @param {string} dialedNumber - The number the caller dialed (To number)
 * @param {object} hestiaClient - Hestia API client for lookups
 * @returns {object} - { entrypoint, dealer_id, locked, tracking }
 */
export async function determineAttribution(dialedNumber, hestiaClient) {
  // Normalize the dialed number to E.164 format
  const normalizedNumber = normalizePhoneNumber(dialedNumber);
  
  if (!normalizedNumber) {
    console.warn('[ATTRIBUTION] Invalid dialed number format:', dialedNumber);
    return {
      entrypoint: 'lender_global_phone',
      dealer_id: null,
      locked: false,
      tracking: null,
    };
  }
  
  try {
    // Look up the dialed number in dealer tracking numbers
    const dealerInfo = await hestiaClient.lookupDealerByTrackingNumber(normalizedNumber);
    
    if (dealerInfo && dealerInfo.dealer_id) {
      console.log(`[ATTRIBUTION] Matched tracking number ${normalizedNumber} to dealer ${dealerInfo.dealer_id}`);
      
      return {
        entrypoint: 'dealer_phone',
        dealer_id: dealerInfo.dealer_id,
        locked: true,
        tracking: {
          dealer_id: dealerInfo.dealer_id,
          attribution_token: generateAttributionToken(dialedNumber),
        },
      };
    }
  } catch (error) {
    console.error('[ATTRIBUTION] Error looking up tracking number:', error);
  }
  
  // No match found - this is a global phone number
  console.log(`[ATTRIBUTION] No dealer match for ${normalizedNumber}, using lender_global_phone`);
  
  return {
    entrypoint: 'lender_global_phone',
    dealer_id: null,
    locked: false,
    tracking: null,
  };
}

/**
 * Normalize a phone number to E.164 format
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // Already has country code
  if (phone.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }
  
  return null;
}

/**
 * Generate a unique attribution token for tracking
 */
function generateAttributionToken(dialedNumber) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `att_voice_${timestamp}${random}`;
}

/**
 * Create the initial source object for a voice call
 * 
 * @param {object} callInfo - Information from the Twilio setup message
 * @param {object} attribution - Result from determineAttribution()
 * @returns {object} - Source object for lead creation
 */
export function buildSourceFromCall(callInfo, attribution) {
  return {
    channel: 'voice',
    entrypoint: attribution.entrypoint,
    session_id: callInfo.callSid,
    referrer_url: null, // Not available for voice
    tracking: attribution.tracking,
  };
}

/**
 * Log attribution event for audit trail
 */
export function createAttributionEvent(callSid, attribution) {
  return {
    event_type: attribution.dealer_id ? 'attribution_set' : 'attribution_not_matched',
    actor_type: 'system',
    payload_json: {
      call_sid: callSid,
      entrypoint: attribution.entrypoint,
      dealer_id: attribution.dealer_id,
      locked: attribution.locked,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validate that dealer attribution should be locked
 * 
 * Per Hestia rules, attribution is locked when:
 * - entrypoint is dealer_link or dealer_phone
 * - dealer_id is present
 */
export function shouldLockAttribution(entrypoint, dealerId) {
  const lockableEntrypoints = ['dealer_link', 'dealer_phone'];
  return lockableEntrypoints.includes(entrypoint) && !!dealerId;
}

/**
 * Get human-readable description of entrypoint
 */
export function getEntrypointDescription(entrypoint) {
  const descriptions = {
    dealer_link: 'Dealer referral link',
    dealer_phone: 'Dealer tracking phone number',
    lender_global_site: 'TLC website',
    lender_global_phone: 'TLC main phone line',
    unknown: 'Unknown source',
  };
  
  return descriptions[entrypoint] || 'Unknown source';
}

export default {
  determineAttribution,
  buildSourceFromCall,
  createAttributionEvent,
  shouldLockAttribution,
  getEntrypointDescription,
};
