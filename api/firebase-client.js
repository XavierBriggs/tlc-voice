// api/firebase-client.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildLeadPayload } from '../lib/state-machine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin (only once)
if (getApps().length === 0) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production: JSON string in env var
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } else {
    // Local dev: JSON file in project root
    const serviceAccountPath = join(__dirname, '..', 'hestia-service-account.json');
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

const db = getFirestore();

function generateId(prefix = 'lead') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Recursively convert undefined values to null for Firestore compatibility.
 * This preserves the intent that a field exists but has no value,
 * rather than silently dropping undefined fields. UPDATE TO SOMETHING MORE DESCRIPTIVE like NOT_PROVIDED or EMPTY.
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

  async createLead(state) {
    const payload = buildLeadPayload(state);
    const idempotencyKey = payload.idempotency_key;

    // Check for existing lead with same idempotency key
    const existing = await db.collection('leads')
      .where('idempotencyKey', '==', idempotencyKey)
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

    // Create new lead
    const leadId = generateId('lead');
    const lead = {
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'new',

      // Source
      source: {
        channel: payload.source.channel,
        entrypoint: payload.source.entrypoint,
        sessionId: payload.source.session_id,
        tracking: payload.source.tracking || null,
      },

      // Assignment (null until routed)
      assignedDealerId: null,
      assignmentType: null,
      routedAt: null,

      // Delivery
      dealerDeliveryStatus: 'pending',

      // Data
      applicant: payload.applicant,
      homeAndSite: payload.home_and_site,
      financial: payload.financial_snapshot,
      notes: payload.notes,
    };

    await db.collection('leads').doc(leadId).set(sanitizeForFirestore(lead));
    
    // Log creation event
    await this.logEvent(leadId, {
      event_type: 'lead_created',
      actor_type: 'ai',
      payload_json: { source: payload.source },
    });

    this._log('createLead (new)', { lead_id: leadId });
    return { lead_id: leadId, status: 'new', created: true };
  }

  async updateLead(leadId, state) {
    const payload = buildLeadPayload(state);
    const docRef = db.collection('leads').doc(leadId);

    // Firestore merge update
    await docRef.update(sanitizeForFirestore({
      updatedAt: FieldValue.serverTimestamp(),
      applicant: payload.applicant,
      homeAndSite: payload.home_and_site,
      financial: payload.financial_snapshot,
      notes: payload.notes,
    }));

    await this.logEvent(leadId, {
      event_type: 'lead_updated',
      actor_type: 'ai',
      payload_json: { fields_updated: Object.keys(payload) },
    });

    this._log('updateLead', { lead_id: leadId });
    return { success: true };
  }

  async getLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    if (!doc.exists) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    return { lead_id: doc.id, ...doc.data() };
  }

  async setStatus(leadId, status, reason = null) {
    const docRef = db.collection('leads').doc(leadId);
    const doc = await docRef.get();
    const previousStatus = doc.data()?.status;

    await docRef.update(sanitizeForFirestore({
      status,
      statusReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    }));

    await this.logEvent(leadId, {
      event_type: 'status_changed',
      actor_type: 'ai',
      payload_json: { previous_status: previousStatus, new_status: status, reason },
    });

    this._log('setStatus', { lead_id: leadId, status });
    return { success: true, previous_status: previousStatus };
  }

  async routeLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    const lead = doc.data();

    if (lead.assignedDealerId) {
      return { success: true, assigned_dealer_id: lead.assignedDealerId, already_routed: true };
    }

    // Check attribution-based routing
    if (lead.source?.tracking?.dealer_id) {
      const dealerId = lead.source.tracking.dealer_id;
      
      await db.collection('leads').doc(leadId).update(sanitizeForFirestore({
        assignedDealerId: dealerId,
        assignmentType: 'dealer_sourced',
        routedAt: FieldValue.serverTimestamp(),
        status: 'routed',
        updatedAt: FieldValue.serverTimestamp(),
      }));

      await this.logEvent(leadId, {
        event_type: 'dealer_assignment_created',
        actor_type: 'system',
        payload_json: { dealer_id: dealerId, assignment_type: 'dealer_sourced' },
      });

      this._log('routeLead', { lead_id: leadId, dealer_id: dealerId });
      return { success: true, assigned_dealer_id: dealerId, assignment_type: 'dealer_sourced' };
    }

    // Geo routing would go here - for now just return needs routing
    return { success: false, error: 'Geo routing not implemented - needs dealer coverage setup' };
  }

  async deliverLead(leadId) {
    const doc = await db.collection('leads').doc(leadId).get();
    const lead = doc.data();

    if (!lead.assignedDealerId) {
      return { success: false, error: 'No dealer assigned' };
    }

    if (lead.dealerDeliveryStatus === 'delivered') {
      return { success: true, already_delivered: true };
    }

    await db.collection('leads').doc(leadId).update(sanitizeForFirestore({
      dealerDeliveryStatus: 'delivered',
      dealerDeliveredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }));

    await this.logEvent(leadId, {
      event_type: 'dealer_delivery_succeeded',
      actor_type: 'system',
      payload_json: { dealer_id: lead.assignedDealerId },
    });

    this._log('deliverLead', { lead_id: leadId });
    return { success: true, dealer_id: lead.assignedDealerId };
  }

  // ===========================================================================
  // EVENT OPERATIONS
  // ===========================================================================

  async logEvent(leadId, eventData) {
    const eventId = generateId('evt');
    const event = {
      eventId,
      leadId,
      eventType: eventData.event_type,
      eventAt: FieldValue.serverTimestamp(),
      actorType: eventData.actor_type || 'system',
      payload: eventData.payload_json || {},
    };

    await db.collection('leads').doc(leadId)
      .collection('events').doc(eventId).set(sanitizeForFirestore(event));

    return { event_id: eventId };
  }

  async getEvents(leadId) {
    const snapshot = await db.collection('leads').doc(leadId)
      .collection('events')
      .orderBy('eventAt', 'asc')
      .get();

    return snapshot.docs.map(doc => doc.data());
  }

  // ===========================================================================
  // DEALER OPERATIONS
  // ===========================================================================

  async lookupDealerByTrackingNumber(dialedNumber) {
    const snapshot = await db.collection('dealerTrackingNumbers')
      .where('trackingNumber', '==', dialedNumber)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const tracking = snapshot.docs[0].data();
    const dealerDoc = await db.collection('dealers').doc(tracking.dealerId).get();
    
    if (!dealerDoc.exists) return null;

    return {
      dealer_id: tracking.dealerId,
      dealer_name: dealerDoc.data().dealerName,
      tracking_number: dialedNumber,
    };
  }

  // ===========================================================================
  // DEBUG (for parity with mock)
  // ===========================================================================

  async getAllLeads() {
    const snapshot = await db.collection('leads').orderBy('createdAt', 'desc').limit(50).get();
    return snapshot.docs.map(doc => ({ lead_id: doc.id, ...doc.data() }));
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