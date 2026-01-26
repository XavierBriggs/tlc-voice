/**
 * Lead Detail Page
 *
 * Full view of a single lead with all information and actions.
 */

import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UserIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../components/layout/PageHeader';
import { useLead } from '../hooks/useLeads';
import { formatPhone, formatDate, formatCurrency, formatLocation } from '../lib/formatters';
import { HUMAN_STATE_LABELS, STATE_COLORS, OUTCOME_LABELS, OUTCOME_COLORS } from '../lib/schemas';

export function LeadDetailPage() {
  const { leadId } = useParams();
  const { lead, loading, error } = useLead(leadId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || 'Lead not found'}</p>
        <Link to="/queue" className="mt-4 btn btn-secondary">
          Back to Queue
        </Link>
      </div>
    );
  }

  const applicant = lead.applicant || {};
  const homeAndSite = lead.home_and_site || {};
  const financial = lead.financial_snapshot || {};
  const human = lead.human || {};
  const assignment = lead.assignment || {};
  const source = lead.source || {};

  return (
    <div>
      {/* Back link */}
      <Link
        to="/pipeline"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Pipeline
      </Link>

      <PageHeader
        title={applicant.full_name || 'Unknown Lead'}
        description={formatLocation(homeAndSite.property_state, homeAndSite.property_zip)}
      >
        {/* Status badges */}
        <div className="flex items-center gap-2">
          <span className={`badge ${STATE_COLORS[human.state] || 'bg-gray-100'}`}>
            {HUMAN_STATE_LABELS[human.state] || human.state}
          </span>
          {human.outcome && (
            <span className={`badge ${OUTCOME_COLORS[human.outcome] || 'bg-gray-100'}`}>
              {OUTCOME_LABELS[human.outcome] || human.outcome}
            </span>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center">
                <UserIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{applicant.full_name || '-'}</p>
                </div>
              </div>
              <div className="flex items-center">
                <PhoneIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  {applicant.phone_e164 ? (
                    <a href={`tel:${applicant.phone_e164}`} className="font-medium text-primary hover:underline">
                      {formatPhone(applicant.phone_e164)}
                    </a>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                <EnvelopeIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  {applicant.email ? (
                    <a href={`mailto:${applicant.email}`} className="font-medium text-primary hover:underline">
                      {applicant.email}
                    </a>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                <ClockIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Best Time to Contact</p>
                  <p className="font-medium">{applicant.best_time_to_contact?.replace(/_/g, ' ') || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Property Details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Property Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center">
                <MapPinIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium">
                    {formatLocation(homeAndSite.property_state, homeAndSite.property_zip) || '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <BuildingOfficeIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Home Type</p>
                  <p className="font-medium">{homeAndSite.home_type?.replace(/_/g, ' ') || '-'}</p>
                </div>
              </div>
              <div className="flex items-center">
                <CurrencyDollarIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Estimated Price</p>
                  <p className="font-medium">
                    {homeAndSite.home_price_estimate_usd
                      ? formatCurrency(homeAndSite.home_price_estimate_usd)
                      : '-'}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <ClockIcon className="h-5 w-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-sm text-gray-500">Timeline</p>
                  <p className="font-medium">{homeAndSite.timeline?.replace(/_/g, ' ') || '-'}</p>
                </div>
              </div>
            </div>

            {/* Additional property details */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Land Status</p>
                  <p className="font-medium">{homeAndSite.land_status?.replace(/_/g, ' ') || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">New Purchase</p>
                  <p className="font-medium">
                    {homeAndSite.is_new_home_purchase === true
                      ? 'Yes'
                      : homeAndSite.is_new_home_purchase === false
                      ? 'No'
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Snapshot */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Snapshot</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Credit Band</p>
                <p className="font-medium">
                  {financial.credit_band_self_reported?.replace(/_/g, ' ') || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Monthly Income</p>
                <p className="font-medium">
                  {financial.monthly_income_estimate_usd
                    ? formatCurrency(financial.monthly_income_estimate_usd)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Recent Bankruptcy</p>
                <p className="font-medium">
                  {financial.has_recent_bankruptcy === true
                    ? 'Yes'
                    : financial.has_recent_bankruptcy === false
                    ? 'No'
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Owner & Assignment */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assignment</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Owner</p>
                <p className="font-medium">{human.owner_name || 'Unclaimed'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Dealer</p>
                <p className="font-medium">{assignment.assigned_dealer_id || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Assignment Type</p>
                <p className="font-medium">{assignment.assignment_type?.replace(/_/g, ' ') || '-'}</p>
              </div>
            </div>
          </div>

          {/* Activity Stats */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Contact Attempts</p>
                <p className="font-medium">{human.contact_attempts || 0} / {human.max_contact_attempts || 5}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">First Contacted</p>
                <p className="font-medium">
                  {human.first_contacted_at ? formatDate(human.first_contacted_at) : 'Not yet'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{formatDate(lead.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Source */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Source</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Channel</p>
                <p className="font-medium capitalize">{source.channel || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Entry Point</p>
                <p className="font-medium">{source.entrypoint?.replace(/_/g, ' ') || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeadDetailPage;
