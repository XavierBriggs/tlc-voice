// functions/index.js
// TLC Voice Agent Cloud Functions
//
// Functions:
// 1. onLeadPrequalified - Route lead to dealer (attribution or geo)
// 2. onLeadRouted - Send email notifications + deliver to dealer
// 3. syncLeadToSimpleNexus - Push lead to SimpleNexus CRM
//
// Setup:
// 1. npm install
// 2. Configure secrets (see README.md)
// 3. firebase deploy --only functions

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineString, defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const db = getFirestore();

// =============================================================================
// CONFIGURATION
// =============================================================================

// Email Configuration (for Trigger Email extension)
const LEAD_NOTIFICATION_EMAILS = defineString('LEAD_NOTIFICATION_EMAILS', {
  description: 'Comma-separated list of email addresses to notify on new leads',
  default: '',
});
const DEALER_EMAILS_ENABLED = defineString('DEALER_EMAILS_ENABLED', {
  description: 'Set to "true" to send lead notifications to dealers',
  default: 'false',
});

// SimpleNexus Configuration
const SIMPLENEXUS_API_TOKEN = defineSecret('SIMPLENEXUS_API_TOKEN');
const SIMPLENEXUS_COMPANY_ID = defineString('SIMPLENEXUS_COMPANY_ID', { default: '' });
const SIMPLENEXUS_DEFAULT_LO_ID = defineString('SIMPLENEXUS_DEFAULT_LO_ID', { default: '' });
const SIMPLENEXUS_API_BASE = defineString('SIMPLENEXUS_API_BASE', { 
  default: 'https://api.simplenexus.com/v1' 
});
const SIMPLENEXUS_ENABLED = defineString('SIMPLENEXUS_ENABLED', { default: 'false' });

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateEventId() {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function logEvent(leadId, eventType, payload) {
  const eventId = generateEventId();
  await db.collection('leads').doc(leadId)
    .collection('events').doc(eventId).set({
      eventId,
      leadId,
      eventType,
      eventAt: FieldValue.serverTimestamp(),
      actorType: 'system',
      payload,
    });
  return eventId;
}

// =============================================================================
// EMAIL FORMATTING
// =============================================================================

function formatLeadEmailHtml(lead, dealer) {
  const applicant = lead.applicant || {};
  const homeAndSite = lead.homeAndSite || {};
  const financial = lead.financial || {};
  
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 16px; color: #2563eb; margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    .field { margin-bottom: 8px; }
    .field-label { font-weight: bold; color: #6b7280; }
    .field-value { color: #111827; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-success { background: #d1fae5; color: #065f46; }
    .badge-info { background: #dbeafe; color: #1e40af; }
    .footer { background: #f3f4f6; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏠 New Prequalified Lead</h1>
    </div>
    <div class="content">
      <div class="section">
        <h2>Contact Information</h2>
        <div class="field"><span class="field-label">Name:</span> <span class="field-value">${applicant.full_name || 'Not provided'}</span></div>
        <div class="field"><span class="field-label">Phone:</span> <span class="field-value">${applicant.phone_e164 || 'Not provided'}</span></div>
        <div class="field"><span class="field-label">Email:</span> <span class="field-value">${applicant.email || 'Not provided'}</span></div>
        <div class="field"><span class="field-label">Preferred Contact:</span> <span class="field-value">${applicant.preferred_contact_method || 'Not specified'}</span></div>
      </div>
      <div class="section">
        <h2>Property Details</h2>
        <div class="field"><span class="field-label">Location:</span> <span class="field-value">${homeAndSite.property_zip || '?'}, ${homeAndSite.property_state || '?'}</span></div>
        <div class="field"><span class="field-label">Land Status:</span> <span class="field-value">${homeAndSite.land_status || 'Not specified'}</span></div>
        <div class="field"><span class="field-label">Home Type:</span> <span class="field-value">${homeAndSite.home_type || 'Not specified'}</span></div>
        <div class="field"><span class="field-label">Timeline:</span> <span class="badge badge-info">${homeAndSite.timeline || 'Not specified'}</span></div>
      </div>
      <div class="section">
        <h2>Financial Snapshot</h2>
        <div class="field"><span class="field-label">Credit Range:</span> <span class="field-value">${financial.credit_band_self_reported || 'Not provided'}</span></div>
        <div class="field"><span class="field-label">Recent Bankruptcy:</span> <span class="field-value">${financial.has_recent_bankruptcy === true ? 'Yes' : financial.has_recent_bankruptcy === false ? 'No' : 'Not disclosed'}</span></div>
      </div>
      ${dealer ? `
      <div class="section">
        <h2>Assigned Dealer</h2>
        <div class="field"><span class="field-label">Dealer:</span> <span class="field-value">${dealer.dealer_name}</span></div>
      </div>
      ` : ''}
      ${lead.notes?.free_text ? `
      <div class="section">
        <h2>Notes</h2>
        <p>${lead.notes.free_text}</p>
      </div>
      ` : ''}
    </div>
    <div class="footer">
      <p>Lead ID: ${lead.lead_id || 'N/A'} | Source: ${lead.source?.channel || 'Unknown'}</p>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// FUNCTION 1: Route Lead on Prequalified
// =============================================================================

export const onLeadPrequalified = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const leadId = event.params.leadId;

  if (before.status === after.status) return;
  if (after.status !== 'prequalified') return;
  if (after.assignedDealerId) return;

  console.log(`[ROUTE] Lead ${leadId} is prequalified, routing...`);

  try {
    // 1. Check for dealer attribution
    if (after.source?.tracking?.dealer_id) {
      const dealerId = after.source.tracking.dealer_id;
      const dealerDoc = await db.collection('dealers').doc(dealerId).get();
      
      if (dealerDoc.exists && dealerDoc.data().status === 'active') {
        await db.collection('leads').doc(leadId).update({
          assignedDealerId: dealerId,
          assignmentType: 'dealer_sourced',
          routedAt: FieldValue.serverTimestamp(),
          status: 'routed',
          updatedAt: FieldValue.serverTimestamp(),
        });
        await logEvent(leadId, 'dealer_assignment_created', { dealer_id: dealerId, type: 'dealer_sourced' });
        return;
      }
    }

    // 2. Geo route by ZIP
    const zip = after.homeAndSite?.property_zip;
    const state = after.homeAndSite?.property_state;
    
    if (!zip && !state) {
      await logEvent(leadId, 'routing_failed', { reason: 'Missing ZIP and state' });
      return;
    }

    let dealersSnapshot;
    let assignmentType = 'geo_routed';
    let assignmentReason = '';

    // Try ZIP-based routing first
    if (zip) {
      dealersSnapshot = await db.collection('dealers')
        .where('status', '==', 'active')
        .where('coverage_zips', 'array-contains', zip)
        .orderBy('priority_weight', 'desc')
        .limit(1)
        .get();
      assignmentReason = `ZIP ${zip}`;
    }

    // Fallback to state-based routing if no ZIP match
    if ((!dealersSnapshot || dealersSnapshot.empty) && state) {
      console.log(`[ROUTE] No ZIP match for ${zip}, trying state ${state}`);
      dealersSnapshot = await db.collection('dealers')
        .where('status', '==', 'active')
        .where('address.state', '==', state.toUpperCase())
        .orderBy('priority_weight', 'desc')
        .limit(1)
        .get();
      assignmentType = 'state_fallback';
      assignmentReason = `State ${state} (no ZIP coverage)`;
    }

    if (!dealersSnapshot || dealersSnapshot.empty) {
      await logEvent(leadId, 'routing_failed', { 
        reason: `No dealers cover ZIP ${zip} or state ${state}` 
      });
      return;
    }

    const dealer = dealersSnapshot.docs[0];
    await db.collection('leads').doc(leadId).update({
      assignedDealerId: dealer.id,
      assignmentType,
      assignmentReason,
      routedAt: FieldValue.serverTimestamp(),
      status: 'routed',
      updatedAt: FieldValue.serverTimestamp(),
    });
    await logEvent(leadId, 'dealer_assignment_created', { 
      dealer_id: dealer.id, 
      type: assignmentType, 
      zip, 
      state 
    });
    
  } catch (error) {
    console.error(`[ROUTE] Error:`, error);
    await logEvent(leadId, 'routing_failed', { reason: error.message });
  }
});

// =============================================================================
// FUNCTION 2: Send Notifications on Routed
// =============================================================================

export const onLeadRouted = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const leadId = event.params.leadId;

  if (before.status === after.status) return;
  if (after.status !== 'routed') return;

  console.log(`[NOTIFY] Lead ${leadId} routed, sending notifications...`);

  let dealer = null;
  if (after.assignedDealerId) {
    const dealerDoc = await db.collection('dealers').doc(after.assignedDealerId).get();
    if (dealerDoc.exists) dealer = { dealer_id: dealerDoc.id, ...dealerDoc.data() };
  }

  const leadData = { lead_id: leadId, ...after };
  const applicant = after.applicant || {};
  
  // Send email via Trigger Email extension
  const emailList = LEAD_NOTIFICATION_EMAILS.value();
  if (emailList) {
    const recipients = emailList.split(',').map(e => e.trim()).filter(Boolean);
    if (recipients.length > 0) {
      await db.collection('mail').add({
        to: recipients,
        message: {
          subject: `🏠 New Lead: ${applicant.full_name || 'Unknown'} - ${after.homeAndSite?.property_zip || 'No ZIP'}`,
          html: formatLeadEmailHtml(leadData, dealer),
        },
      });
      await logEvent(leadId, 'email_notification_queued', { recipients });
    }
  }

  // Deliver to dealer (only if enabled)
  if (dealer?.primary_contact_email && after.dealerDeliveryStatus !== 'delivered') {
    if (DEALER_EMAILS_ENABLED.value() === 'true') {
      await db.collection('mail').add({
        to: [dealer.primary_contact_email],
        message: {
          subject: `[NEW LEAD] ${applicant.full_name || 'Unknown'} - ${after.homeAndSite?.property_zip || ''}`,
          html: formatLeadEmailHtml(leadData, dealer),
        },
      });
      console.log(`[DELIVER] Email sent to dealer: ${dealer.primary_contact_email}`);
      await logEvent(leadId, 'dealer_delivery_succeeded', { dealer_id: dealer.dealer_id, method: 'email' });
    } else {
      console.log(`[DELIVER] Dealer emails DISABLED - would have sent to: ${dealer.primary_contact_email}`);
      await logEvent(leadId, 'dealer_delivery_skipped', { 
        dealer_id: dealer.dealer_id, 
        reason: 'dealer_emails_disabled',
        would_send_to: dealer.primary_contact_email 
      });
    }
    
    await db.collection('leads').doc(leadId).update({
      dealerDeliveryStatus: DEALER_EMAILS_ENABLED.value() === 'true' ? 'delivered' : 'pending_enabled',
      dealerDeliveredAt: FieldValue.serverTimestamp(),
    });
  }
});

// =============================================================================
// FUNCTION 3: Sync to SimpleNexus CRM
// =============================================================================

function mapLeadToSimpleNexus(lead, loanOfficerId) {
  const applicant = lead.applicant || {};
  const homeAndSite = lead.homeAndSite || {};
  const financial = lead.financial || {};
  
  const nameParts = (applicant.full_name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  
  const creditMapping = { 'under_580': 550, '580_619': 600, '620_679': 650, '680_719': 700, '720_plus': 750 };
  
  return {
    loan_officer_id: loanOfficerId,
    borrower: {
      first_name: firstName,
      last_name: lastName || firstName,
      email: applicant.email,
      phone: applicant.phone_e164,
    },
    property: {
      address: { zip: homeAndSite.property_zip, state: homeAndSite.property_state },
    },
    loan: {
      purpose: 'purchase',
      estimated_fico: creditMapping[financial.credit_band_self_reported] || null,
    },
    source: 'TLC Voice Agent',
    external_id: lead.lead_id,
    notes: `Source: ${lead.source?.entrypoint || 'voice'}\nLand: ${homeAndSite.land_status || 'unknown'}\n${lead.notes?.free_text || ''}`,
  };
}

export const syncLeadToSimpleNexus = onDocumentUpdated(
  { document: 'leads/{leadId}', secrets: [SIMPLENEXUS_API_TOKEN] },
  async (event) => {
    if (SIMPLENEXUS_ENABLED.value() !== 'true') return;
    
    const before = event.data.before.data();
    const after = event.data.after.data();
    const leadId = event.params.leadId;

    if (before.status === after.status) return;
    if (after.status !== 'routed') return;
    if (after.simpleNexusLoanId) return;

    console.log(`[SIMPLENEXUS] Syncing lead ${leadId}...`);

    const apiToken = SIMPLENEXUS_API_TOKEN.value();
    const loanOfficerId = SIMPLENEXUS_DEFAULT_LO_ID.value();
    
    if (!apiToken || !loanOfficerId) {
      await logEvent(leadId, 'simplenexus_sync_failed', { reason: 'Not configured' });
      return;
    }

    try {
      const leadData = { lead_id: leadId, ...after };
      const loanData = mapLeadToSimpleNexus(leadData, loanOfficerId);
      
      const response = await fetch(
        `${SIMPLENEXUS_API_BASE.value()}/loan_officers/${loanOfficerId}/loans`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(loanData),
        }
      );

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result = await response.json();
      await db.collection('leads').doc(leadId).update({
        simpleNexusLoanId: result.id || result.loan_id,
        simpleNexusSyncedAt: FieldValue.serverTimestamp(),
      });
      await logEvent(leadId, 'simplenexus_sync_succeeded', { loan_id: result.id });
      
    } catch (error) {
      console.error(`[SIMPLENEXUS] Error:`, error);
      await logEvent(leadId, 'simplenexus_sync_failed', { reason: error.message });
    }
  }
);