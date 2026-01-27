# TLC System Flow Diagram V1

This document describes the complete operational flow of the TLC system using the Firestore schema. It explains the automation triggers, idempotency guards, and the human handling lifecycle.

## High level architecture

The system follows an event driven workflow:

1. Intake channels create or update a canonical lead document
2. Routing automation assigns a dealer once the lead is routable
3. Delivery automation sends notifications once the lead is prequalified
4. Humans claim and work the lead inside TLC

---

# 1) Flow diagram

```text
┌──────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│ Voice Agent Intake    │        │ Web Form Intake       │        │ Future App Intake     │
│ channel: voice        │        │ channel: web          │        │ channel: app          │
└───────────┬──────────┘        └───────────┬──────────┘        └───────────┬──────────┘
            │                                │                                │
            │ create or update               │ create or update               │ create or update
            │ leads/{leadId}                 │ leads/{leadId}                 │ leads/{leadId}
            ▼                                ▼                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Firestore leads/{leadId}                                 │
│ status: collecting or prequalified                                                       │
│ source.attribution.locked_dealer_id may be set                                           │
│ assignment.routed_at is null until routing completes                                     │
│ delivery.delivered_at is null until delivery completes                                   │
└───────────────────────────────────────────────────────┬──────────────────────────────────┘
                                                        │
                                                        │ onWrite trigger
                                                        ▼
                                  ┌───────────────────────────────────────────────┐
                                  │ routeLeadIfNeeded                             │
                                  │ Guards: IF                                    │
                                  │ 1) not terminal status                        │
                                  │ 2) assignment.routed_at is null               │
                                  │ 3) property_state and property_zip exist      │
                                  │ Effects:                                      │
                                  │ 1) choose dealer                              │
                                  │ 2) write assignment fields                    │
                                  └───────────────────────────┬───────────────────┘
                                                              │
                                                              │ onWrite trigger
                                                              ▼
                                  ┌───────────────────────────────────────────────┐
                                  │ deliverLeadIfNeeded                           │
                                  │ Guards:                                       │
                                  │ 1) status is prequalified                     │
                                  │ 2) assignment.assigned_dealer_id exists       │
                                  │ 3) delivery.status is pending                 │
                                  │ 4) delivery.delivered_at is null              │
                                  │ Effects:                                      │
                                  │ 1) email TLC team                             │
                                  │ 2) email dealer if enabled                    │
                                  │ 3) mark delivered or failed                   │
                                  └───────────────────────────┬───────────────────┘
                                                              │
                                                              ▼
                                  ┌───────────────────────────────────────────────┐
                                  │ Human workflow                                │
                                  │ 1) claim lead                                 │
                                  │ 2) contact borrower                           │
                                  │ 3) close outcome                              │
                                  │ Writes to human fields                        │
                                  └───────────────────────────────────────────────┘
```

---

# 2) Intake flows

## 2.1 Voice intake with dealer assigned number

Example:
1. Borrower calls dealer assigned number +15125550101
2. Twilio provides the dialed number as the To field
3. The system looks up `dealerNumbers/+15125550101` to get dealer_id

Write behavior:
1. Create lead with `source.entrypoint = dealer_phone`
2. Set `source.attribution.inbound_dealer_number = +15125550101`
3. Set `source.attribution.locked_dealer_id = dlr_001`
4. Set `source.attribution.locked_reason = dealer_phone`
5. Continue updating applicant and questionnaire fields during the call

Key outcome:
Routing will prefer the locked dealer even if zipCoverage would choose a different dealer.

## 2.2 Voice intake with TLC global number

Example:
1. Borrower calls TLC global number
2. The dialed number is not present in dealerNumbers
3. The system cannot lock a dealer from the dialed number

Write behavior:
1. Create lead with `source.entrypoint = tlc_phone`
2. Do not set `locked_dealer_id`
3. Route later using zipCoverage once property zip and state are collected

## 2.3 Web intake from a dealer link

Example:
1. Borrower clicks a dealer website apply link with `?ref=<key_hash>`
2. Intake resolves `dealerAttributionKeys/{key_hash}` to get dealer_id
3. Intake sets a lock using the resolved dealer_id

Write behavior:
1. Create lead with `source.entrypoint = dealer_link`
2. Set `source.attribution.dealer_id_from_referral`
3. Set `source.attribution.locked_dealer_id`
4. Set `source.attribution.locked_reason = dealer_link`

## 2.4 Web intake from the TLC website

Example:
1. Borrower completes a TLC direct form
2. No dealer lock information exists

Write behavior:
1. Create lead with `source.entrypoint = tlc_site`
2. Route by zipCoverage after property zip and state are collected

---

# 3) Routing flow

Routing runs as soon as the lead is routable, which means property zip and state exist.

## 3.1 Routing guard conditions

Routing runs only when all are true:

1. `status` is not `ineligible`, `do_not_contact`, or `closed`
2. `assignment.routed_at` is null
3. `home_and_site.property_state` exists
4. `home_and_site.property_zip` exists

## 3.2 Routing decision order

Routing chooses a dealer with these rules, in order:

1. Dealer lock rule  
   If `source.attribution.locked_dealer_id` exists and the dealer is active, route to that dealer.

2. Zip coverage rule  
   If no lock exists, read `zipCoverage/{stateZip}` and select the best active candidate.

3. Fallback rule  
   If no candidates exist, route to a default dealer id or internal TLC queue.

## 3.3 Routing write effects

Routing writes these fields:

1. `assignment.assigned_dealer_id`
2. `assignment.assignment_type`
3. `assignment.assignment_reason`
4. `assignment.routed_at` as the processing marker

Routing should also append an event record to `leadEvents` describing the decision.

---

# 4) Delivery flow

Delivery runs once the lead is prequalified and assigned.

## 4.1 Delivery guard conditions

Delivery runs only when all are true:

1. `status` equals `prequalified`
2. `assignment.assigned_dealer_id` exists
3. `delivery.status` equals `pending`
4. `delivery.delivered_at` is null

## 4.2 Delivery actions

Delivery performs these actions:

1. Email the TLC team always
2. Email the dealer only when `dealers/{dealerId}.delivery_prefs.dealer_delivery_enabled` is true
3. Write delivery results back to the lead

## 4.3 Delivery write effects

On success:
1. Set `delivery.status = delivered`
2. Set `delivery.delivered_at` as the processing marker
3. Set `delivery.tlc_team_notified = true`

On failure:
1. Set `delivery.status = failed`
2. Update `delivery.last_error`
3. Increment `delivery.attempts`

Delivery should append a `leadEvents` record describing the attempt.

---

# 5) Human workflow

Humans do not change routing and delivery markers. They operate in parallel with them.

## 5.1 Claim lead

A loan officer claims a lead using a Firestore transaction:

1. Verify `human.state` is `unclaimed`
2. Set `human.state = claimed`
3. Set `human.owner_user_id` and `human.owner_name`
4. Set `human.claimed_at` and `human.last_touched_at`

This prevents two users from claiming the same lead.

## 5.2 Work lead

As the loan officer contacts the borrower:

1. Set `human.state = in_progress`
2. Update `human.first_contacted_at` if missing
3. Increment `human.contact_attempts`
4. Update `human.last_contact_attempt_at` and `human.last_touched_at`

## 5.3 Close lead

When the lead is resolved:

1. Set `human.state = closed`
2. Set `human.outcome` and optional `human.outcome_notes`
3. Optionally set `status = closed` as the overall business state

---

# 6) Idempotency and at least once behavior

Firestore triggers may run more than once. This system is safe because:

1. Routing runs only when `assignment.routed_at` is null
2. Delivery runs only when `delivery.delivered_at` is null and delivery is pending
3. Claiming uses transactions to prevent race conditions
4. leadEvents are append only and do not affect control flow

---

# 7) End to end example timeline

Example scenario: Borrower calls a dealer assigned number.

1. Voice creates lead with locked dealer id
2. Voice collects property zip and state
3. Routing trigger assigns locked dealer and sets `assignment.routed_at`
4. Voice completes prequalification and sets `status = prequalified`
5. Delivery trigger emails TLC team and dealer, sets `delivery.delivered_at`
6. Loan officer claims and works the lead, then closes outcome
