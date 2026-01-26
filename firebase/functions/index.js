/**
 * TLC Voice Agent Cloud Functions
 * 
 * Implements the TLC System Flow Diagram V1:
 * 1. routeLeadIfNeeded - Routes lead to dealer when zip+state exist
 * 2. deliverLeadIfNeeded - Sends notifications when lead is prequalified
 * 
 * Both functions use idempotency guards to prevent duplicate processing.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

// Import helpers
import { shouldRoute, routeLead, buildAssignmentUpdate } from './lib/routing.js';
import { shouldDeliver, deliverLead, buildDeliverySuccessUpdate, buildDeliveryFailureUpdate } from './lib/delivery.js';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

// =============================================================================
// CONFIGURATION
// =============================================================================

// TLC team email addresses for lead notifications
const TLC_TEAM_EMAILS = defineString('TLC_TEAM_EMAILS', {
  description: 'Comma-separated list of TLC team email addresses',
  default: '',
});

// =============================================================================
// FUNCTION 1: routeLeadIfNeeded
// =============================================================================

/**
 * Route lead to dealer when guard conditions are met
 * 
 * Trigger: onWrite to leads/{leadId}
 * 
 * Guards (all must be true):
 * 1. status is NOT terminal (ineligible, do_not_contact, closed)
 * 2. assignment.routed_at is null
 * 3. home_and_site.property_state exists
 * 4. home_and_site.property_zip exists
 * 
 * Routing logic (priority order):
 * 1. Dealer lock: If locked_dealer_id exists and dealer is active
 * 2. Zip coverage: Query zipCoverage/{state}_{zip} for candidates
 * 3. Fallback: Route to Home Nation (default dealer)
 */
export const routeLeadIfNeeded = onDocumentWritten('leads/{leadId}', async (event) => {
  const leadId = event.params.leadId;
  
  // Get current document data
  const after = event.data?.after?.data();
  if (!after) {
    // Document was deleted
    return;
  }
  
  // Check guard conditions
  const routeCheck = shouldRoute(after);
  if (!routeCheck.should) {
    // Guards not met - skip silently
    return;
  }
  
  console.log(`[routeLeadIfNeeded] Processing lead ${leadId}`);
  
  try {
    // Route the lead
    const routingResult = await routeLead(leadId, after);
    
    // Build and apply update
    const update = buildAssignmentUpdate(routingResult);
    await db.collection('leads').doc(leadId).update(update);
    
    console.log(`[routeLeadIfNeeded] Lead ${leadId} routed to dealer ${routingResult.dealer_id}`);
    
  } catch (error) {
    console.error(`[routeLeadIfNeeded] Error routing lead ${leadId}:`, error);
    
    // Record the failure but don't throw - let the function complete
    await db.collection('leads').doc(leadId).update({
      'assignment.routing_last_error': {
        code: error.code || 'unknown',
        message: error.message,
      },
      'assignment.routing_attempt_count': FieldValue.increment(1),
      'assignment.routing_last_attempt_at': FieldValue.serverTimestamp(),
    });
  }
});

// =============================================================================
// FUNCTION 2: deliverLeadIfNeeded
// =============================================================================

/**
 * Send lead notifications when guard conditions are met
 * 
 * Trigger: onWrite to leads/{leadId}
 * 
 * Guards (all must be true):
 * 1. status equals 'prequalified'
 * 2. assignment.assigned_dealer_id exists
 * 3. delivery.status equals 'pending'
 * 4. delivery.delivered_at is null
 * 
 * Actions:
 * 1. Always email TLC team
 * 2. Email dealer if delivery_prefs.dealer_delivery_enabled is true
 */
export const deliverLeadIfNeeded = onDocumentWritten('leads/{leadId}', async (event) => {
  const leadId = event.params.leadId;
  
  // Get current document data
  const after = event.data?.after?.data();
  if (!after) {
    // Document was deleted
    return;
  }
  
  // Check guard conditions
  const deliverCheck = shouldDeliver(after);
  if (!deliverCheck.should) {
    // Guards not met - skip silently
    return;
  }
  
  console.log(`[deliverLeadIfNeeded] Processing lead ${leadId}`);
  
  // Parse TLC team emails
  const tlcEmailsStr = TLC_TEAM_EMAILS.value();
  const tlcEmails = tlcEmailsStr
    ? tlcEmailsStr.split(',').map(e => e.trim()).filter(Boolean)
    : [];
  
  try {
    // Deliver the lead
    const deliveryResult = await deliverLead(leadId, after, tlcEmails);
    
    // Build and apply success update
    const update = buildDeliverySuccessUpdate(deliveryResult);
    await db.collection('leads').doc(leadId).update(update);
    
    console.log(`[deliverLeadIfNeeded] Lead ${leadId} delivered successfully`);
    
  } catch (error) {
    console.error(`[deliverLeadIfNeeded] Error delivering lead ${leadId}:`, error);
    
    // Build and apply failure update
    const update = buildDeliveryFailureUpdate(error);
    await db.collection('leads').doc(leadId).update(update);
  }
});
