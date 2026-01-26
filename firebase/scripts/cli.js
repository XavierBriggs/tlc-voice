#!/usr/bin/env node
/**
 * Unified CLI for dealer/coverage scripts.
 */

import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { PATHS } from './lib/paths.js';

const args = process.argv.slice(2);
const command = args.shift();

const COMMANDS = {
  normalize: 'normalize/normalize-dealers-csv.js',
  'missing-report': 'normalize/generate-missing-dealers-report.js',
  'coverage-generate': 'coverage/generate-zip-coverage.js',
  'coverage-seed': 'coverage/seed-zip-coverage-generated.js',
  'dealers-seed': 'seed-dealers-normalized.js',
};

function showHelp() {
  console.log(`Usage:
  node scripts/cli.js <command> [options]

Commands:
  normalize          Normalize CSV into dealers JSON
  missing-report     Generate missing-data report
  coverage-generate  Generate zipCoverage JSON
  coverage-seed      Seed zipCoverage into Firestore
  dealers-seed       Seed dealers/locations/contacts into Firestore

Examples:
  node scripts/cli.js normalize
  node scripts/cli.js missing-report --recalc
  node scripts/cli.js coverage-generate --radius 60
  node scripts/cli.js coverage-seed --merge
  node scripts/cli.js dealers-seed --merge
`);
}

if (!command || command === 'help' || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

const script = COMMANDS[command];
if (!script) {
  console.error(`Unknown command: ${command}`);
  showHelp();
  process.exit(1);
}

const scriptPath = resolve(PATHS.scriptsDir, script);
const result = spawnSync(process.execPath, [scriptPath, ...args], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
