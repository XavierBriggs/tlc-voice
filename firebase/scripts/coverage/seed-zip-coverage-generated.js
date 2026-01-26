#!/usr/bin/env node
/**
 * Seed zipCoverage from a generated JSON coverage file.
 *
 * Usage:
 *   node scripts/coverage/seed-zip-coverage-generated.js --file scripts/data/coverage/zip_coverage_radius_60mi.json
 *   node scripts/coverage/seed-zip-coverage-generated.js --file scripts/data/coverage/zip_coverage_radius_60mi.json --dry-run
 *   node scripts/coverage/seed-zip-coverage-generated.js --file scripts/data/coverage/zip_coverage_radius_60mi.json --merge
 */

import { readFileSync, existsSync } from 'fs';
import { getDb, FieldValue } from '../lib/db.js';
import { coverageFile, relativePath } from '../lib/paths.js';

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
  node scripts/coverage/seed-zip-coverage-generated.js [options]

Options:
  --file <path>     Coverage JSON file (default: ${relativePath(coverageFile(60))})
  --radius <miles>  Use default file for radius (default: 60)
  --dry-run         Print counts only
  --merge           Merge into existing docs
  --help            Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const radiusMiles = parseFloat(getArg('radius') || '60');
const filePath = getArg('file') || coverageFile(radiusMiles);
const dryRun = hasFlag('dry-run');
const merge = hasFlag('merge');

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(filePath, 'utf8'));
const coverage = payload.coverage || [];

if (dryRun) {
  console.log('Dry run enabled. No data will be written.');
  console.log(`  Zip docs: ${coverage.length}`);
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

for (const entry of coverage) {
  const id = `${entry.state}_${entry.zip5}`;
  const ref = db.collection('zipCoverage').doc(id);
  batch.set(ref, {
    state: entry.state,
    zip5: entry.zip5,
    candidates: entry.candidates || [],
    updated_at: FieldValue.serverTimestamp(),
  }, { merge });
  ops += 1;
  if (ops >= MAX_OPS) await commitBatch();
}

await commitBatch();

console.log('Zip coverage seeding complete.');
console.log(`  Zip docs: ${coverage.length}`);
console.log(`  Source: ${relativePath(filePath)}`);
