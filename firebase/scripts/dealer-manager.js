#!/usr/bin/env node
/**
 * Dealer Manager CLI
 * 
 * Unified tool for managing dealers, phone numbers, and zip coverage.
 * 
 * Usage:
 *   node dealer-manager.js <command> [options]
 * 
 * Commands:
 *   add-dealer          Add a new dealer
 *   add-number          Add a phone number to a dealer
 *   add-coverage        Add zip coverage for a dealer
 *   import              Import data from JSON file
 *   list-dealers        List all dealers
 *   list-numbers        List dealer numbers
 *   list-coverage       List zip coverage
 *   dealer-info         Show detailed dealer info
 * 
 * Examples:
 *   node dealer-manager.js add-dealer --name "Texas Homes" --email leads@texas.com
 *   node dealer-manager.js add-number --dealer dlr_xxx --phone +15125551234
 *   node dealer-manager.js add-coverage --dealer dlr_xxx --state TX --zips "78701-78750"
 *   node dealer-manager.js import --file data/dealers.json
 */

import { getDb, FieldValue } from './lib/db.js';
import {
  normalizePhone,
  isValidZip,
  isValidState,
  isValidEmail,
  generateDealerId,
  parseZipRange,
  US_STATES,
} from './lib/validators.js';
import { readFileSync, existsSync } from 'fs';

// =============================================================================
// MAIN DISPATCHER
// =============================================================================

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'add-dealer':
      await addDealer();
      break;
    case 'add-number':
      await addNumber();
      break;
    case 'add-coverage':
      await addCoverage();
      break;
    case 'import':
      await importData();
      break;
    case 'list-dealers':
      await listDealers();
      break;
    case 'list-numbers':
      await listNumbers();
      break;
    case 'list-coverage':
      await listCoverage();
      break;
    case 'dealer-info':
      await dealerInfo();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.log('Unknown command. Use --help for usage.');
      process.exit(1);
  }
}

function getArg(name, required = false) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) {
    if (required) {
      console.error(`Missing required argument: --${name}`);
      process.exit(1);
    }
    return null;
  }
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

// =============================================================================
// ADD DEALER
// =============================================================================

async function addDealer() {
  const name = getArg('name', true);
  const email = getArg('email', true);
  const id = getArg('id') || generateDealerId(name);
  const tier = getArg('tier') || 'standard';
  const website = getArg('website');
  const notes = getArg('notes');
  const deliveryEnabled = !hasFlag('no-delivery');
  
  if (!isValidEmail(email)) {
    console.error(`Invalid email: ${email}`);
    process.exit(1);
  }
  
  const db = getDb();
  
  // Check if ID already exists
  const existing = await db.collection('dealers').doc(id).get();
  if (existing.exists) {
    console.error(`Dealer ID already exists: ${id}`);
    process.exit(1);
  }
  
  const dealer = {
    dealer_id: id,
    schema_version: 1,
    dealer_name: name,
    status: 'active',
    tier: tier,
    website_url: website || null,
    notes: notes || null,
    delivery_prefs: {
      dealer_delivery_enabled: deliveryEnabled,
      delivery_mode: 'email',
      email_to: [email],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: 100,
      exclusive_zips_allowed: true,
    },
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  
  await db.collection('dealers').doc(id).set(dealer);
  
  console.log('\n✓ Dealer created successfully!');
  console.log(`  ID: ${id}`);
  console.log(`  Name: ${name}`);
  console.log(`  Email: ${email}`);
  console.log(`  Tier: ${tier}`);
  console.log(`  Delivery enabled: ${deliveryEnabled}`);
}

// =============================================================================
// ADD NUMBER
// =============================================================================

async function addNumber() {
  const dealerId = getArg('dealer', true);
  const phone = getArg('phone', true);
  const label = getArg('label') || 'Main line';
  
  const phoneE164 = normalizePhone(phone);
  if (!phoneE164) {
    console.error(`Invalid phone number: ${phone}`);
    process.exit(1);
  }
  
  const db = getDb();
  
  // Verify dealer exists
  const dealerDoc = await db.collection('dealers').doc(dealerId).get();
  if (!dealerDoc.exists) {
    console.error(`Dealer not found: ${dealerId}`);
    process.exit(1);
  }
  
  // Check if number already exists
  const existing = await db.collection('dealerNumbers').doc(phoneE164).get();
  if (existing.exists) {
    const existingDealerId = existing.data().dealer_id;
    console.error(`Phone number already assigned to dealer: ${existingDealerId}`);
    process.exit(1);
  }
  
  const numberDoc = {
    phone_e164: phoneE164,
    dealer_id: dealerId,
    label: label,
    active: true,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  
  await db.collection('dealerNumbers').doc(phoneE164).set(numberDoc);
  
  console.log('\n✓ Phone number added successfully!');
  console.log(`  Phone: ${phoneE164}`);
  console.log(`  Dealer: ${dealerId} (${dealerDoc.data().dealer_name})`);
  console.log(`  Label: ${label}`);
}

// =============================================================================
// ADD COVERAGE
// =============================================================================

async function addCoverage() {
  const dealerId = getArg('dealer', true);
  const state = getArg('state', true)?.toUpperCase();
  const zipsInput = getArg('zips', true);
  const priority = parseInt(getArg('priority') || '10', 10);
  const exclusive = hasFlag('exclusive');
  
  if (!isValidState(state)) {
    console.error(`Invalid state: ${state}`);
    process.exit(1);
  }
  
  const zips = parseZipRange(zipsInput);
  if (zips.length === 0) {
    console.error(`No valid zips parsed from: ${zipsInput}`);
    process.exit(1);
  }
  
  const db = getDb();
  
  // Verify dealer exists
  const dealerDoc = await db.collection('dealers').doc(dealerId).get();
  if (!dealerDoc.exists) {
    console.error(`Dealer not found: ${dealerId}`);
    process.exit(1);
  }
  
  console.log(`\nAdding coverage for ${zips.length} zips in ${state}...`);
  
  // Process in batches
  const batchSize = 500;
  let added = 0;
  let updated = 0;
  
  for (let i = 0; i < zips.length; i += batchSize) {
    const batch = db.batch();
    const chunk = zips.slice(i, i + batchSize);
    
    for (const zip of chunk) {
      const coverageId = `${state}_${zip}`;
      const docRef = db.collection('zipCoverage').doc(coverageId);
      const existing = await docRef.get();
      
      const candidate = { dealer_id: dealerId, priority, exclusive };
      
      if (existing.exists) {
        // Add or update candidate in existing coverage
        const data = existing.data();
        const candidates = data.candidates || [];
        const existingIdx = candidates.findIndex(c => c.dealer_id === dealerId);
        
        if (existingIdx >= 0) {
          candidates[existingIdx] = candidate;
        } else {
          candidates.push(candidate);
        }
        
        // Sort by priority
        candidates.sort((a, b) => a.priority - b.priority);
        
        batch.update(docRef, {
          candidates: candidates,
          updated_at: FieldValue.serverTimestamp(),
        });
        updated++;
      } else {
        // Create new coverage document
        batch.set(docRef, {
          state: state,
          zip5: zip,
          candidates: [candidate],
          updated_at: FieldValue.serverTimestamp(),
        });
        added++;
      }
    }
    
    await batch.commit();
    process.stdout.write('.');
  }
  
  console.log('\n');
  console.log(`✓ Coverage added for ${dealerDoc.data().dealer_name}`);
  console.log(`  New zips: ${added}`);
  console.log(`  Updated zips: ${updated}`);
  console.log(`  Priority: ${priority}`);
  console.log(`  Exclusive: ${exclusive}`);
}

// =============================================================================
// IMPORT FROM JSON
// =============================================================================

async function importData() {
  const filePath = getArg('file', true);
  
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const db = getDb();
  
  console.log('\nImporting data...\n');
  
  // Import dealers
  if (data.dealers && data.dealers.length > 0) {
    console.log(`Importing ${data.dealers.length} dealers...`);
    for (const dealer of data.dealers) {
      const id = dealer.dealer_id || generateDealerId(dealer.dealer_name);
      
      // Build full dealer document
      const doc = {
        dealer_id: id,
        schema_version: 1,
        dealer_name: dealer.dealer_name || dealer.name,
        status: dealer.status || 'active',
        tier: dealer.tier || 'standard',
        website_url: dealer.website_url || dealer.website || null,
        notes: dealer.notes || null,
        delivery_prefs: {
          dealer_delivery_enabled: dealer.delivery_prefs?.dealer_delivery_enabled ?? dealer.delivery_enabled ?? true,
          delivery_mode: dealer.delivery_prefs?.delivery_mode || 'email',
          email_to: dealer.delivery_prefs?.email_to || [dealer.email].filter(Boolean),
          email_cc: dealer.delivery_prefs?.email_cc || [],
          webhook_url: dealer.delivery_prefs?.webhook_url || null,
          allow_lead_cap: dealer.delivery_prefs?.allow_lead_cap || false,
          daily_lead_cap: dealer.delivery_prefs?.daily_lead_cap || null,
        },
        routing_prefs: {
          priority_weight: dealer.routing_prefs?.priority_weight || 100,
          exclusive_zips_allowed: dealer.routing_prefs?.exclusive_zips_allowed ?? true,
        },
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      
      await db.collection('dealers').doc(id).set(doc);
      console.log(`  ✓ ${doc.dealer_name} (${id})`);
    }
    console.log('');
  }
  
  // Import numbers
  if (data.numbers && data.numbers.length > 0) {
    console.log(`Importing ${data.numbers.length} phone numbers...`);
    for (const number of data.numbers) {
      const phoneE164 = normalizePhone(number.phone || number.phone_e164);
      if (!phoneE164) {
        console.log(`  ✗ Invalid phone: ${number.phone || number.phone_e164}`);
        continue;
      }
      
      const doc = {
        phone_e164: phoneE164,
        dealer_id: number.dealer_id,
        label: number.label || 'Main line',
        active: number.active ?? true,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };
      
      await db.collection('dealerNumbers').doc(phoneE164).set(doc);
      console.log(`  ✓ ${phoneE164} -> ${number.dealer_id}`);
    }
    console.log('');
  }
  
  // Import coverage
  if (data.coverage && data.coverage.length > 0) {
    console.log(`Importing ${data.coverage.length} coverage entries...`);
    let count = 0;
    
    for (const entry of data.coverage) {
      const state = entry.state?.toUpperCase();
      if (!isValidState(state)) continue;
      
      const zips = parseZipRange(entry.zips);
      
      for (const zip of zips) {
        const coverageId = `${state}_${zip}`;
        const docRef = db.collection('zipCoverage').doc(coverageId);
        const existing = await docRef.get();
        
        const candidate = {
          dealer_id: entry.dealer_id,
          priority: entry.priority || 10,
          exclusive: entry.exclusive || false,
        };
        
        if (existing.exists) {
          const candidates = existing.data().candidates || [];
          const existingIdx = candidates.findIndex(c => c.dealer_id === entry.dealer_id);
          if (existingIdx >= 0) {
            candidates[existingIdx] = candidate;
          } else {
            candidates.push(candidate);
          }
          candidates.sort((a, b) => a.priority - b.priority);
          
          await docRef.update({
            candidates: candidates,
            updated_at: FieldValue.serverTimestamp(),
          });
        } else {
          await docRef.set({
            state: state,
            zip5: zip,
            candidates: [candidate],
            updated_at: FieldValue.serverTimestamp(),
          });
        }
        count++;
      }
    }
    console.log(`  ✓ Added coverage for ${count} state+zip combinations`);
    console.log('');
  }
  
  console.log('✓ Import complete!');
}

// =============================================================================
// LIST COMMANDS
// =============================================================================

async function listDealers() {
  const db = getDb();
  const snapshot = await db.collection('dealers').orderBy('dealer_name').get();
  
  console.log('\n=== DEALERS ===\n');
  console.log('ID                       | Name                    | Status  | Tier     | Delivery');
  console.log('-------------------------|-------------------------|---------|----------|----------');
  
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const id = d.dealer_id.padEnd(24);
    const name = (d.dealer_name || '').slice(0, 23).padEnd(23);
    const status = (d.status || '').padEnd(7);
    const tier = (d.tier || '').padEnd(8);
    const delivery = d.delivery_prefs?.dealer_delivery_enabled ? 'Yes' : 'No';
    console.log(`${id} | ${name} | ${status} | ${tier} | ${delivery}`);
  }
  
  console.log(`\nTotal: ${snapshot.size} dealers`);
}

async function listNumbers() {
  const dealerId = getArg('dealer');
  const db = getDb();
  
  let query = db.collection('dealerNumbers');
  if (dealerId) {
    query = query.where('dealer_id', '==', dealerId);
  }
  
  const snapshot = await query.get();
  
  console.log('\n=== DEALER NUMBERS ===\n');
  console.log('Phone           | Dealer ID               | Label                | Active');
  console.log('----------------|-------------------------|----------------------|-------');
  
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const phone = d.phone_e164.padEnd(15);
    const dealer = d.dealer_id.padEnd(23);
    const label = (d.label || '').slice(0, 20).padEnd(20);
    const active = d.active ? 'Yes' : 'No';
    console.log(`${phone} | ${dealer} | ${label} | ${active}`);
  }
  
  console.log(`\nTotal: ${snapshot.size} numbers`);
}

async function listCoverage() {
  const dealerId = getArg('dealer');
  const state = getArg('state')?.toUpperCase();
  const db = getDb();
  
  let query = db.collection('zipCoverage');
  if (state) {
    query = query.where('state', '==', state);
  }
  
  const snapshot = await query.limit(100).get();
  
  console.log('\n=== ZIP COVERAGE ===\n');
  
  // Group by dealer if filtering by dealer
  if (dealerId) {
    const zips = [];
    for (const doc of snapshot.docs) {
      const d = doc.data();
      const hasDealer = d.candidates?.some(c => c.dealer_id === dealerId);
      if (hasDealer) {
        zips.push(`${d.state}_${d.zip5}`);
      }
    }
    console.log(`Coverage for ${dealerId}:`);
    console.log(zips.join(', '));
    console.log(`\nTotal: ${zips.length} zips`);
  } else {
    console.log('State | Zip   | Dealers');
    console.log('------|-------|------------------------------------------');
    
    for (const doc of snapshot.docs) {
      const d = doc.data();
      const stateCol = d.state.padEnd(5);
      const zip = d.zip5;
      const dealers = d.candidates?.map(c => `${c.dealer_id}(p${c.priority})`).join(', ') || '-';
      console.log(`${stateCol} | ${zip} | ${dealers}`);
    }
    
    console.log(`\nShowing ${snapshot.size} entries (limited to 100)`);
  }
}

async function dealerInfo() {
  const dealerId = getArg('dealer', true);
  const db = getDb();

  // Get dealer
  const dealerDoc = await db.collection('dealers').doc(dealerId).get();
  if (!dealerDoc.exists) {
    console.error(`Dealer not found: ${dealerId}`);
    process.exit(1);
  }

  const dealer = dealerDoc.data();

  // Get locations subcollection
  const locationsSnapshot = await db.collection('dealers')
    .doc(dealerId)
    .collection('locations')
    .orderBy('is_primary', 'desc')
    .get();

  // Get contacts subcollection
  const contactsSnapshot = await db.collection('dealers')
    .doc(dealerId)
    .collection('contacts')
    .orderBy('is_primary', 'desc')
    .get();

  // Get numbers
  const numbersSnapshot = await db.collection('dealerNumbers')
    .where('dealer_id', '==', dealerId).get();

  // Get coverage count (sample)
  const coverageSnapshot = await db.collection('zipCoverage').limit(1000).get();
  let coverageCount = 0;
  const states = new Set();
  for (const doc of coverageSnapshot.docs) {
    const d = doc.data();
    if (d.candidates?.some(c => c.dealer_id === dealerId)) {
      coverageCount++;
      states.add(d.state);
    }
  }

  console.log('\n=== DEALER INFO ===\n');
  console.log(`ID:        ${dealer.dealer_id}`);
  console.log(`Name:      ${dealer.dealer_name}`);
  console.log(`Status:    ${dealer.status}`);
  console.log(`Tier:      ${dealer.tier}`);
  console.log(`Website:   ${dealer.website_url || '-'}`);
  console.log(`Notes:     ${dealer.notes || '-'}`);

  console.log('\nDelivery Preferences:');
  console.log(`  Enabled: ${dealer.delivery_prefs?.dealer_delivery_enabled}`);
  console.log(`  Mode:    ${dealer.delivery_prefs?.delivery_mode}`);
  console.log(`  Email:   ${dealer.delivery_prefs?.email_to?.join(', ') || '-'}`);
  console.log(`  CC:      ${dealer.delivery_prefs?.email_cc?.join(', ') || '-'}`);

  console.log('\nRouting Preferences:');
  console.log(`  Priority:  ${dealer.routing_prefs?.priority_weight}`);
  console.log(`  Exclusive: ${dealer.routing_prefs?.exclusive_zips_allowed}`);

  console.log('\nLocations:');
  if (locationsSnapshot.empty) {
    console.log('  (none)');
  } else {
    for (const doc of locationsSnapshot.docs) {
      const loc = doc.data();
      const primary = loc.is_primary ? ' [PRIMARY]' : '';
      const address = [loc.address1, loc.city, loc.state, loc.zip5].filter(Boolean).join(', ');
      console.log(`  ${loc.location_id}${primary}`);
      console.log(`    ${address || '(no address)'}`);
      if (loc.phone_e164) console.log(`    Phone: ${loc.phone_e164}`);
      if (loc.email) console.log(`    Email: ${loc.email}`);
    }
  }

  console.log('\nContacts:');
  if (contactsSnapshot.empty) {
    console.log('  (none)');
  } else {
    for (const doc of contactsSnapshot.docs) {
      const contact = doc.data();
      const primary = contact.is_primary ? ' [PRIMARY]' : '';
      const role = contact.role ? ` (${contact.role})` : '';
      console.log(`  ${contact.full_name || contact.contact_id}${role}${primary}`);
      if (contact.phone_e164) console.log(`    Phone: ${contact.phone_e164}`);
      if (contact.email) console.log(`    Email: ${contact.email}`);
    }
  }

  console.log('\nPhone Numbers (Attribution):');
  if (numbersSnapshot.empty) {
    console.log('  (none)');
  } else {
    for (const doc of numbersSnapshot.docs) {
      const n = doc.data();
      console.log(`  ${n.phone_e164} - ${n.label} (${n.active ? 'active' : 'inactive'})`);
    }
  }

  console.log('\nZip Coverage:');
  console.log(`  ${coverageCount} zips across ${states.size} states: ${Array.from(states).sort().join(', ')}`);
}

// =============================================================================
// HELP
// =============================================================================

function showHelp() {
  console.log(`
Dealer Manager CLI

Usage: node dealer-manager.js <command> [options]

COMMANDS:

  add-dealer          Add a new dealer
    --name <name>     Dealer name (required)
    --email <email>   Primary email for leads (required)
    --id <id>         Custom dealer ID (auto-generated if omitted)
    --tier <tier>     Tier: standard or top50 (default: standard)
    --website <url>   Website URL
    --notes <text>    Notes
    --no-delivery     Disable dealer email delivery

  add-number          Add a phone number to a dealer
    --dealer <id>     Dealer ID (required)
    --phone <number>  Phone number (required)
    --label <label>   Description (default: "Main line")

  add-coverage        Add zip coverage for a dealer
    --dealer <id>     Dealer ID (required)
    --state <ST>      State abbreviation (required)
    --zips <zips>     Zip codes: "78701" or "78701-78750" or "78701,78702,78703" (required)
    --priority <n>    Priority (lower = higher priority, default: 10)
    --exclusive       Mark as exclusive coverage

  import              Import data from JSON file
    --file <path>     Path to JSON file (required)

  list-dealers        List all dealers

  list-numbers        List dealer phone numbers
    --dealer <id>     Filter by dealer ID

  list-coverage       List zip coverage
    --dealer <id>     Filter by dealer ID
    --state <ST>      Filter by state

  dealer-info         Show detailed info for a dealer
    --dealer <id>     Dealer ID (required)

EXAMPLES:

  # Add a new dealer
  node dealer-manager.js add-dealer --name "Texas Homes" --email leads@texas.com

  # Add phone number
  node dealer-manager.js add-number --dealer dlr_texas_xxx --phone 5125551234

  # Add coverage for Austin area
  node dealer-manager.js add-coverage --dealer dlr_texas_xxx --state TX --zips "78701-78750"

  # Import from file
  node dealer-manager.js import --file data/dealers.json

  # View dealer details
  node dealer-manager.js dealer-info --dealer dlr_texas_xxx
`);
}

// =============================================================================
// RUN
// =============================================================================

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
