/**
 * Seed Zip Coverage Collection
 * 
 * Creates zipCoverage documents that map state+zip to dealer candidates
 * for geo routing.
 * 
 * Usage:
 *   node seed-zip-coverage.js
 */

import { getDb, FieldValue } from './lib/db.js';

const db = getDb();

// =============================================================================
// SAMPLE ZIP COVERAGE
// =============================================================================

// Austin area zips -> Example Homes Austin
const AUSTIN_ZIPS = [
  '78701', '78702', '78703', '78704', '78705',
  '78721', '78722', '78723', '78724', '78725',
  '78741', '78742', '78744', '78745', '78746',
  '78748', '78749', '78750', '78751', '78752',
  '78753', '78754', '78756', '78757', '78758',
  '78759',
];

// Houston area zips -> Example Homes Houston
const HOUSTON_ZIPS = [
  '77001', '77002', '77003', '77004', '77005',
  '77006', '77007', '77008', '77009', '77010',
  '77011', '77012', '77013', '77014', '77015',
  '77016', '77017', '77018', '77019', '77020',
];

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seedZipCoverage() {
  console.log('Seeding zipCoverage collection...\n');
  
  let count = 0;
  
  // Process in batches of 500 (Firestore limit)
  const allCoverage = [];
  
  // Austin zips
  for (const zip of AUSTIN_ZIPS) {
    allCoverage.push({
      id: `TX_${zip}`,
      data: {
        state: 'TX',
        zip5: zip,
        candidates: [
          { dealer_id: 'dlr_example_001', priority: 10, exclusive: false },
        ],
        updated_at: FieldValue.serverTimestamp(),
      },
    });
  }
  
  // Houston zips
  for (const zip of HOUSTON_ZIPS) {
    allCoverage.push({
      id: `TX_${zip}`,
      data: {
        state: 'TX',
        zip5: zip,
        candidates: [
          { dealer_id: 'dlr_example_002', priority: 10, exclusive: false },
        ],
        updated_at: FieldValue.serverTimestamp(),
      },
    });
  }
  
  // Write in batches
  const batchSize = 500;
  for (let i = 0; i < allCoverage.length; i += batchSize) {
    const batch = db.batch();
    const chunk = allCoverage.slice(i, i + batchSize);
    
    for (const coverage of chunk) {
      const docRef = db.collection('zipCoverage').doc(coverage.id);
      batch.set(docRef, coverage.data);
      count++;
    }
    
    await batch.commit();
    console.log(`  Wrote batch ${Math.floor(i / batchSize) + 1} (${chunk.length} documents)`);
  }
  
  console.log(`\nSeeded ${count} zip coverage documents.`);
  console.log(`  - Austin area (${AUSTIN_ZIPS.length} zips) -> dlr_example_001`);
  console.log(`  - Houston area (${HOUSTON_ZIPS.length} zips) -> dlr_example_002`);
}

// Run
seedZipCoverage()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error seeding zip coverage:', error);
    process.exit(1);
  });
