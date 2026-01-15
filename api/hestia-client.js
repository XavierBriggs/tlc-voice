/**
 * Hestia API Client Interface
 * 
 * Provides a unified interface for interacting with the Hestia API.
 * Can be configured to use either the mock client (for testing) or
 * a real HTTP client (for production).
 */

import { MockHestiaClient } from './mock-hestia.js';

/**
 * Create a Hestia client based on configuration
 * 
 * @param {object} options - Configuration options
 * @param {string} options.mode - 'mock' or 'live'
 * @param {string} options.baseUrl - Base URL for live API
 * @param {string} options.apiKey - API key for authentication
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {object} Hestia client instance
 */
export function createHestiaClient(options = {}) {
  const mode = options.mode || process.env.HESTIA_MODE || 'mock';
  
  if (mode === 'mock') {
    console.log('[HESTIA] Using mock client');
    return new MockHestiaClient({
      verbose: options.verbose ?? true,
      simulateLatency: options.simulateLatency ?? false,
    });
  }
  
  // Live client would be implemented here
  console.log('[HESTIA] Using live client');
  return new LiveHestiaClient(options);
}

/**
 * Live Hestia API Client (stub for future implementation)
 */
class LiveHestiaClient {
  constructor(options) {
    this.baseUrl = options.baseUrl || process.env.HESTIA_API_URL;
    this.apiKey = options.apiKey || process.env.HESTIA_API_KEY;
    this.verbose = options.verbose ?? false;
    
    if (!this.baseUrl) {
      throw new Error('HESTIA_API_URL is required for live mode');
    }
    if (!this.apiKey) {
      throw new Error('HESTIA_API_KEY is required for live mode');
    }
  }
  
  _log(operation, data) {
    if (this.verbose) {
      console.log(`[HESTIA-LIVE] ${operation}:`, JSON.stringify(data));
    }
  }
  
  async _request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    
    const options = {
      method,
      headers,
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Hestia API error ${response.status}: ${error}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`[HESTIA-LIVE] Request failed:`, error);
      throw error;
    }
  }
  
  // Lead operations
  async createLead(state) {
    const { buildLeadPayload } = await import('../lib/state-machine.js');
    const payload = buildLeadPayload(state);
    return this._request('POST', '/v2/leads:intake', payload);
  }
  
  async updateLead(leadId, state) {
    const { buildLeadPayload } = await import('../lib/state-machine.js');
    const payload = buildLeadPayload(state);
    return this._request('PATCH', `/v2/leads/${leadId}`, payload);
  }
  
  async getLead(leadId) {
    return this._request('GET', `/v2/leads/${leadId}`);
  }
  
  async setStatus(leadId, status, reason = null) {
    return this._request('POST', `/v2/leads/${leadId}/status`, { status, reason });
  }
  
  async routeLead(leadId) {
    return this._request('POST', `/v2/leads/${leadId}/route`);
  }
  
  async deliverLead(leadId) {
    return this._request('POST', `/v2/leads/${leadId}/deliver`);
  }
  
  // Event operations
  async logEvent(leadId, eventData) {
    return this._request('POST', `/v2/leads/${leadId}/events`, eventData);
  }
  
  async getEvents(leadId) {
    return this._request('GET', `/v2/leads/${leadId}/events`);
  }
  
  // Dealer operations
  async lookupDealerByTrackingNumber(dialedNumber) {
    return this._request('GET', `/v2/dealers/tracking-numbers/${encodeURIComponent(dialedNumber)}`);
  }
  
  async getDealer(dealerId) {
    return this._request('GET', `/v2/dealers/${dealerId}`);
  }
}

export default createHestiaClient;
