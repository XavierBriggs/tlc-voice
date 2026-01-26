# TLC Firestore Schemas V1

This document defines the canonical Firestore collections and document structures for the TLC lead intake, routing, delivery, and human handling system.

## Design goals

1. One canonical lead document per applicant request
2. Support voice, web, and future app intake
3. Deterministic dealer attribution and routing
4. Idempotent automation that is safe under at least once execution
5. Clear auditability for partner and internal debugging
6. No SMS support at this time

## Canonical enums

```js
export const ENUMS = {
  lead_status: [
    "new",
    "collecting",
    "prequalified",
    "ineligible",
    "do_not_contact",
    "closed"
  ],

  source_channel: [
    "voice",
    "web",
    "app"
  ],

  entrypoint: [
    "dealer_phone",
    "dealer_link",
    "tlc_phone",
    "tlc_site",
    "unknown"
  ],

  consent_capture_method: [
    "voice_yes",
    "web_checkbox"
  ],

  preferred_contact_method: [
    "phone",
    "email"
  ],

  best_time_to_contact: [
    "morning",
    "afternoon",
    "evening",
    "weekday_morning",
    "weekday_evening",
    "weekend"
  ],

  land_status: [
    "own",
    "buying",
    "family_land",
    "gifted_land",
    "renting_lot",
    "not_sure"
  ],

  land_value_band: [
    "0_25k",
    "25k_50k",
    "50k_100k",
    "100k_200k",
    "200k_plus",
    "not_sure"
  ],

  home_type: [
    "manufactured",
    "mobile_pre_hud",
    "modular",
    "single_wide",
    "double_wide",
    "not_sure"
  ],

  timeline: [
    "0_3_months",
    "3_6_months",
    "6_12_months",
    "12_plus",
    "not_sure"
  ],

  site_work_needed: [
    "foundation",
    "utilities",
    "septic",
    "well",
    "driveway",
    "grading",
    "deck",
    "skirting",
    "not_sure"
  ],

  credit_band_self_reported: [
    "under_580",
    "580_619",
    "620_679",
    "680_719",
    "720_plus",
    "prefer_not_to_say"
  ],

  assignment_type: [
    "dealer_sourced",
    "geo_routed",
    "manual"
  ],

  assignment_reason: [
    "referral_lock",
    "dealer_number",
    "zip_match",
    "fallback",
    "manual_override"
  ],

  delivery_status: [
    "pending",
    "delivered",
    "failed",
    "skipped"
  ],

  human_state: [
    "unclaimed",
    "claimed",
    "contact_attempted",
    "contacted",
    "qualified",
    "application_sent",
    "in_progress",
    "closed"
  ],

  human_outcome: [
    "converted",
    "no_answer",
    "not_interested",
    "not_qualified",
    "duplicate",
    "invalid",
    "do_not_contact"
  ],

  locked_reason: [
    "dealer_phone",
    "dealer_link",
    "signed_token"
  ],

  dealer_status: [
    "active",
    "paused",
    "inactive"
  ],

  dealer_tier: [
    "top50",
    "standard"
  ],

  crm_provider: [
    "hubspot",
    "internal"
  ],

  crm_sync_status: [
    "pending",
    "synced",
    "failed",
    "skipped"
  ]
};
```

## Collection overview

1. `leads/{leadId}`  
   Canonical lead record, written by intake channels and updated by automation and humans.

2. `dealers/{dealerId}`  
   Dealer registry and delivery preferences.

3. `dealers/{dealerId}/locations/{locationId}`  
   Dealer addresses and local contact info.

4. `dealers/{dealerId}/contacts/{contactId}`  
   Named people at the dealer.

5. `dealerNumbers/{phoneE164}`  
   Maps inbound dealer assigned phone numbers to dealer ids for deterministic attribution.

6. `zipCoverage/{stateZip}`  
   Fast state and zip coverage to dealer candidate lookup.

7. `dealerAttributionKeys/{keyId}`  
   Optional mapping for dealer link attribution by domain, referral codes, or signed tokens.

8. `dealerCapacity/{dealerId}`  
   Optional per dealer caps and counters.

9. `users/{userId}`  
   Internal TLC users, including loan officers and ops.

10. `leadEvents/{eventId}`  
    Append only event log for auditability.

---

## 1. leads collection

### Document: `leads/{leadId}`

```json
{
  "lead_id": "lead_xxx",
  "schema_version": 1,

  "created_at": null,
  "updated_at": null,

  "status": "collecting",
  "status_reason": null,

  "source": {
    "channel": "voice",
    "session_id": null,
    "entrypoint": "unknown",

    "referrer_url": null,
    "landing_url": null,

    "ip_hash": null,
    "user_agent": null,

    "attribution": {
      "utm": {
        "utm_source": null,
        "utm_medium": null,
        "utm_campaign": null,
        "utm_term": null,
        "utm_content": null
      },

      "referral_code": null,
      "dealer_id_from_referral": null,

      "inbound_dealer_number": null,
      "attribution_token": null,

      "locked_dealer_id": null,
      "locked_reason": null,
      "locked_at": null,
      "lock_expires_at": null
    }
  },

  "consents": {
    "contact_consent": null,
    "tcpa_disclosure_ack": null,
    "privacy_policy_ack": null,

    "consent_language_version": null,
    "consent_capture_method": null,
    "consented_at": null
  },

  "applicant": {
    "full_name": null,
    "phone_e164": null,
    "email": null,

    "preferred_contact_method": null,
    "best_time_to_contact": null
  },

  "home_and_site": {
    "property_zip": null,
    "property_state": null,

    "land_status": null,
    "land_value_band": null,

    "home_type": null,
    "is_new_home_purchase": null,

    "timeline": null,

    "site_work_needed": null,
    "home_price_estimate_usd": null
  },

  "financial_snapshot": {
    "credit_band_self_reported": null,
    "monthly_income_estimate_usd": null,
    "has_recent_bankruptcy": null
  },

  "notes": {
    "free_text": null
  },

  "assignment": {
    "assigned_dealer_id": null,

    "assignment_type": null,
    "assignment_reason": null,

    "routing_version": 1,
    "routed_at": null,

    "routing_attempt_count": 0,
    "routing_last_attempt_at": null,
    "routing_last_error": null
  },

  "delivery": {
    "status": "pending",

    "dealer_delivery_enabled": false,
    "tlc_team_notified": false,

    "attempts": 0,
    "last_attempt_at": null,
    "delivered_at": null,

    "last_error": null
  },

  "human": {
    "state": "unclaimed",

    "owner_user_id": null,
    "owner_name": null,

    "claimed_at": null,
    "last_touched_at": null,

    "first_contacted_at": null,
    "last_contact_attempt_at": null,
    "contact_attempts": 0,
    "max_contact_attempts": 5,

    "qualified_at": null,
    "qualification_notes": null,

    "application_sent_at": null,
    "application_method": null,

    "outcome": null,
    "outcome_notes": null,

    "next_follow_up_at": null
  },

  "flags": {
    "test_lead": false,
    "duplicate_of_lead_id": null
  },

  "crm": {
    "provider": null,
    "hubspot_contact_id": null,
    "hubspot_deal_id": null,
    "synced_at": null,
    "sync_status": "pending",
    "sync_attempts": 0,
    "last_sync_attempt_at": null,
    "last_error": null
  }
}
```

### Notes for storage types

1. Timestamps should be Firestore Timestamp objects.
2. `home_and_site.site_work_needed` is either null or an array of strings from `ENUMS.site_work_needed`.
3. Numeric fields store integers or floats depending on your needs.
4. Errors store an object with `code` and `message` if present.
5. Will probably need to make delivery and assignment a little more clear/rename

---

## 2. dealers collection

### Document: `dealers/{dealerId}`

```json
{
  "dealer_id": "dlr_001",
  "schema_version": 1,

  "dealer_name": "Example Homes",
  "status": "active",
  "tier": "standard",

  "website_url": null,
  "notes": null,

  "delivery_prefs": {
    "dealer_delivery_enabled": true,
    "delivery_mode": "email",

    "email_to": ["leads@examplehomes.com"],
    "email_cc": [],

    "webhook_url": null,

    "allow_lead_cap": false,
    "daily_lead_cap": null
  },

  "routing_prefs": {
    "priority_weight": 100,
    "exclusive_zips_allowed": true
  },

  "created_at": null,
  "updated_at": null
}
```

### Subcollection: `dealers/{dealerId}/locations/{locationId}`

```json
{
  "location_id": "loc_001",
  "label": "main",

  "address1": "123 Main St",
  "address2": null,
  "city": "Austin",
  "state": "TX",
  "zip5": "78701",

  "phone_e164": null,
  "email": null,

  "is_primary": true,

  "created_at": null,
  "updated_at": null
}
```

### Subcollection: `dealers/{dealerId}/contacts/{contactId}`

```json
{
  "contact_id": "ctc_001",
  "full_name": "Jane Dealer",
  "role": "sales",

  "phone_e164": null,
  "email": "jane@examplehomes.com",

  "is_primary": true,

  "created_at": null,
  "updated_at": null
}
```

---

## 3. dealerNumbers collection

### Document: `dealerNumbers/{phoneE164}`

Document id example: `+15125550101`

```json
{
  "phone_e164": "+15125550101",
  "dealer_id": "dlr_001",

  "label": "Example Homes website main",
  "active": true,

  "created_at": null,
  "updated_at": null
}
```

---

## 4. zipCoverage collection

### Document: `zipCoverage/{stateZip}`

Document id example: `TX_78701`

```json
{
  "state": "TX",
  "zip5": "78701",

  "candidates": [
    { "dealer_id": "dlr_001", "priority": 10, "exclusive": false },
    { "dealer_id": "dlr_002", "priority": 20, "exclusive": false }
  ],

  "updated_at": null
}
```

---

## 5. dealerAttributionKeys collection

### Document: `dealerAttributionKeys/{keyId}`

```json
{
  "key_id": "atk_001",
  "key_type": "domain",
  "key_value": "examplehomes.com",

  "dealer_id": "dlr_001",

  "confidence": 100,
  "active": true,

  "created_at": null
}
```

---

## 6. dealerCapacity collection

### Document: `dealerCapacity/{dealerId}`

```json
{
  "dealer_id": "dlr_001",

  "daily_lead_cap": null,
  "leads_assigned_today": 0,

  "last_reset_at": null,
  "updated_at": null
}
```

---

## 7. users collection

### Document: `users/{userId}`

```json
{
  "user_id": "usr_001",
  "full_name": "Loan Officer Name",
  "email": "lo@tlcmanufacturedloans.com",

  "role": "loan_officer",
  "active": true,

  "created_at": null,
  "updated_at": null
}
```

---

## 8. leadEvents collection

### Document: `leadEvents/{eventId}`

```json
{
  "event_id": "evt_001",
  "lead_id": "lead_xxx",

  "event_type": "routed",
  "actor_type": "system",
  "actor_id": null,

  "details": {
    "assigned_dealer_id": "dlr_001",
    "assignment_reason": "dealer_number"
  },

  "created_at": null
}
```

---

## Field naming rules

1. All stored field names use snake_case.
2. All enums are stored as their canonical enum string values.
3. Do not rename enum values after launch.
4. Prefer timestamps as processing markers rather than boolean processed flags.

## Processing markers

1. Lead has been routed when `assignment.routed_at` is non null.
2. Lead has been delivered when `delivery.delivered_at` is non null.
3. Lead has been claimed when `human.claimed_at` is non null.
4. Lead has been synced to CRM when `crm.synced_at` is non null.
