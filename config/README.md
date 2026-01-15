# ⚙️ config/ - Configuration

Static configuration for the voice agent.

## 📁 Files

| File | Purpose |
|------|---------|
| `questions.js` | Question flow definitions |
| `enums.js` | Valid values from Hestia schema |

---

## ❓ questions.js

Defines the question flow based on [Hestia Voice Questions](../Hestia%20Voice%20Questions.md).

```javascript
import { QUESTIONS, getNextQuestion } from './questions.js';

// Get next question for current state
const question = getNextQuestion(state);
// {
//   id: 'property_zip',
//   phase: 'property_location',
//   question: 'What ZIP code will the home be placed in?',
//   spoken: 'What ZIP code will the home be placed in?',
//   validResponses: ['5-digit ZIP code']
// }
```

### Question Structure

```javascript
{
  id: 'land_ownership',
  phase: 'land_situation',
  required: true,
  field: 'land_status',
  
  // Display version
  question: 'Do you currently own the land?',
  
  // Voice-optimized version
  spoken: 'Do you currently own the land where the home will go?',
  
  // Expected responses
  validResponses: ['yes', 'no', 'not sure'],
  
  // Value mapping
  mapping: {
    yes: 'own',
    no: 'trigger_followup',
    'not sure': 'not_sure'
  },
  
  // Conditional follow-ups
  triggersQuestion: {
    no: 'land_status_followup'
  },
  
  // Retry prompt
  followUp: 'Just to clarify - do you own the land?'
}
```

### Questions by Phase

| Phase | Questions |
|-------|-----------|
| `consent_check` | `interested_in_financing`, `contact_consent` |
| `contact_info` | `full_name`, `phone_number`, `preferred_contact`, `email_address` |
| `property_location` | `property_zip`, `property_state` |
| `land_situation` | `land_ownership`, `land_status_followup`, `land_value` |
| `home_basics` | `home_type`, `is_new_purchase` |
| `timeline` | `timeline` |
| `financial_snapshot` | `credit_band`, `monthly_income`, `recent_bankruptcy` |
| `optional_questions` | `home_price`, `site_work`, `best_time_to_contact`, `additional_notes` |

---

## 📋 enums.js

Valid values matching Hestia API Schema V2.

```javascript
import { ENUMS, isValidEnum, formatEnumForSpeech } from './enums.js';

// Validate value
isValidEnum('land_status', 'own');  // true
isValidEnum('land_status', 'rent'); // false

// Format for speech
formatEnumForSpeech('timeline', '0_3_months');
// "zero to three months"
```

### Available Enums

| Enum | Values |
|------|--------|
| `channel` | `web`, `voice` |
| `entrypoint` | `dealer_link`, `dealer_phone`, `lender_global_site`, `lender_global_phone` |
| `land_status` | `own`, `buying`, `family_land`, `gifted_land`, `renting_lot`, `not_sure` |
| `home_type` | `manufactured`, `mobile_pre_hud`, `modular`, `single_wide`, `double_wide` |
| `timeline` | `0_3_months`, `3_6_months`, `6_12_months`, `12_plus`, `not_sure` |
| `credit_band` | `under_580`, `580_619`, `620_679`, `680_719`, `720_plus`, `prefer_not_to_say` |
| `lead_status` | `new`, `prequalified`, `routed`, `contacted`, `ineligible`, `do_not_contact` |

### Validation Helpers

```javascript
import { isValidZipCode, isValidE164Phone, normalizeToE164 } from './enums.js';

isValidZipCode('63110');        // true
isValidE164Phone('+15551234567'); // true
normalizeToE164('555-123-4567');  // '+15551234567'
```
