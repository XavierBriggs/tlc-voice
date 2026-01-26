/**
 * Firestore Hestia API Client
 * 
 * Firestore implementation using TLC Firestore Schemas V1.
 * Uses snake_case field names for Firestore compatibility.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildLeadPayload, buildLeadUpdatePayload } from '../lib/state-machine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================================================
// FIREBASE INITIALIZATION
// =============================================================================

if (getApps().length === 0) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production: JSON string in env var
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } else {
    // Local dev: JSON file in project root
    const serviceAccountPath = join(__dirname, '..', 'hestia-service-account.json');
    if (existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      // Initialize without credentials (will use default credentials in cloud)
      initializeApp();
    }
  }
}

const db = getFirestore();

// Default dealer for fallback routing
const DEFAULT_DEALER_ID = 'home_nation';

// =============================================================================
// HELPERS
// =============================================================================

function generateId(prefix = 'lead') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Recursively convert undefined values to null for Firestore compatibility.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  
  // Preserve FieldValue instances (serverTimestamp, etc.)
  if (obj.constructor && obj.constructor.name === 'FieldValue') return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeForFirestore(value);
  }
  return result;
}

// =============================================================================
// CLIENT CLASS
// =============================================================================

export class FirestoreHestiaClient {
  constructor(options = {}) {
    this.verbose = options.verbose ?? true;
  }

  _log(operation, data) {
    if (this.verbose) {
      console.log(`[FIRESTORE] ${operation}:`, JSON.stringify(data));
    }
  }

  // ===========================================================================
  // LEAD OPERATIONS
  // ===========================================================================

  /**
   * Create a new lead using TLC Firestore Schemas V1
   */
  async createLead(state) {
    const payload = buildLeadPayload(state);
    const idempotencyKey = `voice_${state.callSid}`;

    // Check for existing lead with same idempotency key
    const existing = await db.collection('leads')
      .where('_idempotency_key', '==', idempotencyKey)
      .limit(1)
      .get();

    if (!existing.empty) {
      const doc = existing.docs[0];
      this._log('createLead (existing)', { lead_id: doc.id });
      return {
        lead_id: doc.id,
        status: doc.data().status,
        created: false,
      };
    }

    // Create new lead with full schema
    const leadId = generateId('lead');
    
    const lead = {
      lead_id: leadId,
      _idempotency_key: idempotencyKey,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      ...payload,
    };

    await db.collection('leads').doc(leadId).set(sanitizeForFirestore(lead));
    
    // Log creation event to top-level leadEvents collection
    await this.logEvent(leadId, {
      event_type: 'created',
      actor_type: 'system',
      details: {
        channel: payload.source.channel,
        entrypoint: payload.source.entrypoint,
      },
    });

    this._log('createLead (new)', { lead_id: leadId, status: lead.status });
    return { lead_id: leadId, status: lead.status, created: true };
  }

  /**
   * Update an existing lead with progressive enrichment
   */
  async updateLead(leadId, state) {
    const updates = buildLeadUpdatePayload(state);
    const docRef = db.collection('leads').doc(leadId);

    await docRef.update(sanitizeForFirestore({
      updated_at: FieldValue.serverTimestamp(),
      ...updates,
    }));

    this._log('updateLead', { lead_id: leadId });
    return { success: true };
  }

  /**
   * Get a lead by ID
   */
  async getLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    if (!doc.exists) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    return doc.data();
  }

  /**
   * Set lead status with optional reason
   */
  async setStatus(leadId, status, statusReason = null) {
    const docRef = db.collection('leads').doc(leadId);
    const doc = await docRef.get();
    const previousStatus = doc.data()?.status;

    await docRef.update(sanitizeForFirestore({
      status: status,
      status_reason: statusReason,
      updated_at: FieldValue.serverTimestamp(),
    }));

    await this.logEvent(leadId, {
      event_type: 'status_changed',
      actor_type: 'system',
      details: {
        old_status: previousStatus,
        new_status: status,
        reason: statusReason,
      },
    });

    this._log('setStatus', { lead_id: leadId, status });
    return { success: true, previous_status: previousStatus };
  }

  /**
   * Route a lead to a dealer
   * Note: In production, this is handled by the routeLeadIfNeeded Cloud Function
   */
  async routeLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    const lead = doc.data();

    // Already routed?
    if (lead.assignment?.routed_at) {
      return {
        success: true,
        assigned_dealer_id: lead.assignment.assigned_dealer_id,
        assignment_type: lead.assignment.assignment_type,
        already_routed: true,
      };
    }

    let assignedDealerId = null;
    let assignmentType = null;
    let assignmentReason = null;

    // Rule 1: Check for dealer lock
    const lockedDealerId = lead.source?.attribution?.locked_dealer_id;
    if (lockedDealerId) {
      const dealerDoc = await db.collection('dealers').doc(lockedDealerId).get();
      if (dealerDoc.exists && dealerDoc.data().status === 'active') {
        assignedDealerId = lockedDealerId;
        assignmentType = 'dealer_sourced';
        assignmentReason = lead.source.attribution.locked_reason === 'dealer_phone'
          ? 'dealer_number'
          : 'referral_lock';
      }
    }

    // Rule 2: Zip coverage lookup
    if (!assignedDealerId) {
      const state = lead.home_and_site?.property_state;
      const zip = lead.home_and_site?.property_zip;
      
      if (state && zip) {
        const coverageId = `${state}_${zip}`;
        const coverageDoc = await db.collection('zipCoverage').doc(coverageId).get();
        
        if (coverageDoc.exists) {
          const candidates = coverageDoc.data().candidates || [];
          const sortedCandidates = [...candidates].sort((a, b) => a.priority - b.priority);
          
          for (const candidate of sortedCandidates) {
            const dealerDoc = await db.collection('dealers').doc(candidate.dealer_id).get();
            if (dealerDoc.exists && dealerDoc.data().status === 'active') {
              assignedDealerId = candidate.dealer_id;
              assignmentType = 'geo_routed';
              assignmentReason = 'zip_match';
              break;
            }
          }
        }
      }
    }

    // Rule 3: Fallback
    if (!assignedDealerId) {
      assignedDealerId = DEFAULT_DEALER_ID;
      assignmentType = 'geo_routed';
      assignmentReason = 'fallback';
    }

    // Update lead using dot notation for nested fields
    await db.collection('leads').doc(leadId).update({
      'assignment.assigned_dealer_id': assignedDealerId,
      'assignment.assignment_type': assignmentType,
      'assignment.assignment_reason': assignmentReason,
      'assignment.routed_at': FieldValue.serverTimestamp(),
      'assignment.routing_attempt_count': FieldValue.increment(1),
      'assignment.routing_last_attempt_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });

    await this.logEvent(leadId, {
      event_type: 'routed',
      actor_type: 'system',
      details: {
        assigned_dealer_id: assignedDealerId,
        assignment_type: assignmentType,
        assignment_reason: assignmentReason,
      },
    });

    this._log('routeLead', { lead_id: leadId, dealer_id: assignedDealerId });
    return {
      success: true,
      assigned_dealer_id: assignedDealerId,
      assignment_type: assignmentType,
      assignment_reason: assignmentReason,
    };
  }

  /**
   * Deliver a lead (send notifications)
   * Note: In production, this is handled by the deliverLeadIfNeeded Cloud Function
   */
  async deliverLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    const lead = doc.data();

    if (!lead.assignment?.assigned_dealer_id) {
      return { success: false, error: 'No dealer assigned' };
    }

    if (lead.delivery?.delivered_at) {
      return { success: true, already_delivered: true };
    }

    const dealerId = lead.assignment.assigned_dealer_id;
    const dealerDoc = await db.collection('dealers').doc(dealerId).get();
    const dealer = dealerDoc.exists ? dealerDoc.data() : null;

    await db.collection('leads').doc(leadId).update({
      'delivery.status': 'delivered',
      'delivery.delivered_at': FieldValue.serverTimestamp(),
      'delivery.tlc_team_notified': true,
      'delivery.dealer_delivery_enabled': dealer?.delivery_prefs?.dealer_delivery_enabled || false,
      'delivery.attempts': FieldValue.increment(1),
      'delivery.last_attempt_at': FieldValue.serverTimestamp(),
      'updated_at': FieldValue.serverTimestamp(),
    });

    await this.logEvent(leadId, {
      event_type: 'delivered',
      actor_type: 'system',
      details: {
        dealer_id: dealerId,
        tlc_notified: true,
        dealer_notified: dealer?.delivery_prefs?.dealer_delivery_enabled || false,
      },
    });

    this._log('deliverLead', { lead_id: leadId, dealer_id: dealerId });
    return { success: true, dealer_id: dealerId };
  }

  // ===========================================================================
  // DEALER OPERATIONS
  // ===========================================================================

  /**
   * Look up dealer by tracking phone number (dealerNumbers collection)
   */
  async lookupDealerByTrackingNumber(phoneE164) {
    const doc = await db.collection('dealerNumbers').doc(phoneE164).get();
    
    if (!doc.exists || !doc.data().active) {
      return null;
    }

    const dealerId = doc.data().dealer_id;
    const dealerDoc = await db.collection('dealers').doc(dealerId).get();
    
    if (!dealerDoc.exists || dealerDoc.data().status !== 'active') {
      return null;
    }

    return {
      dealer_id: dealerId,
      dealer_name: dealerDoc.data().dealer_name,
    };
  }

  /**
   * Get zip coverage for routing
   */
  async getZipCoverage(state, zip) {
    const coverageId = `${state}_${zip}`;
    const doc = await db.collection('zipCoverage').doc(coverageId).get();
    return doc.exists ? doc.data() : null;
  }

  /**
   * Get a dealer by ID
   */
  async getDealer(dealerId) {
    const doc = await db.collection('dealers').doc(dealerId).get();
    return doc.exists ? doc.data() : null;
  }

  // ===========================================================================
  // EVENT OPERATIONS
  // ===========================================================================

  /**
   * Log an event to top-level leadEvents collection
   */
  async logEvent(leadId, eventData) {
    const eventId = generateId('evt');
    
    const event = {
      event_id: eventId,
      lead_id: leadId,
      event_type: eventData.event_type,
      actor_type: eventData.actor_type || 'system',
      actor_id: eventData.actor_id || null,
      details: eventData.details || {},
      created_at: FieldValue.serverTimestamp(),
    };

    await db.collection('leadEvents').doc(eventId).set(sanitizeForFirestore(event));

    return { event_id: eventId };
  }

  /**
   * Get all events for a lead
   */
  async getEvents(leadId) {
    const snapshot = await db.collection('leadEvents')
      .where('lead_id', '==', leadId)
      .orderBy('created_at', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data());
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  async getAllLeads(limit = 50) {
    const snapshot = await db.collection('leads')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => doc.data());
  }

  async getStats() {
    const snapshot = await db.collection('leads').get();
    const leadsByStatus = {};
    
    snapshot.docs.forEach(doc => {
      const status = doc.data().status;
      leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
    });

    return { total_leads: snapshot.size, leads_by_status: leadsByStatus };
  }
}

export default FirestoreHestiaClient;
