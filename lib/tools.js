/**
 * OpenAI Function Calling Tools for Lead Capture
 * 
 * Unified extraction tool that extracts ALL recognizable fields from user utterances.
 * The conversation controller handles flow - the LLM just extracts data.
 */

import { ENUMS } from '../config/enums.js';

// =============================================================================
// UNIFIED EXTRACTION TOOL
// =============================================================================

/**
 * Single unified tool for extracting all fields from user utterances
 */
export const EXTRACT_FIELDS_TOOL = {
  type: 'function',
  function: {
    name: 'extract_fields',
    description: `Extract ALL information the caller provides in their response. Call this for EVERY user message that contains any data.

IMPORTANT:
- Extract ALL fields mentioned, even if the conversation hasn't asked for them yet
- For yes/no confirmations, set confirmation: true/false
- For corrections during confirmation, update the field with the new value
- Never fabricate data - only extract what was explicitly said
- Convert spoken numbers to digits (e.g., "six fifty" → 650, "forty thousand" → 40000)`,
    parameters: {
      type: 'object',
      properties: {
        // Confirmation response
        confirmation: {
          type: 'boolean',
          description: 'If the user is responding to a confirmation question: true for yes/correct, false for no/incorrect',
        },
        
        // Consent
        contact_consent: {
          type: 'boolean',
          description: 'Whether the user consents to being contacted. Extract from "yes", "okay", "sure", "that\'s fine", etc.',
        },
        
        // Contact info
        full_name: {
          type: 'string',
          description: 'The caller\'s full name (first and last). Extract from "my name is...", "I\'m...", "this is..."',
        },
        phone_e164: {
          type: 'string',
          description: 'Phone number. Convert to digits only (e.g., "five oh three, five five five, one two three four" → "5035551234")',
        },
        email: {
          type: 'string',
          description: 'Email address. Convert spelled versions (e.g., "john at gmail dot com" → "john@gmail.com")',
        },
        preferred_contact_method: {
          type: 'string',
          enum: ENUMS.preferred_contact_method,
          description: 'How the caller prefers to be contacted: "phone" or "email"',
        },
        
        // Property location
        property_zip: {
          type: 'string',
          description: 'Five digit ZIP code. Convert spoken to digits (e.g., "six three one one zero" → "63110")',
        },
        property_state: {
          type: 'string',
          description: 'US state name or abbreviation. Convert to 2-letter code (e.g., "Missouri" → "MO")',
        },
        
        // Land situation
        land_status: {
          type: 'string',
          enum: ENUMS.land_status,
          description: 'Land ownership status: own, buying, family_land, gifted_land, renting_lot, not_sure',
        },
        land_value_raw: {
          type: 'number',
          description: 'Raw land value in dollars. Convert spoken amounts (e.g., "forty thousand" → 40000, "about seventy five thousand" → 75000)',
        },
        
        // Home basics
        home_type: {
          type: 'string',
          enum: ENUMS.home_type,
          description: 'Type of home: manufactured, mobile_pre_hud, modular, single_wide, double_wide, not_sure. "trailer" usually means manufactured.',
        },
        
        // Timeline
        timeline_raw: {
          type: 'string',
          description: 'Raw timeline input as spoken (e.g., "April", "next month", "in about 3 months", "end of year", "soon")',
        },
        
        // Financial
        credit_raw: {
          type: 'number',
          description: 'Raw credit score as a number. Convert spoken (e.g., "six fifty" → 650, "around seven twenty" → 720)',
        },
        monthly_income: {
          type: 'number',
          description: 'Monthly household income in dollars. Convert spoken amounts.',
        },
        has_recent_bankruptcy: {
          type: 'boolean',
          description: 'Whether they\'ve had a recent bankruptcy. null if "prefer not to say"',
        },
        
        // Optional
        best_time_to_contact_raw: {
          type: 'string',
          description: 'Raw best time input as spoken (e.g., "mornings work best", "after work", "weekends", "afternoons are good"). Will be normalized to: morning, afternoon, evening, weekday_morning, weekday_evening, weekend',
        },
        home_price: {
          type: 'number',
          description: 'Expected home price in dollars. Convert spoken amounts.',
        },
        site_work: {
          type: 'array',
          items: {
            type: 'string',
            enum: ENUMS.site_work_needed,
          },
          description: 'Site work needed: foundation, utilities, septic, well, driveway, grading, deck, skirting, not_sure',
        },
        notes_free_text: {
          type: 'string',
          description: 'Any other details or notes the caller shares',
        },
      },
      required: [],
    },
  },
};

/**
 * Tool for providing information/explanations when caller asks questions
 */
export const PROVIDE_INFO_TOOL = {
  type: 'function',
  function: {
    name: 'provide_info',
    description: `Use when the caller asks a question, needs clarification, or wants to understand their options.
Examples: "What's a double wide?", "What are my options?", "What does that mean?", "Can you explain?"
After explaining, guide them back to the current question.`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: [
            'home_types',
            'timeline_options', 
            'land_status_options',
            'credit_ranges',
            'process_overview',
            'tlc_info',
            'clarify_question',
            'other'
          ],
          description: 'What the caller is asking about',
        },
        response: {
          type: 'string',
          description: 'BRIEF explanation - MAX 25-30 words! This is a phone call, not a lecture. Give the key difference and move on. Example: "A single wide is narrower and more affordable. A double wide is two sections joined - feels more like a regular house."',
        },
        follow_up_with_question: {
          type: 'boolean',
          description: 'Whether to repeat the current question after explaining. Usually true.',
        },
      },
      required: ['topic', 'response'],
    },
  },
};

/**
 * Tool for when the user's response is unclear
 */
export const REQUEST_CLARIFICATION_TOOL = {
  type: 'function',
  function: {
    name: 'request_clarification',
    description: 'Call this when the user\'s response is unclear, inaudible, or doesn\'t answer the question. Do NOT call if they provided ANY usable information.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['unclear_audio', 'off_topic', 'incomplete', 'ambiguous'],
          description: 'Why clarification is needed',
        },
      },
      required: ['reason'],
    },
  },
};

/**
 * Tool for when user wants to end the call
 */
export const END_CALL_TOOL = {
  type: 'function',
  function: {
    name: 'end_call',
    description: 'Call this when the user explicitly wants to end the call or declines to continue.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: ['user_requested', 'do_not_contact', 'callback_requested'],
          description: 'Why the call is ending',
        },
      },
      required: ['reason'],
    },
  },
};

// =============================================================================
// TOOLS ARRAY
// =============================================================================

/**
 * All available tools - always include all of them
 * The conversation controller decides what to do with extracted data
 */
export const TOOLS = [
  EXTRACT_FIELDS_TOOL,
  PROVIDE_INFO_TOOL,
  REQUEST_CLARIFICATION_TOOL,
  END_CALL_TOOL,
];

// =============================================================================
// FIELD MAPPING
// =============================================================================

/**
 * Map extraction tool parameters to state machine field names
 */
export const EXTRACTION_TO_STATE_FIELD_MAP = {
  contact_consent: 'contact_consent',
  full_name: 'full_name',
  phone_e164: 'phone_e164',
  email: 'email',
  preferred_contact_method: 'preferred_contact_method',
  property_zip: 'property_zip',
  property_state: 'property_state',
  land_status: 'land_status',
  land_value_raw: 'land_value',       // Mapped to 'land_value' - state machine handles raw→band
  home_type: 'home_type',
  timeline_raw: 'timeline',           // Mapped to 'timeline' - state machine handles raw→band
  credit_raw: 'credit',               // Mapped to 'credit' - state machine handles raw→band
  monthly_income: 'monthly_income',
  has_recent_bankruptcy: 'has_recent_bankruptcy',
  best_time_to_contact_raw: 'best_time_to_contact',  // Mapped to 'best_time_to_contact' - state machine handles raw→band
  home_price: 'home_price',
  site_work: 'site_work',
  notes_free_text: 'notes_free_text',
};

/**
 * Get tools for the conversation
 * In the new architecture, we always return the same tools
 */
export function getToolsForPhase(phase) {
  // Always return all tools - the controller handles flow
  return TOOLS;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  TOOLS,
  EXTRACT_FIELDS_TOOL,
  PROVIDE_INFO_TOOL,
  REQUEST_CLARIFICATION_TOOL,
  END_CALL_TOOL,
  EXTRACTION_TO_STATE_FIELD_MAP,
  getToolsForPhase,
};
