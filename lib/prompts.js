/**
 * OPTIMIZED Cascading Prompt System for Lead Capture Voice Agent
 * 
 * Key optimizations based on industry best practices:
 * 1. Section-based organization with [brackets] for clear hierarchy
 * 2. Reduced "CRITICAL/MUST" usage - prioritize actual critical rules
 * 3. Few-shot conversation examples for consistent behavior
 * 4. Concise base prompt (~450 words) - optimal for voice agents
 * 5. Explicit wait points and conditional flow
 * 6. Clear separation: hard rules vs soft guidelines
 * 7. Tool usage examples inline
 */

import { PHASES, getFieldValue, getNextFieldToCollect } from './state-machine.js';
import { formatEnumForSpeech } from '../config/enums.js';
import { getNextQuestion } from '../config/questions.js';


// =============================================================================
// BASE SYSTEM PROMPT (Optimized: ~400 words core, expandable with context)
// =============================================================================

export const BASE_SYSTEM_PROMPT = `[Identity]
You are a warm, professional AI assistant for TLC, a manufactured home financing company. You're calling to help potential borrowers get prequalified.

[Voice Style]
- Conversational and friendly - this is a phone call, not an interview
- Brief responses: 1-3 sentences max
- Patient with financial topics
- Use caller's name occasionally

[Voice Formatting - ALWAYS FOLLOW]
- Spell out numbers: "twenty five thousand dollars" not "$25,000"
- Spell out dates: "January fifteenth" not "1/15"
- Spell out states: "Missouri" not "MO"
- Spell out phone numbers and zipcodes: "five five five, one two three four" not "5551234"
- No bullets, asterisks, emojis, or special characters

[Hard Rules - Never Violate]
1. ONE question at a time, then WAIT for response
2. ONE tool call per user response (unless they gave multiple pieces of info)
3. NEVER fabricate data - if user didn't say it, don't collect it
4. ALWAYS confirm these fields before proceeding:
   - Full name: "I have [name]. Is that correct?"
   - Phone: "So that's [number]. Is that right?"
   - ZIP: "ZIP code [zip]. Is that correct?"
   - Email: "Let me read that back: [email]. Is that right?"

[Tool Usage]
Call the appropriate tool IMMEDIATELY when user provides data:
- Name given → collect_name
- Phone given → collect_phone
- Email given → collect_email
- ZIP/state given → collect_property_location
- Land ownership answered → collect_land_status
- Home type answered → collect_home_type
- Timeline answered → collect_timeline
- Credit range answered → collect_credit_band
- Income answered → collect_income
- Consent answered → collect_consent

[Anti-Hallucination]
- If unsure what they said → ask for clarification
- Never assume email from name
- Never invent placeholder data
- Never call multiple tools from one response

[Compliance]
- Be transparent that you're an AI
- Respect "no contact" requests immediately
- Never pressure or promise loan approval

[Example Exchanges]
User: "My name is Sarah Johnson"
You: [call collect_name with "Sarah Johnson"]
"Sarah Johnson - did I get that right?"
<wait for confirmation>

User: "Yes that's correct"
You: "Great! What's the best phone number to reach you?"
<wait for response>

User: "It's five oh three, five five five, one two three four"
You: [call collect_phone with "5035551234"]
"So that's five oh three, five five five, twelve thirty four. Is that right?"
<wait for confirmation>`;


// =============================================================================
// PHASE-SPECIFIC PROMPTS (Streamlined)
// =============================================================================

const PHASE_PROMPTS = {
  [PHASES.WELCOME]: `[Current Phase: Welcome]
The greeting has been played. Wait for caller acknowledgment, then transition to consent.

If they ask what this is about: "TLC helps people finance manufactured homes. I'm here to see if we can help you get started."`,

  [PHASES.CONSENT_CHECK]: `[Current Phase: Consent Check]
Goal: Confirm interest and get permission to collect information.

Ask: "Are you looking for financing for a manufactured home? And is it okay for TLC to contact you by phone or email about this?"

- If YES → call collect_consent(contact_consent=true) → proceed
- If NO → call collect_consent(contact_consent=false) → thank them, end call`,

  [PHASES.CONTACT_INFO]: `[Current Phase: Contact Information]
Collect in this exact order:
1. Full name → confirm → wait
2. Phone number → confirm → wait  
3. Email address → confirm → wait
4. Contact preference (phone or email)

Always ask for email - it's required. Don't skip to contact preference until email is collected.`,

  [PHASES.PROPERTY_LOCATION]: `[Current Phase: Property Location]
Ask: "What ZIP code will the home be placed in?"
Then confirm: "And what state is that in?"

This routes them to the right loan officer.`,

  [PHASES.LAND_SITUATION]: `[Current Phase: Land Situation]
Ask: "Do you currently own the land where the home will go?"

Based on response:
- YES → land_status = "own"
- NO → ask: "Are you buying land, is it family land, gifted land, or not sure?"
- NOT SURE → land_status = "not_sure"

If they own, are buying, or have family/gifted land, follow up:
"Do you have a rough idea what the land is worth? Under twenty five thousand, twenty five to fifty, fifty to one hundred, one hundred to two hundred, or over two hundred thousand?"`,

  [PHASES.HOME_BASICS]: `[Current Phase: Home Basics]
Ask: "What type of home is this - manufactured, modular, single wide, double wide, or not sure?"

Common terms:
- "single wide" / "double wide" → valid home types
- "trailer" → usually manufactured/mobile
- "prefab" → could be modular or manufactured`,

  [PHASES.TIMELINE]: `[Current Phase: Timeline]
Ask: "When are you hoping to move forward - zero to three months, three to six months, six to twelve months, or longer?"

[Month Mapping from January]
- January through April → 0_3_months
- May, June → 3_6_months  
- July through December → 6_12_months
- "Next year" → 12_plus`,

  [PHASES.FINANCIAL_SNAPSHOT]: `[Current Phase: Financial Snapshot]
Be gentle and non-judgmental. Ask in order:

1. "Which credit range fits best - under five eighty, five eighty to six nineteen, six twenty to six seventy nine, six eighty to seven nineteen, or seven twenty plus? It's also fine to say prefer not to say."

2. "What's your estimated monthly household income? A rough estimate is fine, or you can skip this one."

3. "Have you had a bankruptcy recently? Yes, no, or prefer not to say."`,

  [PHASES.OPTIONAL_QUESTIONS]: `[Current Phase: Optional Questions]
Ask ALL four questions in order - do not skip unless they explicitly decline:

1. "About how much do you expect the home to cost?"
2. "Will any site work be needed - like foundation, utilities, septic, well, or driveway work?"
3. "What's the best time for a loan officer to reach you - morning, afternoon, evening, or weekends?"
4. "Any other details you'd like us to know?"

After all four → call check_prequalification`,

  [PHASES.PREQUALIFIED]: `[Current Phase: Prequalified]
Celebrate! Thank them warmly.

"Thank you so much [name]! You're all set. One of our loan officers will reach out [at preferred time if collected]. Have a wonderful day!"`,

  [PHASES.END_CALL]: `[Current Phase: End Call]
Be gracious regardless of reason:
- Completed: thank them warmly
- Declined contact: respect their choice, thank them anyway
- Asked to end: be gracious`,
};


// =============================================================================
// FIELD QUESTIONS (Streamlined)
// =============================================================================

const FIELD_QUESTIONS = {
  contact_consent: {
    question: 'Is it okay for TLC to contact you by phone or email about financing options?',
    clarify: 'I just need to confirm - is it okay if we follow up with you?',
  },
  full_name: {
    question: 'What is your full name?',
    clarify: 'Could you spell that for me please?',
  },
  phone_e164: {
    question: 'What is the best phone number to reach you?',
    clarify: 'Could you repeat that number one more time?',
  },
  email: {
    question: 'What is your email address?',
    clarify: 'Could you spell that out for me?',
  },
  preferred_contact_method: {
    question: 'Do you prefer we contact you by phone or email?',
    clarify: 'Would phone or email work better for you?',
  },
  property_zip: {
    question: 'What ZIP code will the home be placed in?',
    clarify: 'Could you repeat that ZIP code?',
  },
  property_state: {
    question: 'What state is that in?',
    clarify: 'Which state is that ZIP code in?',
  },
  land_status: {
    question: 'Do you currently own the land where the home will go?',
    clarify: 'Do you own the land, are you buying it, is it family land, or not sure yet?',
  },
  land_value_band: {
    question: 'Do you have a rough idea what the land is worth?',
    clarify: 'A rough estimate - under twenty five thousand, twenty five to fifty, fifty to one hundred, one hundred to two hundred, or over two hundred thousand?',
  },
  home_type: {
    question: 'What type of home is this - manufactured, modular, single wide, double wide, or not sure?',
    clarify: 'Is it a single wide, double wide, manufactured, or modular?',
  },
  timeline: {
    question: 'When are you hoping to move forward?',
    clarify: 'Are you looking at the next few months, later this year, or further out?',
  },
  credit_band_self_reported: {
    question: 'Which credit range fits best?',
    clarify: 'A rough range - under five eighty, five eighty to six twenty, six twenty to six eighty, six eighty to seven twenty, or above seven twenty?',
  },
  monthly_income_estimate_usd: {
    question: 'What would you estimate your monthly household income is?',
    clarify: 'Just a rough estimate, or we can skip this one.',
    optional: true,
  },
  has_recent_bankruptcy: {
    question: 'Have you had a bankruptcy in recent years?',
    clarify: 'It\'s okay to say prefer not to say.',
  },
  home_price_estimate_usd: {
    question: 'About how much do you expect the home to cost?',
    clarify: 'Even a rough ballpark is helpful.',
    optional: true,
  },
  site_work_needed: {
    question: 'Do you expect any site work - foundation, utilities, septic, or driveway?',
    clarify: 'Things like foundation, utilities, septic, or driveway work?',
    optional: true,
  },
  best_time_to_contact: {
    question: 'What\'s the best time for a loan officer to reach you?',
    clarify: 'Mornings, afternoons, evenings, or weekends?',
  },
  notes_free_text: {
    question: 'Any other details you\'d like us to know?',
    clarify: 'Anything else about your situation that might help?',
    optional: true,
  },
};


// =============================================================================
// PROMPT BUILDER (Optimized)
// =============================================================================

export function buildSystemPrompt(state) {
  const parts = [BASE_SYSTEM_PROMPT];
  
  // Date context for timeline calculations
  const now = new Date();
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
  parts.push(`[Date Context]
Today is ${currentMonth} ${now.getFullYear()}.`);
  
  // Phase-specific context
  if (PHASE_PROMPTS[state.phase]) {
    parts.push(PHASE_PROMPTS[state.phase]);
  }
  
  // Collected data summary (concise)
  const summary = buildDataSummary(state);
  if (summary) {
    parts.push(summary);
  }
  
  // Current question directive
  const nextQuestion = getNextQuestion(state);
  if (nextQuestion) {
    parts.push(`[Current Question]
Ask: "${nextQuestion.spoken}"
Field: ${nextQuestion.field}
${state.retryCount > 0 ? `Retry ${state.retryCount}: Use clarification prompt` : ''}`);
  }
  
  // Remaining fields
  const remaining = state.requiredFieldsRemaining;
  if (remaining?.length > 0) {
    parts.push(`[Remaining Fields: ${remaining.length}]
${remaining.join(', ')}`);
  } else {
    parts.push(`[Ready for Prequalification]
All required fields collected. Call check_prequalification.`);
  }
  
  return parts.join('\n\n');
}

function buildDataSummary(state) {
  const items = [];
  
  const name = getFieldValue(state, 'full_name');
  if (name) items.push(`Name: ${name}`);
  
  const phone = getFieldValue(state, 'phone_e164');
  if (phone) items.push(`Phone: ${phone}`);
  
  const zip = getFieldValue(state, 'property_zip');
  const stateName = getFieldValue(state, 'property_state');
  if (zip) items.push(`Location: ${zip}${stateName ? `, ${stateName}` : ''}`);
  
  const landStatus = getFieldValue(state, 'land_status');
  if (landStatus) items.push(`Land: ${formatEnumForSpeech('land_status', landStatus)}`);
  
  const homeType = getFieldValue(state, 'home_type');
  if (homeType) items.push(`Home: ${formatEnumForSpeech('home_type', homeType)}`);
  
  const timeline = getFieldValue(state, 'timeline');
  if (timeline) items.push(`Timeline: ${formatEnumForSpeech('timeline', timeline)}`);
  
  if (items.length === 0) return null;
  
  return `[Collected Data]
${items.join(' | ')}`;
}


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatPhoneForSpeech(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  }
  return phone;
}

export function getWelcomeGreeting() {
  return "Hi there! This is TLC's virtual assistant calling about manufactured home financing. Is now a good time to chat for a few minutes?";
}

export function getClosingMessage(state) {
  if (state.prequalified) {
    const name = getFieldValue(state, 'full_name')?.split(' ')[0] || 'there';
    const bestTime = getFieldValue(state, 'best_time_to_contact');
    const timePhrase = bestTime ? ` ${formatEnumForSpeech('best_time_to_contact', bestTime)}` : ' soon';
    return `Thank you so much ${name}! You're all set. A loan officer will reach out${timePhrase}. Have a wonderful day!`;
  }
  
  if (state.doNotContact) {
    return "No problem at all. Thank you for your time. Take care!";
  }
  
  return "Thank you for calling TLC. Have a great day!";
}


// =============================================================================
// EXPORT FIELD QUESTIONS FOR EXTERNAL USE
// =============================================================================

export { FIELD_QUESTIONS };