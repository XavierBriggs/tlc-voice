/**
 * Mock Hestia API Client
 * 
 * In-memory implementation for testing without a backend.
 * Implements TLC Firestore Schemas V1.
 */

import { buildLeadPayload, buildLeadUpdatePayload } from '../lib/state-machine.js';

// =============================================================================
// IN-MEMORY STORAGE
// =============================================================================

const leads = new Map();
const leadEvents = new Map();
const dealers = new Map();
const dealerNumbers = new Map();
const zipCoverage = new Map();

// =============================================================================
// INITIALIZE TEST DATA
// =============================================================================

function initializeTestData() {
  // Sample dealers with new schema
  dealers.set('home_nation', {
    dealer_id: 'home_nation',
    schema_version: 1,
    dealer_name: 'Home Nation',
    status: 'active',
    tier: 'top50',
    website_url: 'https://www.homenation.com',
    notes: 'Default fallback dealer',
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['leads@homenation.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: null,
    },
    routing_prefs: {
      priority_weight: 1000,
      exclusive_zips_allowed: false,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  
  dealers.set('dlr_12345', {
    dealer_id: 'dlr_12345',
    schema_version: 1,
    dealer_name: 'ABC Homes of Missouri',
    status: 'active',
    tier: 'standard',
    website_url: 'https://www.abchomes.example.com',
    notes: null,
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['sales@abchomes.example.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: 10,
    },
    routing_prefs: {
      priority_weight: 100,
      exclusive_zips_allowed: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  
  dealers.set('dlr_67890', {
    dealer_id: 'dlr_67890',
    schema_version: 1,
    dealer_name: 'Texas Mobile Homes',
    status: 'active',
    tier: 'standard',
    website_url: 'https://www.txmobile.example.com',
    notes: null,
    delivery_prefs: {
      dealer_delivery_enabled: true,
      delivery_mode: 'email',
      email_to: ['leads@txmobile.example.com'],
      email_cc: [],
      webhook_url: null,
      allow_lead_cap: false,
      daily_lead_cap: 15,
    },
    routing_prefs: {
      priority_weight: 80,
      exclusive_zips_allowed: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  
  // Sample dealer numbers for attribution
  dealerNumbers.set('+18005551234', {
    phone_e164: '+18005551234',
    dealer_id: 'dlr_12345',
    label: 'ABC Homes Main',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  
  dealerNumbers.set('+18005555678', {
    phone_e164: '+18005555678',
    dealer_id: 'dlr_67890',
    label: 'Texas Mobile Homes Main',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  
  // Sample zip coverage
  zipCoverage.set('MO_63101', {
    state: 'MO',
    zip5: '63101',
    candidates: [
      { dealer_id: 'dlr_12345', priority: 10, exclusive: false },
    ],
    updated_at: new Date().toISOString(),
  });
  
  zipCoverage.set('TX_75201', {
    state: 'TX',
    zip5: '75201',
    candidates: [
      { dealer_id: 'dlr_67890', priority: 10, exclusive: false },
    ],
    updated_at: new Date().toISOString(),
  });
}

// Initialize on module load
initializeTestData();

// =============================================================================
// HELPERS
// =============================================================================

function generateId(prefix = 'lead') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

// Default dealer for fallback
const DEFAULT_DEALER_ID = 'home_nation';

// =============================================================================
// MOCK CLIENT CLASS
// =============================================================================

export class MockHestiaClient {
  constructor(options = {}) {
    this.verbose = options.verbose ?? true;
    this.simulateLatency = options.simulateLatency ?? false;
    this.latencyMs = options.latencyMs ?? 50;
  }
  
  async _maybeDelay() {
    if (this.simulateLatency) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
  }
  
  _log(operation, data) {
    if (this.verbose) {
      console.log(`[MOCK-HESTIA] ${operation}:`, JSON.stringify(data, null, 2));
    }
  }
  
  // ===========================================================================
  // LEAD OPERATIONS
  // ===========================================================================
  
  /**
   * Create a new lead using TLC Firestore Schemas V1
   */
  async createLead(state) {
    await this._maybeDelay();
    
    const payload = buildLeadPayload(state);
    const idempotencyKey = `voice_${state.callSid}`;
    
    // Check for existing lead with same idempotency key
    for (const [leadId, lead] of leads) {
      if (lead._idempotency_key === idempotencyKey) {
        this._log('createLead (existing)', { lead_id: leadId });
        return {
          lead_id: leadId,
          status: lead.status,
          created: false,
        };
      }
    }
    
    // Create new lead with full schema
    const leadId = generateId('lead');
    const now = new Date().toISOString();
    
    const lead = {
      lead_id: leadId,
      _idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now,
      ...payload,
    };
    
    leads.set(leadId, lead);
    
    // Log creation event
    await this.logEvent(leadId, {
      event_type: 'created',
      actor_type: 'system',
      details: {
        channel: payload.source.channel,
        entrypoint: payload.source.entrypoint,
      },
    });
    
    this._log('createLead (new)', { lead_id: leadId, status: lead.status });
    
    return {
      lead_id: leadId,
      status: lead.status,
      created: true,
    };
  }
  
  /**
   * Update an existing lead with progressive enrichment
   */
  async updateLead(leadId, state) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    const updates = buildLeadUpdatePayload(state);
    const now = new Date().toISOString();
    
    // Deep merge updates
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        lead[key] = { ...lead[key], ...value };
      } else {
        lead[key] = value;
      }
    }
    
    lead.updated_at = now;
    leads.set(leadId, lead);
    
    this._log('updateLead', { lead_id: leadId });
    
    return { success: true };
  }
  
  /**
   * Get a lead by ID
   */
  async getLead(leadId) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    return lead;
  }
  
  /**
   * Set lead status with optional reason
   */
  async setStatus(leadId, status, statusReason = null) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    const previousStatus = lead.status;
    lead.status = status;
    lead.status_reason = statusReason;
    lead.updated_at = new Date().toISOString();
    
    leads.set(leadId, lead);
    
    await this.logEvent(leadId, {
      event_type: 'status_changed',
      actor_type: 'system',
      details: {
        old_status: previousStatus,
        new_status: status,
        reason: statusReason,
      },
    });
    
    this._log('setStatus', { lead_id: leadId, status, previous: previousStatus });
    
    return { success: true, previous_status: previousStatus };
  }
  
  /**
   * Route a lead to a dealer
   * Implements routing logic from TLC System Flow Diagram V1
   */
  async routeLead(leadId) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    // Already routed?
    if (lead.assignment?.routed_at) {
      return {
        success: true,
        assigned_dealer_id: lead.assignment.assigned_dealer_id,
        assignment_type: lead.assignment.assignment_type,
        already_routed: true,
      };
    }
    
    const now = new Date().toISOString();
    let assignedDealerId = null;
    let assignmentType = null;
    let assignmentReason = null;
    
    // Rule 1: Check for dealer lock
    const lockedDealerId = lead.source?.attribution?.locked_dealer_id;
    if (lockedDealerId) {
      const dealer = dealers.get(lockedDealerId);
      if (dealer && dealer.status === 'active') {
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
        const coverage = zipCoverage.get(coverageId);
        
        if (coverage && coverage.candidates?.length > 0) {
          // Sort by priority and find first active dealer
          const sortedCandidates = [...coverage.candidates].sort((a, b) => a.priority - b.priority);
          
          for (const candidate of sortedCandidates) {
            const dealer = dealers.get(candidate.dealer_id);
            if (dealer && dealer.status === 'active') {
              assignedDealerId = candidate.dealer_id;
              assignmentType = 'geo_routed';
              assignmentReason = 'zip_match';
              break;
            }
          }
        }
      }
    }
    
    // Rule 3: Fallback to default dealer
    if (!assignedDealerId) {
      assignedDealerId = DEFAULT_DEALER_ID;
      assignmentType = 'geo_routed';
      assignmentReason = 'fallback';
    }
    
    // Update lead assignment
    lead.assignment = {
      ...lead.assignment,
      assigned_dealer_id: assignedDealerId,
      assignment_type: assignmentType,
      assignment_reason: assignmentReason,
      routed_at: now,
      routing_attempt_count: (lead.assignment?.routing_attempt_count || 0) + 1,
      routing_last_attempt_at: now,
    };
    lead.updated_at = now;
    
    leads.set(leadId, lead);
    
    await this.logEvent(leadId, {
      event_type: 'routed',
      actor_type: 'system',
      details: {
        assigned_dealer_id: assignedDealerId,
        assignment_type: assignmentType,
        assignment_reason: assignmentReason,
      },
    });
    
    this._log('routeLead', { lead_id: leadId, dealer_id: assignedDealerId, type: assignmentType });
    
    return {
      success: true,
      assigned_dealer_id: assignedDealerId,
      assignment_type: assignmentType,
      assignment_reason: assignmentReason,
    };
  }
  
  /**
   * Deliver a lead (send notifications)
   */
  async deliverLead(leadId) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    if (!lead.assignment?.assigned_dealer_id) {
      return { success: false, error: 'Cannot deliver: no dealer assigned' };
    }
    
    if (lead.delivery?.delivered_at) {
      return { success: true, already_delivered: true };
    }
    
    const now = new Date().toISOString();
    const dealerId = lead.assignment.assigned_dealer_id;
    const dealer = dealers.get(dealerId);
    
    // Update delivery status
    lead.delivery = {
      ...lead.delivery,
      status: 'delivered',
      delivered_at: now,
      tlc_team_notified: true,
      dealer_delivery_enabled: dealer?.delivery_prefs?.dealer_delivery_enabled || false,
      attempts: (lead.delivery?.attempts || 0) + 1,
      last_attempt_at: now,
    };
    lead.updated_at = now;
    
    leads.set(leadId, lead);
    
    await this.logEvent(leadId, {
      event_type: 'delivered',
      actor_type: 'system',
      details: {
        dealer_id: dealerId,
        tlc_notified: true,
        dealer_notified: lead.delivery.dealer_delivery_enabled,
      },
    });
    
    this._log('deliverLead', { lead_id: leadId, dealer_id: dealerId });
    
    return {
      success: true,
      dealer_id: dealerId,
    };
  }
  
  // ===========================================================================
  // DEALER OPERATIONS
  // ===========================================================================
  
  /**
   * Look up dealer by tracking phone number (dealerNumbers collection)
   */
  async lookupDealerByTrackingNumber(phoneE164) {
    await this._maybeDelay();
    
    const numberDoc = dealerNumbers.get(phoneE164);
    if (!numberDoc || !numberDoc.active) {
      return null;
    }
    
    const dealer = dealers.get(numberDoc.dealer_id);
    if (!dealer || dealer.status !== 'active') {
      return null;
    }
    
    return {
      dealer_id: dealer.dealer_id,
      dealer_name: dealer.dealer_name,
    };
  }
  
  /**
   * Get zip coverage for routing
   */
  async getZipCoverage(state, zip) {
    await this._maybeDelay();
    
    const coverageId = `${state}_${zip}`;
    return zipCoverage.get(coverageId) || null;
  }
  
  /**
   * Get a dealer by ID
   */
  async getDealer(dealerId) {
    await this._maybeDelay();
    return dealers.get(dealerId) || null;
  }
  
  // ===========================================================================
  // EVENT OPERATIONS
  // ===========================================================================
  
  /**
   * Log an event to leadEvents collection
   */
  async logEvent(leadId, eventData) {
    await this._maybeDelay();
    
    const eventId = generateId('evt');
    const event = {
      event_id: eventId,
      lead_id: leadId,
      event_type: eventData.event_type,
      actor_type: eventData.actor_type || 'system',
      actor_id: eventData.actor_id || null,
      details: eventData.details || {},
      created_at: new Date().toISOString(),
    };
    
    if (!leadEvents.has(leadId)) {
      leadEvents.set(leadId, []);
    }
    leadEvents.get(leadId).push(event);
    
    return { event_id: eventId };
  }
  
  /**
   * Get all events for a lead
   */
  async getEvents(leadId) {
    await this._maybeDelay();
    return leadEvents.get(leadId) || [];
  }
  
  // ===========================================================================
  // TEST UTILITIES
  // ===========================================================================
  
  getAllLeads() {
    return Array.from(leads.values());
  }
  
  getAllEvents() {
    const all = [];
    for (const events of leadEvents.values()) {
      all.push(...events);
    }
    return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  
  clearAll() {
    leads.clear();
    leadEvents.clear();
  }
  
  addDealerNumber(phoneE164, dealerId, label = 'Test') {
    dealerNumbers.set(phoneE164, {
      phone_e164: phoneE164,
      dealer_id: dealerId,
      label: label,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  addZipCoverage(state, zip, candidates) {
    const coverageId = `${state}_${zip}`;
    zipCoverage.set(coverageId, {
      state: state,
      zip5: zip,
      candidates: candidates,
      updated_at: new Date().toISOString(),
    });
  }
  
  getStats() {
    const leadsByStatus = {};
    for (const lead of leads.values()) {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1;
    }
    
    return {
      total_leads: leads.size,
      total_events: this.getAllEvents().length,
      total_dealers: dealers.size,
      total_dealer_numbers: dealerNumbers.size,
      total_zip_coverage: zipCoverage.size,
      leads_by_status: leadsByStatus,
    };
  }
}

// Singleton instance
export const hestiaClient = new MockHestiaClient({ verbose: true });

export default hestiaClient;
