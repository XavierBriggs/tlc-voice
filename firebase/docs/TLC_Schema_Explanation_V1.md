# TLC Schema Explanation V1

This document explains the TLC Firestore schema, including the purpose of every field and why it exists.

## Conventions used here

1. Field paths are written as `object.subobject.field`.
2. All timestamps are Firestore Timestamp values.
3. Enum fields must match the canonical enum strings.
4. Null means the value is unknown or not yet collected.

---

# 1) leads document explanation

## Identity and version

1. `lead_id`  
   Unique id for the lead. Use a random id or a deterministic id for voice calls if you want deduplication by call.

2. `schema_version`  
   Integer version for safe migrations and backfills.

## Record lifecycle fields

1. `created_at`  
   When the lead was first created.

2. `updated_at`  
   When the lead was last modified by any writer.

## Lead status

1. `status`  
   High level state of the lead. This is a business state, not an automation state.

   Meanings:
   1. `new` Lead exists but intake has not begun.
   2. `collecting` Intake is in progress.
   3. `prequalified` Minimum required fields are complete and the lead is ready for delivery to TLC team and possibly a dealer.
   4. `ineligible` Lead failed an eligibility screen or rule.
   5. `do_not_contact` The borrower did not consent to follow up.
   6. `closed` The lead is finished by a loan officer.

2. `status_reason`  
   Optional structured explanation for why the lead reached a terminal state.

   Fields:
   1. `status_reason.code` A short machine readable reason.
   2. `status_reason.details` Extra explanation for debugging.

## Source metadata

1. `source.channel`  
   Where the lead originated. Values are `voice`, `web`, or `app`.

2. `source.session_id`  
   Unique id for the session, such as Twilio callSid or a web session id.

3. `source.entrypoint`  
   How the borrower entered TLC. This is used to decide attribution behavior and optional questions.

   Meanings:
   1. `dealer_phone` Borrower called a dealer assigned number that routes to TLC.
   2. `dealer_link` Borrower came from a dealer website or dealer referral link.
   3. `tlc_phone` Borrower called TLC global number.
   4. `tlc_site` Borrower used TLC direct website form.
   5. `unknown` The system could not determine entrypoint.

4. `source.referrer_url`  
   The HTTP referrer for web traffic when available. Useful for debugging and attribution.

5. `source.landing_url`  
   The full landing page URL, which can include query parameters and UTMs.

6. `source.ip_hash`  
   Optional, hashed IP for abuse prevention or deduplication. Store only a hash.

7. `source.user_agent`  
   Optional, user agent string for debugging.

## Attribution object

The attribution object exists so routing can be deterministic and dealer ownership can be protected.

1. `source.attribution.utm.*`  
   Standard UTM fields for marketing analytics.

2. `source.attribution.referral_code`  
   Optional human readable referral code.

3. `source.attribution.dealer_id_from_referral`  
   Dealer id provided by the dealer link or referral code lookup.

4. `source.attribution.inbound_dealer_number`  
   The phone number the borrower dialed. This is the key for dealer assigned numbers.

5. `source.attribution.attribution_token`  
   Optional signed token that encodes dealer id and metadata. Helps prevent spoofing.

6. `source.attribution.locked_dealer_id`  
   The dealer id that should receive the lead if a dealer source is confirmed.

7. `source.attribution.locked_reason`  
   Explains why the dealer was locked.

   Meanings:
   1. `dealer_phone` Dealer assigned phone number was dialed.
   2. `dealer_link` Dealer referral link provided dealer id.
   3. `signed_token` Dealer id came from a signed token.

8. `source.attribution.locked_at`  
   When the lock was applied.

9. `source.attribution.lock_expires_at`  
   Optional, expires attribution lock if you want it time limited.

---

# 2) consents explanation

1. `consents.contact_consent`  
   True if borrower allows TLC to contact them by phone or email.

2. `consents.tcpa_disclosure_ack`  
   True if borrower acknowledged TCPA disclosure language.

3. `consents.privacy_policy_ack`  
   True if borrower acknowledged privacy policy language.

4. `consents.consent_language_version`  
   Version string for the disclosure language displayed or spoken. This supports compliance audits.

5. `consents.consent_capture_method`  
   How the consent was obtained. Values include voice confirmation or web checkbox.

6. `consents.consented_at`  
   Timestamp for when consent was captured.

---

# 3) applicant explanation

These fields describe the person and how to reach them. SMS is not used.

1. `applicant.full_name`  
   Borrower full name as spoken or entered.

2. `applicant.phone_e164`  
   Borrower phone number normalized to E.164.

3. `applicant.email`  
   Borrower email address.

4. `applicant.preferred_contact_method`  
   Borrower preference for follow up. Values are `phone` or `email`.

5. `applicant.best_time_to_contact`  
   Borrower best time window for a loan officer to reach them.

---

# 4) home_and_site explanation

These fields capture where the home goes and the deal context.

1. `home_and_site.property_zip`  
   The placement zip code used for geo routing.

2. `home_and_site.property_state`  
   The placement state used for routing key construction.

3. `home_and_site.land_status`  
   Borrower land situation. Used to determine the product and whether land value questions apply.

4. `home_and_site.land_value_band`  
   Rough band for land value when land is owned or relevant.

5. `home_and_site.home_type`  
   The home type. Used to route to correct loan products and underwriting constraints.

6. `home_and_site.is_new_home_purchase`  
   True if new purchase, false if not, null if unknown.

7. `home_and_site.timeline`  
   When borrower hopes to move forward.

8. `home_and_site.site_work_needed`  
   Array describing expected site work categories.

9. `home_and_site.home_price_estimate_usd`  
   Optional estimate for home price.

---

# 5) financial_snapshot explanation

These fields capture a light prequalification snapshot.

1. `financial_snapshot.credit_band_self_reported`  
   Self reported credit bucket.

2. `financial_snapshot.monthly_income_estimate_usd`  
   Optional monthly household income estimate.

3. `financial_snapshot.has_recent_bankruptcy`  
   Optional boolean or null.

---

# 6) notes explanation

1. `notes.free_text`  
   Free form notes from voice or web.

---

# 7) assignment explanation

The assignment object represents dealer routing results. This is separate from lead status.

1. `assignment.assigned_dealer_id`  
   The dealer that should receive the lead.

2. `assignment.assignment_type`  
   How the assignment was chosen.

   Meanings:
   1. `dealer_sourced` Dealer lock applied, dealer owns the lead.
   2. `geo_routed` Routed by zip coverage.
   3. `manual` Set by a human override.

3. `assignment.assignment_reason`  
   More specific reason for audit.

   Meanings:
   1. `dealer_number` Dealer assigned phone number caused lock.
   2. `referral_lock` Dealer referral link or key caused lock.
   3. `zip_match` Zip coverage map chose dealer.
   4. `fallback` No candidates, system fallback chosen.
   5. `manual_override` A human changed the assignment.

4. `assignment.routing_version`  
   Allows routing logic upgrades without ambiguity.

5. `assignment.routed_at`  
   Processing marker for routing. If set, routing must not run again.

6. `assignment.routing_attempt_count`  
   Count of routing attempts.

7. `assignment.routing_last_attempt_at`  
   Timestamp of most recent routing attempt.

8. `assignment.routing_last_error`  
   Error object if routing failed.

---

# 8) delivery explanation

The delivery object represents notifications to TLC and the dealer.

1. `delivery.status`  
   Delivery automation state.

   Meanings:
   1. `pending` Not yet delivered.
   2. `delivered` Notifications were sent.
   3. `failed` A delivery attempt failed.
   4. `skipped` Delivery intentionally not performed.

2. `delivery.dealer_delivery_enabled`  
   Snapshot of whether dealer emailing was enabled at time of delivery.

3. `delivery.tlc_team_notified`  
   True if TLC internal email was sent.

4. `delivery.attempts`  
   Number of delivery attempts.

5. `delivery.last_attempt_at`  
   Timestamp of last attempt.

6. `delivery.delivered_at`  
   Processing marker for delivery completion.

7. `delivery.last_error`  
   Error object for failures.

---

# 9) human explanation

The human object tracks loan officer ownership, workflow progression, and outcomes.

1. `human.state`
   Human workflow state representing the loan officer pipeline stage.

   Meanings:
   1. `unclaimed` No owner assigned. Lead is in queue waiting to be claimed.
   2. `claimed` A loan officer claimed the lead but has not attempted contact yet.
   3. `contact_attempted` Loan officer tried to reach borrower but no successful connection yet.
   4. `contacted` First successful conversation with borrower completed.
   5. `qualified` Loan officer verified borrower meets lending criteria.
   6. `application_sent` Application link or documents sent to borrower.
   7. `in_progress` Application received and being processed.
   8. `closed` The lead is resolved with a final outcome.

2. `human.owner_user_id`
   The internal user id that owns the lead.

3. `human.owner_name`
   Denormalized name for convenience in dashboards.

4. `human.claimed_at`
   Timestamp of claim action.

5. `human.last_touched_at`
   Timestamp of last human interaction.

6. `human.first_contacted_at`
   Timestamp of first successful contact with borrower. Used to distinguish between contact_attempted and contacted states.

7. `human.last_contact_attempt_at`
   Timestamp of most recent outreach attempt.

8. `human.contact_attempts`
   Count of outreach attempts. Used with max_contact_attempts to determine when to move lead to no_answer outcome.

9. `human.max_contact_attempts`
   Threshold for contact attempts before suggesting no_answer outcome. Default is 5.

10. `human.qualified_at`
    Timestamp when loan officer marked borrower as qualified after verification.

11. `human.qualification_notes`
    Notes from qualification call explaining why borrower qualifies or any conditions.

12. `human.application_sent_at`
    Timestamp when application was sent to borrower.

13. `human.application_method`
    How the application was sent. Values include email_link, portal_invite, or paper.

14. `human.outcome`
    Final outcome when closed.

    Meanings:
    1. `converted` Loan funded successfully.
    2. `no_answer` Could not reach borrower after max attempts.
    3. `not_interested` Borrower declined to proceed.
    4. `not_qualified` Borrower did not meet lending criteria after verification.
    5. `duplicate` Lead is a duplicate of another record.
    6. `invalid` Bad data, fake lead, or test submission.
    7. `do_not_contact` Borrower requested no further contact. Compliance flag.

15. `human.outcome_notes`
    Free form notes on outcome.

16. `human.next_follow_up_at`
    Optional scheduling hint for next outreach.

---

# 10) flags explanation

1. `flags.test_lead`
   True if generated for testing.

2. `flags.duplicate_of_lead_id`
   If deduplicated, points to canonical lead id.

---

# 10b) crm explanation

The crm object tracks CRM integration status.

1. `crm.provider`
   Which CRM system this lead synced to. Values: `hubspot` or `internal`.

2. `crm.hubspot_contact_id`
   The HubSpot Contact record ID if synced to HubSpot.

3. `crm.hubspot_deal_id`
   The HubSpot Deal record ID if synced to HubSpot.

4. `crm.synced_at`
   Timestamp when CRM sync completed successfully. Processing marker.

5. `crm.sync_status`
   Current sync state.

   Meanings:
   1. `pending` Not yet synced.
   2. `synced` Successfully synced to CRM.
   3. `failed` Sync attempted but failed.
   4. `skipped` Sync intentionally not performed.

6. `crm.sync_attempts`
   Number of sync attempts made.

7. `crm.last_sync_attempt_at`
   Timestamp of most recent sync attempt.

8. `crm.last_error`
   Error object if sync failed, with code and message.

---

# 11) dealers schema explanation

## dealers root document

1. `dealer_id`  
   Unique dealer id.

2. `schema_version`  
   Version integer for future migrations.

3. `dealer_name`  
   Public facing dealer name.

4. `status`  
   Dealer availability.

   Meanings:
   1. `active` Eligible for routing.
   2. `paused` Temporarily excluded from routing.
   3. `inactive` Not eligible for routing.

5. `tier`  
   Categorization such as top50 or standard.

   Meanings:
   1. `top50` High priority tier.
   2. `standard` Default tier.

6. `website_url`  
   Dealer website.

7. `notes`  
   Internal notes.

## delivery_prefs

1. `delivery_prefs.dealer_delivery_enabled`  
   Whether dealer emails should be sent.

2. `delivery_prefs.delivery_mode`  
   Delivery method. In V1 this is typically email.

3. `delivery_prefs.email_to`  
   Primary recipients.

4. `delivery_prefs.email_cc`  
   Carbon copy recipients.

5. `delivery_prefs.webhook_url`  
   Optional future path for automated delivery.

6. `delivery_prefs.allow_lead_cap`  
   Whether caps are enforced.

7. `delivery_prefs.daily_lead_cap`  
   Max leads per day.

## routing_prefs

1. `routing_prefs.priority_weight`  
   Global preference for tie breaks. Lower is better.

2. `routing_prefs.exclusive_zips_allowed`  
   Whether this dealer may be assigned exclusive zips.

## timestamps

1. `created_at`  
   Dealer creation time.

2. `updated_at`  
   Dealer last update time.

---

# 12) dealerNumbers explanation

1. `dealerNumbers/{phoneE164}.phone_e164`  
   The dialed number in E.164.

2. `dealerNumbers/{phoneE164}.dealer_id`  
   Dealer receiving leads from this number.

3. `dealerNumbers/{phoneE164}.label`  
   Human label for the number.

4. `dealerNumbers/{phoneE164}.active`  
   Whether the mapping is active.

5. `created_at` and `updated_at`  
   Administrative timestamps.

---

# 13) zipCoverage explanation

1. `zipCoverage/{stateZip}.state`  
   Two letter state code.

2. `zipCoverage/{stateZip}.zip5`  
   Five digit zip code.

3. `zipCoverage/{stateZip}.candidates`  
   Ordered candidate list where the lowest priority wins.

4. `candidates[].dealer_id`  
   Candidate dealer id.

5. `candidates[].priority`  
   Priority number. Lower means higher preference.

6. `candidates[].exclusive`  
   If true, dealer should win for the zip when available.

7. `updated_at`  
   When coverage last changed.

---

# 14) leadEvents explanation

1. `leadEvents/{eventId}.lead_id`  
   The lead being recorded.

2. `event_type`  
   The type of event, such as routed or delivered.

3. `actor_type` and `actor_id`  
   Who caused the event.

4. `details`  
   Event specific JSON.

5. `created_at`  
   Event time.

---

# 15) Why routing and delivery markers are timestamps

Routing and delivery use `assignment.routed_at` and `delivery.delivered_at` instead of a boolean processed flag.

This prevents accidental resets, supports safe retries, and keeps automation steps independent.
