/**
 * LeadCard Component
 *
 * Displays a lead summary in a card format for queue and pipeline views.
 */

import { Link } from 'react-router-dom';
import {
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ClockIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { formatPhone, formatRelativeTime, formatCurrency, formatLocation } from '../../lib/formatters';
import { HUMAN_STATE_LABELS, STATE_COLORS } from '../../lib/schemas';

export function LeadCard({ lead, onClaim, showClaimButton = false, loading = false }) {
  const applicant = lead.applicant || {};
  const homeAndSite = lead.home_and_site || {};
  const financial = lead.financial_snapshot || {};
  const human = lead.human || {};

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        {/* Lead info */}
        <div className="flex-1 min-w-0">
          {/* Name and status */}
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/leads/${lead.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-primary truncate"
            >
              {applicant.full_name || 'Unknown'}
            </Link>
            <span className={`badge ${STATE_COLORS[human.state] || 'bg-gray-100 text-gray-700'}`}>
              {HUMAN_STATE_LABELS[human.state] || human.state}
            </span>
          </div>

          {/* Contact info */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mb-3">
            {applicant.phone_e164 && (
              <a
                href={`tel:${applicant.phone_e164}`}
                className="flex items-center hover:text-primary"
              >
                <PhoneIcon className="h-4 w-4 mr-1" />
                {formatPhone(applicant.phone_e164)}
              </a>
            )}
            {applicant.email && (
              <a
                href={`mailto:${applicant.email}`}
                className="flex items-center hover:text-primary truncate max-w-[200px]"
              >
                <EnvelopeIcon className="h-4 w-4 mr-1" />
                {applicant.email}
              </a>
            )}
          </div>

          {/* Property details */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            {(homeAndSite.property_state || homeAndSite.property_zip) && (
              <span className="flex items-center">
                <MapPinIcon className="h-4 w-4 mr-1" />
                {formatLocation(homeAndSite.property_state, homeAndSite.property_zip)}
              </span>
            )}
            {homeAndSite.home_price_estimate_usd && (
              <span className="flex items-center">
                <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                {formatCurrency(homeAndSite.home_price_estimate_usd)}
              </span>
            )}
            {homeAndSite.timeline && (
              <span className="flex items-center">
                <ClockIcon className="h-4 w-4 mr-1" />
                {homeAndSite.timeline.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {financial.credit_band_self_reported && (
              <span className="badge bg-blue-50 text-blue-700">
                {financial.credit_band_self_reported.replace(/_/g, ' ')}
              </span>
            )}
            {homeAndSite.land_status && (
              <span className="badge bg-amber-50 text-amber-700">
                Land: {homeAndSite.land_status.replace(/_/g, ' ')}
              </span>
            )}
            {homeAndSite.home_type && (
              <span className="badge bg-purple-50 text-purple-700">
                {homeAndSite.home_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end ml-4">
          {showClaimButton && (
            <button
              onClick={() => onClaim?.(lead.id)}
              disabled={loading}
              className="btn btn-primary whitespace-nowrap"
            >
              {loading ? 'Claiming...' : 'Claim Lead'}
            </button>
          )}

          {/* Created time */}
          <span className="text-xs text-gray-400 mt-2">
            {formatRelativeTime(lead.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default LeadCard;
