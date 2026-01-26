#!/usr/bin/env node
/**
 * Convert GeoNames US.txt to a JSON lookup file.
 * 
 * Input: scripts/data/US.txt (tab-separated from GeoNames)
 * Output: scripts/data/reference/us_zipcodes.json
 * 
 * Usage: node convert-geonames-to-json.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { PATHS, relativePath } from './lib/paths.js';
import { resolve } from 'path';

const inputFile = resolve(PATHS.dataDir, 'US.txt');
const outputFile = PATHS.zipcodesReference;

// GeoNames format (tab-separated):
// 0: country_code, 1: postal_code, 2: place_name, 3: admin_name1 (state name),
// 4: admin_code1 (state abbrev), 5: admin_name2 (county), 6: admin_code2,
// 7: admin_name3, 8: admin_code3, 9: latitude, 10: longitude, 11: accuracy

const raw = readFileSync(inputFile, 'utf8');
const lines = raw.trim().split('\n');

const zipcodes = {};

for (const line of lines) {
  const parts = line.split('\t');
  if (parts.length < 11) continue;

  const zip = parts[1].trim();
  const city = parts[2].trim();
  const state = parts[4].trim();
  const lat = parseFloat(parts[9]);
  const lng = parseFloat(parts[10]);

  if (!zip || zip.length !== 5) continue;
  if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

  // Use first entry for each zip (some zips span multiple places)
  if (!zipcodes[zip]) {
    zipcodes[zip] = {
      zip,
      city,
      state,
      lat,
      lng,
    };
  }
}

const count = Object.keys(zipcodes).length;

writeFileSync(outputFile, JSON.stringify(zipcodes, null, 2));

console.log(`Converted ${count} unique ZIP codes to ${relativePath(outputFile)}`);
