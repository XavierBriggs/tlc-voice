/**
 * Valid enum values from TLC Firestore Schemas V1
 * 
 * These ensure data collected by the voice agent matches
 * the expected values in the backend system.
 */

export const ENUMS = {
  // =============================================================================
  // LEAD STATUS & SOURCE
  // =============================================================================

  // Lead status - business state of the lead
  lead_status: [
    'new',           // Lead exists but intake has not begun
    'collecting',    // Intake is in progress
    'prequalified',  // Minimum required fields complete, ready for delivery
    'ineligible',    // Lead failed an eligibility screen or rule
    'do_not_contact', // Borrower did not consent to follow up
    'closed',        // Lead is finished by a loan officer
  ],

  // Source channel - where the lead originated
  source_channel: [
    'voice',
    'web',
    'app',
  ],

  // Source entrypoint - how the borrower entered TLC
  entrypoint: [
    'dealer_phone',  // Borrower called a dealer-assigned number
    'dealer_link',   // Borrower came from a dealer website or referral link
    'tlc_phone',     // Borrower called TLC global number
    'tlc_site',      // Borrower used TLC direct website form
    'unknown',       // System could not determine entrypoint
  ],

  // Locked reason - why a dealer was locked for attribution
  locked_reason: [
    'dealer_phone',   // Dealer-assigned phone number was dialed
    'dealer_link',    // Dealer referral link provided dealer id
    'signed_token',   // Dealer id came from a signed token
  ],

  // =============================================================================
  // CONSENT
  // =============================================================================

  // Consent capture method - how consent was obtained
  consent_capture_method: [
    'voice_yes',
    'web_checkbox',
  ],

  // =============================================================================
  // APPLICANT
  // =============================================================================

  // Preferred contact method
  preferred_contact_method: ['phone', 'email'],

  // Best time to contact
  best_time_to_contact: [
    'anytime',
    'monday morning',
    'monday_afternoon',
    'monday_evening',
    'tuesday_morning',
    'tuesday_afternoon',
    'tuesday_evening',
    'wednesday_morning',
    'wednesday_afternoon',
    'wednesday_evening',
    'thursday_morning',
    'thursday_afternoon',
    'thursday_evening',
    'friday_morning',
    'friday_afternoon',
    'friday_evening',
    'saturday_morning',
    'saturday_afternoon',
    'saturday_evening',
    'sunday_morning',
    'sunday_afternoon',
    'sunday_evening',
    'weekday_morning',
    'weekday_afternoon',
    'weekday_evening',
    'weekend_morning',
    'weekend_afternoon',
    'weekend_evening',
    'morning',
    'afternoon',
    'evening',
    'weekday',
    'weekend',
  ],

  // =============================================================================
  // HOME AND SITE
  // =============================================================================

  // Land status
  land_status: [
    'own',
    'buying',
    'family_land',
    'gifted_land',
    'renting_lot',
    'not_sure',
  ],

  // Land value band
  land_value_band: [
    '0_25k',
    '25k_50k',
    '25k_75k',
    '75k_100k',
    '100k_150k',
    '150k_200k',
    '200k_250k',
    '250k_300k',
    '300k_350k',
    '350k_400k',
    '400k_450k',
    '450k_500k',  
    '500k_plus',
    'not_sure',
  ],

  // Home type
  home_type: [
    'manufactured',
    'mobile_pre_hud',
    'modular',
    'single_wide',
    'double_wide',
    'not_sure',
  ],

  // Timeline
  timeline: [
    'as soon as possible',
    '0_3_months',
    '3_6_months',
    '6_12_months',
    '12_plus',
    'not_sure',
  ],

  // Site work needed
  site_work_needed: [
    'foundation',
    'utilities',
    'septic',
    'well',
    'driveway',
    'grading',
    'deck',
    'skirting',
    'not_sure',
  ],

  // =============================================================================
  // FINANCIAL SNAPSHOT
  // =============================================================================

  // Credit band self reported
  credit_band_self_reported: [
    'under_580',
    '580_619',
    '620_679',
    '680_719',
    '720_plus',
    'prefer_not_to_say',
  ],

  // =============================================================================
  // ASSIGNMENT (Routing)
  // =============================================================================

  // Assignment type - how the assignment was chosen
  assignment_type: [
    'dealer_sourced',  // Dealer lock applied, dealer owns the lead
    'geo_routed',      // Routed by zip coverage
    'manual',          // Set by a human override
  ],

  // Assignment reason - more specific reason for audit
  assignment_reason: [
    'dealer_number',    // Dealer-assigned phone number caused lock
    'referral_lock',    // Dealer referral link or key caused lock
    'zip_match',        // Zip coverage map chose dealer
    'fallback',         // No candidates, system fallback chosen
    'manual_override',  // A human changed the assignment
  ],

  // =============================================================================
  // DELIVERY
  // =============================================================================

  // Delivery status - notification automation state
  delivery_status: [
    'pending',    // Not yet delivered
    'delivered',  // Notifications were sent
    'failed',     // A delivery attempt failed
    'skipped',    // Delivery intentionally not performed
  ],

  // =============================================================================
  // HUMAN WORKFLOW
  // =============================================================================

  // Human state - loan officer workflow state
  human_state: [
    'unclaimed',    // No owner assigned
    'claimed',      // A loan officer claimed the lead
    'in_progress',  // The lead is actively being worked
    'closed',       // The lead is resolved
  ],

  // Human outcome - final outcome when closed
  human_outcome: [
    'converted',
    'no_answer',
    'not_interested',
    'duplicate',
    'invalid',
    'do_not_contact',
  ],

  // =============================================================================
  // DEALER
  // =============================================================================

  // Dealer status
  dealer_status: [
    'active',    // Eligible for routing
    'paused',    // Temporarily excluded from routing
    'inactive',  // Not eligible for routing
  ],

  // Dealer tier
  dealer_tier: [
    'top50',
    'standard',
  ],
};

/**
 * Validate that a value is in the allowed enum set
 */
export function isValidEnum(enumName, value) {
  const allowed = ENUMS[enumName];
  if (!allowed) return false;
  
  if (Array.isArray(value)) {
    return value.every(v => allowed.includes(v));
  }
  
  return allowed.includes(value);
}

/**
 * Get a human-readable version of an enum value
 */
export function formatEnumForSpeech(enumName, value) {
  const formatters = {
    land_status: {
      own: 'you own the land',
      buying: 'you are buying land',
      family_land: 'it is family land',
      gifted_land: 'the land is being gifted to you',
      renting_lot: 'you are renting a lot',
      not_sure: 'you are not sure about the land situation',
    },
    timeline: {
      '0_3_months': 'zero to three months',
      '3_6_months': 'three to six months',
      '6_12_months': 'six to twelve months',
      '12_plus': 'more than twelve months',
      'not_sure': 'not sure about timing',
    },
    credit_band_self_reported: {
      under_580: 'under five eighty',
      '580_619': 'five eighty to six nineteen',
      '620_679': 'six twenty to six seventy nine',
      '680_719': 'six eighty to seven nineteen',
      '720_plus': 'seven twenty or above',
      prefer_not_to_say: 'prefer not to say',
    },
    land_value_band: {
      '0_25k': 'under twenty five thousand dollars',
      '25k_50k': 'twenty five to fifty thousand dollars',
      '50k_100k': 'fifty to one hundred thousand dollars',
      '100k_200k': 'one hundred to two hundred thousand dollars',
      '200k_plus': 'over two hundred thousand dollars',
      'not_sure': 'not sure',
    },
    home_type: {
      manufactured: 'manufactured home',
      mobile_pre_hud: 'mobile home built before nineteen seventy six',
      modular: 'modular home',
      single_wide: 'single wide',
      double_wide: 'double wide',
      not_sure: 'not sure about the type',
    },
    best_time_to_contact: {
      morning: 'in the morning',
      afternoon: 'in the afternoon',
      evening: 'in the evening',
      weekday_morning: 'weekday mornings',
      weekday_evening: 'weekday evenings',
      weekend: 'on the weekend',
    },
  };

  if (formatters[enumName] && formatters[enumName][value]) {
    return formatters[enumName][value];
  }
  
  // Default: replace underscores with spaces
  return String(value).replace(/_/g, ' ');
}

/**
 * US State abbreviations for validation
 */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
];

/**
 * Validate a ZIP code format
 */
export function isValidZipCode(zip) {
  return /^\d{5}(-\d{4})?$/.test(zip);
}

/**
 * Validate an E.164 phone number format
 */
export function isValidE164Phone(phone) {
  return /^\+1\d{10}$/.test(phone);
}

/**
 * Normalize a phone number to E.164 format
 */
export function normalizeToE164(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // Already has country code
  if (digits.length === 11) {
    return `+${digits}`;
  }
  
  return null; // Invalid
}

/**
 * Validate an email address format
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
