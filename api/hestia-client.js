// api/hestia-client.js
import { MockHestiaClient } from './mock-hestia.js';
import { FirestoreHestiaClient } from './firebase-client.js';

export function createHestiaClient(options = {}) {
  const mode = options.mode || process.env.HESTIA_MODE || 'mock';
  
  if (mode === 'mock') {
    console.log('[HESTIA] Using mock client');
    return new MockHestiaClient(options);
  }
  
  if (mode === 'firestore') {
    console.log('[HESTIA] Using Firestore client');
    return new FirestoreHestiaClient(options);
  }
  
  // Live REST API client
  console.log('[HESTIA] Using live client');
  return new LiveHestiaClient(options);
}