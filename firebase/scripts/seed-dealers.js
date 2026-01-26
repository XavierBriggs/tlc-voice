/**
 * Seed Dealers Collection
 *
 * Creates sample dealer documents with:
 * - delivery_prefs
 * - routing_prefs
 * - locations (subcollection)
 * - contacts (subcollection)
 *
 * For production data, use seed-dealers-normalized.js with a JSON file.
 *
 * Usage:
 *   node seed-dealers.js
 */

import { getDb, FieldValue } from './lib/db.js';

const db = getDb();

// =============================================================================
// SAMPLE DEALERS
// =============================================================================

const DEALERS = [
  {
    dealer_id: 'home_nation',
    dealer_name: 'Home Nation',
    status: 'active',
    tier: 'top50',
    website_url: 'https://www.homenation.com',
    notes: 'Default fallback dealer for all leads',
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['leads@homenation.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: 1000,  // Highest (used as fallback)
      exclusive_zips_allowed: false,
    },
    locations: [
      {
        location_id: 'loc_hn_main',
        label: 'Headquarters',
        address1: '123 Home Nation Blvd',
        city: 'Dallas',
        state: 'TX',
        zip5: '75201',
        is_primary: true,
      },
    ],
    contacts: [
      {
        contact_id: 'ctc_hn_main',
        full_name: 'Home Nation Leads',
        role: 'leads',
        email: 'leads@homenation.com',
        is_primary: true,
      },
    ],
  },
  {
    dealer_id: 'dlr_example_001',
    dealer_name: 'Example Homes Austin',
    status: 'active',
    tier: 'standard',
    website_url: 'https://www.examplehomes.com',
    notes: 'Austin area dealer',
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['austin@examplehomes.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: 100,
      exclusive_zips_allowed: true,
    },
    locations: [
      {
        location_id: 'loc_austin_main',
        label: 'Austin Showroom',
        address1: '456 Congress Ave',
        city: 'Austin',
        state: 'TX',
        zip5: '78701',
        phone_e164: '+15125551234',
        is_primary: true,
      },
    ],
    contacts: [
      {
        contact_id: 'ctc_austin_sales',
        full_name: 'Jane Smith',
        role: 'sales',
        email: 'jane@examplehomes.com',
        phone_e164: '+15125551234',
        is_primary: true,
      },
    ],
  },
  {
    dealer_id: 'dlr_example_002',
    dealer_name: 'Example Homes Houston',
    status: 'active',
    tier: 'standard',
    website_url: 'https://www.examplehomes.com',
    notes: 'Houston area dealer',
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['houston@examplehomes.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: 100,
      exclusive_zips_allowed: true,
    },
    locations: [
      {
        location_id: 'loc_houston_main',
        label: 'Houston Showroom',
        address1: '789 Westheimer Rd',
        city: 'Houston',
        state: 'TX',
        zip5: '77056',
        phone_e164: '+17135551234',
        is_primary: true,
      },
    ],
    contacts: [
      {
        contact_id: 'ctc_houston_sales',
        full_name: 'John Doe',
        role: 'sales',
        email: 'john@examplehomes.com',
        phone_e164: '+17135551234',
        is_primary: true,
      },
    ],
  },
];

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seedDealers() {
  console.log('Seeding dealers collection...\n');

  for (const dealer of DEALERS) {
    // Extract subcollection data
    const { locations, contacts, ...dealerData } = dealer;

    // Write dealer document
    const dealerRef = db.collection('dealers').doc(dealer.dealer_id);
    await dealerRef.set({
      ...dealerData,
      schema_version: 1,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    console.log(`  - ${dealer.dealer_id}: ${dealer.dealer_name}`);

    // Write locations subcollection
    if (locations && locations.length > 0) {
      for (const location of locations) {
        const locRef = dealerRef.collection('locations').doc(location.location_id);
        await locRef.set({
          ...location,
          dealer_id: dealer.dealer_id,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        console.log(`      └─ location: ${location.location_id}`);
      }
    }

    // Write contacts subcollection
    if (contacts && contacts.length > 0) {
      for (const contact of contacts) {
        const ctcRef = dealerRef.collection('contacts').doc(contact.contact_id);
        await ctcRef.set({
          ...contact,
          dealer_id: dealer.dealer_id,
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        console.log(`      └─ contact: ${contact.contact_id}`);
      }
    }
  }

  console.log(`\nSeeded ${DEALERS.length} dealers with locations and contacts.`);
}

// Run
seedDealers()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding dealers:', error);
    process.exit(1);
  });
