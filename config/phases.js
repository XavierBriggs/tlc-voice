/**
 * Conversation Phases
 * 
 * Extracted to avoid circular dependencies between 
 * state-machine.js and questions.js
 */

export const PHASES = {
  WELCOME: 'welcome',
  CONSENT_CHECK: 'consent_check',
  CONTACT_INFO: 'contact_info',
  PROPERTY_LOCATION: 'property_location',
  LAND_SITUATION: 'land_situation',
  HOME_BASICS: 'home_basics',
  TIMELINE: 'timeline',
  FINANCIAL_SNAPSHOT: 'financial_snapshot',
  OPTIONAL_QUESTIONS: 'optional_questions',
  PREQUALIFIED: 'prequalified',
  END_CALL: 'end_call',
};
