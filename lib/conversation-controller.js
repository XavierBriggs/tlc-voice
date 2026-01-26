/**
 * Conversation Controller for Lead Capture
 * 
 * The deterministic brain of the conversation flow. This controller decides
 * exactly what the agent should do next:
 * - Confirm unconfirmed fields (ALL fields must be confirmed)
 * - Ask for the next required field
 * - Complete prequalification when ready
 * 
 * The LLM is only used for extraction and natural language generation.
 * Flow control is deterministic and code-driven.
 */

import {
  FIELD_ORDER,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  PHASE_FIELDS,
  LAND_VALUE_APPLICABLE_STATUSES,
  getFieldValue,
  getRawValue,
  isFieldConfirmed,
  getUnconfirmedFields,
  getNextFieldToCollect,
  isPrequalificationReady,
  isMinimumLeadReady,
  PHASES,
} from './state-machine.js';

import { formatValueForSpeech } from './value-normalizers.js';
import { formatEnumForSpeech } from '../config/enums.js';

// =============================================================================
// CONFIRMATION TEMPLATES
// =============================================================================

/**
 * Templates for confirming each field type
 * {value} = the value to confirm
 * {raw} = the raw value (for fields with raw + band)
 * {spoken} = the value formatted for speech
 */
export const CONFIRMATION_TEMPLATES = {
  contact_consent: {
    template: "Perfect! Just to make sure - you're okay with us reaching out about financing options, right?",
    usesValue: false,
  },
  full_name: {
    template: "Great to meet you, {value}! Did I get that right?",
    usesValue: true,
  },
  phone_e164: {
    template: "Got it - {spoken}. Does that sound right?",
    usesValue: true,
    formatter: (value) => formatPhoneForSpeech(value),
  },
  email: {
    template: "Let me make sure I got that - {spoken}. Sound good?",
    usesValue: true,
    formatter: (value) => formatEmailForSpeech(value),
  },
  preferred_contact_method: {
    template: "Okay, so {value} works best for you?",
    usesValue: true,
  },
  property_zip: {
    template: "Got it, ZIP code {spoken}. Is that right?",
    usesValue: true,
    formatter: (value) => formatZipForSpeech(value),
  },
  property_state: {
    template: "And that's in {spoken}, right?",
    usesValue: true,
    formatter: (value) => formatStateForSpeech(value),
  },
  land_status: {
    template: "Okay, so {spoken}. Do I have that right?",
    usesValue: true,
    formatter: (value) => formatEnumForSpeech('land_status', value),
  },
  land_value: {
    template: "And the land's worth around {spoken}. Does that sound about right?",
    usesValue: true,
    usesRaw: true,
    formatter: (raw) => formatValueForSpeech(raw, 'currency'),
  },
  home_type: {
    template: "Awesome, a {spoken}! Is that correct?",
    usesValue: true,
    formatter: (value) => formatEnumForSpeech('home_type', value),
  },
  timeline: {
    template: "So you're looking to get moving {spoken}. Did I get that right?",
    usesValue: true,
    usesRaw: true,
    formatter: (raw, band) => formatTimelineForSpeech(raw, band),
  },
  credit: {
    template: "And credit's around {spoken}. Sound about right?",
    usesValue: true,
    usesRaw: true,
    formatter: (raw) => formatValueForSpeech(raw, 'credit'),
  },
  monthly_income: {
    template: "Monthly income around {spoken}. Is that close?",
    usesValue: true,
    formatter: (value) => formatValueForSpeech(value, 'currency'),
  },
  has_recent_bankruptcy: {
    template: "{spoken} recent bankruptcy. Is that correct?",
    usesValue: true,
    formatter: (value) => value === true ? "Okay, you mentioned" : value === false ? "Great, no" : "Prefer not to say about",
  },
  best_time_to_contact: {
    template: "Perfect, {spoken} is best for a callback. Right?",
    usesValue: true,
    usesRaw: true,
    formatter: (raw, band) => formatBestTimeForSpeech(raw, band),
  },
  home_price: {
    template: "And you're looking at around {spoken} for the home. Does that sound right?",
    usesValue: true,
    formatter: (value) => formatValueForSpeech(value, 'currency'),
  },
  site_work: {
    template: "Got it, you'll need {spoken}. Right?",
    usesValue: true,
    formatter: (value) => Array.isArray(value) ? value.map(v => formatEnumForSpeech('site_work_needed', v)).join(', ') : 'none',
  },
  notes_free_text: {
    template: "I've made a note of that. Anything else you'd like to add?",
    usesValue: false,
  },
};

// =============================================================================
// QUESTION TEMPLATES
// =============================================================================

/**
 * Templates for asking for each field
 */
export const QUESTION_TEMPLATES = {
  contact_consent: {
    question: "Is it okay for TLC to contact you about financing options?",
    followUp: "Just want to make sure - is it alright if we follow up with you?",
  },
  full_name: {
    question: "Wonderful! Can I get your name?",
    followUp: "Sorry, could you spell that out for me?",
  },
  phone_e164: {
    question: "And what's the best number to reach you at?",
    followUp: "Sorry, could you repeat that number for me?",
  },
  email: {
    question: "Perfect! And what's your email address?",
    followUp: "Could you spell that out for me?",
  },
  preferred_contact_method: {
    question: "Do you prefer we reach out by phone or email?",
    followUp: "What works better for you - phone or email?",
  },
  property_zip: {
    question: "Great! What's the ZIP code where you're looking to place the home?",
    followUp: "Sorry, could you repeat that ZIP code?",
  },
  property_state: {
    question: "And which state is that in?",
    followUp: "What state is that ZIP in?",
  },
  land_status: {
    question: "Awesome! Do you already own the land, or is it gifted land, family land, or buying land?",
    followUp: "Is it land you own, buying, family land, or still figuring that out?",
  },
  land_value: {
    question: "Do you have a rough idea what the land is worth?",
    followUp: "Just a ballpark - under twenty five thousand, twenty five to fifty, fifty to a hundred, or more?",
  },
  home_type: {
    question: "What kind of home are you looking for - manufactured, mobile home, single wide, double wide, or something else?",
    followUp: "Are you thinking single wide, double wide, manufactured, or modular?",
  },
  timeline: {
    question: "When are you hoping to make this happen, 0-3 months, 3-6 months, 6-12 months, or 12+ months?",
    followUp: "Are you thinking the next few months, later this year, or further out?",
  },
  credit: {
    question: "And roughly, where would you say your credit score is? Doesn't have to be exact.",
    followUp: "Just a ballpark - like six fifty, seven hundred, or you can say prefer not to say.",
  },
  monthly_income: {
    question: "What's your approximate monthly household income?",
    followUp: "Just a rough estimate is fine, or we can skip this one.",
    optional: true,
  },
  has_recent_bankruptcy: {
    question: "Have you had any bankruptcies in recent years?",
    followUp: "Just yes, no, or prefer not to say.",
    optional: true,
  },
  best_time_to_contact: {
    question: "When's the best time for one of our loan officers to give you a call?",
    followUp: "Mornings, afternoons, evenings, or weekends - what works best?",
  },
  home_price: {
    question: "Do you have a budget in mind for the home?",
    followUp: "Even a rough ballpark helps us out.",
    optional: true,
  },
  site_work: {
    question: "Will you need any site work done - like foundation, utilities, septic, or driveway?",
    followUp: "Things like foundation, utilities, septic, or driveway work?",
    optional: true,
  },
  notes_free_text: {
    question: "Anything else you'd like us to know about your situation?",
    followUp: "Any other details that might be helpful?",
    optional: true,
  },
};

// =============================================================================
// CONVERSATION CONTROLLER CLASS
// =============================================================================

/**
 * ConversationController - Deterministic flow control for lead capture
 */
export class ConversationController {
  constructor() {
    this.fieldOrder = FIELD_ORDER;
    this.requiredFields = REQUIRED_FIELDS;
    this.optionalFields = OPTIONAL_FIELDS;
  }

  /**
   * Get the next action the agent should take
   * 
   * @param {object} state - Current session state
   * @returns {object} - Action to take: { type, field?, value?, template?, question? }
   */
  getNextAction(state) {
    // 0. Check for do-not-contact
    if (state.doNotContact) {
      return {
        type: 'end_call',
        reason: 'do_not_contact',
        message: "No problem at all. Thank you for your time. Take care!",
      };
    }

    // 1. Check for ANY fields needing confirmation (ALL fields must be confirmed)
    const unconfirmed = getUnconfirmedFields(state);
    if (unconfirmed.length > 0) {
      const field = unconfirmed[0];
      return this._buildConfirmAction(field.field, field.value, field.rawValue, state);
    }

    // 2. Check if prequalification is ready
    if (isPrequalificationReady(state)) {
      return {
        type: 'complete',
        message: this._buildCompletionMessage(state),
      };
    }

    // 3. Get next required field to ask
    const nextField = this._getNextFieldToAsk(state);
    if (nextField) {
      return this._buildAskAction(nextField, state);
    }

    // 4. All required fields collected but not all confirmed - this shouldn't happen
    // but handle gracefully
    return {
      type: 'complete',
      message: this._buildCompletionMessage(state),
    };
  }

  /**
   * Get the next field to ask for (not just collect)
   * Considers field order and skips fields that shouldn't be asked
   */
  _getNextFieldToAsk(state) {
    for (const field of this.fieldOrder) {
      // Check if field should be skipped
      if (this._shouldSkipField(field, state)) {
        continue;
      }

      // Check if field already has a value (not null/undefined)
      const value = getFieldValue(state, field);
      if (value !== undefined && value !== null) {
        // Has value - check if confirmed
        if (isFieldConfirmed(state, field)) {
          continue; // Fully done with this field
        }
        // Has value but not confirmed - will be handled by confirmation flow
        continue;
      }

      // Found a field that needs to be asked
      return field;
    }

    return null;
  }

  /**
   * Check if a field should be skipped based on current state
   */
  _shouldSkipField(field, state) {
    // Skip optional fields unless in optional questions phase
    if (this.optionalFields.includes(field)) {
      if (state.phase !== PHASES.OPTIONAL_QUESTIONS) {
        return true;
      }
    }

    // Skip land_value if land_status doesn't require it
    if (field === 'land_value') {
      const landStatus = getFieldValue(state, 'land_status');
      if (!landStatus || !LAND_VALUE_APPLICABLE_STATUSES.includes(landStatus)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build a confirmation action
   */
  _buildConfirmAction(field, value, rawValue, state) {
    const template = CONFIRMATION_TEMPLATES[field];
    if (!template) {
      // Fallback for unknown fields
      return {
        type: 'confirm',
        field,
        value,
        rawValue,
        message: `I have ${field} as ${value}. Is that correct?`,
      };
    }

    let spoken = value;
    if (template.formatter) {
      if (template.usesRaw && rawValue !== undefined) {
        spoken = template.formatter(rawValue, value);
      } else {
        spoken = template.formatter(value);
      }
    }

    let message = template.template;
    if (template.usesValue) {
      message = message
        .replace('{value}', String(value))
        .replace('{spoken}', spoken)
        .replace('{raw}', rawValue !== undefined ? String(rawValue) : String(value));
    }

    return {
      type: 'confirm',
      field,
      value,
      rawValue,
      spoken,
      message,
    };
  }

  /**
   * Build an ask action
   */
  _buildAskAction(field, state) {
    const template = QUESTION_TEMPLATES[field];
    if (!template) {
      return {
        type: 'ask',
        field,
        message: `What is your ${field.replace(/_/g, ' ')}?`,
      };
    }

    const retryCount = state.retryCount || 0;
    const question = retryCount > 0 && template.followUp 
      ? template.followUp 
      : template.question;

    return {
      type: 'ask',
      field,
      message: question,
      isOptional: template.optional || false,
    };
  }

  /**
   * Build completion message
   */
  _buildCompletionMessage(state) {
    const name = getFieldValue(state, 'full_name');
    const firstName = name ? name.split(' ')[0] : 'there';
    const bestTime = getFieldValue(state, 'best_time_to_contact');
    
    let timePhrase = 'soon';
    if (bestTime) {
      timePhrase = formatEnumForSpeech('best_time_to_contact', bestTime);
    }

    return `Thank you so much ${firstName}! You're all set. A loan officer will reach out ${timePhrase}. Have a wonderful day!`;
  }

  /**
   * Process extracted fields and determine what confirmations are needed
   * 
   * @param {object} extractedFields - Fields extracted by LLM
   * @param {object} state - Current session state
   * @returns {object[]} - Array of fields that were stored and need confirmation
   */
  processExtractedFields(extractedFields, state) {
    const storedFields = [];

    for (const [field, value] of Object.entries(extractedFields)) {
      if (value === undefined || value === null) continue;

      // Check if this is a confirmation response
      if (field === 'confirmation') {
        // This is handled separately
        continue;
      }

      // Store the field (unconfirmed)
      // The state machine's setFieldValue handles raw→band conversion
      storedFields.push({
        field,
        value,
        needsConfirmation: true,
      });
    }

    return storedFields;
  }

  /**
   * Handle a confirmation response (yes/no)
   * 
   * @param {boolean} confirmed - Whether the user confirmed
   * @param {string} field - The field being confirmed
   * @param {*} newValue - Optional new/corrected value
   * @returns {object} - Result with next action
   */
  handleConfirmation(confirmed, field, newValue = null) {
    if (confirmed) {
      return {
        confirmed: true,
        field,
        action: 'mark_confirmed',
      };
    }

    // User said no - need to re-collect
    return {
      confirmed: false,
      field,
      newValue,
      action: newValue ? 'update_and_reconfirm' : 'recollect',
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format phone number for speech
 */
function formatPhoneForSpeech(phone) {
  if (!phone) return '';
  
  // Remove +1 prefix if present
  const digits = phone.replace(/\D/g, '');
  const cleaned = digits.length === 11 && digits.startsWith('1') 
    ? digits.slice(1) 
    : digits;
  
  if (cleaned.length !== 10) return phone;
  
  // Format as "area code, first three, last four"
  const area = cleaned.slice(0, 3);
  const first = cleaned.slice(3, 6);
  const last = cleaned.slice(6, 10);
  
  return `${digitToWords(area)}, ${digitToWords(first)}, ${digitToWords(last)}`;
}

/**
 * Format email for speech
 */
function formatEmailForSpeech(email) {
  if (!email) return '';
  
  return email
    .replace(/@/g, ' at ')
    .replace(/\./g, ' dot ')
    .replace(/_/g, ' underscore ')
    .replace(/-/g, ' dash ');
}

/**
 * Format ZIP code for speech
 */
function formatZipForSpeech(zip) {
  if (!zip) return '';
  return digitToWords(zip);
}

/**
 * Format state abbreviation for speech
 */
function formatStateForSpeech(state) {
  const stateNames = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia',
  };
  
  return stateNames[state?.toUpperCase()] || state;
}

/**
 * Format timeline for speech
 */
function formatTimelineForSpeech(raw, band) {
  if (raw && raw !== band) {
    // Use the raw value (e.g., "April") with context
    const bandSpoken = formatEnumForSpeech('timeline', band);
    return `${raw}, so ${bandSpoken}`;
  }
  return formatEnumForSpeech('timeline', band);
}

/**
 * Format best time to contact for speech
 */
function formatBestTimeForSpeech(raw, band) {
  if (raw && raw !== band) {
    // Use the raw value (e.g., "mornings work best")
    return raw;
  }
  return formatEnumForSpeech('best_time_to_contact', band);
}

/**
 * Convert a string of digits to spoken words
 */
function digitToWords(digits) {
  const words = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  };
  
  return String(digits)
    .split('')
    .map(d => words[d] || d)
    .join(' ');
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const conversationController = new ConversationController();

export default ConversationController;
