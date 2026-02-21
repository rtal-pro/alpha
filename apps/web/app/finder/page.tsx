'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Opportunity {
  id: string;
  title: string;
  slug: string | null;
  category: string | null;
  description: string | null;
  type: string | null;
  composite_score: number | null;
  growth_score: number | null;
  gap_score: number | null;
  regulatory_score: number | null;
  feasibility_score: number | null;
  source_signals: string[];
  evidence_summary: Record<string, unknown> | null;
  target_geo: string | null;
  detection_count: number | null;
  status: string;
  created_at: string;
  last_detected_at: string | null;
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const domains = [
  { value: 'all', label: 'All Domains' },
  { value: 'payment_processing', label: 'Fintech' },
  { value: 'ci_cd', label: 'DevTools' },
  { value: 'crm', label: 'CRM' },
  { value: 'storefront', label: 'E-commerce' },
  { value: 'telehealth', label: 'Healthcare' },
  { value: 'lms', label: 'Education' },
  { value: 'compliance', label: 'Legal/Compliance' },
  { value: 'recruitment', label: 'HR' },
  { value: 'pos', label: 'Restaurant' },
  { value: 'property_management', label: 'Real Estate' },
];

const types = [
  { value: 'all', label: 'All Types' },
  { value: 'geo_gap', label: 'Geo Gap' },
  { value: 'regulatory_gap', label: 'Regulatory Gap' },
  { value: 'convergence', label: 'Convergence' },
  { value: 'competitor_weakness', label: 'Competitor Weakness' },
];

const scoreRanges = [
  { value: '0', label: 'Any Score' },
  { value: '90', label: '90+' },
  { value: '80', label: '80+' },
  { value: '70', label: '70+' },
  { value: '60', label: '60+' },
  { value: '50', label: '50+' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function typeBadge(type: string | null): { label: string; color: string } {
  switch (type) {
    case 'geo_gap': return { label: 'Geo Gap', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    case 'regulatory_gap': return { label: 'Regulatory', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
    case 'convergence': return { label: 'Convergence', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    case 'competitor_weakness': return { label: 'Weakness', color: 'bg-red-500/20 text-red-300 border-red-500/30' };
    default: return { label: type ?? 'Unknown', color: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' };
  }
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// OpportunityCard
// ---------------------------------------------------------------------------

function OpportunityCard({
  opp,
  onAction,
}: {
  opp: Opportunity;
  onAction: (type: string, id: string) => void;
}) {
  const score = opp.composite_score ?? 0;
  const badge = typeBadge(opp.type);
  const evidence = opp.evidence_summary ?? {};
  const signalCount = opp.source_signals?.length ?? 0;

  return (
    <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/finder/${opp.id}`}
            className="text-base font-semibold text-zinc-100 hover:text-blue-400 transition-colors line-clamp-2"
          >
            {opp.title}
          </Link>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
            {opp.category && (
              <span className="text-xs text-zinc-500">{opp.category}</span>
            )}
            {opp.target_geo && (
              <span className="text-xs text-zinc-600">{opp.target_geo}</span>
            )}
          </div>
        </div>

        {/* Score circle */}
        <div className="ml-4 flex-shrink-0">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
            score >= 75 ? 'border-green-500/50' : score >= 50 ? 'border-yellow-500/50' : 'border-red-500/50'
          }`}>
            <span className={`text-lg font-bold ${scoreColor(score)}`}>{score}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {opp.description && (
        <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{opp.description}</p>
      )}

      {/* Score bars */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Growth', value: opp.growth_score ?? 0 },
          { label: 'Gap', value: opp.gap_score ?? 0 },
          { label: 'Regulatory', value: opp.regulatory_score ?? 0 },
          { label: 'Feasibility', value: opp.feasibility_score ?? 0 },
        ].map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-xs text-zinc-500 mb-0.5">
              <span>{s.label}</span>
              <span>{s.value}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-800">
              <div className={`h-1.5 rounded-full ${scoreBg(s.value)}`} style={{ width: `${s.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Meta + actions */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{signalCount} signals</span>
          {opp.detection_count && opp.detection_count > 1 && (
            <span>Detected {opp.detection_count}x</span>
          )}
          <span>{timeAgo(opp.created_at)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Link
            href={`/finder/${opp.id}`}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Explore
          </Link>
          <button
            onClick={() => onAction('save', opp.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => onAction('dismiss', opp.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-red-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinderPage() {
  const [domain, setDomain] = useState('all');
  const [type, setType] = useState('all');
  const [minScore, setMinScore] = useState('0');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'discovered' | 'saved'>('discovered');

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const statuses = tab === 'saved' ? 'saved,exploring,pursued' : 'new';
      const params = new URLSearchParams({
        domain,
        type,
        minScore,
        status: statuses,
        limit: '50',
      });

      const res = await fetch(`/api/finder?${params}`);
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      setOpportunities(data.opportunities);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [domain, type, minScore, tab]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleAction = async (actionType: string, opportunityId: string) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: actionType, opportunity_id: opportunityId }),
      });
      // Remove from list or refresh
      setOpportunities((prev) => prev.filter((o) => o.id !== opportunityId));
    } catch {
      // Silently fail — feedback is non-critical
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Idea Finder</h1>
        <p className="text-zinc-400">
          Discovered SaaS opportunities from automated scraping and signal detection.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 mb-6 w-fit">
        <button
          onClick={() => setTab('discovered')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'discovered' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Discovered
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'saved' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Saved
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 mb-6 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {domains.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Min Score</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {scoreRanges.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={fetchOpportunities}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>

        {total > 0 && (
          <div className="flex items-end ml-auto">
            <span className="text-sm text-zinc-500">{total} opportunities</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Opportunity List */}
      {!loading && opportunities.length > 0 && (
        <div className="grid gap-4">
          {opportunities.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && opportunities.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-300 mb-2">
            {tab === 'saved' ? 'No saved opportunities' : 'No opportunities discovered yet'}
          </h3>
          <p className="text-sm text-zinc-500 max-w-md">
            {tab === 'saved'
              ? 'Save opportunities from the Discovered tab to track them here.'
              : 'Run the scraper pipeline to discover SaaS opportunities. Opportunities appear here once the intelligence engine detects them.'}
          </p>
        </div>
      )}
    </div>
  );
}
