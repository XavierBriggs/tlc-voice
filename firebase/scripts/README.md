# Scripts Guide

This folder contains the data normalization, coverage generation, and seeding tools.
The pipeline is designed so data moves from CSV -> normalized JSON -> zip coverage -> Firestore.

## Data flow overview

1) `Dealers_Normalized_v1_data.csv` (raw source)
2) `dealers_normalized_v1.json` (cleaned + structured)
3) `zip_coverage_radius_60mi.json` (expanded coverage candidates)
4) Firestore collections:
   - `dealers/{dealerId}`
   - `dealers/{dealerId}/locations/{locationId}`
   - `dealers/{dealerId}/contacts/{contactId}`
   - `zipCoverage/{STATE_ZIP}`

Each step is deterministic so you can regenerate and re-seed safely.

## Quick start

```bash
node scripts/cli.js --help
```

## Common workflows

Normalize dealers CSV (source of truth for dealer/location/contact data):
```bash
node scripts/cli.js normalize
```

Generate missing data report (recomputed by default):
```bash
node scripts/cli.js missing-report
```

Generate 60-mile zip coverage (radius, cross-state):
```bash
node scripts/cli.js coverage-generate --radius 60
```

Seed dealers/locations/contacts:
```bash
node scripts/cli.js dealers-seed --merge
```

Seed zip coverage:
```bash
node scripts/cli.js coverage-seed --merge
```

## What each tool does

- `scripts/normalize/normalize-dealers-csv.js`
  - Reads `scripts/data/Dealers_Normalized_v1_data.csv`
  - Writes `scripts/data/dealers_normalized_v1.json` and `scripts/data/dealers_normalized_v1_report.json`
  - Splits multi-contact/phone/email fields and normalizes phones
  - Treats each location as its own `dealer_id` so routing is location-level
  - Maps `top_50` -> `top50` tier Tips:
    - Update CSV rows for missing ZIPs before generating coverage

- `scripts/normalize/generate-missing-dealers-report.js`
  - Reads `scripts/data/dealers_normalized_v1.json`
  - Writes `scripts/data/dealers_missing_data_report.md` and `.csv`
  - Recomputes missing fields unless `--use-report` is passed
  - Use this to send a list of missing ZIPs/phones/emails to the loan officer

- `scripts/coverage/generate-zip-coverage.js`
  - Reads normalized dealers + ZIP reference data (`scripts/data/reference/us_zipcodes.json`)
  - Generates `scripts/data/coverage/zip_coverage_radius_60mi.json`
  - Adds `distance_miles` for tie-break routing
  - Includes all ZIPs within radius; optional `--same-state` to restrict by state

- `scripts/coverage/seed-zip-coverage-generated.js`
  - Writes coverage into Firestore `zipCoverage`
  - Use `--merge` to update existing docs without overwriting other fields

- `scripts/seed-dealers-normalized.js`
  - Writes dealers, locations, and contacts into Firestore
  - Use `--merge` to update missing fields safely

## Routing behavior (important)

Routing order (per docs and `functions/lib/routing.js`):
1) Dealer lock (dealer phone or referral link)
2) Zip coverage lookup
3) Fallback to `home_nation`

Zip coverage selection:
- priority (lowest `priority_weight` wins)
- if priorities tie, lower `distance_miles` wins

This means proximity is used as a tie-breaker, not the primary driver.

## Adding a dealer (recommended flow)

1) Add the dealer/location to `scripts/data/Dealers_Normalized_v1_data.csv`
2) Normalize and review missing data:
   - `node scripts/cli.js normalize`
   - `node scripts/cli.js missing-report`
3) Fill any missing ZIP/phone/email as needed
4) Regenerate coverage after any ZIP changes:
   - `node scripts/cli.js coverage-generate --radius 60`
5) Seed updates:
   - `node scripts/cli.js dealers-seed --merge`
   - `node scripts/cli.js coverage-seed --merge`

## Updating existing dealers

- Update the CSV row(s), re-run `normalize` and `missing-report`.
- If ZIP changes: re-run `coverage-generate`.
- Seed with `--merge` to avoid overwriting unrelated fields.

## Reports

- Missing data report:
  - `scripts/data/dealers_missing_data_report.md`
  - `scripts/data/dealers_missing_data_report.csv`
- Coverage report:
  - `scripts/data/coverage/zip_coverage_radius_60mi_report.json`

## Reference data

- `scripts/data/reference/us_zipcodes.json`
  - ZIP -> lat/lon lookup used for radius-based coverage
  - Generated from GeoNames via `scripts/convert-geonames-to-json.js`

## npm shortcuts

```bash
npm --prefix scripts run normalize
npm --prefix scripts run missing-report
npm --prefix scripts run coverage-generate
npm --prefix scripts run dealers-seed
npm --prefix scripts run coverage-seed
```
