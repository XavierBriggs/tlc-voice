# TLC Lead Cloud Functions

Firestore-triggered Cloud Functions for lead routing, email notifications, and CRM sync.

## Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `onLeadPrequalified` | Lead status → `prequalified` | Routes lead to dealer (attribution or geo) |
| `onLeadRouted` | Lead status → `routed` | Sends email to TLC team + delivers to dealer |
| `syncLeadToSimpleNexus` | Lead status → `routed` | Pushes lead to SimpleNexus CRM |

## Quick Setup

### 1. Install Firebase CLI & Dependencies

```bash
npm install -g firebase-tools
firebase login
cd functions
npm install
```

### 2. Install Trigger Email Extension

1. Go to Firebase Console → Extensions → Browse
2. Search "Trigger Email"
3. Install with SendGrid:
   - SMTP connection URI: `smtps://apikey@smtp.sendgrid.net:465`
   - SMTP password: Your SendGrid API key
   - Email documents collection: `mail`
   - Default FROM address: `TLC Leads <leads@yourdomain.com>`

### 3. Configure Email Notifications

```bash
firebase functions:config:set lead.notification_emails="sales@tlc.com,manager@tlc.com"
```

Or use the Firebase Console → Functions → Configuration.

### 4. Configure SimpleNexus (Optional)

Get your SimpleNexus API credentials:
1. Log into SimpleNexus admin
2. Go to Company Settings → Technical → API Management
3. Click "New Token" and copy it

```bash
# Enable SimpleNexus sync
firebase functions:config:set simplenexus.enabled="true"

# Set API token (secret)
firebase functions:secrets:set SIMPLENEXUS_API_TOKEN

# Set company ID
firebase functions:config:set simplenexus.company_id="your-company-id"

# Set default loan officer ID for new leads
firebase functions:config:set simplenexus.default_lo_id="your-lo-id"
```

### 5. Create Firestore Index

The geo-routing query requires a composite index:

| Collection | Fields |
|------------|--------|
| `dealers` | `status` (Asc), `coverage_zips` (Array contains), `priority_weight` (Desc) |

Firebase will prompt you with a link when the query first runs.

### 6. Deploy

```bash
firebase deploy --only functions
```

## Lead Flow

```
Voice Call Ends
     │
     ▼ setStatus('prequalified')
┌─────────────────────────────────────────────────────────┐
│  onLeadPrequalified                                     │
│  - Check dealer attribution                             │
│  - Or geo-route by ZIP                                  │
│  - Update status → 'routed'                             │
└─────────────────────────────────────────────────────────┘
     │
     ▼ status changed to 'routed'
┌─────────────────────────────────────────────────────────┐
│  onLeadRouted                                           │
│  - Send email to TLC team (via Trigger Email extension) │
│  - Send email to assigned dealer                        │
└─────────────────────────────────────────────────────────┘
     │
     ▼ (if enabled)
┌─────────────────────────────────────────────────────────┐
│  syncLeadToSimpleNexus                                  │
│  - Create loan application in SimpleNexus               │
│  - Store simpleNexusLoanId on lead                      │
└─────────────────────────────────────────────────────────┘
```

## Monitoring

```bash
# View logs
firebase functions:log

# Or in Firebase Console → Functions → Logs
```

## Troubleshooting

### "No dealers cover ZIP XXXXX"
- Add dealers to `dealers` collection with matching `coverage_zips`
- Ensure dealer `status` is `active`

### Email not sending
- Check Trigger Email extension is installed
- Verify SendGrid API key
- Check `mail` collection for queued emails

### SimpleNexus not syncing
- Verify `SIMPLENEXUS_ENABLED` is `true`
- Check API token is set correctly
- Review function logs for errors
