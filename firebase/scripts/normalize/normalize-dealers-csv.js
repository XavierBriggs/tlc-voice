#!/usr/bin/env node
/**
 * Normalize dealer CSV into JSON suitable for seeding Firestore.
 *
 * Output structure:
 * {
 *   meta: {...},
 *   dealers: [...],
 *   locations: [...],
 *   contacts: [...]
 * }
 */

import { readFileSync, writeFileSync } from 'fs';
import { normalizePhone, isValidEmail } from '../lib/validators.js';
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
  node scripts/normalize/normalize-dealers-csv.js [options]

Options:
  --input <path>   CSV input file (default: ${relativePath(PATHS.dealersCsv)})
  --output <path>  Output JSON file (default: ${relativePath(PATHS.normalizedDealersJson)})
  --report <path>  Output report JSON (default: ${relativePath(PATHS.normalizedDealersReport)})
  --help           Show this help message
`);
}

if (hasFlag('help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

const inputFile = getArg('input') || PATHS.dealersCsv;
const outputFile = getArg('output') || PATHS.normalizedDealersJson;
const reportFile = getArg('report') || PATHS.normalizedDealersReport;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      continue;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function cleanValue(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === 'MISSING') return null;
  return trimmed;
}

function slugify(value) {
  if (!value) return 'unknown';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function splitContacts(raw) {
  if (!raw) return [];
  const chunks = raw.split(/;|\s*\/\s*|&/i).map(part => part.trim()).filter(Boolean);
  const results = [];

  chunks.forEach(chunk => {
    if (!/\sand\s/i.test(chunk)) {
      results.push(chunk);
      return;
    }

    const parts = chunk.split(/\s+and\s+/i).map(part => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      const leftTokens = parts[0].split(/\s+/).filter(Boolean);
      const rightTokens = parts[1].split(/\s+/).filter(Boolean);

      if (leftTokens.length === 1 && rightTokens.length >= 2) {
        const lastName = rightTokens[rightTokens.length - 1];
        results.push(`${leftTokens[0]} ${lastName}`);
        results.push(parts[1]);
        return;
      }
    }

    parts.forEach(part => results.push(part));
  });

  return results.filter(Boolean);
}

function splitPhones(raw) {
  if (!raw) return [];
  const parts = raw.split(/[|;]/);
  return parts.map(p => p.trim()).filter(Boolean);
}

function splitEmails(raw) {
  if (!raw) return [];
  const parts = raw.split(/[;,]/);
  return parts.map(p => p.trim().toLowerCase()).filter(Boolean);
}

function parseAddressParts(address) {
  if (!address) return null;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const last = parts[parts.length - 1];
  const match = last.match(/^([A-Za-z]{2})\s*(\d{5})?$/);
  if (!match) return null;

  return {
    address1: parts.slice(0, parts.length - 2).join(', '),
    city: parts[parts.length - 2],
    state: match[1].toUpperCase(),
    zip: match[2] || null,
  };
}

const raw = readFileSync(inputFile, 'utf8');
const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
const rows = parseCsv(text);

if (rows.length === 0) {
  console.error('CSV is empty.');
  process.exit(1);
}

const header = rows.shift();

const report = {
  source_file: inputFile,
  header_columns: header.length,
  rows_total: rows.length,
  rows_used: 0,
  dealers_count: 0,
  locations_count: 0,
  contacts_count: 0,
  missing_fields: {
    company: 0,
    contact: 0,
    phone: 0,
    address: 0,
    city: 0,
    state: 0,
    zip: 0,
    email: 0,
    tier: 0,
  },
  missing_rows: [],
  missing_by_dealer: [],
  invalid_emails: [],
  invalid_phones: [],
  rows_with_extra_columns: [],
  rows_with_filled_city: [],
  duplicates_merged: [],
  tier_overrides: [],
  home_nation: null,
};

const dealerMap = new Map();
const dealerIds = new Map();

function ensureDealerId(baseId) {
  if (!dealerIds.has(baseId)) {
    dealerIds.set(baseId, 1);
    return baseId;
  }
  const count = dealerIds.get(baseId) + 1;
  dealerIds.set(baseId, count);
  return `${baseId}_${count}`;
}

for (let i = 0; i < rows.length; i++) {
  const rowIndex = i + 2;
  const row = rows[i];
  const trimmed = row.slice(0, 9);
  while (trimmed.length < 9) trimmed.push('');

  if (row.slice(9).some(value => String(value || '').trim())) {
    report.rows_with_extra_columns.push({
      row: rowIndex,
      values: row.slice(9).filter(v => String(v || '').trim()),
    });
  }

  if (!trimmed.some(value => String(value || '').trim())) {
    continue;
  }

  report.rows_used += 1;

  let company = cleanValue(trimmed[0]);
  let contactRaw = cleanValue(trimmed[1]);
  let phoneRaw = cleanValue(trimmed[2]);
  let address = cleanValue(trimmed[3]);
  let city = cleanValue(trimmed[4]);
  let state = cleanValue(trimmed[5]);
  let zip = cleanValue(trimmed[6]);
  let emailRaw = cleanValue(trimmed[7]);
  let tierRaw = cleanValue(trimmed[8]);

  if (!company) report.missing_fields.company += 1;
  if (!contactRaw) report.missing_fields.contact += 1;
  if (!phoneRaw) report.missing_fields.phone += 1;
  if (!address) report.missing_fields.address += 1;
  if (!city) report.missing_fields.city += 1;
  if (!state) report.missing_fields.state += 1;
  if (!zip) report.missing_fields.zip += 1;
  if (!emailRaw) report.missing_fields.email += 1;
  if (!tierRaw) report.missing_fields.tier += 1;

  const missingFields = [];
  if (!company) missingFields.push('company');
  if (!contactRaw) missingFields.push('contact');
  if (!phoneRaw) missingFields.push('phone');
  if (!address) missingFields.push('address');
  if (!city) missingFields.push('city');
  if (!state) missingFields.push('state');
  if (!zip) missingFields.push('zip');
  if (!emailRaw) missingFields.push('email');
  if (!tierRaw) missingFields.push('tier');

  if (missingFields.length > 0) {
    report.missing_rows.push({
      row: rowIndex,
      company,
      city,
      state,
      zip,
      missing: missingFields,
    });
  }

  const addressParts = parseAddressParts(address);
  if (addressParts) {
    if (!city && addressParts.city) {
      city = addressParts.city;
      report.rows_with_filled_city.push(rowIndex);
    }
    if (!state && addressParts.state) state = addressParts.state;
    if (!zip && addressParts.zip) zip = addressParts.zip;
    if (addressParts.address1) address = addressParts.address1;
  }

  const tier = tierRaw && tierRaw.toLowerCase() === 'top_50' ? 'top50' : (tierRaw || 'standard');

  const contacts = splitContacts(contactRaw);
  const phones = splitPhones(phoneRaw)
    .map(p => normalizePhone(p))
    .filter(Boolean);

  const emails = splitEmails(emailRaw)
    .filter(email => {
      if (!isValidEmail(email)) {
        report.invalid_emails.push({ row: rowIndex, value: email });
        return false;
      }
      return true;
    });

  if (phoneRaw) {
    splitPhones(phoneRaw).forEach(part => {
      const normalized = normalizePhone(part);
      if (!normalized) {
        report.invalid_phones.push({ row: rowIndex, value: part });
      }
    });
  }

  const isHomeNation = company && company.toLowerCase() === 'home nation';
  const baseId = isHomeNation
    ? 'home_nation'
    : `dlr_${slugify([company, city, state, zip || address].filter(Boolean).join(' ')).slice(0, 60)}`;

  if (isHomeNation) {
    report.home_nation = report.home_nation || { row: rowIndex };
  }

  const locationKey = [
    company || 'unknown',
    address || 'unknown',
    city || 'unknown',
    state || 'unknown',
    zip || 'unknown',
  ].join('|');

  if (!dealerMap.has(locationKey)) {
    const dealerId = ensureDealerId(baseId);
    dealerMap.set(locationKey, {
      dealer_id: dealerId,
      dealer_name: company || 'Unknown Dealer',
      tier,
      status: 'active',
      notes: isHomeNation ? 'Default fallback dealer for all leads' : null,
      website_url: null,
      delivery_emails: new Set(emails),
      phones: new Set(phones),
      address,
      city,
      state,
      zip,
      contacts: new Map(),
      contact_order: 0,
      rows: [rowIndex],
      priority_weight: isHomeNation ? 1000 : 100,
      exclusive_zips_allowed: !isHomeNation,
    });
  } else {
    const existing = dealerMap.get(locationKey);
    existing.rows.push(rowIndex);
    if (existing.tier !== 'top50' && tier === 'top50') {
      report.tier_overrides.push({
        dealer_id: existing.dealer_id,
        from: existing.tier,
        to: 'top50',
        row: rowIndex,
      });
      existing.tier = 'top50';
    }
    emails.forEach(email => existing.delivery_emails.add(email));
    phones.forEach(phone => existing.phones.add(phone));
  }

  const entry = dealerMap.get(locationKey);

  if (contacts.length > 0) {
    contacts.forEach((name, idx) => {
      const key = name.toLowerCase();
      const contact = entry.contacts.get(key) || {
        full_name: name,
        phone_e164: null,
        email: null,
        order: entry.contact_order,
      };
      const email = emails[idx] || (emails.length === 1 ? emails[0] : null);
      const phone = phones[idx] || (phones.length === 1 ? phones[0] : null);
      contact.email = contact.email || email || null;
      contact.phone_e164 = contact.phone_e164 || phone || null;
      if (!entry.contacts.has(key)) {
        entry.contact_order += 1;
      }
      entry.contacts.set(key, contact);
    });
  }
}

const dealers = [];
const locations = [];
const contacts = [];

for (const entry of dealerMap.values()) {
  dealers.push({
    dealer_id: entry.dealer_id,
    dealer_name: entry.dealer_name,
    status: entry.status,
    tier: entry.tier,
    website_url: entry.website_url,
    notes: entry.notes,
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: Array.from(entry.delivery_emails),
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: entry.priority_weight,
      exclusive_zips_allowed: entry.exclusive_zips_allowed,
    },
  });

  locations.push({
    dealer_id: entry.dealer_id,
    location_id: 'loc_main',
    label: 'main',
    address1: entry.address || null,
    address2: null,
    city: entry.city || null,
    state: entry.state || null,
    zip5: entry.zip || null,
    phone_e164: entry.phones.values().next().value || null,
    email: entry.delivery_emails.values().next().value || null,
    is_primary: true,
  });

  const contactEntries = Array.from(entry.contacts.values()).sort((a, b) =>
    a.order - b.order,
  );
  const idCounts = new Map();

  contactEntries.forEach((contact, idx) => {
    const idBase = `ctc_${slugify(contact.full_name).slice(0, 40)}`;
    const count = (idCounts.get(idBase) || 0) + 1;
    idCounts.set(idBase, count);
    const contactId = count === 1 ? idBase : `${idBase}_${count}`;
    contacts.push({
      dealer_id: entry.dealer_id,
      contact_id: contactId,
      full_name: contact.full_name,
      role: 'sales',
      phone_e164: contact.phone_e164 || null,
      email: contact.email || null,
      is_primary: idx === 0,
    });
  });
}

for (const entry of dealerMap.values()) {
  if (entry.rows.length > 1) {
    report.duplicates_merged.push({
      dealer_id: entry.dealer_id,
      rows: entry.rows,
    });
  }
}

report.dealers_count = dealers.length;
report.locations_count = locations.length;
report.contacts_count = contacts.length;

const contactCounts = new Map();
contacts.forEach(contact => {
  contactCounts.set(contact.dealer_id, (contactCounts.get(contact.dealer_id) || 0) + 1);
});

locations.forEach(location => {
  const missing = [];
  if (!location.address1) missing.push('address1');
  if (!location.city) missing.push('city');
  if (!location.state) missing.push('state');
  if (!location.zip5) missing.push('zip5');
  if (!location.phone_e164) missing.push('phone_e164');
  if (!location.email) missing.push('email');
  if ((contactCounts.get(location.dealer_id) || 0) === 0) missing.push('contacts');
  if (missing.length > 0) {
    report.missing_by_dealer.push({
      dealer_id: location.dealer_id,
      missing,
    });
  }
});

const output = {
  meta: {
    generated_at: new Date().toISOString(),
    source_file: inputFile,
    rows_used: report.rows_used,
  },
  dealers,
  locations,
  contacts,
};

writeFileSync(outputFile, JSON.stringify(output, null, 2));
writeFileSync(reportFile, JSON.stringify(report, null, 2));

console.log('Normalization complete.');
console.log(`  Dealers:   ${dealers.length}`);
console.log(`  Locations: ${locations.length}`);
console.log(`  Contacts:  ${contacts.length}`);
console.log(`  Output:    ${relativePath(outputFile)}`);
console.log(`  Report:    ${relativePath(reportFile)}`);
