#!/usr/bin/env node
// seed-dealers-from-excel.js
// Seed Firestore with dealers from the processed Excel data
//
// Usage:
//   node seed-dealers-from-excel.js [--dry-run] [--clear]
//
// Options:
//   --dry-run  Show what would be created without writing to Firestore
//   --clear    Delete all existing dealers before seeding
//
// Prerequisites:
//   - GOOGLE_APPLICATION_CREDENTIALS env var set to service account JSON path
//   - Or run: export GOOGLE_APPLICATION_CREDENTIALS="./path/to/serviceAccount.json"

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CLEAR_EXISTING = args.includes('--clear');

// Initialize Firebase
let app;
try {
  // Try to use GOOGLE_APPLICATION_CREDENTIALS
  app = initializeApp();
} catch (e) {
  // Fallback to local service account file
  const serviceAccountPath = join(__dirname, 'serviceAccount.json');
  if (existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    app = initializeApp({ credential: cert(serviceAccount) });
  } else {
    console.error('❌ Firebase credentials not found.');
    console.error('   Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccount.json in this directory.');
    process.exit(1);
  }
}

const db = getFirestore();

// ==============================================================================
// DEALER DATA (processed from Excel)
// ==============================================================================

const DEALERS = [
  {
    "dealer_id": "brindlee_mtn_home_sales",
    "dealer_name": "Brindlee Mtn Home Sales",
    "status": "active",
    "primary_contact_name": "Billy & Cyndi Griffin",
    "primary_contact_email": "bmh@brindleemtnhomes.com",
    "primary_phone": "256-947-0018",
    "address": { "street": "4059 Hwy 231", "city": "Lacey Springs", "state": "AL", "zip": "35754" },
    "coverage_zips": ["35754"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "regional_home_sales",
    "dealer_name": "Regional Home Sales",
    "status": "active",
    "primary_contact_name": "Brian Moye",
    "primary_contact_email": "bmoye@regionalhomes.net",
    "primary_phone": "256-775-8794",
    "address": { "street": "660 County Road 437", "city": "Cullman", "state": "AL", "zip": "35055" },
    "coverage_zips": ["35055"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "corky_s_homes",
    "dealer_name": "Corky's Homes",
    "status": "active",
    "primary_contact_name": "Jan Davis",
    "primary_contact_email": "corkysloans@aol.com",
    "primary_phone": "334-358-4258",
    "address": { "street": "1691 S. Memorial Drive", "city": "Prattville", "state": "AL", "zip": "36066" },
    "coverage_zips": ["36066"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "jaco_sales_llc",
    "dealer_name": "Jaco Sales LLC",
    "status": "active",
    "primary_contact_name": "Bubba Moore",
    "primary_contact_email": "ljmoore1973@gmail.com",
    "primary_phone": "334-283-1017",
    "address": { "street": "3711 North Wetumpka Highway", "city": "Montgomery", "state": "AL", "zip": "36110" },
    "coverage_zips": ["36110"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "timberline_homes_inc",
    "dealer_name": "Timberline Homes Inc",
    "status": "active",
    "primary_contact_name": "Andrew Stronge",
    "primary_contact_email": "astronge@timberlinehomes.com",
    "primary_phone": "205-463-8021",
    "address": { "street": "6201 Highway 69 South", "city": "Tuscaloosa", "state": "AL", "zip": "35405" },
    "coverage_zips": ["35405"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "clayton_homes_clanton",
    "dealer_name": "Clayton Homes - Clanton",
    "status": "active",
    "primary_contact_name": "Tim Slaney",
    "primary_contact_email": "r819@claytonhomes.com",
    "primary_phone": "205-755-4023",
    "address": { "street": "2101 Holiday Inn Drive", "city": "Clanton", "state": "AL", "zip": "35046" },
    "coverage_zips": ["35046"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "sanders_manufactured_housing",
    "dealer_name": "Sanders Manufactured Housing",
    "status": "active",
    "primary_contact_name": "Trent Sanders",
    "primary_contact_email": "trent@sandershousing.com",
    "primary_phone": "850-474-0261",
    "address": { "street": "10300 Pensacola Blvd", "city": "Pensacola", "state": "AL", "zip": "32534" },
    "coverage_zips": ["32534"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "clayton_jonesboro",
    "dealer_name": "Clayton - Jonesboro",
    "status": "active",
    "primary_contact_name": "Kim Adams",
    "primary_contact_email": "kimberly.adams@claytonhomes.com",
    "primary_phone": "870-935-1700",
    "address": { "street": "3920 Stadium Blvd", "city": "Jonesboro", "state": "AR", "zip": "72404" },
    "coverage_zips": ["72404"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "clayton_fort_smith",
    "dealer_name": "Clayton - Fort Smith",
    "status": "active",
    "primary_contact_name": "Kirk Freeman",
    "primary_contact_email": "kirk.freeman@claytonhomes.com",
    "primary_phone": "479-648-0070",
    "address": { "street": "6700 Hwy 71 South", "city": "Fort Smith", "state": "AR", "zip": "72908" },
    "coverage_zips": ["72908"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "sue_white_homes",
    "dealer_name": "Sue White Homes",
    "status": "active",
    "primary_contact_name": "Derek Dellinger",
    "primary_contact_email": "derekbladedellinger@gmail.com",
    "primary_phone": "479-452-6045",
    "address": { "street": "9210 Rogers Ave", "city": "Fort Smith", "state": "AR", "zip": "72903" },
    "coverage_zips": ["72903"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "el_dorado_homes",
    "dealer_name": "El Dorado Homes",
    "status": "active",
    "primary_contact_name": "Leslie Word",
    "primary_contact_email": "lword@eldohomes.com",
    "primary_phone": "870-862-5785",
    "address": { "street": "4607 Junction City Hwy", "city": "El Dorado", "state": "AR", "zip": "71730" },
    "coverage_zips": ["71730"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "nobility_homes",
    "dealer_name": "NOBILITY HOMES",
    "status": "active",
    "primary_contact_name": "TOM TREXLER",
    "primary_contact_email": "tom@nobilityhomes.com",
    "primary_phone": "(352) 732-5157",
    "address": { "street": "8651 SE 67 Court Rd", "city": "OCALA", "state": "FL", "zip": "34474" },
    "coverage_zips": ["34474"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "wayne_frier_macclenny",
    "dealer_name": "Wayne Frier - MacClenny",
    "status": "active",
    "primary_contact_name": "Jared Martin",
    "primary_contact_email": "jm_martin23@yahoo.com",
    "primary_phone": "904-259-4663",
    "address": { "street": "6629 US Hwy 90 W", "city": "MacClenny", "state": "FL", "zip": "32063" },
    "coverage_zips": ["32063"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "wayne_frier_home_ctrs",
    "dealer_name": "Wayne Frier Home Ctrs",
    "status": "active",
    "primary_contact_name": "Matt Frier",
    "primary_contact_email": "mfrier12@gmail.com",
    "primary_phone": "386-362-6306",
    "address": { "street": "12788 US Hwy 90", "city": "Live Oak", "state": "FL", "zip": null },
    "coverage_zips": [],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "freedom_home_center",
    "dealer_name": "Freedom Home center",
    "status": "active",
    "primary_contact_name": "Wes Lawler",
    "primary_contact_email": "wesley.lawler@claytonhomes.com",
    "primary_phone": "850-981-9100",
    "address": { "street": "5619 Stewart St", "city": "Milton", "state": "FL", "zip": "32853" },
    "coverage_zips": ["32853"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "affordable_homes_crestview",
    "dealer_name": "Affordable Homes - Crestview",
    "status": "active",
    "primary_contact_name": "Brandon Holland - CEO",
    "primary_contact_email": "affordablehomescrestview@gmail.com",
    "primary_phone": "850-398-5685",
    "address": { "street": "5250 South Ferdon Blvd", "city": "Crestview", "state": "FL", "zip": "32536" },
    "coverage_zips": ["32536"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "all_star_manufactured_housing_inc",
    "dealer_name": "All Star Manufactured Housing, Inc",
    "status": "active",
    "primary_contact_name": "Greg Kinder",
    "primary_contact_email": "gdk63@aol.com",
    "primary_phone": "352-622-9910",
    "address": { "street": "5325 South Pine Avenue", "city": "OCALA", "state": "FL", "zip": "34480" },
    "coverage_zips": ["34480"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "prestige_home_centers",
    "dealer_name": "Prestige Home Centers",
    "status": "active",
    "primary_contact_name": "Angela Martinez",
    "primary_contact_email": "ocala@prestigehomecenters.com",
    "primary_phone": "352-622-6324",
    "address": { "street": "4300 South Pine Avenue", "city": "OCALA", "state": "FL", "zip": "34480" },
    "coverage_zips": ["34480"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "jacobsen_homes_plant_city",
    "dealer_name": "Jacobsen Homes - Plant City",
    "status": "active",
    "primary_contact_name": "Thomas Malan",
    "primary_contact_email": "tom@jacobsenplantcity.com",
    "primary_phone": "844-466-3734",
    "address": { "street": "3818 W Baker St", "city": "Plant City", "state": "FL", "zip": "33565" },
    "coverage_zips": ["33565"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "leecorp_homes",
    "dealer_name": "LeeCorp Homes",
    "status": "active",
    "primary_contact_name": "Christopher Lee",
    "primary_contact_email": "chris@leecorpinc.com",
    "primary_phone": "239-498-2220",
    "address": { "street": "20251 S Tamiami Trail, Ste 2", "city": "Estero", "state": "FL", "zip": "33928" },
    "coverage_zips": ["33928"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "central_mobile_homes",
    "dealer_name": "Central Mobile Homes",
    "status": "active",
    "primary_contact_name": "Ken Kinney",
    "primary_contact_email": "kenkinneyjr@gmail.com",
    "primary_phone": "863-675-8888",
    "address": { "street": "871 W Hickpochee Ave", "city": "LaBelle", "state": "FL", "zip": "33935" },
    "coverage_zips": ["33935"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "quality_homes",
    "dealer_name": "Quality Homes",
    "status": "active",
    "primary_contact_name": "Katie Seybert",
    "primary_contact_email": "katieseybert@thequalityhomes.com",
    "primary_phone": "904-619-1462",
    "address": { "street": "7474 103rd St", "city": "Jacksonville", "state": "FL", "zip": "32221" },
    "coverage_zips": ["32221"],
    "priority_weight": 100,
    "lead_delivery_method": "email",
    "is_top50": true
  },
  {
    "dealer_id": "palm_harbor_homes_plant_city",
    "dealer_name": "Palm Harbor Homes - Plant City",
    "status": "active",
    "primary_contact_name": "John Leggett",
    "primary_contact_email": "johnl@palmharbor.com",
    "primary_phone": "813-719-9498",
    "address": { "street": "2545 N Frontage Rd", "city": "Plant City", "state": "FL", "zip": "33563" },
    "coverage_zips": ["33563"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "jacobsen_homes_ocala",
    "dealer_name": "Jacobsen Homes -Ocala",
    "status": "active",
    "primary_contact_name": "Jason Hart",
    "primary_contact_email": "jhart@jacobsenhomesflorida.com",
    "primary_phone": "352-629-9009",
    "address": { "street": "5131 SE 113th place", "city": "Belleview", "state": "FL", "zip": "34420" },
    "coverage_zips": ["34420"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "wayne_frier_homes_chiefland",
    "dealer_name": "Wayne Frier Homes - Chiefland",
    "status": "active",
    "primary_contact_name": "Joey Williams",
    "primary_contact_email": "joeyw@waynefrierhomes.com",
    "primary_phone": "352-493-1760",
    "address": { "street": "13771 NW US Hwy 19", "city": "Chiefland", "state": "FL", "zip": "32626" },
    "coverage_zips": ["32626"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  {
    "dealer_id": "wayne_frier_tallahassee",
    "dealer_name": "Wayne Frier - Tallahassee",
    "status": "active",
    "primary_contact_name": "Heather Lindsey",
    "primary_contact_email": "heatherl@waynefrierhomes.com",
    "primary_phone": "850-553-7006",
    "address": { "street": "6817 Mahan Drive", "city": "Tallahassee", "state": "FL", "zip": "32308" },
    "coverage_zips": ["32308"],
    "priority_weight": 50,
    "lead_delivery_method": "email",
    "is_top50": false
  },
  // ... continuing with remaining dealers - truncated for brevity
  // Full list will be loaded from JSON file
];

// ==============================================================================
// SEED FUNCTIONS
// ==============================================================================

async function clearDealers() {
  console.log('🗑️  Clearing existing dealers...');
  const snapshot = await db.collection('dealers').get();
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`   Deleted ${snapshot.size} dealers`);
}

async function seedDealers(dealers) {
  console.log(`\n📦 Seeding ${dealers.length} dealers...`);
  
  const stats = { created: 0, skipped: 0, errors: 0 };
  
  for (const dealer of dealers) {
    try {
      const docRef = db.collection('dealers').doc(dealer.dealer_id);
      
      if (DRY_RUN) {
        console.log(`   [DRY RUN] Would create: ${dealer.dealer_id} (${dealer.dealer_name})`);
        stats.created++;
        continue;
      }
      
      await docRef.set({
        ...dealer,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      
      stats.created++;
      
      // Progress indicator
      if (stats.created % 20 === 0) {
        console.log(`   Created ${stats.created}/${dealers.length}...`);
      }
    } catch (error) {
      console.error(`   ❌ Error creating ${dealer.dealer_id}:`, error.message);
      stats.errors++;
    }
  }
  
  return stats;
}

async function seedTrackingNumbers(dealers) {
  console.log('\n📞 Seeding dealer tracking numbers...');
  
  let count = 0;
  for (const dealer of dealers) {
    if (!dealer.primary_phone) continue;
    
    // Normalize phone to E.164-ish format
    const digits = dealer.primary_phone.replace(/\D/g, '');
    if (digits.length < 10) continue;
    
    const phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    
    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would map: ${phone} → ${dealer.dealer_id}`);
    } else {
      await db.collection('dealerTrackingNumbers').doc(phone).set({
        dealer_id: dealer.dealer_id,
        phone: phone,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    count++;
  }
  
  console.log(`   Mapped ${count} phone numbers`);
}

// ==============================================================================
// MAIN
// ==============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('TLC Dealer Seeding Script');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  
  // Load dealers from JSON file if available, otherwise use embedded data
  let dealers = DEALERS;
  const jsonPath = join(__dirname, 'dealers_processed.json');
  if (existsSync(jsonPath)) {
    console.log(`📂 Loading dealers from ${jsonPath}`);
    dealers = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } else {
    console.log('📂 Using embedded dealer data (partial list)');
    console.log('   For full list, run the Python processor first');
  }
  
  console.log(`   Found ${dealers.length} dealers`);
  console.log(`   Top 50: ${dealers.filter(d => d.is_top50).length}`);
  console.log(`   States: ${[...new Set(dealers.map(d => d.address?.state).filter(Boolean))].sort().join(', ')}`);
  
  if (CLEAR_EXISTING) {
    await clearDealers();
  }
  
  const stats = await seedDealers(dealers);
  await seedTrackingNumbers(dealers);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ COMPLETE');
  console.log(`   Created: ${stats.created}`);
  console.log(`   Errors: ${stats.errors}`);
  if (DRY_RUN) {
    console.log('\n   Run without --dry-run to actually create records');
  }
  console.log('='.repeat(60));
  
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
