// test-firestore.js
import { createHestiaClient } from '../api/hestia-client.js';

const client = createHestiaClient({ mode: 'firestore', verbose: true });

// Create a test lead - structure must match state machine expectations
const result = await client.createLead({
  callSid: 'TEST_' + Date.now(),
  collectedData: {
    source: { 
      channel: 'voice', 
      entrypoint: 'lender_global_phone',
      session_id: 'TEST_' + Date.now(),
    },
    applicant: {
      full_name: 'Test User',
      phone_e164: '+13145551234',
      email: 'test@example.com',
      preferred_contact_method: 'phone',
    },
    consents: {
      contact_consent: true,
      tcpa_disclosure_ack: true,
    },
    home_and_site: {
      property_zip: '63110',
      property_state: 'MO',
      land_status: 'own',
      home_type: 'manufactured',
      timeline: '0_3_months',
    },
    financial_snapshot: {
      credit_band_self_reported: '680_719',
    },
    notes: {},
  }
});

console.log('Created lead:', result);