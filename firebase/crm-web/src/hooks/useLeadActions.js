/**
 * Lead Actions Hook
 *
 * Provides mutations for updating leads (claim, contact, qualify, etc.)
 */

import { doc, updateDoc, collection, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useCurrentUser } from './useCurrentUser';

/**
 * Hook that provides lead action functions
 * @returns {object} Object with lead action functions
 */
export function useLeadActions() {
  const { currentUser } = useCurrentUser();

  /**
   * Log an event to leadEvents collection
   */
  const logEvent = async (leadId, eventType, details = {}) => {
    const eventsRef = collection(db, 'leadEvents');
    await addDoc(eventsRef, {
      lead_id: leadId,
      event_type: eventType,
      actor_type: 'user',
      actor_id: currentUser?.id || null,
      details: {
        ...details,
        actor_name: currentUser?.full_name || 'Unknown',
      },
      created_at: serverTimestamp(),
    });
  };

  /**
   * Claim an unclaimed lead
   */
  const claimLead = async (leadId) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'claimed',
      'human.owner_user_id': currentUser.id,
      'human.owner_name': currentUser.full_name,
      'human.claimed_at': serverTimestamp(),
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'claimed', {
      owner_user_id: currentUser.id,
      owner_name: currentUser.full_name,
    });
  };

  /**
   * Log a contact attempt
   */
  const logContactAttempt = async (leadId, { outcome, notes }) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    const updates = {
      'human.state': 'contact_attempted',
      'human.contact_attempts': increment(1),
      'human.last_contact_attempt_at': serverTimestamp(),
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    };

    await updateDoc(leadRef, updates);

    await logEvent(leadId, 'contact_attempted', {
      outcome,
      notes,
    });
  };

  /**
   * Mark lead as contacted (first successful contact)
   */
  const markContacted = async (leadId, notes) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'contacted',
      'human.first_contacted_at': serverTimestamp(),
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'contacted', { notes });
  };

  /**
   * Qualify the borrower
   */
  const qualifyLead = async (leadId, { notes }) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'qualified',
      'human.qualified_at': serverTimestamp(),
      'human.qualification_notes': notes || null,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'qualified', { notes });
  };

  /**
   * Mark application as sent
   */
  const sendApplication = async (leadId, { method, notes }) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'application_sent',
      'human.application_sent_at': serverTimestamp(),
      'human.application_method': method,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'application_sent', { method, notes });
  };

  /**
   * Mark as in progress (application received)
   */
  const markInProgress = async (leadId) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'in_progress',
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'in_progress', {});
  };

  /**
   * Close the lead with an outcome
   */
  const closeLead = async (leadId, { outcome, notes }) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'status': 'closed',
      'human.state': 'closed',
      'human.outcome': outcome,
      'human.outcome_notes': notes || null,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'closed', { outcome, notes });
  };

  /**
   * Schedule a follow-up
   */
  const scheduleFollowUp = async (leadId, followUpDate) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.next_follow_up_at': followUpDate,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'follow_up_scheduled', {
      follow_up_date: followUpDate.toISOString(),
    });
  };

  /**
   * Add a note to the lead
   */
  const addNote = async (leadId, note) => {
    if (!currentUser) throw new Error('Not authenticated');

    await logEvent(leadId, 'note_added', { note });
  };

  /**
   * Reassign lead to another user (admin only)
   */
  const reassignLead = async (leadId, { newOwnerId, newOwnerName }) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.owner_user_id': newOwnerId,
      'human.owner_name': newOwnerName,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'reassigned', {
      new_owner_id: newOwnerId,
      new_owner_name: newOwnerName,
    });
  };

  /**
   * Unclaim a lead (return to queue - admin only)
   */
  const unclaimLead = async (leadId) => {
    if (!currentUser) throw new Error('Not authenticated');

    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      'human.state': 'unclaimed',
      'human.owner_user_id': null,
      'human.owner_name': null,
      'human.claimed_at': null,
      'human.last_touched_at': serverTimestamp(),
      'updated_at': serverTimestamp(),
    });

    await logEvent(leadId, 'unclaimed', {});
  };

  return {
    claimLead,
    logContactAttempt,
    markContacted,
    qualifyLead,
    sendApplication,
    markInProgress,
    closeLead,
    scheduleFollowUp,
    addNote,
    reassignLead,
    unclaimLead,
  };
}

export default useLeadActions;
