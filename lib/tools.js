/**
 * OpenAI Function Calling Tools for Lead Capture
 * 
 * Defines tools that the LLM can call to extract structured data from conversation,
 * update lead records, and control conversation flow.
 */

import { ENUMS } from '../config/enums.js';

/**
 * All available tools for the lead capture agent
 */
export const TOOLS = [
  // =============================================================================
  // DATA COLLECTION TOOLS
  // =============================================================================
  {
    type: 'function',
    function: {
      name: 'collect_consent',
      description: 'Record the user consent response. Call this when the user agrees or declines to be contacted.',
      parameters: {
        type: 'object',
        properties: {
          contact_consent: {
            type: 'boolean',
            description: 'Whether the user consents to being contacted by phone or email',
          },
          tcpa_disclosure_ack: {
            type: 'boolean',
            description: 'Whether the user acknowledges the TCPA disclosure (implied true if they consent to contact)',
          },
        },
        required: ['contact_consent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_name',
      description: 'Extract and record the caller full name from their response.',
      parameters: {
        type: 'object',
        properties: {
          full_name: {
            type: 'string',
            description: 'The full name of the caller (first and last name)',
          },
          confidence: {
            type: 'number',
            description: 'Confidence level 0-1 that the name was heard correctly',
          },
          needs_confirmation: {
            type: 'boolean',
            description: 'Whether to confirm the name back to the caller',
          },
        },
        required: ['full_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_phone',
      description: 'Extract and record the caller phone number. Use the caller ID if they confirm it.',
      parameters: {
        type: 'object',
        properties: {
          phone_e164: {
            type: 'string',
            description: 'Phone number in E.164 format (e.g., +13145551234)',
          },
          confirmed_caller_id: {
            type: 'boolean',
            description: 'Whether the user confirmed their caller ID is the best number',
          },
        },
        required: ['phone_e164'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_email',
      description: 'Extract and record the caller email address.',
      parameters: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Email address',
          },
          needs_confirmation: {
            type: 'boolean',
            description: 'Whether to spell back and confirm the email',
          },
        },
        required: ['email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_preferred_contact',
      description: 'Record how the caller prefers to be contacted.',
      parameters: {
        type: 'object',
        properties: {
          preferred_contact_method: {
            type: 'string',
            enum: ['phone', 'email'],
            description: 'Whether the caller prefers phone or email contact',
          },
        },
        required: ['preferred_contact_method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_property_location',
      description: 'Extract the ZIP code and state where the manufactured home will be placed.',
      parameters: {
        type: 'object',
        properties: {
          property_zip: {
            type: 'string',
            description: 'Five digit ZIP code where the home will be placed',
          },
          property_state: {
            type: 'string',
            description: 'Two letter state abbreviation (e.g., MO, TX, FL)',
          },
          needs_confirmation: {
            type: 'boolean',
            description: 'Whether to confirm the ZIP code back to the caller',
          },
        },
        required: ['property_zip'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_land_status',
      description: 'Record the caller land ownership situation.',
      parameters: {
        type: 'object',
        properties: {
          land_status: {
            type: 'string',
            enum: ['own', 'buying', 'family_land', 'gifted_land', 'renting_lot', 'not_sure'],
            description: 'The land ownership status',
          },
        },
        required: ['land_status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_land_value',
      description: 'Record the approximate land value band. Only collect if land_status is own, buying, family_land, or gifted_land.',
      parameters: {
        type: 'object',
        properties: {
          land_value_band: {
            type: 'string',
            enum: ['0_25k', '25k_50k', '50k_100k', '100k_200k', '200k_plus', 'not_sure'],
            description: 'Approximate land value range',
          },
        },
        required: ['land_value_band'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_home_type',
      description: 'Record the type of manufactured home the caller is interested in.',
      parameters: {
        type: 'object',
        properties: {
          home_type: {
            type: 'string',
            enum: ['manufactured', 'mobile_pre_hud', 'modular', 'single_wide', 'double_wide', 'not_sure'],
            description: 'Type of manufactured home',
          },
          is_new_home_purchase: {
            type: 'boolean',
            description: 'Whether this is a new home purchase (vs existing home refinance)',
          },
        },
        required: ['home_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_timeline',
      description: 'Record when the caller is hoping to move forward with their purchase.',
      parameters: {
        type: 'object',
        properties: {
          timeline: {
            type: 'string',
            enum: ['0_3_months', '3_6_months', '6_12_months', '12_plus', 'not_sure'],
            description: 'Expected timeline for moving forward',
          },
        },
        required: ['timeline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_home_price',
      description: 'Record the estimated home price the caller is considering.',
      parameters: {
        type: 'object',
        properties: {
          home_price_estimate_usd: {
            type: 'integer',
            description: 'Estimated home price in USD',
          },
        },
        required: ['home_price_estimate_usd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_site_work',
      description: 'Record what site work the caller expects to need.',
      parameters: {
        type: 'object',
        properties: {
          site_work_needed: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['foundation', 'utilities', 'septic', 'well', 'driveway', 'grading', 'deck', 'skirting', 'not_sure'],
            },
            description: 'List of site work items needed',
          },
          site_work_budget_estimate_usd: {
            type: 'integer',
            description: 'Estimated budget for site work in USD',
          },
        },
        required: ['site_work_needed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_credit_band',
      description: 'Record the caller self-reported credit score range.',
      parameters: {
        type: 'object',
        properties: {
          credit_band_self_reported: {
            type: 'string',
            enum: ['under_580', '580_619', '620_679', '680_719', '720_plus', 'prefer_not_to_say'],
            description: 'Self-reported credit score range',
          },
        },
        required: ['credit_band_self_reported'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_income',
      description: 'Record the caller estimated monthly household income.',
      parameters: {
        type: 'object',
        properties: {
          monthly_income_estimate_usd: {
            type: 'integer',
            description: 'Estimated monthly household income in USD',
          },
        },
        required: ['monthly_income_estimate_usd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_bankruptcy',
      description: 'Record whether the caller has had a recent bankruptcy.',
      parameters: {
        type: 'object',
        properties: {
          has_recent_bankruptcy: {
            type: 'boolean',
            description: 'Whether the caller has had a bankruptcy in recent years',
          },
        },
        required: ['has_recent_bankruptcy'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_best_time',
      description: 'Record the best time for a loan officer to contact the caller.',
      parameters: {
        type: 'object',
        properties: {
          best_time_to_contact: {
            type: 'string',
            enum: ['morning', 'afternoon', 'evening', 'weekday_morning', 'weekday_evening', 'weekend'],
            description: 'Best time to reach the caller',
          },
        },
        required: ['best_time_to_contact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_notes',
      description: 'Record any additional details or notes the caller wants to share.',
      parameters: {
        type: 'object',
        properties: {
          notes_free_text: {
            type: 'string',
            description: 'Free text notes from the caller about their situation',
          },
        },
        required: ['notes_free_text'],
      },
    },
  },

  // =============================================================================
  // CONVERSATION CONTROL TOOLS
  // =============================================================================
  {
    type: 'function',
    function: {
      name: 'check_prequalification',
      description: 'Check if all required fields have been collected and the lead can be marked as prequalified.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_optional_questions',
      description: 'Skip remaining optional questions and proceed to close the call. Call this if the caller seems in a hurry or asks to wrap up.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why the optional questions are being skipped',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_conversation',
      description: 'End the conversation gracefully. Call this after prequalification is complete or if the caller wants to end the call.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['prequalified_complete', 'user_requested', 'do_not_contact', 'error', 'transfer_requested'],
            description: 'Reason for ending the conversation',
          },
          transfer_to: {
            type: 'string',
            description: 'If transferring, who to transfer to (e.g., loan_officer)',
          },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_clarification',
      description: 'The caller response was unclear. Request they repeat or clarify.',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description: 'The field we are trying to collect',
          },
          issue: {
            type: 'string',
            enum: ['unclear_audio', 'invalid_value', 'ambiguous_response', 'incomplete'],
            description: 'What was unclear about the response',
          },
        },
        required: ['field', 'issue'],
      },
    },
  },
];

/**
 * Map tool names to the fields they collect
 */
export const TOOL_TO_FIELD_MAP = {
  collect_consent: ['contact_consent', 'tcpa_disclosure_ack'],
  collect_name: ['full_name'],
  collect_phone: ['phone_e164'],
  collect_email: ['email'],
  collect_preferred_contact: ['preferred_contact_method'],
  collect_property_location: ['property_zip', 'property_state'],
  collect_land_status: ['land_status'],
  collect_land_value: ['land_value_band'],
  collect_home_type: ['home_type', 'is_new_home_purchase'],
  collect_timeline: ['timeline'],
  collect_home_price: ['home_price_estimate_usd'],
  collect_site_work: ['site_work_needed', 'site_work_budget_estimate_usd'],
  collect_credit_band: ['credit_band_self_reported'],
  collect_income: ['monthly_income_estimate_usd'],
  collect_bankruptcy: ['has_recent_bankruptcy'],
  collect_best_time: ['best_time_to_contact'],
  collect_notes: ['notes_free_text'],
};

/**
 * Map fields to the tool that should collect them
 */
export const FIELD_TO_TOOL_MAP = {
  contact_consent: 'collect_consent',
  tcpa_disclosure_ack: 'collect_consent',
  full_name: 'collect_name',
  phone_e164: 'collect_phone',
  email: 'collect_email',
  preferred_contact_method: 'collect_preferred_contact',
  property_zip: 'collect_property_location',
  property_state: 'collect_property_location',
  land_status: 'collect_land_status',
  land_value_band: 'collect_land_value',
  home_type: 'collect_home_type',
  is_new_home_purchase: 'collect_home_type',
  timeline: 'collect_timeline',
  home_price_estimate_usd: 'collect_home_price',
  site_work_needed: 'collect_site_work',
  site_work_budget_estimate_usd: 'collect_site_work',
  credit_band_self_reported: 'collect_credit_band',
  monthly_income_estimate_usd: 'collect_income',
  has_recent_bankruptcy: 'collect_bankruptcy',
  best_time_to_contact: 'collect_best_time',
  notes_free_text: 'collect_notes',
};

/**
 * Get the tools relevant for a specific phase
 * 
 * IMPORTANT: Users don't follow strict phases - they might give name, phone, and ZIP 
 * all at once. So we always return ALL data collection tools, plus phase-specific 
 * control tools.
 */
export function getToolsForPhase(phase) {
  // Always available: all data collection tools
  const alwaysAvailable = [
    'collect_consent',
    'collect_name',
    'collect_phone',
    'collect_email',
    'collect_preferred_contact',
    'collect_property_location',
    'collect_land_status',
    'collect_land_value',
    'collect_home_type',
    'collect_timeline',
    'collect_home_price',
    'collect_site_work',
    'collect_credit_band',
    'collect_income',
    'collect_bankruptcy',
    'collect_best_time',
    'collect_notes',
    'request_clarification',
  ];
  
  // Phase-specific control tools
  const phaseControlTools = {
    welcome: [],
    consent_check: ['end_conversation'],
    contact_info: [],
    property_location: [],
    land_situation: [],
    home_basics: [],
    timeline: [],
    financial_snapshot: ['skip_optional_questions'],
    optional_questions: ['skip_optional_questions', 'check_prequalification'],
    prequalified: ['end_conversation'],
    end_call: ['end_conversation'],
  };

  const controlTools = phaseControlTools[phase] || [];
  const allToolNames = [...new Set([...alwaysAvailable, ...controlTools])];
  
  return TOOLS.filter(t => allToolNames.includes(t.function.name));
}
