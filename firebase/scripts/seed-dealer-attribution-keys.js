#!/usr/bin/env node
/**
 * Seed dealer attribution keys (hashed ref codes) into Firestore.
 *
 * Usage:
 *   node scripts/seed-dealer-attribution-keys.js --file scripts/data/dealer_attribution_keys_v1.json
 *   node scripts/seed-dealer-attribution-keys.js --file scripts/data/dealer_attribution_keys_v1.json --merge
 *   node scripts/seed-dealer-attribution-keys.js --file scripts/data/dealer_attribution_keys_v1.json --allow-generate --write-back
 *   node scripts/seed-dealer-attribution-keys.js --file scripts/data/dealer_attribution_keys_v1.json --allow-generate --salt "your-secret"
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
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
  node scripts/seed-dealer-attribution-keys.js [options]

Options:
  --file <path>       Keys JSON file (default: ${relativePath(PATHS.dealerAttributionKeysJson)})
  --dry-run           Print counts only
  --merge             Merge into existing docs
  --allow-generate    Generate key_hash when missing
  --write-back        Persist generated key_hash values back to the JSON file
  --salt <string>     Deterministic hash salt (only used when generating)
  --help              Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const filePath = getArg('file') || PATHS.dealerAttributionKeysJson;
const dryRun = hasFlag('dry-run');
const merge = hasFlag('merge');
const allowGenerate = hasFlag('allow-generate');
const writeBack = hasFlag('write-back');
const salt = getArg('salt') || '';

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(filePath, 'utf8'));
const keys = Array.isArray(payload) ? payload : (payload.keys || []);

if (!Array.isArray(keys)) {
  console.error('Invalid input: expected an array or { keys: [...] }');
  process.exit(1);
}

function isValidHex16(value) {
  return typeof value === 'string' && /^[a-f0-9]{16}$/i.test(value);
}

function normalizeTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function generateKeyHash(entry) {
  if (salt) {
    const material = `${entry.dealer_id}:${entry.key_label}:${entry.key_type}:${salt}`;
    return createHash('sha256').update(material).digest('hex').slice(0, 16);
  }
  return randomBytes(8).toString('hex');
}

const normalized = [];
let generatedCount = 0;

for (const raw of keys) {
  const entry = { ...raw };

  if (!entry.dealer_id || !entry.key_label || !entry.key_type) {
    console.error('Missing required fields: dealer_id, key_label, key_type');
    process.exit(1);
  }

  if (!entry.key_hash || !isValidHex16(entry.key_hash)) {
    if (!allowGenerate) {
      console.error(`Missing or invalid key_hash for dealer ${entry.dealer_id} (${entry.key_label}).`);
      console.error('Use --allow-generate to create one.');
      process.exit(1);
    }
    entry.key_hash = generateKeyHash(entry);
    generatedCount += 1;
  }

  entry.active = entry.active !== false;
  entry.expires_at = normalizeTimestamp(entry.expires_at);
  normalized.push(entry);
}

if (writeBack && generatedCount > 0) {
  const out = Array.isArray(payload) ? normalized : { ...payload, keys: normalized };
  writeFileSync(filePath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${generatedCount} generated key_hash values to ${relativePath(filePath)}`);
}

if (dryRun) {
  console.log('Dry run enabled. No data will be written.');
  console.log(`  Keys: ${normalized.length}`);
  if (generatedCount > 0) {
    console.log(`  Generated key_hash: ${generatedCount}`);
  }
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

for (const entry of normalized) {
  const ref = db.collection('dealerAttributionKeys').doc(entry.key_hash);
  batch.set(ref, {
    key_hash: entry.key_hash,
    key_label: entry.key_label,
    dealer_id: entry.dealer_id,
    dealer_name: entry.dealer_name || null,
    key_type: entry.key_type,
    active: entry.active,
    expires_at: entry.expires_at || null,
    notes: entry.notes || null,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge });
  ops += 1;
  if (ops >= MAX_OPS) await commitBatch();
}

await commitBatch();

console.log('Seeding complete.');
console.log(`  Keys: ${normalized.length}`);
console.log(`  Source: ${relativePath(filePath)}`);
