#!/usr/bin/env node
/**
 * Generate dealer attribution keys JSON from normalized dealers.
 *
 * Usage:
 *   node scripts/generate-dealer-attribution-keys.js
 *   node scripts/generate-dealer-attribution-keys.js --output scripts/data/dealer_attribution_keys_v1.json
 *   node scripts/generate-dealer-attribution-keys.js --key-type qr_code --key-label store_display
 */

import { readFileSync, writeFileSync } from 'fs';
import { PATHS, relativePath } from './lib/paths.js';

const args = process.argv.slice(2);

function getArg(name, defaultValue = null) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return defaultValue;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function showHelp() {
  console.log(`Usage:
  node scripts/generate-dealer-attribution-keys.js [options]

Options:
  --input <path>      Dealers JSON file (default: ${relativePath(PATHS.normalizedDealersJson)})
  --output <path>     Output keys JSON file (default: ${relativePath(PATHS.dealerAttributionKeysJson)})
  --key-type <type>   Key type (default: referral_code)
  --key-label <label> Key label (default: web_default)
  --active-only       Only generate keys for active dealers
  --help              Show this help message

Examples:
  node scripts/generate-dealer-attribution-keys.js
  node scripts/generate-dealer-attribution-keys.js --active-only
  node scripts/generate-dealer-attribution-keys.js --key-type qr_code --key-label store_display
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

// Configuration
const inputPath = getArg('input') || PATHS.normalizedDealersJson;
const outputPath = getArg('output') || PATHS.dealerAttributionKeysJson;
const keyType = getArg('key-type') || 'referral_code';
const keyLabel = getArg('key-label') || 'web_default';
const activeOnly = hasFlag('active-only');

// Read dealers
const dealersData = JSON.parse(readFileSync(inputPath, 'utf8'));
const dealers = dealersData.dealers || [];

if (dealers.length === 0) {
  console.error('No dealers found in input file.');
  process.exit(1);
}

// Filter active dealers if requested
const filtered = activeOnly
  ? dealers.filter((d) => d.status === 'active')
  : dealers;

console.log(`Processing ${filtered.length} dealers...`);

// Generate keys array
const keys = filtered.map((dealer) => ({
  key_label: keyLabel,
  dealer_id: dealer.dealer_id,
  dealer_name: dealer.dealer_name,
  key_type: keyType,
  active: dealer.status === 'active',
  expires_at: null,
  notes: `Auto-generated ${keyLabel} for ${dealer.dealer_name}`,
}));

// Output
const output = {
  meta: {
    generated_at: new Date().toISOString(),
    source_file: relativePath(inputPath),
    key_type: keyType,
    key_label: keyLabel,
    total_keys: keys.length,
  },
  keys,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\nGenerated ${keys.length} attribution key entries.`);
console.log(`  Output: ${relativePath(outputPath)}`);
console.log(`  Key type: ${keyType}`);
console.log(`  Key label: ${keyLabel}`);
console.log(`\nNext step: Run the seed command to generate key_hash values and seed to Firestore:`);
console.log(
  `  node scripts/cli.js dealer-keys-seed --file ${relativePath(outputPath)} --allow-generate --write-back --merge`
);
