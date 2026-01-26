# TLC Voice Agent - Firebase

This directory contains Firebase Cloud Functions and Firestore configuration for the TLC Voice Agent lead processing system.

## Architecture

```
leads/{leadId}  ──onWrite──>  routeLeadIfNeeded
                              │
                              ├── Check guards (zip+state exist, not already routed)
                              ├── Route using locked_dealer_id or zipCoverage
                              └── Write assignment.routed_at

leads/{leadId}  ──onWrite──>  deliverLeadIfNeeded
                              │
                              ├── Check guards (prequalified, assigned, not delivered)
                              ├── Email TLC team
                              ├── Email dealer (if enabled)
                              └── Write delivery.delivered_at
```

## Cloud Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `routeLeadIfNeeded` | `leads/{leadId}` onWrite | Routes lead to dealer when zip+state collected |
| `deliverLeadIfNeeded` | `leads/{leadId}` onWrite | Sends email notifications when prequalified |

## Collections

| Collection | Document ID | Description |
|------------|-------------|-------------|
| `leads` | `lead_{id}` | Lead records |
| `dealers` | `{dealer_id}` | Dealer registry with delivery_prefs, routing_prefs |
| `dealerNumbers` | `{phone_e164}` | Phone number to dealer mapping for attribution |
| `zipCoverage` | `{state}_{zip}` | Zip code to dealer candidates for geo routing |
| `leadEvents` | `evt_{id}` | Append-only event log |
| `mail` | Auto-generated | Used by Trigger Email extension |

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment

Set required environment variables in Firebase console or `.env` file:

```
TLC_TEAM_EMAILS=lead1@tlc.com,lead2@tlc.com
```

### 3. Deploy Security Rules

```bash
firebase deploy --only firestore:rules
```

### 4. Deploy Functions

```bash
firebase deploy --only functions
```

### 5. Seed Initial Data

```bash
# Run individual seed scripts for sample data
node scripts/seed-dealers.js
node scripts/seed-dealer-numbers.js
node scripts/seed-zip-coverage.js
```

## Dealer Management CLI

The `dealer-manager.js` script provides a unified interface for managing dealers, phone numbers, and zip coverage.

### Add a Dealer

```bash
node scripts/dealer-manager.js add-dealer \
  --name "Austin Mobile Homes" \
  --email leads@austinmobile.com \
  --tier standard \
  --website https://austinmobile.com
```

### Add a Phone Number

```bash
node scripts/dealer-manager.js add-number \
  --dealer dlr_austin_xxx \
  --phone 5125551234 \
  --label "Website main"
```

### Add Zip Coverage

```bash
# Single zip
node scripts/dealer-manager.js add-coverage \
  --dealer dlr_austin_xxx --state TX --zips 78701

# Zip range
node scripts/dealer-manager.js add-coverage \
  --dealer dlr_austin_xxx --state TX --zips "78701-78750"

# Multiple zips
node scripts/dealer-manager.js add-coverage \
  --dealer dlr_austin_xxx --state TX --zips "78701,78702,78703"
```

### Import from JSON File

```bash
node scripts/dealer-manager.js import --file scripts/data/dealers.json
```

Example import file format (`scripts/data/example-import.json`):

```json
{
  "dealers": [
    { "dealer_name": "Example Homes", "email": "leads@example.com" }
  ],
  "numbers": [
    { "phone": "5125551234", "dealer_id": "dlr_xxx", "label": "Main" }
  ],
  "coverage": [
    { "dealer_id": "dlr_xxx", "state": "TX", "zips": "78701-78750", "priority": 10 }
  ]
}
```

### View Data

```bash
# List all dealers
node scripts/dealer-manager.js list-dealers

# List phone numbers
node scripts/dealer-manager.js list-numbers
node scripts/dealer-manager.js list-numbers --dealer dlr_xxx

# List coverage
node scripts/dealer-manager.js list-coverage --state TX
node scripts/dealer-manager.js list-coverage --dealer dlr_xxx

# Detailed dealer info
node scripts/dealer-manager.js dealer-info --dealer dlr_xxx
```

## Routing Logic

Routing runs when a lead has `property_zip` AND `property_state` and hasn't been routed yet.

**Priority order:**

1. **Dealer lock rule**: If `source.attribution.locked_dealer_id` exists and dealer is active, route to that dealer
2. **Zip coverage rule**: Query `zipCoverage/{state}_{zip}` and select lowest priority active candidate
3. **Fallback rule**: Route to Home Nation (default dealer)

## Delivery Logic

Delivery runs when a lead is `prequalified`, has an assigned dealer, and hasn't been delivered yet.

**Actions:**

1. Always email TLC team (addresses from `TLC_TEAM_EMAILS`)
2. Email dealer only if `dealers/{dealerId}.delivery_prefs.dealer_delivery_enabled` is true

## Idempotency

Both functions use timestamp markers as idempotency guards:

- `assignment.routed_at` - Prevents re-routing
- `delivery.delivered_at` - Prevents re-delivery

This makes the system safe for at-least-once execution.

## Local Development

```bash
# Start emulators
firebase emulators:start

# Run functions shell
npm run shell
```

## Trigger Email Extension

The system uses the Firebase Trigger Email extension to send emails. Documents written to the `mail` collection are automatically processed and sent.

Install the extension from the Firebase console:
https://firebase.google.com/products/extensions/firebase-firestore-send-email
