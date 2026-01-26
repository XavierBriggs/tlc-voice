/**
 * Dealer Attribution Logic
 * 
 * Determines the entrypoint and dealer attribution based on the dialed number.
 * Implements the rules from TLC Firestore Schemas V1.
 * 
 * Attribution flow:
 * 1. Borrower calls a phone number
 * 2. System looks up number in dealerNumbers collection
 * 3. If found, set locked_dealer_id and locked_reason
 * 4. If not found, use tlc_phone entrypoint (no lock)
 */

/**
 * Determine the source entrypoint and dealer attribution from the dialed number
 * 
 * @param {string} dialedNumber - The number the caller dialed (To number)
 * @param {object} hestiaClient - Hestia API client for lookups
 * @returns {object} - { entrypoint, attribution }
 */
export async function determineAttribution(dialedNumber, hestiaClient) {
  // Normalize the dialed number to E.164 format
  const normalizedNumber = normalizePhoneNumber(dialedNumber);
  
  if (!normalizedNumber) {
    console.warn('[ATTRIBUTION] Invalid dialed number format:', dialedNumber);
    return {
      entrypoint: 'tlc_phone',
      attribution: createEmptyAttribution(),
    };
  }
  
  try {
    // Look up the dialed number in dealerNumbers collection
    const dealerInfo = await hestiaClient.lookupDealerByTrackingNumber(normalizedNumber);
    
    if (dealerInfo && dealerInfo.dealer_id) {
      console.log(`[ATTRIBUTION] Matched tracking number ${normalizedNumber} to dealer ${dealerInfo.dealer_id}`);
      
      return {
        entrypoint: 'dealer_phone',
        attribution: {
          utm: createEmptyUtm(),
          referral_code: null,
          dealer_id_from_referral: null,
          inbound_dealer_number: normalizedNumber,
          attribution_token: generateAttributionToken(dialedNumber),
          locked_dealer_id: dealerInfo.dealer_id,
          locked_reason: 'dealer_phone',
          locked_at: new Date().toISOString(),
          lock_expires_at: null,
        },
      };
    }
  } catch (error) {
    console.error('[ATTRIBUTION] Error looking up tracking number:', error);
  }
  
  // No match found - this is TLC global phone number
  console.log(`[ATTRIBUTION] No dealer match for ${normalizedNumber}, using tlc_phone`);
  
  return {
    entrypoint: 'tlc_phone',
    attribution: createEmptyAttribution(),
  };
}

/**
 * Create an empty attribution object
 */
function createEmptyAttribution() {
  return {
    utm: createEmptyUtm(),
    referral_code: null,
    dealer_id_from_referral: null,
    inbound_dealer_number: null,
    attribution_token: null,
    locked_dealer_id: null,
    locked_reason: null,
    locked_at: null,
    lock_expires_at: null,
  };
}

/**
 * Create an empty UTM object
 */
function createEmptyUtm() {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
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
 * Build the metadata object for session state creation
 * 
 * @param {object} callInfo - Information from the Twilio setup message
 * @param {object} attributionResult - Result from determineAttribution()
 * @returns {object} - Metadata object for createSessionState
 */
export function buildSessionMetadata(callInfo, attributionResult) {
  return {
    from: callInfo.from,
    to: callInfo.to,
    direction: callInfo.direction || 'inbound',
    customParameters: callInfo.customParameters || {},
    entrypoint: attributionResult.entrypoint,
    attribution: attributionResult.attribution,
  };
}

/**
 * Log attribution event for audit trail
 */
export function createAttributionEvent(callSid, attributionResult) {
  const { entrypoint, attribution } = attributionResult;
  
  return {
    event_type: attribution.locked_dealer_id ? 'attribution_locked' : 'attribution_not_matched',
    actor_type: 'system',
    actor_id: null,
    details: {
      call_sid: callSid,
      entrypoint: entrypoint,
      inbound_dealer_number: attribution.inbound_dealer_number,
      locked_dealer_id: attribution.locked_dealer_id,
      locked_reason: attribution.locked_reason,
    },
  };
}

/**
 * Validate that dealer attribution should be locked
 * 
 * Per TLC schema, attribution is locked when:
 * - entrypoint is dealer_link or dealer_phone
 * - locked_dealer_id is present
 */
export function isAttributionLocked(attribution) {
  return !!attribution.locked_dealer_id;
}

/**
 * Check if entrypoint supports dealer locking
 */
export function isLockableEntrypoint(entrypoint) {
  const lockableEntrypoints = ['dealer_link', 'dealer_phone'];
  return lockableEntrypoints.includes(entrypoint);
}

/**
 * Get human-readable description of entrypoint
 */
export function getEntrypointDescription(entrypoint) {
  const descriptions = {
    dealer_phone: 'Dealer tracking phone number',
    dealer_link: 'Dealer referral link',
    tlc_phone: 'TLC main phone line',
    tlc_site: 'TLC website',
    unknown: 'Unknown source',
  };
  
  return descriptions[entrypoint] || 'Unknown source';
}

export default {
  determineAttribution,
  buildSessionMetadata,
  createAttributionEvent,
  isAttributionLocked,
  isLockableEntrypoint,
  getEntrypointDescription,
};
