/**
 * Mock Hestia API Client
 * 
 * In-memory implementation of the Hestia V2 API for testing without a backend.
 * Mirrors the real API endpoints and stores data locally.
 */

import { buildLeadPayload } from '../lib/state-machine.js';

// In-memory storage
const leads = new Map();
const events = new Map();
const dealers = new Map();
const dealerTrackingNumbers = new Map();

// Initialize some test dealer data
function initializeTestData() {
  // Sample dealers
  dealers.set('dlr_12345', {
    dealer_id: 'dlr_12345',
    dealer_name: 'ABC Homes of Missouri',
    status: 'active',
    primary_contact_email: 'sales@abchomes.example.com',
    primary_contact_phone: '+13145551000',
    lead_delivery_method: 'email',
    daily_lead_cap: 10,
    priority_weight: 100,
  });
  
  dealers.set('dlr_67890', {
    dealer_id: 'dlr_67890',
    dealer_name: 'Texas Mobile Homes',
    status: 'active',
    primary_contact_email: 'leads@txmobile.example.com',
    primary_contact_phone: '+12145552000',
    lead_delivery_method: 'webhook',
    daily_lead_cap: 15,
    priority_weight: 80,
  });
  
  // Sample tracking numbers
  dealerTrackingNumbers.set('+18005551234', {
    tracking_number_e164: '+18005551234',
    dealer_id: 'dlr_12345',
    status: 'active',
  });
  
  dealerTrackingNumbers.set('+18005555678', {
    tracking_number_e164: '+18005555678',
    dealer_id: 'dlr_67890',
    status: 'active',
  });
}

// Initialize test data on module load
initializeTestData();

/**
 * Generate a unique ID
 */
function generateId(prefix = 'lead') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Mock Hestia API Client Class
 */
export class MockHestiaClient {
  constructor(options = {}) {
    this.verbose = options.verbose ?? true;
    this.simulateLatency = options.simulateLatency ?? false;
    this.latencyMs = options.latencyMs ?? 50;
  }
  
  /**
   * Simulate network latency if enabled
   */
  async _maybeDelay() {
    if (this.simulateLatency) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
  }
  
  /**
   * Log operations if verbose mode is enabled
   */
  _log(operation, data) {
    if (this.verbose) {
      console.log(`[MOCK-HESTIA] ${operation}:`, JSON.stringify(data, null, 2));
    }
  }
  
  // ===========================================================================
  // LEAD OPERATIONS
  // ===========================================================================
  
  /**
   * POST /v2/leads:intake
   * Create a new lead or return existing if idempotency key matches
   */
  async createLead(state) {
    await this._maybeDelay();
    
    const payload = buildLeadPayload(state);
    const idempotencyKey = payload.idempotency_key;
    
    // Check for existing lead with same idempotency key
    for (const [leadId, lead] of leads) {
      if (lead.idempotency_key === idempotencyKey) {
        this._log('createLead (existing)', { lead_id: leadId });
        return {
          lead_id: leadId,
          status: lead.status,
          assigned_dealer_id: lead.assigned_dealer_id,
          dealer_delivery_status: lead.dealer_delivery_status,
          created: false,
        };
      }
    }
    
    // Create new lead
    const leadId = generateId('lead');
    const now = new Date().toISOString();
    
    const lead = {
      lead_id: leadId,
      idempotency_key: idempotencyKey,
      created_at: now,
      updated_at: now,
      status: 'new',
      status_reason: null,
      
      // Source
      source_channel: payload.source.channel,
      source_entrypoint: payload.source.entrypoint,
      referrer_url: null,
      campaign_id: payload.source.tracking?.campaign_id || null,
      session_id: payload.source.session_id,
      
      // Assignment
      assigned_dealer_id: null,
      assignment_type: null,
      assignment_reason: null,
      routed_at: null,
      
      // Delivery
      dealer_delivery_status: 'pending',
      dealer_delivered_at: null,
      dealer_delivery_error: null,
      dealer_delivery_attempts: 0,
      
      // Related data
      applicant: payload.applicant,
      home_and_site: payload.home_and_site,
      financial_snapshot: payload.financial_snapshot,
      notes: payload.notes,
      consents: payload.applicant.consents,
      attribution: payload.source.tracking ? {
        dealer_id: payload.source.tracking.dealer_id,
        attribution_token: payload.source.tracking.attribution_token,
        locked: true,
      } : null,
    };
    
    leads.set(leadId, lead);
    
    // Log creation event
    await this.logEvent(leadId, {
      event_type: 'lead_created',
      actor_type: 'ai',
      payload_json: {
        source: payload.source,
        channel: payload.source.channel,
      },
    });
    
    this._log('createLead (new)', { lead_id: leadId, status: 'new' });
    
    return {
      lead_id: leadId,
      status: 'new',
      assigned_dealer_id: null,
      dealer_delivery_status: 'pending',
      created: true,
    };
  }
  
  /**
   * PATCH /v2/leads/{lead_id}
   * Update lead with new data (progressive enrichment)
   */
  async updateLead(leadId, state) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    const payload = buildLeadPayload(state);
    
    // Merge updated data
    lead.updated_at = new Date().toISOString();
    lead.applicant = { ...lead.applicant, ...payload.applicant };
    lead.home_and_site = { ...lead.home_and_site, ...payload.home_and_site };
    lead.financial_snapshot = { ...lead.financial_snapshot, ...payload.financial_snapshot };
    lead.notes = { ...lead.notes, ...payload.notes };
    
    if (payload.applicant.consents) {
      lead.consents = { ...lead.consents, ...payload.applicant.consents };
    }
    
    leads.set(leadId, lead);
    
    // Log update event
    await this.logEvent(leadId, {
      event_type: 'lead_updated',
      actor_type: 'ai',
      payload_json: {
        fields_updated: Object.keys(payload),
      },
    });
    
    this._log('updateLead', { lead_id: leadId });
    
    return { success: true };
  }
  
  /**
   * GET /v2/leads/{lead_id}
   * Retrieve a lead by ID
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
   * POST /v2/leads/{lead_id}/status
   * Update lead status
   */
  async setStatus(leadId, status, reason = null) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    const previousStatus = lead.status;
    lead.status = status;
    lead.status_reason = reason;
    lead.updated_at = new Date().toISOString();
    
    leads.set(leadId, lead);
    
    // Log status change event
    await this.logEvent(leadId, {
      event_type: 'status_changed',
      actor_type: 'ai',
      payload_json: {
        previous_status: previousStatus,
        new_status: status,
        reason,
      },
    });
    
    this._log('setStatus', { lead_id: leadId, status, previous: previousStatus });
    
    return { success: true, previous_status: previousStatus };
  }
  
  /**
   * POST /v2/leads/{lead_id}/route
   * Trigger dealer routing for a lead
   */
  async routeLead(leadId) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    // Skip if already routed
    if (lead.assigned_dealer_id) {
      return {
        success: true,
        assigned_dealer_id: lead.assigned_dealer_id,
        assignment_type: lead.assignment_type,
        already_routed: true,
      };
    }
    
    // Check for attribution-based routing
    if (lead.attribution?.dealer_id) {
      const dealer = dealers.get(lead.attribution.dealer_id);
      if (dealer && dealer.status === 'active') {
        lead.assigned_dealer_id = dealer.dealer_id;
        lead.assignment_type = 'dealer_sourced';
        lead.assignment_reason = 'Attributed to dealer via tracking number';
        lead.routed_at = new Date().toISOString();
        lead.status = 'routed';
        
        leads.set(leadId, lead);
        
        await this.logEvent(leadId, {
          event_type: 'dealer_assignment_created',
          actor_type: 'system',
          payload_json: {
            dealer_id: dealer.dealer_id,
            assignment_type: 'dealer_sourced',
            reason: 'Attribution locked to dealer',
          },
        });
        
        this._log('routeLead', { lead_id: leadId, dealer_id: dealer.dealer_id, type: 'dealer_sourced' });
        
        return {
          success: true,
          assigned_dealer_id: dealer.dealer_id,
          assignment_type: 'dealer_sourced',
        };
      }
    }
    
    // Geo-routing: find dealer by ZIP (simplified mock)
    // In real implementation, this would query dealer_coverage table
    const zip = lead.home_and_site?.property_zip;
    if (!zip) {
      return {
        success: false,
        error: 'Cannot route: missing property ZIP',
      };
    }
    
    // Mock: just assign to first active dealer
    for (const [dealerId, dealer] of dealers) {
      if (dealer.status === 'active') {
        lead.assigned_dealer_id = dealerId;
        lead.assignment_type = 'geo_routed';
        lead.assignment_reason = `Routed by ZIP ${zip}`;
        lead.routed_at = new Date().toISOString();
        lead.status = 'routed';
        
        leads.set(leadId, lead);
        
        await this.logEvent(leadId, {
          event_type: 'dealer_assignment_created',
          actor_type: 'system',
          payload_json: {
            dealer_id: dealerId,
            assignment_type: 'geo_routed',
            zip,
          },
        });
        
        this._log('routeLead', { lead_id: leadId, dealer_id: dealerId, type: 'geo_routed' });
        
        return {
          success: true,
          assigned_dealer_id: dealerId,
          assignment_type: 'geo_routed',
        };
      }
    }
    
    return {
      success: false,
      error: 'No active dealers available',
    };
  }
  
  /**
   * POST /v2/leads/{lead_id}/deliver
   * Deliver lead to assigned dealer
   */
  async deliverLead(leadId) {
    await this._maybeDelay();
    
    const lead = leads.get(leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    if (!lead.assigned_dealer_id) {
      return {
        success: false,
        error: 'Cannot deliver: no dealer assigned',
      };
    }
    
    if (lead.dealer_delivery_status === 'delivered') {
      return {
        success: true,
        already_delivered: true,
      };
    }
    
    // Mock: simulate successful delivery
    lead.dealer_delivery_status = 'delivered';
    lead.dealer_delivered_at = new Date().toISOString();
    lead.dealer_delivery_attempts += 1;
    
    leads.set(leadId, lead);
    
    await this.logEvent(leadId, {
      event_type: 'dealer_delivery_succeeded',
      actor_type: 'system',
      payload_json: {
        dealer_id: lead.assigned_dealer_id,
        delivery_method: 'mock',
      },
    });
    
    this._log('deliverLead', { lead_id: leadId, dealer_id: lead.assigned_dealer_id });
    
    return {
      success: true,
      dealer_id: lead.assigned_dealer_id,
    };
  }
  
  // ===========================================================================
  // EVENT OPERATIONS
  // ===========================================================================
  
  /**
   * POST /v2/leads/{lead_id}/events
   * Log an event for a lead
   */
  async logEvent(leadId, eventData) {
    await this._maybeDelay();
    
    const eventId = generateId('evt');
    const event = {
      event_id: eventId,
      lead_id: leadId,
      event_type: eventData.event_type,
      event_at: new Date().toISOString(),
      actor_type: eventData.actor_type || 'system',
      actor_id: eventData.actor_id || null,
      request_id: eventData.request_id || null,
      correlation_id: eventData.correlation_id || null,
      payload_json: eventData.payload_json || {},
    };
    
    // Store event
    if (!events.has(leadId)) {
      events.set(leadId, []);
    }
    events.get(leadId).push(event);
    
    if (this.verbose && eventData.event_type !== 'lead_updated') {
      this._log('logEvent', { event_id: eventId, type: eventData.event_type });
    }
    
    return { event_id: eventId };
  }
  
  /**
   * GET /v2/leads/{lead_id}/events
   * Get all events for a lead
   */
  async getEvents(leadId) {
    await this._maybeDelay();
    
    return events.get(leadId) || [];
  }
  
  // ===========================================================================
  // DEALER OPERATIONS
  // ===========================================================================
  
  /**
   * Look up dealer attribution from dialed number
   */
  async lookupDealerByTrackingNumber(dialedNumber) {
    await this._maybeDelay();
    
    const tracking = dealerTrackingNumbers.get(dialedNumber);
    if (!tracking || tracking.status !== 'active') {
      return null;
    }
    
    const dealer = dealers.get(tracking.dealer_id);
    if (!dealer || dealer.status !== 'active') {
      return null;
    }
    
    return {
      dealer_id: dealer.dealer_id,
      dealer_name: dealer.dealer_name,
      tracking_number: dialedNumber,
    };
  }
  
  /**
   * Get a dealer by ID
   */
  async getDealer(dealerId) {
    await this._maybeDelay();
    
    return dealers.get(dealerId) || null;
  }
  
  // ===========================================================================
  // DEBUG/TEST UTILITIES
  // ===========================================================================
  
  /**
   * Get all leads (for debugging)
   */
  getAllLeads() {
    return Array.from(leads.values());
  }
  
  /**
   * Get all events (for debugging)
   */
  getAllEvents() {
    const allEvents = [];
    for (const leadEvents of events.values()) {
      allEvents.push(...leadEvents);
    }
    return allEvents.sort((a, b) => new Date(a.event_at) - new Date(b.event_at));
  }
  
  /**
   * Clear all data (for testing)
   */
  clearAll() {
    leads.clear();
    events.clear();
  }
  
  /**
   * Add a test dealer tracking number
   */
  addTrackingNumber(phoneNumber, dealerId) {
    dealerTrackingNumbers.set(phoneNumber, {
      tracking_number_e164: phoneNumber,
      dealer_id: dealerId,
      status: 'active',
    });
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const leadsByStatus = {};
    for (const lead of leads.values()) {
      leadsByStatus[lead.status] = (leadsByStatus[lead.status] || 0) + 1;
    }
    
    return {
      total_leads: leads.size,
      total_events: this.getAllEvents().length,
      total_dealers: dealers.size,
      total_tracking_numbers: dealerTrackingNumbers.size,
      leads_by_status: leadsByStatus,
    };
  }
}

/**
 * Create a singleton instance for use across the application
 */
export const hestiaClient = new MockHestiaClient({ verbose: true });

export default hestiaClient;
