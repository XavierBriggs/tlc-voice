#!/usr/bin/env node
/**
 * Seed dealers, locations, and contacts from a normalized JSON file.
 *
 * Usage:
 *   node seed-dealers-normalized.js --file scripts/data/dealers_normalized_v1.json
 *   node seed-dealers-normalized.js --file scripts/data/dealers_normalized_v1.json --dry-run
 *   node seed-dealers-normalized.js --file scripts/data/dealers_normalized_v1.json --merge
 */

import { readFileSync, existsSync } from 'fs';
import { getDb, FieldValue } from './lib/db.js';
import { PATHS, relativePath } from './lib/paths.js';

const args = process.argv.slice(2);

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

function showHelp() {
  console.log(`Usage:
  node scripts/seed-dealers-normalized.js [options]

Options:
  --file <path>   Normalized dealers JSON (default: ${relativePath(PATHS.normalizedDealersJson)})
  --dry-run       Print counts only
  --merge         Merge into existing docs
  --help          Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const filePath = getArg('file') || PATHS.normalizedDealersJson;
const dryRun = hasFlag('dry-run');
const merge = hasFlag('merge');

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(filePath, 'utf8'));

const dealers = payload.dealers || [];
const locations = payload.locations || [];
const contacts = payload.contacts || [];

if (dryRun) {
  console.log('Dry run enabled. No data will be written.');
  console.log(`  Dealers:   ${dealers.length}`);
  console.log(`  Locations: ${locations.length}`);
  console.log(`  Contacts:  ${contacts.length}`);
  process.exit(0);
}

const db = getDb();

let batch = db.batch();
let ops = 0;
const MAX_OPS = 450;

async function commitBatch() {
  if (ops === 0) return;
  await batch.commit();
  batch = db.batch();
  ops = 0;
}

for (const dealer of dealers) {
  const ref = db.collection('dealers').doc(dealer.dealer_id);
  batch.set(ref, {
    ...dealer,
    schema_version: 1,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge });
  ops += 1;
  if (ops >= MAX_OPS) await commitBatch();
}

for (const location of locations) {
  const ref = db.collection('dealers')
    .doc(location.dealer_id)
    .collection('locations')
    .doc(location.location_id);
  batch.set(ref, {
    ...location,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge });
  ops += 1;
  if (ops >= MAX_OPS) await commitBatch();
}

for (const contact of contacts) {
  const ref = db.collection('dealers')
    .doc(contact.dealer_id)
    .collection('contacts')
    .doc(contact.contact_id);
  batch.set(ref, {
    ...contact,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge });
  ops += 1;
  if (ops >= MAX_OPS) await commitBatch();
}

await commitBatch();

console.log('Seeding complete.');
console.log(`  Dealers:   ${dealers.length}`);
console.log(`  Locations: ${locations.length}`);
console.log(`  Contacts:  ${contacts.length}`);
console.log(`  Source:    ${relativePath(filePath)}`);
