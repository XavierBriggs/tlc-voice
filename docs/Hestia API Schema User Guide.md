# **1\. Intake payload V2 (what comes into the system)**

The intake payload exists to solve one problem:

**Create a lead record that is valid, attributable, routable, and auditable, without collecting sensitive underwriting data.**

## **1.1 `application_version`**

**Purpose**

* Lets you evolve the intake contract without breaking old clients

**How it is used**

* Your API can branch logic if needed

* Example: if version is 2.0, it expects `tracking` inside `source`

---

## **1.2 `idempotency_key`**

**Purpose**

* Prevent duplicate leads when:

  * the web form is submitted twice

  * the voice agent retries after a network hiccup

  * the same call sends intake more than once

**How it is used**

* `leads.idempotency_key` is unique

* If the same key is received again, the API returns the same `lead_id`

This is one of the most important reliability fields in the whole system.

---

## **1.3 `source`**

This tells you **where the lead came from and how attribution should work.**

### **`source.channel`**

**Values**: `web`, `voice`

**How it is used**

* Determines how to interpret the session

* Determines what enrichment steps to expect

* Helps analytics split behavior by channel

Example:

* Web leads often arrive complete

* Voice leads often arrive partial and get enriched progressively

---

### **`source.entrypoint`**

**Values**:

* `dealer_link`

* `dealer_phone`

* `lender_global_site`

* `lender_global_phone`

* `unknown`

**How it is used**  
 This is your “pathway classifier.” It drives attribution rules:

* `dealer_link` means the buyer came through a dealer’s unique link

* `dealer_phone` means the buyer dialed a dealer’s unique tracking phone number

* `lender_global_site` means the buyer found TLC directly on the web

* `lender_global_phone` means the buyer called TLC directly

* `unknown` is your safe fallback

Entrypoint also tells you what to expect:

* Dealer entrypoints usually have locked attribution

* Global entrypoints usually require geo routing

---

### **`source.referrer_url`**

**Purpose**

* Gives context for how the buyer arrived

**How it is used**

* Used for analytics and debugging

* Helps validate that dealer links are being used correctly

---

### **`source.session_id`**

**Purpose**

* A stable session concept shared by web and voice

**How it is used**

* Web: browser session or front end session id

* Voice: Twilio CallSid or equivalent call session id

* Lets you correlate multiple updates to the same lead journey

---

### **`source.tracking`**

This exists to keep dealer attribution durable.

#### **`tracking.dealer_id`**

**Purpose**

* Direct dealer ownership signal

**How it is used**

* If present, create a locked attribution record

* Ensures referral leads go back to the correct dealer

Dealer link and dealer phone should set this.

---

#### **`tracking.attribution_token`**

**Purpose**

* A unique referral token that proves the click came from the dealer link

**How it is used**

* Stored in `lead_attribution.attribution_token`

* Supports dedupe, fraud detection, and auditability

* Lets you attribute even if dealer id was missing in the request

---

#### **`tracking.campaign_id` and `tracking.utm`**

**Purpose**

* Marketing attribution and reporting

**How it is used**

* Stored in attribution so you can answer:

  * which dealers produce the most conversion

  * which campaigns drive quality leads

  * which entrypoints generate duplicates or low quality

---

## **1.4 `applicant`**

This is the “contact card” for the lead. It is intentionally minimal.

### **`full_name`**

**Purpose**

* Human usable identification

**How it is used**

* Loan officer outreach

* Dealer delivery payload

---

### **`phone_e164`**

**Purpose**

* Primary callback identifier

**How it is used**

* Used for contact attempts

* Used for dedupe searches

* Used for follow up workflows

This is the single most useful PII field in the system.

---

### **`email`**

**Purpose**

* Secondary contact method

**How it is used**

* Dealer delivery

* Outreach if preferred contact is email

---

### **`preferred_contact_method`**

**Values**: `phone`, `email`

**How it is used**

* Tells loan officers how to follow up first

* Helps the voice agent decide whether to confirm email

---

### **`best_time_to_contact`**

**Purpose**

* Helps loan officers contact when response probability is highest

**How it is used**

* Drives workflow scheduling in the CRM later

* Useful even if it is approximate

---

### **`consents`**

This is your compliance checkpoint.

#### **`contact_consent`**

**How it is used**

* If false, you should not contact the lead

* Can drive `status = do_not_contact` or delivery skip behavior

#### **`tcpa_disclosure_ack`**

**How it is used**

* Evidence that the TCPA language was acknowledged

* Stored with a timestamp in `consents`

#### **`privacy_policy_ack`**

**How it is used**

* Evidence of privacy policy acknowledgment

#### **`consent_language_version`**

**How it is used**

* Critical for audits because the disclosure text changes over time

* Lets you prove exactly what the user agreed to

---

## **1.5 `home_and_site`**

This exists to make routing and triage possible.

### **`property_zip` and `property_state`**

**Purpose**

* The core routing inputs

**How they are used**

* Geo routing uses ZIP as the main key

* Dealer coverage rules are expressed in ZIPs

This is the most important routing data.

---

### **`land_status`**

**Values**:

* `own`

* `buying`

* `family_land`

* `gifted_land`

* `renting_lot`

* `not_sure`

**How it is used**

* Helps determine loan path complexity

* Helps the voice agent ask the right next question

* Helps loan officers understand the buyer situation immediately

---

### **`land_value_band`**

**Purpose**

* Adds useful context without collecting a precise land value

**How it is used**

* Helps triage land package leads

* Helps a loan officer prioritize and prepare

* Only meaningful when land is owned, being bought, family land, or gifted land

If land status is renting lot or not sure, you can set land value band to null or not sure.

---

### **`home_type`**

**How it is used**

* Determines what kind of manufactured home financing path applies

* Helps ensure the lead is not miscategorized

---

### **`is_new_home_purchase`**

**How it is used**

* Helps identify whether this is a purchase scenario versus existing home financing

* Guides follow up questions

---

### **`home_price_estimate_usd`**

**How it is used**

* Helps rough affordability and deal sizing

* Helps loan officer prioritize and prepare

This is still non sensitive. It is not income verification.

---

### **`site_work_needed` and `site_work_budget_estimate_usd`**

**How they are used**

* Provides context that affects total project cost

* Helps loan officers anticipate complexity

Because `site_work_needed` is multi select, you store it in a join table for clean analytics.

---

### **`timeline`**

**How it is used**

* Helps prioritize

* Helps dealers know how urgent the buyer is

---

## **1.6 `financial_snapshot`**

This is intentionally self reported and non sensitive.

### **`credit_band_self_reported`**

**How it is used**

* Determines the rough tier of lead readiness

* Helps set expectations for next steps

* Useful for routing rules later if you ever specialize dealer assignments

---

### **`monthly_income_estimate_usd`**

**How it is used**

* Directional context only

* Helps loan officers plan initial conversation

* Not used for approvals in this system

---

### **`has_recent_bankruptcy`**

**How it is used**

* High level complexity signal

* Useful for triage and setting the right human handoff

---

## **1.7 `notes.free_text`**

**How it is used**

* Captures anything that does not fit structured fields

* Often contains critical detail like:

  * single wide vs double wide

  * delivery concerns

  * “I already have a lot”

This should be treated as advisory, not underwriting facts.

---

## **1.8 `anti_abuse`**

### **`ip_address`, `user_agent`, `captcha_passed`**

**How it is used**

* Helps filter spam leads

* Helps detect automated abuse

* Helps compliance review if needed

Voice can leave these null.

---

# **2\. Enumerations (why they matter)**

Enums exist to keep the system stable.

**How they are used**

* Ensure analytics do not fragment into messy free text

* Ensure routing rules and automation do not break

* Make UI and reporting consistent

The main idea is: stable values produce stable automation.

---

# **3\. Lead statuses (how they run your workflow)**

Status is how you automate reliably without guessing.

### **`new`**

Lead exists but is not yet “ready.”

### **`prequalified`**

You have enough information and consent to move forward.

This is the key milestone for V2.

### **`routed`**

A dealer has been assigned.

### **`contact_attempted`, `contacted`**

Human workflow states for loan officers.

### **`ineligible`, `do_not_contact`**

Terminal suppression states.

**How it is used**

* Trigger routing, delivery, and suppression rules

* Provide consistent reporting for operations

---

# **4\. Persistence model (tables and how they work together)**

## **4.1 `leads`**

This is the master record and the workflow state container.

**How it is used**

* Primary lookup for any lead

* Holds the canonical status and assignment fields

* Stores delivery state so delivery is idempotent

Key columns and purpose:

* `lead_id` primary identifier

* `idempotency_key` prevents duplicate lead creation

* `status` workflow state

* `assigned_dealer_id` dealer selected for this lead

* `dealer_delivery_status` tracks whether dealer has actually received the lead

* source fields allow attribution reporting and debugging

---

## **4.2 `lead_attribution`**

This is the referral ownership record.

**How it is used**

* Locks dealer ownership for dealer link and dealer phone leads

* Stores marketing context

* Provides a durable audit trail for partner relationships

Key column:

* `locked`

  * When true, dealer cannot change without an admin override event

This protects dealer partners and eliminates attribution disputes.

---

## **4.3 `applicants`**

This isolates PII from routing logic.

**How it is used**

* Loan officers use it to contact leads

* Dealers receive it when delivery happens

* The routing engine does not need to scan PII for its decisions

This separation makes the system cleaner and safer.

---

## **4.4 `consents`**

This is your compliance proof table.

**How it is used**

* If contact consent is false, do not contact

* If TCPA ack is missing, you can block outbound texting

* The language version proves exactly what the user accepted

Storing consent here also makes audits straightforward.

---

## **4.5 `home_requests`**

This is the structured “what are they trying to buy and where” record.

**How it is used**

* ZIP and state are the routing inputs

* Land status helps triage

* Timeline helps urgency sorting

* Notes carry context to the human team

This table is the core routing data aside from attribution.

---

## **4.6 `home_request_site_work`**

This is the normalized version of site work needs.

**How it is used**

* Allows analytics like:

  * percent of leads needing foundation work

  * average site work needs by dealer

* Avoids messy JSON array querying

---

## **4.7 `financial_snapshots`**

This captures self reported context without sensitive details.

**How it is used**

* Helps triage and prioritization

* Helps loan officers prepare

* Can support future segmentation reporting

---

## **4.8 `lead_events`**

This is the audit log and the explanation engine.

**How it is used**

* Every important action writes an event:

  * lead created

  * attribution set

  * dealer assigned

  * delivery attempted

  * delivery succeeded or failed

  * status changed

* The payload explains “why” and “how” actions happened

This makes the system debuggable and defensible.

If someone asks, “Why did this lead go to this dealer?”  
 The answer should exist in `lead_events.payload_json`.

---

# **5\. Dealer and territory tables (routing inputs)**

## **5.1 `dealers`**

This is your dealer registry.

**How it is used**

* Defines which dealers exist

* Stores delivery method so delivery can be executed correctly

* Stores caps and weights for fair distribution

Key fields:

* `status` controls eligibility

* `lead_delivery_method` controls how you deliver

* `daily_lead_cap` controls volume

* `priority_weight` controls preference

---

## **5.2 `dealer_coverage`**

This is the simplest and most explicit geo routing model.

**How it is used**

* For a given ZIP, find eligible dealers

* Ensure coverage is deterministic

This table makes routing explainable and easy to change.

---

## **5.3 `dealer_capacity`**

This is the runtime limiter.

**How it is used**

* Prevents sending too many leads to one dealer in a day

* Resets daily

* Checked during routing

Without this, routing is blind to operational reality.

---

## **5.4 `dealer_tracking_numbers`**

This powers dealer phone attribution.

**How it is used**

* When a call comes in, you read the dialed number

* If it matches an active tracking number, you set:

  * entrypoint \= dealer\_phone

  * attribution dealer\_id \= the mapped dealer

  * locked \= true

This is what makes dealer phone attribution deterministic.

---

# **6\. Routing logic and how it uses the schema**

## **6.1 If lead is dealer sourced**

Dealer sourced means:

* entrypoint is dealer\_link or dealer\_phone

* attribution dealer\_id exists

**What happens**

1. Validate the dealer is active

2. Validate the dealer covers the ZIP

3. Assign that dealer

4. Log the reason

Where this lives:

* assignment stored in `leads.assigned_dealer_id`

* explanation stored in `lead_events`

---

## **6.2 If lead is not dealer sourced**

Global entrypoints mean no dealer attribution.

**What happens**

1. Find all dealers covering the ZIP from `dealer_coverage`

2. Filter by dealer status

3. Filter by cap from `dealer_capacity`

4. Choose a dealer based on weight or deterministic logic

5. Assign and log

This is how the system routes fairly and predictably.

---

# **7\. Delivery logic and why it is separate**

Dealer assignment answers:  
 **Who owns this lead?**

Delivery answers:  
 **Has the dealer actually received it yet?**

This matters because you often want to:

* assign immediately for correctness and reservation

* deliver only when the lead is prequalified

That is why `dealer_delivery_status` exists in `leads`.

**Delivery fields used**

* `dealer_delivery_status`

* attempts, error message, timestamps

* events for every attempt and outcome

This makes delivery idempotent and retryable.

---

# **8\. How the API endpoints use the schema**

## **`POST /v2/leads:intake`**

Uses:

* creates `leads`

* creates `applicants`, `home_requests`, `consents`, `financial_snapshots`

* creates `lead_attribution` if tracking exists

* writes `lead_events`

Optionally triggers routing if ZIP exists.

---

## **`PATCH /v2/leads/{lead_id}`**

Used for progressive enrichment.

Typical for voice:

* the call starts with partial data

* each answer updates the lead

Writes:

* updates the normalized tables

* appends `lead_updated` event

---

## **`POST /v2/leads/{lead_id}/status`**

Used to set `prequalified`, `do_not_contact`, etc.

Writes:

* update `leads.status`

* append `status_changed` event

---

## **`POST /v2/leads/{lead_id}/route`**

Used when:

* ZIP arrives later

* attribution arrives later

* routing needs to be retried

Writes:

* dealer assignment fields in `leads`

* `dealer_assignment_created` event with reason and candidate set

---

## **`POST /v2/leads/{lead_id}/deliver`**

Used when lead is ready and should be sent to the dealer.

Writes:

* delivery status fields in `leads`

* delivery attempt events and outcome events

---

## **`POST /v2/leads/{lead_id}/events`**

Used when you want external systems or the voice agent to log facts that do not belong in the core tables.

Example:

* voice call started

* transfer to loan officer

* agent summary

Append only, always.

---

# **9\. How it all comes together in one sentence**

This schema is a pipeline:

**Intake creates the lead, attribution locks dealer ownership, routing assigns a dealer deterministically, prequalified marks readiness, delivery sends the lead exactly once, and events preserve the full why behind every action.**

