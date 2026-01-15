/**
 * Valid enum values from Hestia API Schema V2
 * 
 * These ensure data collected by the voice agent matches
 * the expected values in the backend system.
 */

export const ENUMS = {
  // Source channel
  channel: ['web', 'voice'],

  // Source entrypoint
  entrypoint: [
    'dealer_link',
    'dealer_phone',
    'lender_global_site',
    'lender_global_phone',
    'unknown',
  ],

  // Preferred contact method
  preferred_contact_method: ['phone', 'email'],

  // Best time to contact
  best_time_to_contact: [
    'morning',
    'afternoon',
    'evening',
    'weekday_morning',
    'weekday_evening',
    'weekend',
  ],

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
    '50k_100k',
    '100k_200k',
    '200k_plus',
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

  // Credit band self reported
  credit_band_self_reported: [
    'under_580',
    '580_619',
    '620_679',
    '680_719',
    '720_plus',
    'prefer_not_to_say',
  ],

  // Lead status
  lead_status: [
    'new',
    'prequalified',
    'routed',
    'contact_attempted',
    'contacted',
    'ineligible',
    'do_not_contact',
  ],

  // Dealer delivery status
  dealer_delivery_status: [
    'pending',
    'delivered',
    'failed',
    'skipped',
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
