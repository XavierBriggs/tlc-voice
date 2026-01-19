/**
 * Question Flow Configuration
 * 
 * Based on the Hestia Voice Questions document, this configuration
 * defines the questions to ask, their order, and validation rules.
 */

import { PHASES } from './phases.js';

// =============================================================================
// QUESTION DEFINITIONS
// =============================================================================

export const QUESTIONS = {
  // ===========================================================================
  // CONSENT AND CONTACT (Required)
  // ===========================================================================
  
  interested_in_financing: {
    id: 'interested_in_financing',
    phase: PHASES.CONSENT_CHECK,
    required: true,
    field: null, // Screening question, doesn't map to a field
    question: 'Are you looking for financing for a manufactured home today?',
    spoken: 'Are you looking for financing for a manufactured home today?',
    validResponses: ['yes', 'no'],
    onNo: 'end_call',
  },
  
  contact_consent: {
    id: 'contact_consent',
    phase: PHASES.CONSENT_CHECK,
    required: true,
    field: 'contact_consent',
    question: 'Is it okay for TLC to contact you by phone or email about this request?',
    spoken: 'Is it okay for TLC to contact you by phone or email about this request?',
    validResponses: ['yes', 'no'],
    onNo: 'do_not_contact',
    followUp: 'I just need to confirm - is it okay if we follow up with you about this?',
  },
  
  full_name: {
    id: 'full_name',
    phase: PHASES.CONTACT_INFO,
    required: true,
    field: 'full_name',
    question: 'What is your full name?',
    spoken: 'What is your full name?',
    validResponses: ['first and last name'],
    followUp: 'Could you spell that for me please?',
    confirmationTemplate: 'I have your name as {value}. Is that correct?',
  },
  
  phone_number: {
    id: 'phone_number',
    phase: PHASES.CONTACT_INFO,
    required: true,
    field: 'phone_e164',
    question: 'What is the best phone number to reach you?',
    spoken: 'What is the best phone number to reach you?',
    alternativeWithCallerId: 'I can confirm the number I see is {caller_id}. Is that correct, or would you prefer a different number?',
    validResponses: ['10-digit phone number'],
    followUp: 'Could you repeat that number for me slowly?',
  },
  
  email_address: {
    id: 'email_address',
    phase: PHASES.CONTACT_INFO,
    required: true,
    field: 'email',
    question: 'What is your email address?',
    spoken: 'What is your email address?',
    validResponses: ['valid email address'],
    followUp: 'Could you spell that out for me?',
    confirmationTemplate: 'Let me read that back: {value}. Is that correct?',
    // Email is always collected regardless of preferred contact method
  },
  
  preferred_contact: {
    id: 'preferred_contact',
    phase: PHASES.CONTACT_INFO,
    required: true,
    field: 'preferred_contact_method',
    question: 'Do you prefer we contact you by phone or email?',
    spoken: 'Do you prefer we contact you by phone or email?',
    validResponses: ['phone', 'email'],
    followUp: 'Would phone or email work better for you?',
    // No longer triggers email_address since email is always collected before this
  },
  
  // ===========================================================================
  // PROPERTY LOCATION (Required)
  // ===========================================================================
  
  property_zip: {
    id: 'property_zip',
    phase: PHASES.PROPERTY_LOCATION,
    required: true,
    field: 'property_zip',
    question: 'What ZIP code will the home be placed in?',
    spoken: 'What ZIP code will the home be placed in?',
    validResponses: ['5-digit ZIP code'],
    followUp: 'Could you repeat that ZIP code for me?',
    confirmationTemplate: 'I have ZIP code {value}. Is that right?',
  },
  
  property_state: {
    id: 'property_state',
    phase: PHASES.PROPERTY_LOCATION,
    required: true,
    field: 'property_state',
    question: 'What state is that in?',
    spoken: 'What state is that in?',
    validResponses: ['US state name or abbreviation'],
    followUp: 'And which state is that ZIP code in?',
  },
  
  // ===========================================================================
  // LAND SITUATION (Required)
  // ===========================================================================
  
  land_ownership: {
    id: 'land_ownership',
    phase: PHASES.LAND_SITUATION,
    required: true,
    field: 'land_status',
    question: 'Do you currently own the land where the home will go?',
    spoken: 'Do you currently own the land where the home will go?',
    validResponses: ['yes', 'no', 'not sure'],
    mapping: {
      yes: 'own',
      no: 'trigger_followup',
      'not sure': 'not_sure',
    },
    triggersQuestion: {
      no: 'land_status_followup',
    },
  },
  
  land_status_followup: {
    id: 'land_status_followup',
    phase: PHASES.LAND_SITUATION,
    required: false,
    field: 'land_status',
    question: 'Where will the home be placed?',
    spoken: 'Are you buying land, is it family land, gifted land, or are you not sure?',
    validResponses: ['buying land', 'family land', 'gifted land', 'not sure'],
    mapping: {
      'buying land': 'buying',
      'buying': 'buying',
      'family land': 'family_land',
      'family': 'family_land',
      'gifted land': 'gifted_land',
      'gifted': 'gifted_land',
      'not sure': 'not_sure',
    },
    condition: (state) => state.collectedData.home_and_site.land_status === undefined,
  },
  
  land_value: {
    id: 'land_value',
    phase: PHASES.LAND_SITUATION,
    required: true,
    field: 'land_value_band',
    question: 'Do you have a rough idea what the land is worth?',
    spoken: 'Do you have a rough idea what the land is worth? Under twenty five thousand, twenty five to fifty thousand, fifty to one hundred thousand, one hundred to two hundred thousand, or over two hundred thousand?',
    validResponses: ['0-25k', '25k-50k', '50k-100k', '100k-200k', '200k+', 'not sure'],
    mapping: {
      'under 25': '0_25k',
      'under twenty five': '0_25k',
      '25 to 50': '25k_50k',
      'twenty five to fifty': '25k_50k',
      '50 to 100': '50k_100k',
      'fifty to one hundred': '50k_100k',
      '100 to 200': '100k_200k',
      'one hundred to two hundred': '100k_200k',
      'over 200': '200k_plus',
      'over two hundred': '200k_plus',
      'not sure': 'not_sure',
    },
    condition: (state) => {
      const landStatus = state.collectedData.home_and_site.land_status;
      return ['own', 'buying', 'family_land', 'gifted_land'].includes(landStatus);
    },
  },
  
  // ===========================================================================
  // HOME BASICS (Required)
  // ===========================================================================
  
  home_type: {
    id: 'home_type',
    phase: PHASES.HOME_BASICS,
    required: true,
    field: 'home_type',
    question: 'What type of home is this?',
    spoken: 'What type of home is this? A manufactured home, mobile home built before nineteen seventy six, modular home, single wide, double wide, or are you not sure?',
    validResponses: ['manufactured', 'mobile pre-HUD', 'modular', 'single wide', 'double wide', 'not sure'],
    mapping: {
      'manufactured': 'manufactured',
      'mobile': 'mobile_pre_hud',
      'mobile home': 'mobile_pre_hud',
      'pre hud': 'mobile_pre_hud',
      'modular': 'modular',
      'single wide': 'single_wide',
      'single': 'single_wide',
      'double wide': 'double_wide',
      'double': 'double_wide',
      'not sure': 'not_sure',
      'trailer': 'manufactured', // Common term
    },
    followUp: 'Is it a single wide, double wide, manufactured, or modular home?',
  },
  
  is_new_purchase: {
    id: 'is_new_purchase',
    phase: PHASES.HOME_BASICS,
    required: false,
    field: 'is_new_home_purchase',
    question: 'Is this a new home purchase?',
    spoken: 'Is this a new home purchase?',
    validResponses: ['yes', 'no', 'not sure'],
    mapping: {
      yes: true,
      no: false,
      'not sure': null,
    },
  },
  
  // ===========================================================================
  // TIMELINE (Required)
  // ===========================================================================
  
  timeline: {
    id: 'timeline',
    phase: PHASES.TIMELINE,
    required: true,
    field: 'timeline',
    question: 'When are you hoping to move forward?',
    spoken: 'When are you hoping to move forward? Zero to three months, three to six months, six to twelve months, or longer?',
    validResponses: ['0-3 months', '3-6 months', '6-12 months', '12+ months', 'not sure'],
    mapping: {
      'right away': '0_3_months',
      'soon': '0_3_months',
      'next few months': '0_3_months',
      '0 to 3': '0_3_months',
      'zero to three': '0_3_months',
      '3 to 6': '3_6_months',
      'three to six': '3_6_months',
      '6 to 12': '6_12_months',
      'six to twelve': '6_12_months',
      'end of year': '6_12_months',
      'next year': '12_plus',
      'over a year': '12_plus',
      '12 plus': '12_plus',
      'twelve plus': '12_plus',
      'not sure': 'not_sure',
    },
    followUp: 'Are you looking at the next few months, later this year, or further out?',
  },
  
  // ===========================================================================
  // FINANCIAL SNAPSHOT (Required for credit, optional for income/bankruptcy)
  // ===========================================================================
  
  credit_band: {
    id: 'credit_band',
    phase: PHASES.FINANCIAL_SNAPSHOT,
    required: true,
    field: 'credit_band_self_reported',
    question: 'Which credit range fits best?',
    spoken: 'Which credit range would you say fits best? Under five eighty, five eighty to six nineteen, six twenty to six seventy nine, six eighty to seven nineteen, seven twenty plus, or prefer not to say?',
    validResponses: ['under 580', '580-619', '620-679', '680-719', '720+', 'prefer not to say'],
    mapping: {
      'under 580': 'under_580',
      'below 580': 'under_580',
      'under five eighty': 'under_580',
      '580 to 619': '580_619',
      'five eighty to six nineteen': '580_619',
      '620 to 679': '620_679',
      'six twenty to six seventy nine': '620_679',
      '680 to 719': '680_719',
      'six eighty to seven nineteen': '680_719',
      '720 plus': '720_plus',
      'seven twenty plus': '720_plus',
      'above 720': '720_plus',
      'excellent': '720_plus',
      'good': '680_719',
      'fair': '620_679',
      'poor': 'under_580',
      'prefer not to say': 'prefer_not_to_say',
      'rather not say': 'prefer_not_to_say',
    },
    followUp: 'A rough range is fine - under five eighty, five eighty to six twenty, six twenty to six eighty, or above six eighty?',
  },
  
  monthly_income: {
    id: 'monthly_income',
    phase: PHASES.FINANCIAL_SNAPSHOT,
    required: false,
    field: 'monthly_income_estimate_usd',
    question: 'What is your estimated monthly household income?',
    spoken: 'What would you estimate your monthly household income is? An estimate is fine, or you can skip this one.',
    validResponses: ['dollar amount', 'skip'],
    skippable: true,
    followUp: 'Just a rough estimate is helpful, or we can skip this.',
  },
  
  recent_bankruptcy: {
    id: 'recent_bankruptcy',
    phase: PHASES.FINANCIAL_SNAPSHOT,
    required: false,
    field: 'has_recent_bankruptcy',
    question: 'Have you had a bankruptcy recently?',
    spoken: 'Have you had a bankruptcy in recent years? Yes, no, or prefer not to say?',
    validResponses: ['yes', 'no', 'prefer not to say'],
    mapping: {
      yes: true,
      no: false,
      'prefer not to say': null,
    },
  },
  
  // ===========================================================================
  // OPTIONAL QUESTIONS
  // ===========================================================================
  
  home_price: {
    id: 'home_price',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: false,
    field: 'home_price_estimate_usd',
    question: 'About how much do you expect the home to cost?',
    spoken: 'About how much do you expect the home to cost? Even a rough ballpark is helpful.',
    validResponses: ['dollar amount'],
    skippable: true,
  },
  
  site_work: {
    id: 'site_work',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: false,
    field: 'site_work_needed',
    question: 'Do you expect any site work will be needed?',
    spoken: 'Do you expect any site work will be needed? Like foundation, utilities, septic, well, or driveway work?',
    validResponses: ['foundation', 'utilities', 'septic', 'well', 'driveway', 'grading', 'deck', 'skirting', 'not sure', 'none'],
    multiple: true,
    skippable: true,
  },
  
  best_time_to_contact: {
    id: 'best_time_to_contact',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: true,
    field: 'best_time_to_contact',
    question: 'What is the best time for a loan officer to reach you?',
    spoken: 'What is the best time for a loan officer to reach you? Morning, afternoon, evening, or weekends?',
    validResponses: ['morning', 'afternoon', 'evening', 'weekday morning', 'weekday evening', 'weekend'],
    mapping: {
      'morning': 'morning',
      'mornings': 'morning',
      'afternoon': 'afternoon',
      'afternoons': 'afternoon',
      'evening': 'evening',
      'evenings': 'evening',
      'weekday morning': 'weekday_morning',
      'weekday mornings': 'weekday_morning',
      'weekday evening': 'weekday_evening',
      'weekday evenings': 'weekday_evening',
      'weekend': 'weekend',
      'weekends': 'weekend',
      'anytime': 'morning', // Default to morning
    },
  },
  
  additional_notes: {
    id: 'additional_notes',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: false,
    field: 'notes_free_text',
    question: 'Any details you want us to know?',
    spoken: 'Any other details you would like us to know? For example, if you have already picked out a home, or have any special delivery concerns?',
    validResponses: ['free text'],
    skippable: true,
  },
  
  // ===========================================================================
  // CONDITIONAL: DEALER CONTEXT (only for global entrypoints)
  // ===========================================================================
  
  working_with_dealer: {
    id: 'working_with_dealer',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: false,
    field: 'notes_free_text', // Append to notes for V2
    question: 'Are you already working with a specific dealer?',
    spoken: 'Are you already working with a specific dealer?',
    validResponses: ['yes', 'no'],
    triggersQuestion: {
      yes: 'dealer_name',
    },
    condition: (state) => {
      const entrypoint = state.collectedData.source.entrypoint;
      return ['lender_global_site', 'lender_global_phone'].includes(entrypoint);
    },
  },
  
  dealer_name: {
    id: 'dealer_name',
    phase: PHASES.OPTIONAL_QUESTIONS,
    required: false,
    field: 'notes_free_text', // Append to notes for V2
    question: 'What is the dealer name and what city are they in?',
    spoken: 'What is the dealer name and what city are they in?',
    validResponses: ['dealer name and city'],
    condition: (state) => false, // Only shown when triggered by working_with_dealer
  },
};

// =============================================================================
// QUESTION FLOW BY PHASE
// =============================================================================

export const PHASE_QUESTIONS = {
  [PHASES.CONSENT_CHECK]: ['interested_in_financing', 'contact_consent'],
  [PHASES.CONTACT_INFO]: ['full_name', 'phone_number', 'email_address', 'preferred_contact'],
  [PHASES.PROPERTY_LOCATION]: ['property_zip', 'property_state'],
  [PHASES.LAND_SITUATION]: ['land_ownership', 'land_status_followup', 'land_value'],
  [PHASES.HOME_BASICS]: ['home_type', 'is_new_purchase'],
  [PHASES.TIMELINE]: ['timeline'],
  [PHASES.FINANCIAL_SNAPSHOT]: ['credit_band', 'monthly_income', 'recent_bankruptcy'],
  [PHASES.OPTIONAL_QUESTIONS]: ['home_price', 'site_work', 'best_time_to_contact', 'additional_notes', 'working_with_dealer'],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the next question to ask based on state
 */
export function getNextQuestion(state) {
  const phaseQuestions = PHASE_QUESTIONS[state.phase];
  if (!phaseQuestions) return null;
  
  for (const questionId of phaseQuestions) {
    const question = QUESTIONS[questionId];
    if (!question) continue;
    
    // Check if question has a condition
    if (question.condition && !question.condition(state)) {
      continue;
    }
    
    // Check if the field is already collected
    if (question.field) {
      const value = getFieldValue(state, question.field);
      if (value !== undefined && value !== null) {
        continue;
      }
    }
    
    // Check if it's a screening question that was already handled
    if (question.id === 'interested_in_financing' && state.phase !== PHASES.CONSENT_CHECK) {
      continue;
    }
    
    return question;
  }
  
  return null;
}

/**
 * Get field value from state (helper)
 */
function getFieldValue(state, fieldName) {
  const { collectedData } = state;
  
  if (['contact_consent', 'tcpa_disclosure_ack', 'privacy_policy_ack'].includes(fieldName)) {
    return collectedData.consents?.[fieldName];
  }
  
  if (['full_name', 'phone_e164', 'email', 'preferred_contact_method', 'best_time_to_contact'].includes(fieldName)) {
    return collectedData.applicant?.[fieldName];
  }
  
  if (['property_zip', 'property_state', 'land_status', 'land_value_band', 'home_type', 
       'is_new_home_purchase', 'home_price_estimate_usd', 'site_work_needed', 
       'site_work_budget_estimate_usd', 'timeline'].includes(fieldName)) {
    return collectedData.home_and_site?.[fieldName];
  }
  
  if (['credit_band_self_reported', 'monthly_income_estimate_usd', 'has_recent_bankruptcy'].includes(fieldName)) {
    return collectedData.financial_snapshot?.[fieldName];
  }
  
  if (fieldName === 'notes_free_text') {
    return collectedData.notes?.free_text;
  }
  
  return undefined;
}

/**
 * Get all required questions that haven't been answered
 */
export function getRemainingRequiredQuestions(state) {
  const remaining = [];
  
  for (const [questionId, question] of Object.entries(QUESTIONS)) {
    if (!question.required) continue;
    
    if (question.condition && !question.condition(state)) continue;
    
    if (question.field) {
      const value = getFieldValue(state, question.field);
      if (value === undefined || value === null) {
        remaining.push(question);
      }
    }
  }
  
  return remaining;
}

export default {
  QUESTIONS,
  PHASE_QUESTIONS,
  getNextQuestion,
  getRemainingRequiredQuestions,
};
