#!/usr/bin/env node
/**
 * Generate a dealer missing-data report for loan officers.
 *
 * Usage:
 *   node scripts/normalize/generate-missing-dealers-report.js
 *   node scripts/normalize/generate-missing-dealers-report.js --input scripts/data/dealers_normalized_v1.json --report scripts/data/dealers_normalized_v1_report.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { PATHS, relativePath } from '../lib/paths.js';

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
  node scripts/normalize/generate-missing-dealers-report.js [options]

Options:
  --input <path>    Normalized dealers JSON (default: ${relativePath(PATHS.normalizedDealersJson)})
  --report <path>   Normalized report JSON (default: ${relativePath(PATHS.normalizedDealersReport)})
  --out-md <path>   Markdown output (default: ${relativePath(PATHS.missingReportMd)})
  --out-csv <path>  CSV output (default: ${relativePath(PATHS.missingReportCsv)})
  --use-report      Use the normalized report JSON instead of recomputing
  --recalc          Alias for recomputing (default behavior)
  --help            Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const inputFile = getArg('input') || PATHS.normalizedDealersJson;
const reportFile = getArg('report') || PATHS.normalizedDealersReport;
const outputMd = getArg('out-md') || PATHS.missingReportMd;
const outputCsv = getArg('out-csv') || PATHS.missingReportCsv;

const normalized = JSON.parse(readFileSync(inputFile, 'utf8'));
const recalc = hasFlag('recalc');
const useReport = hasFlag('use-report') && !recalc;
const report = useReport ? JSON.parse(readFileSync(reportFile, 'utf8')) : null;

const dealerById = new Map();
const locationById = new Map();
const contactNamesById = new Map();
const contactCountById = new Map();

(normalized.dealers || []).forEach(dealer => {
  dealerById.set(dealer.dealer_id, dealer);
});

(normalized.locations || []).forEach(location => {
  locationById.set(location.dealer_id, location);
});

(normalized.contacts || []).forEach(contact => {
  const list = contactNamesById.get(contact.dealer_id) || [];
  list.push(contact.full_name);
  contactNamesById.set(contact.dealer_id, list);
  contactCountById.set(contact.dealer_id, (contactCountById.get(contact.dealer_id) || 0) + 1);
});

function computeMissingByDealer() {
  const missingEntries = [];
  const contactCounts = new Map();
  (normalized.contacts || []).forEach(contact => {
    contactCounts.set(contact.dealer_id, (contactCounts.get(contact.dealer_id) || 0) + 1);
  });

  (normalized.locations || []).forEach(location => {
    const missing = [];
    if (!location.address1) missing.push('address1');
    if (!location.city) missing.push('city');
    if (!location.state) missing.push('state');
    if (!location.zip5) missing.push('zip5');
    if (!location.phone_e164) missing.push('phone_e164');
    if (!location.email) missing.push('email');
    if ((contactCounts.get(location.dealer_id) || 0) === 0) missing.push('contacts');
    if (missing.length > 0) {
      missingEntries.push({
        dealer_id: location.dealer_id,
        missing,
      });
    }
  });

  return missingEntries;
}

const missingEntries = report ? (report.missing_by_dealer || []) : computeMissingByDealer();
const missingCounts = {};

missingEntries.forEach(entry => {
  entry.missing.forEach(field => {
    missingCounts[field] = (missingCounts[field] || 0) + 1;
  });
});

const rows = missingEntries.map(entry => {
  const dealer = dealerById.get(entry.dealer_id) || {};
  const location = locationById.get(entry.dealer_id) || {};
  const contactNames = (contactNamesById.get(entry.dealer_id) || []).join('; ');
  const contactsCount = contactCountById.get(entry.dealer_id) || 0;

  return {
    dealer_id: entry.dealer_id,
    dealer_name: dealer.dealer_name || '',
    address1: location.address1 || '',
    city: location.city || '',
    state: location.state || '',
    zip5: location.zip5 || '',
    phone_e164: location.phone_e164 || '',
    email: location.email || '',
    contact_names: contactNames,
    contacts_count: String(contactsCount),
    missing_fields: entry.missing.join(', '),
  };
});

rows.sort((a, b) =>
  (a.state || '').localeCompare(b.state || '') ||
  (a.city || '').localeCompare(b.city || '') ||
  (a.dealer_name || '').localeCompare(b.dealer_name || ''),
);

const fieldOrder = [
  'dealer_id',
  'dealer_name',
  'address1',
  'city',
  'state',
  'zip5',
  'phone_e164',
  'email',
  'contact_names',
  'contacts_count',
  'missing_fields',
];

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const csvLines = [fieldOrder.join(',')];
rows.forEach(row => {
  csvLines.push(fieldOrder.map(field => csvEscape(row[field])).join(','));
});

writeFileSync(outputCsv, `${csvLines.join('\n')}\n`);

const mdLines = [];
mdLines.push('# Dealer Missing Data Report');
mdLines.push('');
mdLines.push(`Generated: ${new Date().toISOString()}`);
mdLines.push('');
mdLines.push(`Total dealers missing data: ${rows.length}`);
mdLines.push('');
mdLines.push('Missing field counts:');
Object.keys(missingCounts)
  .sort()
  .forEach(field => {
    mdLines.push(`- ${field}: ${missingCounts[field]}`);
  });

mdLines.push('');
mdLines.push('| Dealer ID | Dealer Name | Address | City | State | Zip | Phone | Email | Contact Names | Missing Fields |');
mdLines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

rows.forEach(row => {
  mdLines.push(`| ${row.dealer_id} | ${row.dealer_name} | ${row.address1} | ${row.city} | ${row.state} | ${row.zip5} | ${row.phone_e164} | ${row.email} | ${row.contact_names} | ${row.missing_fields} |`);
});

writeFileSync(outputMd, `${mdLines.join('\n')}\n`);

console.log('Missing data report generated.');
console.log(`  Markdown: ${relativePath(outputMd)}`);
console.log(`  CSV:      ${relativePath(outputCsv)}`);
