# **API Schema V2**

Created by: Xavier Briggs  
Updated: 1/14/2026

## **Overview**

This document defines V2 of the TLC routing service data contract. V2 supports lead intake from web and voice, durable dealer attribution, deterministic dealer routing, delivery tracking, and full auditability through append only events.

### **In scope**

• Lead intake  
• Dealer attribution and referral locking  
• Dealer assignment and geo routing  
• Dealer delivery tracking  
• Audit logs and reason codes  
• Prequalified status

### **Out of scope**

• Preapproval, underwriting, closing lifecycle  
• Pricing, rates, terms, or approvals  
• Full loan application data capture

---

## **1\. Intake payload schema V2**

### **1.1 Endpoint**

`POST /v2/leads:intake`

### **1.2 Payload**

Short and non sensitive. Works for both web and voice.

`{`  
  `"application_version": "2.0",`  
  `"idempotency_key": "req_9d1c1c3c7d1b4f0b",`  
  `"source": {`  
    `"channel": "web",`  
    `"entrypoint": "dealer_link",`  
    `"referrer_url": "https://dealer-example.com/financing",`  
    `"session_id": "sess_0d94c1e6f3",`  
    `"tracking": {`  
      `"dealer_id": "dlr_12345",`  
      `"attribution_token": "att_6f2c0c0e7c",`  
      `"campaign_id": "cmp_7788",`  
      `"utm": {`  
        `"utm_source": "dealer",`  
        `"utm_medium": "referral",`  
        `"utm_campaign": "spring_promo",`  
        `"utm_term": null,`  
        `"utm_content": null`  
      `}`  
    `}`  
  `},`  
  `"applicant": {`  
    `"full_name": "Jane Doe",`  
    `"phone_e164": "+13145551234",`  
    `"email": "jane@example.com",`  
    `"preferred_contact_method": "phone",`  
    `"best_time_to_contact": "weekday_evening",`  
    `"consents": {`  
      `"contact_consent": true,`  
      `"tcpa_disclosure_ack": true,`  
      `"privacy_policy_ack": true,`  
      `"consent_language_version": "2026_01_01"`  
    `}`  
  `},`  
  `"home_and_site": {`  
    `"property_zip": "63110",`  
    `"property_state": "MO",`  
    `"land_status": "own",`  
    `"land_value_raw": 75000,`  
    `"land_value_band": "50k_100k",`  
    `"home_type": "manufactured",`  
    `"is_new_home_purchase": true,`  
    `"home_price_estimate_usd": 125000,`  
    `"site_work_needed": ["foundation", "utilities", "deck"],`  
    `"site_work_budget_estimate_usd": 20000,`  
    `"timeline_raw": "April",`  
    `"timeline": "0_3_months"`  
  `},`  
  `"financial_snapshot": {`  
    `"credit_raw": 695,`  
    `"credit_band_self_reported": "680_719",`  
    `"monthly_income_estimate_usd": 5500,`  
    `"has_recent_bankruptcy": false`  
  `},`  
  `"notes": {`  
    `"free_text": "I already have a lot picked out and want a single wide delivered."`  
  `},`  
  `"anti_abuse": {`  
    `"ip_address": "203.0.113.10",`  
    `"user_agent": "Mozilla/5.0",`  
    `"captcha_passed": true`  
  `}`  
`}`

### **1.3 Voice intake mapping**

For voice, use the same schema with these conventions:  
• `source.channel = voice`  
• `source.session_id = call_sid`  
• `source.entrypoint` determined from dialed number routing logic  
• `source.tracking.dealer_id` set when dialed number is a dealer tracking number

---

## **2\. Enumerations V2**

### **2.1 source.channel**

• `web`  
• `voice`

### **2.2 source.entrypoint**

• `dealer_link`  
• `dealer_phone`  
• `lender_global_site`  
• `lender_global_phone`  
• `unknown`

### **2.3 applicant.preferred\_contact\_method**

• `phone`  
• `email`

### **2.4 applicant.best\_time\_to\_contact**

• `morning`  
• `afternoon`  
• `evening`  
• `weekday_morning`  
• `weekday_evening`  
• `weekend`

### **2.5 home\_and\_site.land\_status**

• `own`  
• `buying`  
• `family_land`  
• `gifted_land`  
• `not_sure`

### **2.6 home\_and\_site.land\_value\_band**

Optional field. Only meaningful when land status is own, buying, family\_land, gifted\_land.  
• `0_25k`  
• `25k_50k`  
• `50k_100k`  
• `100k_200k`  
• `200k_plus`  
• `not_sure`

### **2.7 home\_and\_site.home\_type**

• `manufactured`  
• `mobile_pre_hud`  
• `modular`  
• `single_wide`  
• `double_wide`  
• `not_sure`

### **2.8 home\_and\_site.timeline**

• `0_3_months`  
• `3_6_months`  
• `6_12_months`  
• `12_plus`  
• `not_sure`

### **2.9 home\_and\_site.site\_work\_needed**

• `foundation`  
• `utilities`  
• `septic`  
• `well`  
• `driveway`  
• `grading`  
• `deck`  
• `skirting`  
• `not_sure`

### **2.10 financial\_snapshot.credit\_band\_self\_reported**

• `under_580`  
• `580_619`  
• `620_679`  
• `680_719`  
• `720_plus`  
• `prefer_not_to_say`

---

## **3\. Lead status model V2**

### **3.1 Status values**

• `new`  
• `prequalified`  
• `routed`  
• `contact_attempted`  
• `contacted`  
• `ineligible`  
• `do_not_contact`

### **3.2 Transition rules**

System or AI can set: `new`, `prequalified`  
Routing engine can set: `routed`  
Loan officers can set: `contact_attempted`, `contacted`, `ineligible`, `do_not_contact`

Terminal statuses: `ineligible`, `do_not_contact`

---

## **4\. Persistence model V2**

### **4.1 Table: leads**

One record per buyer lead.

Columns  
• `lead_id text primary key`  
• `idempotency_key text not null unique`  
• `created_at timestamp not null default now()`  
• `updated_at timestamp not null default now()`  
• `status text not null`  
• `status_reason text null`

Source and session  
• `source_channel text not null`  
• `source_entrypoint text not null`  
• `referrer_url text null`  
• `campaign_id text null`  
• `session_id text null`

Assignment  
• `assigned_dealer_id text null references dealers(dealer_id)`  
• `assignment_type text null` (dealer\_sourced, geo\_routed, manual)  
• `assignment_reason text null`  
• `routed_at timestamp null`

Ownership  
• `assigned_loan_officer_id text null`

Dealer delivery tracking  
• `dealer_delivery_status text not null default 'pending'` (pending, delivered, failed, skipped)  
• `dealer_delivered_at timestamp null`  
• `dealer_delivery_error text null`  
• `dealer_delivery_attempts integer not null default 0`  
• `dealer_delivery_last_attempt_at timestamp null`

Safety  
• `do_not_contact_reason text null`

Indexes  
• index on `status`  
• index on `created_at`  
• index on `assigned_dealer_id`  
• index on `(source_channel, source_entrypoint)`  
• index on `session_id`

---

### **4.2 Table: lead\_attribution**

Immutable attribution facts.

Columns  
• `lead_id text primary key references leads(lead_id)`  
• `dealer_id text null references dealers(dealer_id)`  
• `attribution_token text null unique`  
• `utm_source text null`  
• `utm_medium text null`  
• `utm_campaign text null`  
• `utm_term text null`  
• `utm_content text null`  
• `click_id text null`  
• `attributed_at timestamp not null default now()`  
• `locked boolean not null default true`

Rule  
Once `locked = true`, dealer\_id cannot be changed except by an admin override workflow that records a lead event.

Indexes  
• index on `dealer_id`  
• index on `attribution_token`

---

### **4.3 Table: applicants**

PII lives here, separate from routing logic.

Columns  
• `lead_id text primary key references leads(lead_id)`  
• `full_name text not null`  
• `phone_e164 text not null`  
• `email text null`  
• `preferred_contact_method text not null`  
• `best_time_to_contact text null`

Indexes  
• index on `phone_e164`  
• index on `email`

---

### **4.4 Table: consents**

Compliance acknowledgements.

Columns  
• `lead_id text primary key references leads(lead_id)`  
• `contact_consent boolean not null`  
• `tcpa_disclosure_ack boolean not null`  
• `privacy_policy_ack boolean not null`  
• `consented_at timestamp not null default now()`  
• `consent_language_version text not null`  
• `consented_ip text null`  
• `consented_user_agent text null`

---

### **4.5 Table: home\_requests**

Property and home intent.

Columns  
• `lead_id text primary key references leads(lead_id)`  
• `property_zip text not null`  
• `property_state text not null`  
• `land_status text not null`  
• `land_value_raw integer null` — Raw dollar amount provided by applicant (e.g., 75000)  
• `land_value_band text null` — Computed band from raw value (e.g., "50k\_100k")  
• `home_type text not null`  
• `is_new_home_purchase boolean not null`  
• `home_price_estimate_usd integer null`  
• `site_work_budget_estimate_usd integer null`  
• `timeline_raw text null` — Raw timeline input (e.g., "April", "next month", "end of year")  
• `timeline text not null` — Computed band from raw value (e.g., "0\_3\_months")  
• `notes_free_text text null`

Indexes  
• index on `property_zip`  
• index on `property_state`

---

### **4.6 Table: home\_request\_site\_work**

Multi select join table for site work needs.

Columns  
• `lead_id text not null references leads(lead_id)`  
• `site_work_item text not null`

Primary key  
• `(lead_id, site_work_item)`

Index  
• index on `site_work_item`

---

### **4.7 Table: financial\_snapshots**

Self reported and non sensitive.

Columns  
• `lead_id text primary key references leads(lead_id)`  
• `credit_raw integer null` — Raw credit score provided by applicant (e.g., 695)  
• `credit_band_self_reported text null` — Computed band from raw value (e.g., "680\_719")  
• `monthly_income_estimate_usd integer null`  
• `has_recent_bankruptcy boolean null`

---

### **4.8 Table: lead\_events**

Append only event log for auditability.

Columns  
• `event_id text primary key`  
• `lead_id text not null references leads(lead_id)`  
• `event_type text not null`  
• `event_at timestamp not null default now()`  
• `actor_type text not null` (system, ai, loan\_officer, applicant, admin)  
• `actor_id text null`  
• `request_id text null`  
• `correlation_id text null`  
• `payload_json jsonb not null`

Indexes  
• index on `(lead_id, event_at)`  
• index on `event_type`  
• index on `correlation_id`

---

## **5\. Dealer and territory model V2**

### **5.1 Table: dealers**

Columns  
• `dealer_id text primary key`  
• `dealer_name text not null`  
• `status text not null` (active, paused, disabled)  
• `primary_contact_email text null`  
• `primary_contact_phone text null`  
• `lead_delivery_method text not null` (email, webhook, portal, crm)  
• `daily_lead_cap integer null`  
• `priority_weight integer not null default 100`

Indexes  
• index on `status`

---

### **5.2 Table: dealer\_coverage**

ZIP based coverage.

Columns  
• `dealer_id text not null references dealers(dealer_id)`  
• `zip text not null`

Primary key  
• `(dealer_id, zip)`

Indexes  
• index on `zip`

---

### **5.3 Table: dealer\_capacity**

Tracks daily counters for capacity enforcement.

Columns  
• `dealer_id text primary key references dealers(dealer_id)`  
• `leads_assigned_today integer not null`  
• `last_reset_at timestamp not null`

---

### **5.4 Table: dealer\_tracking\_numbers**

Maps tracking phone numbers to dealers for dealer\_phone entrypoint attribution.

Columns  
• `tracking_number_e164 text primary key`  
• `dealer_id text not null references dealers(dealer_id)`  
• `status text not null` (active, paused, disabled)  
• `created_at timestamp not null default now()`  
• `updated_at timestamp not null default now()`

Indexes  
• index on `dealer_id`  
• index on `status`

Rule  
If an inbound voice call dialed number matches an active tracking number, set entrypoint to dealer\_phone and set attribution dealer\_id locked.

---

## **6\. Routing and attribution rules V2**

### **6.1 Entrypoint determination**

Web

1. If `source.tracking.dealer_id` is present, entrypoint is dealer\_link  
2. Else entrypoint is lender\_global\_site

Voice

1. If dialed number matches dealer\_tracking\_numbers and status is active, entrypoint is dealer\_phone  
2. Else entrypoint is lender\_global\_phone

### **6.2 Dealer attribution locking**

If dealer\_id is present from dealer\_link or dealer\_phone, write lead\_attribution with locked true immediately.

### **6.3 Dealer assignment trigger**

Run assignment when:

1. Lead is created and property\_zip exists  
2. property\_zip is updated and assigned\_dealer\_id is null

### **6.4 Dealer assignment algorithm**

Step 1: If attribution dealer exists  
• Validate dealer is active  
• Validate dealer covers property\_zip  
• Validate dealer under cap if cap exists  
• If valid, assign dealer\_sourced  
• If invalid, fall back to geo routing and write an event describing why

Step 2: Geo routing  
• Find all active dealers covering property\_zip  
• Filter by capacity caps  
• Select deterministically by highest priority\_weight  
• Assign geo\_routed

Always write lead\_events with:  
• candidate set size  
• filters applied  
• final dealer selected  
• reason code

---

## **7\. Dealer delivery model V2**

### **7.1 Dealer delivery status values**

• `pending`  
• `delivered`  
• `failed`  
• `skipped`

### **7.2 Delivery trigger**

Attempt delivery when all conditions are true:  
• lead status is prequalified  
• assigned\_dealer\_id is not null  
• dealer\_delivery\_status is pending

### **7.3 Delivery idempotency**

If dealer\_delivery\_status is delivered, do nothing.

### **7.4 Delivery failure behavior**

On failure:  
• set dealer\_delivery\_status to failed  
• increment dealer\_delivery\_attempts  
• set dealer\_delivery\_last\_attempt\_at  
• set dealer\_delivery\_error  
• write lead\_events dealer\_delivery\_failed

---

## **8\. Event types V2**

Intake and updates  
• `lead_created`  
• `lead_updated`  
• `status_changed`

Attribution  
• `attribution_set`  
• `attribution_lock_applied`  
• `attribution_override_applied`

Routing  
• `dealer_assignment_created`  
• `dealer_assignment_failed`

Delivery  
• `dealer_delivery_attempted`  
• `dealer_delivery_succeeded`  
• `dealer_delivery_failed`  
• `dealer_delivery_skipped`

Voice events  
• `voice_call_started`  
• `voice_intake_completed`  
• `voice_transfer_requested`  
• `voice_transfer_completed`

---

## **9\. API surface V2**

### **9.1 Intake create or reuse**

`POST /v2/leads:intake`

Behavior  
• If idempotency\_key exists, return existing lead  
• Else create lead, persist normalized records, append events, optionally route if ZIP exists

Response

`{`  
  `"lead_id": "lead_01HZZZ123",`  
  `"status": "new",`  
  `"assigned_dealer_id": null,`  
  `"dealer_delivery_status": "pending"`  
`}`

### **9.2 Append event**

`POST /v2/leads/{lead_id}/events`

### **9.3 Partial update for progressive enrichment**

`PATCH /v2/leads/{lead_id}`  
Safe fields only, writes lead\_updated events.

### **9.4 Set status with transition validation**

`POST /v2/leads/{lead_id}/status`

### **9.5 Route lead**

`POST /v2/leads/{lead_id}/route`

### **9.6 Deliver lead to dealer**

`POST /v2/leads/{lead_id}/deliver`

---

## **10\. V2 invariants**

1. source.channel is web or voice only  
2. source.entrypoint is one of dealer\_link, dealer\_phone, lender\_global\_site, lender\_global\_phone, unknown  
3. dealer attribution is locked once set, except admin override with audit event  
4. assignment writes an explicit reason and a lead event every time  
5. delivery is separate from assignment and is idempotent  
6. lead\_events is append only and explains every important system action  
7. prequalified is the last status owned by automation in this service