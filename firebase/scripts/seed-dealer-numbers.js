/**
 * Seed Dealer Numbers Collection
 * 
 * Creates dealerNumbers documents that map phone numbers to dealers
 * for attribution lookup.
 * 
 * Usage:
 *   node seed-dealer-numbers.js
 */

import { getDb, FieldValue } from './lib/db.js';

const db = getDb();

// =============================================================================
// SAMPLE DEALER NUMBERS
// =============================================================================

const DEALER_NUMBERS = [
  {
    phone_e164: '+15125550101',
    dealer_id: 'dlr_example_001',
    label: 'Example Homes Austin - Main',
    active: true,
  },
  {
    phone_e164: '+15125550102',
    dealer_id: 'dlr_example_001',
    label: 'Example Homes Austin - Website',
    active: true,
  },
  {
    phone_e164: '+17135550101',
    dealer_id: 'dlr_example_002',
    label: 'Example Homes Houston - Main',
    active: true,
  },
];

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seedDealerNumbers() {
  console.log('Seeding dealerNumbers collection...\n');
  
  const batch = db.batch();
  
  for (const number of DEALER_NUMBERS) {
    // Use phone number as document ID
    const docRef = db.collection('dealerNumbers').doc(number.phone_e164);
    
    batch.set(docRef, {
      ...number,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    
    console.log(`  - ${number.phone_e164} -> ${number.dealer_id} (${number.label})`);
  }
  
  await batch.commit();
  
  console.log(`\nSeeded ${DEALER_NUMBERS.length} dealer numbers.`);
}

// Run
seedDealerNumbers()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding dealer numbers:', error);
    process.exit(1);
  });
