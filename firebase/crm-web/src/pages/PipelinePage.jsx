/**
 * Pipeline Page
 *
 * Kanban-style view of leads owned by the current user.
 * Placeholder - will be implemented in Phase 2.
 */

import { PageHeader } from '../components/layout/PageHeader';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useMyPipeline } from '../hooks/useLeads';
import { LeadCard } from '../components/leads/LeadCard';
import { HUMAN_STATE_LABELS, ACTIVE_STATES } from '../lib/schemas';

export function PipelinePage() {
  const { currentUser } = useCurrentUser();
  const { leads, loading, error } = useMyPipeline(currentUser?.id);

  // Group leads by state
  const leadsByState = ACTIVE_STATES.reduce((acc, state) => {
    acc[state] = leads.filter((lead) => lead.human?.state === state);
    return acc;
  }, {});

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
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Pipeline"
        description={`${leads.length} active lead${leads.length !== 1 ? 's' : ''}`}
      />

      {leads.length === 0 ? (
        <div className="card p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No leads in your pipeline
          </h3>
          <p className="text-sm text-gray-500">
            Claim leads from the queue to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ACTIVE_STATES.map((state) => (
            <div key={state} className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center justify-between">
                {HUMAN_STATE_LABELS[state]}
                <span className="badge bg-gray-200 text-gray-700">
                  {leadsByState[state].length}
                </span>
              </h3>
              <div className="space-y-3">
                {leadsByState[state].map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
                {leadsByState[state].length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No leads
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PipelinePage;
