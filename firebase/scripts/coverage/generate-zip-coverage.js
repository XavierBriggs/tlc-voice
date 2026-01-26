#!/usr/bin/env node
/**
 * Generate zipCoverage entries from normalized dealers using a radius rule.
 * Uses local US ZIP code database (no network calls).
 *
 * Usage:
 *   node scripts/coverage/generate-zip-coverage.js --radius 60
 *   node scripts/coverage/generate-zip-coverage.js --radius 60 --same-state
 *
 * Input: scripts/data/dealers_normalized_v1.json, scripts/data/reference/us_zipcodes.json
 * Output: scripts/data/coverage/zip_coverage_radius_60mi.json, scripts/data/coverage/zip_coverage_radius_60mi_report.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { PATHS, coverageFile, coverageReport, relativePath } from '../lib/paths.js';

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function showHelp() {
  console.log(`Usage:
  node scripts/coverage/generate-zip-coverage.js [options]

Options:
  --input <path>     Normalized dealers JSON (default: ${relativePath(PATHS.normalizedDealersJson)})
  --zipcodes <path>  ZIP reference JSON (default: ${relativePath(PATHS.zipcodesReference)})
  --radius <miles>   Radius in miles (default: 60)
  --same-state       Restrict coverage to dealer's state
  --output <path>    Output JSON (default: ${relativePath(coverageFile(60))})
  --report <path>    Output report JSON (default: ${relativePath(coverageReport(60))})
  --help             Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const dealersFile = getArg('input') || PATHS.normalizedDealersJson;
const zipcodesFile = getArg('zipcodes') || PATHS.zipcodesReference;
const radiusMiles = parseFloat(getArg('radius') || '60');
const sameStateOnly = hasFlag('same-state');

const outputFile = getArg('output') || coverageFile(radiusMiles);
const reportFile = getArg('report') || coverageReport(radiusMiles);

mkdirSync(dirname(outputFile), { recursive: true });
mkdirSync(dirname(reportFile), { recursive: true });

// Haversine formula to calculate distance between two lat/lng points in miles
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Load data
console.log('Loading data...');
const normalized = JSON.parse(readFileSync(dealersFile, 'utf8'));
const zipcodes = JSON.parse(readFileSync(zipcodesFile, 'utf8'));

const dealerById = new Map((normalized.dealers || []).map(d => [d.dealer_id, d]));
const locationByDealer = new Map((normalized.locations || []).map(l => [l.dealer_id, l]));

// Convert zipcodes object to array for faster iteration
const allZips = Object.values(zipcodes);
console.log(`Loaded ${dealerById.size} dealers and ${allZips.length} ZIP codes`);

const coverageMap = new Map();
const report = {
  generated_at: new Date().toISOString(),
  radius_miles: radiusMiles,
  same_state_only: sameStateOnly,
  dealers_total: dealerById.size,
  dealers_skipped_missing_zip: [],
  dealers_skipped_missing_location: [],
  dealers_skipped_zip_not_found: [],
  dealers_processed: 0,
  zip_docs: 0,
  candidate_entries: 0,
};

console.log(`Processing dealers (${radiusMiles} mile radius, same-state: ${sameStateOnly})...`);

let processed = 0;
for (const [dealerId, dealer] of dealerById.entries()) {
  // Skip Home Nation - it's the fallback dealer, not radius-based
  if (dealerId === 'home_nation') continue;

  const location = locationByDealer.get(dealerId);
  if (!location) {
    report.dealers_skipped_missing_location.push(dealerId);
    continue;
  }

  const dealerZip = location.zip5;
  if (!dealerZip) {
    report.dealers_skipped_missing_zip.push(dealerId);
    continue;
  }

  const centerZip = zipcodes[dealerZip];
  if (!centerZip) {
    report.dealers_skipped_zip_not_found.push({ dealer_id: dealerId, zip: dealerZip });
    continue;
  }

  const dealerState = location.state;
  const priority = dealer.routing_prefs?.priority_weight ?? 100;

  // Find all ZIPs within radius
  for (const targetZip of allZips) {
    // Skip if same-state mode and states don't match
    if (sameStateOnly && dealerState && targetZip.state !== dealerState) {
      continue;
    }

    const distance = haversineDistance(
      centerZip.lat, centerZip.lng,
      targetZip.lat, targetZip.lng
    );

    if (distance <= radiusMiles) {
      const key = `${targetZip.state}_${targetZip.zip}`;
      
      if (!coverageMap.has(key)) {
        coverageMap.set(key, {
          state: targetZip.state,
          zip5: targetZip.zip,
          candidates: [],
        });
      }

      const entry = coverageMap.get(key);
      
      // Add dealer if not already in candidates
      if (!entry.candidates.some(c => c.dealer_id === dealerId)) {
        entry.candidates.push({
          dealer_id: dealerId,
          priority,
          distance_miles: Number(distance.toFixed(2)),
          exclusive: false,
        });
      }
    }
  }

  report.dealers_processed += 1;
  processed++;
  
  if (processed % 10 === 0) {
    process.stdout.write(`\rProcessed ${processed} dealers...`);
  }
}

console.log(`\rProcessed ${processed} dealers.`);

// Sort candidates by priority in each coverage entry
for (const entry of coverageMap.values()) {
  entry.candidates.sort((a, b) => a.priority - b.priority);
}

const coverage = Array.from(coverageMap.values());
report.zip_docs = coverage.length;
report.candidate_entries = coverage.reduce((sum, entry) => sum + entry.candidates.length, 0);

// Write output
writeFileSync(outputFile, JSON.stringify({ coverage }, null, 2));
writeFileSync(reportFile, JSON.stringify(report, null, 2));

console.log('\n=== Zip Coverage Generation Complete ===');
console.log(`  Dealers processed: ${report.dealers_processed}`);
console.log(`  Dealers skipped (no location): ${report.dealers_skipped_missing_location.length}`);
console.log(`  Dealers skipped (no zip): ${report.dealers_skipped_missing_zip.length}`);
console.log(`  Dealers skipped (zip not found): ${report.dealers_skipped_zip_not_found.length}`);
console.log(`  ZIP coverage docs: ${report.zip_docs}`);
console.log(`  Total candidate entries: ${report.candidate_entries}`);
console.log(`\nOutput: ${relativePath(outputFile)}`);
console.log(`Report: ${relativePath(reportFile)}`);
