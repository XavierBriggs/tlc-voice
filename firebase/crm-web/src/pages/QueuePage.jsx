/**
 * Queue Page
 *
 * Shows unclaimed leads ready for loan officers to claim.
 * Real-time updates when new leads arrive.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { LeadCard } from '../components/leads/LeadCard';
import { useLeadQueue } from '../hooks/useLeads';
import { useLeadActions } from '../hooks/useLeadActions';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function QueuePage() {
  const navigate = useNavigate();
  const { leads, loading, error } = useLeadQueue();
  const { claimLead } = useLeadActions();
  const { canClaimLeads } = useCurrentUser();
  const [claimingId, setClaimingId] = useState(null);

  const handleClaim = async (leadId) => {
    if (!canClaimLeads) return;

    setClaimingId(leadId);
    try {
      await claimLead(leadId);
      // Navigate to the lead detail after claiming
      navigate(`/leads/${leadId}`);
    } catch (err) {
      console.error('Failed to claim lead:', err);
      alert('Failed to claim lead. Please try again.');
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 btn btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Lead Queue"
        description={`${leads.length} unclaimed lead${leads.length !== 1 ? 's' : ''} ready to claim`}
      />

      {leads.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary-50 mb-4">
            <svg
              className="h-6 w-6 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No leads in queue
          </h3>
          <p className="text-sm text-gray-500">
            New leads will appear here as they come in.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              showClaimButton={canClaimLeads}
              onClaim={handleClaim}
              loading={claimingId === lead.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default QueuePage;
