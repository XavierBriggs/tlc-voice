// Firebase Cloud Function: Lead Routing on Prequalification
// Triggers when a lead's status changes to 'prequalified'

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const db = getFirestore();

export const onLeadPrequalified = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const leadId = event.params.leadId;

  // Only trigger when status changes TO prequalified
  if (before.status === after.status) return;
  if (after.status !== 'prequalified') return;
  
  // Skip if already routed
  if (after.assignedDealerId) return;

  console.log(`[ROUTE] Lead ${leadId} is prequalified, routing...`);

  // 1. Check for dealer attribution first
  if (after.source?.tracking?.dealer_id) {
    const dealerId = after.source.tracking.dealer_id;
    const dealerDoc = await db.collection('dealers').doc(dealerId).get();
    
    if (dealerDoc.exists && dealerDoc.data().status === 'active') {
      await assignDealer(leadId, dealerId, 'dealer_sourced', 'Attribution locked');
      await deliverLead(leadId, dealerDoc.data());
      return;
    }
  }

  // 2. Geo route by ZIP
  const zip = after.homeAndSite?.property_zip;
  if (!zip) {
    console.error(`[ROUTE] Lead ${leadId} missing ZIP, cannot route`);
    return;
  }

  const dealersSnapshot = await db.collection('dealers')
    .where('status', '==', 'active')
    .where('coverage_zips', 'array-contains', zip)
    .orderBy('priority_weight', 'desc')
    .limit(1)
    .get();

  if (dealersSnapshot.empty) {
    console.error(`[ROUTE] No dealers cover ZIP ${zip}`);
    await logEvent(leadId, 'routing_failed', { reason: `No dealers cover ZIP ${zip}` });
    return;
  }

  const dealer = dealersSnapshot.docs[0];
  await assignDealer(leadId, dealer.id, 'geo_routed', `ZIP ${zip}`);
  await deliverLead(leadId, dealer.data());
});

async function assignDealer(leadId, dealerId, assignmentType, reason) {
  await db.collection('leads').doc(leadId).update({
    assignedDealerId: dealerId,
    assignmentType,
    assignmentReason: reason,
    routedAt: FieldValue.serverTimestamp(),
    status: 'routed',
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logEvent(leadId, 'dealer_assignment_created', {
    dealer_id: dealerId,
    assignment_type: assignmentType,
    reason,
  });

  console.log(`[ROUTE] Lead ${leadId} → ${dealerId} (${assignmentType})`);
}

async function deliverLead(leadId, dealer) {
  // For now, just mark as delivered
  // Later: send email, call webhook, etc.
  
  await db.collection('leads').doc(leadId).update({
    dealerDeliveryStatus: 'delivered',
    dealerDeliveredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logEvent(leadId, 'dealer_delivery_succeeded', {
    dealer_id: dealer.dealer_id,
    method: dealer.lead_delivery_method,
  });

  console.log(`[DELIVER] Lead ${leadId} delivered to ${dealer.dealer_name}`);
}

async function logEvent(leadId, eventType, payload) {
  const eventId = `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  
  await db.collection('leads').doc(leadId)
    .collection('events').doc(eventId).set({
      eventId,
      leadId,
      eventType,
      eventAt: FieldValue.serverTimestamp(),
      actorType: 'system',
      payload,
    });
}
