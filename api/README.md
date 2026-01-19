# 🔌 api/ - External Integrations

Hestia API client for lead management.

## 📁 Files

| File | Purpose |
|------|---------|
| `hestia-client.js` | Client factory (mock or live) |
| `mock-hestia.js` | In-memory mock implementation |

---

## 🏭 hestia-client.js

Factory function to create API client.

```javascript
import { createHestiaClient } from './hestia-client.js';

// Create client based on environment
const client = createHestiaClient({
  mode: 'mock',     // or 'live'
  verbose: true
});
```

**Modes:**
| Mode | Usage |
|------|-------|
| `mock` | Development/testing, stores in memory |
| `live` | Production, calls real Hestia API |

---

## 🧪 mock-hestia.js

In-memory implementation of Hestia V2 API.

```javascript
import { MockHestiaClient } from './mock-hestia.js';

const client = new MockHestiaClient({ verbose: true });
```

### Lead Operations

```javascript
// Create lead
const result = await client.createLead(state);
// { lead_id: 'lead_abc123', status: 'new', created: true }

// Update lead (progressive enrichment)
await client.updateLead(leadId, state);

// Set status
await client.setStatus(leadId, 'prequalified');

// Route to dealer
const routing = await client.routeLead(leadId);
// { assigned_dealer_id: 'dlr_12345', assignment_type: 'geo_routed' }

// Deliver to dealer
await client.deliverLead(leadId);
```

### Event Logging

```javascript
await client.logEvent(leadId, {
  event_type: 'voice_call_started',
  actor_type: 'system',
  payload_json: { call_sid: 'CA123' }
});

const events = await client.getEvents(leadId);
```

**Voice Event Types:**
| Event | Description |
|-------|-------------|
| `voice_call_started` | Call connected |
| `partial_lead_created` | Lead created with minimum fields (contact info only) |
| `voice_intake_completed` | All required fields collected, prequalified |
| `voice_call_ended` | Call ended |
| `voice_transfer_requested` | Caller requested transfer |

> 💡 **partial_lead_created** distinguishes leads created mid-call from completed intakes. Useful for analytics on drop-off rates.

### Dealer Attribution

```javascript
// Lookup tracking number
const dealer = await client.lookupDealerByTrackingNumber('+18005551234');
// { dealer_id: 'dlr_12345', dealer_name: 'ABC Homes' }
```

### Debug Utilities

```javascript
// View all leads (mock mode only)
client.getAllLeads();

// Get statistics
client.getStats();
// { total_leads: 25, leads_by_status: { new: 5, prequalified: 20 } }

// Reset data
client.clearAll();
```

---

## 🔄 API Methods

| Method | Hestia Endpoint | Description |
|--------|-----------------|-------------|
| `createLead(state)` | `POST /v2/leads:intake` | Create with idempotency |
| `updateLead(id, state)` | `PATCH /v2/leads/{id}` | Progressive enrichment |
| `getLead(id)` | `GET /v2/leads/{id}` | Retrieve lead |
| `setStatus(id, status)` | `POST /v2/leads/{id}/status` | Update status |
| `routeLead(id)` | `POST /v2/leads/{id}/route` | Assign dealer |
| `deliverLead(id)` | `POST /v2/leads/{id}/deliver` | Send to dealer |
| `logEvent(id, event)` | `POST /v2/leads/{id}/events` | Append event |
| `getEvents(id)` | `GET /v2/leads/{id}/events` | List events |

---

## 🧪 Test Data

Mock includes pre-configured test data:

**Dealers:**
| ID | Name | Tracking Number |
|----|------|-----------------|
| `dlr_12345` | ABC Homes of Missouri | `+18005551234` |
| `dlr_67890` | Texas Mobile Homes | `+18005555678` |
