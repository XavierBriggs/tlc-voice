/**
 * Leads hooks for querying Firestore
 *
 * Provides real-time lead queries for queue, pipeline, and detail views.
 */

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Hook to get unclaimed leads for the queue
 * @param {number} maxResults - Maximum number of leads to fetch
 * @returns {{ leads: array, loading: boolean, error: string|null }}
 */
export function useLeadQueue(maxResults = 50) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('human.state', '==', 'unclaimed'),
      where('status', '==', 'prequalified'),
      orderBy('created_at', 'desc'),
      limit(maxResults)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const leadsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setLeads(leadsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching queue:', err);
        setError('Failed to load lead queue');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [maxResults]);

  return { leads, loading, error };
}

/**
 * Hook to get leads owned by a specific user (for pipeline view)
 * @param {string} userId - The user ID to filter by
 * @returns {{ leads: array, loading: boolean, error: string|null }}
 */
export function useMyPipeline(userId) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const leadsRef = collection(db, 'leads');
    const q = query(
      leadsRef,
      where('human.owner_user_id', '==', userId),
      where('human.state', 'not-in', ['unclaimed', 'closed']),
      orderBy('human.state'),
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const leadsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setLeads(leadsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching pipeline:', err);
        setError('Failed to load pipeline');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { leads, loading, error };
}

/**
 * Hook to get a single lead by ID with real-time updates
 * @param {string} leadId - The lead ID
 * @returns {{ lead: object|null, loading: boolean, error: string|null }}
 */
export function useLead(leadId) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      setLoading(false);
      return;
    }

    const leadRef = doc(db, 'leads', leadId);

    const unsubscribe = onSnapshot(
      leadRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setLead({
            id: snapshot.id,
            ...snapshot.data(),
          });
          setError(null);
        } else {
          setLead(null);
          setError('Lead not found');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching lead:', err);
        setError('Failed to load lead');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [leadId]);

  return { lead, loading, error };
}

/**
 * Hook to get all leads (admin view)
 * @param {object} filters - Optional filters (status, state, owner)
 * @param {number} maxResults - Maximum number of leads
 * @returns {{ leads: array, loading: boolean, error: string|null }}
 */
export function useAllLeads(filters = {}, maxResults = 100) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const leadsRef = collection(db, 'leads');

    // Build query constraints
    const constraints = [];

    if (filters.status) {
      constraints.push(where('status', '==', filters.status));
    }

    if (filters.humanState) {
      constraints.push(where('human.state', '==', filters.humanState));
    }

    if (filters.ownerId) {
      constraints.push(where('human.owner_user_id', '==', filters.ownerId));
    }

    if (filters.dealerId) {
      constraints.push(where('assignment.assigned_dealer_id', '==', filters.dealerId));
    }

    constraints.push(orderBy('created_at', 'desc'));
    constraints.push(limit(maxResults));

    const q = query(leadsRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const leadsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setLeads(leadsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching leads:', err);
        setError('Failed to load leads');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [filters.status, filters.humanState, filters.ownerId, filters.dealerId, maxResults]);

  return { leads, loading, error };
}

export default useLeadQueue;
