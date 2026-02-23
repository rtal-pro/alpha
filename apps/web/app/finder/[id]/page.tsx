'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Opportunity {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  type: string | null;
  composite_score: number | null;
  growth_score: number | null;
  gap_score: number | null;
  regulatory_score: number | null;
  feasibility_score: number | null;
  source_signals: string[];
  source_regulations: string[];
  evidence_summary: Record<string, unknown> | null;
  score_history: Array<{ score: number; timestamp: string; signal_count: number }> | null;
  target_geo: string | null;
  reference_geo: string | null;
  detection_count: number | null;
  status: string;
  created_at: string;
  last_detected_at: string | null;
}

interface Signal {
  id: string;
  signal_type: string;
  title: string;
  description: string | null;
  strength: number;
  category: string | null;
  source: string;
  source_url: string | null;
  occurred_at: string;
  detected_at: string;
}

interface Idea {
  id: string;
  title: string;
  one_liner: string | null;
  target_persona: string | null;
  core_features: string[];
  differentiation: string | null;
  entry_strategy: string | null;
  estimated_complexity: string | null;
  revenue_model: string | null;
  why_now: string | null;
  status: string;
  freshness: number | null;
  created_at: string;
}

interface RawEvent {
  id: string;
  source: string;
  source_url: string | null;
  source_entity_id: string | null;
  raw_payload: Record<string, unknown> | null;
  scraped_at: string;
}

interface Product {
  id: string;
  canonical_name: string;
  primary_category: string | null;
  website_url: string | null;
  description: string | null;
  source_ids: Record<string, string> | null;
  tags: string[] | null;
}

interface Regulation {
  id: string;
  title: string;
  short_name: string | null;
  jurisdiction: string;
  domain: string;
  transition_deadline: string | null;
  mandatory: boolean;
  forced_adoption: boolean;
  summary: string | null;
  requirements: string[] | null;
  market_impact_score: number | null;
}

interface Trajectory {
  current_score: number | null;
  score_7d_ago: number | null;
  score_30d_ago: number | null;
  delta_7d: number | null;
  delta_30d: number | null;
  trajectory: string | null;
}

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

const DISMISS_REASONS = [
  { value: 'market_too_small', label: 'Market too small' },
  { value: 'too_competitive', label: 'Too competitive' },
  { value: 'not_my_expertise', label: 'Not my expertise' },
  { value: 'bad_timing', label: 'Bad timing' },
  { value: 'already_exists_fr', label: 'Already exists in FR' },
  { value: 'not_interesting', label: 'Not interesting' },
  { value: 'too_complex', label: 'Too complex' },
  { value: 'wrong_category', label: 'Wrong category' },
];

// ---------------------------------------------------------------------------
// Evidence Summary Component
// ---------------------------------------------------------------------------

function EvidenceSummary({ type, data }: { type: string | null; data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  // Type-specific rendering
  if (type === 'convergence') {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(data.signal_types as string[] | undefined)?.map((t) => (
            <span key={t} className="px-2.5 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 capitalize">
              {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="text-zinc-500">Signals:</span> <span className="text-zinc-200">{data.signal_count as number}</span></div>
          <div><span className="text-zinc-500">Avg Strength:</span> <span className="text-zinc-200">{data.avg_strength as number}/100</span></div>
          <div><span className="text-zinc-500">Sources:</span> <span className="text-zinc-200">{(data.unique_sources as string[])?.join(', ')}</span></div>
        </div>
      </div>
    );
  }

  if (type === 'oss_commercial_gap') {
    const topProjects = data.top_projects as Array<{ name: string; strength: number; source_url?: string }> | undefined;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-zinc-500">Projects Found:</span> <span className="text-zinc-200">{data.project_count as number}</span></div>
          <div><span className="text-zinc-500">Avg Strength:</span> <span className="text-zinc-200">{data.avg_strength as number}/100</span></div>
        </div>
        {topProjects && topProjects.length > 0 && (
          <div>
            <div className="text-xs text-zinc-500 font-medium mb-2">Top Projects</div>
            <div className="space-y-1.5">
              {topProjects.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50">
                  <span className="text-sm text-zinc-200">{p.name}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${scoreColor(p.strength)}`}>{p.strength}</span>
                    {p.source_url && (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                        View
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === 'regulatory_gap') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Regulation:</span> <span className="text-zinc-200">{(data.short_name ?? data.regulation_title) as string}</span></div>
          <div><span className="text-zinc-500">Jurisdiction:</span> <span className="text-zinc-200">{data.jurisdiction as string}</span></div>
          <div><span className="text-zinc-500">Deadline:</span> <span className="text-zinc-200">{data.deadline ? new Date(data.deadline as string).toLocaleDateString() : 'N/A'}</span></div>
          <div><span className="text-zinc-500">FR Solutions:</span> <span className="text-zinc-200">{data.fr_solution_count as number}</span></div>
        </div>
        <div className="flex gap-2">
          {!!data.mandatory && <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-300">Mandatory</span>}
          {!!data.forced_adoption && <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-300">Forced Adoption</span>}
        </div>
      </div>
    );
  }

  if (type === 'competitor_weakness') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Competitor:</span> <span className="text-zinc-200">{data.competitor_name as string}</span></div>
          <div><span className="text-zinc-500">Country:</span> <span className="text-zinc-200">{data.competitor_country as string}</span></div>
          <div><span className="text-zinc-500">Pain Signals:</span> <span className="text-zinc-200">{data.pain_signal_count as number}</span></div>
          <div><span className="text-zinc-500">Avg Pain:</span> <span className="text-zinc-200">{data.avg_pain_strength as number}/100</span></div>
        </div>
      </div>
    );
  }

  if (type === 'funding_follows_pain') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Total Raised:</span> <span className="text-zinc-200">${formatEvidence(data.total_raised as number)}</span></div>
          <div><span className="text-zinc-500">Companies:</span> <span className="text-zinc-200">{data.unique_companies as number}</span></div>
          <div><span className="text-zinc-500">Pain Signals:</span> <span className="text-zinc-200">{data.pain_signal_count as number}</span></div>
          <div><span className="text-zinc-500">Avg Pain:</span> <span className="text-zinc-200">{data.avg_pain_strength as number}/100</span></div>
        </div>
        {Array.isArray(data.pain_types) && (
          <div className="flex gap-2">
            {(data.pain_types as string[]).map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400 capitalize">{t.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'platform_risk' || type === 'api_sunset_gap') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Disruption Signals:</span> <span className="text-zinc-200">{(data.consolidation_signal_count ?? data.signal_count) as number}</span></div>
          <div><span className="text-zinc-500">Concern Signals:</span> <span className="text-zinc-200">{(data.concern_signal_count ?? data.related_pain_count) as number}</span></div>
          <div><span className="text-zinc-500">Avg Strength:</span> <span className="text-zinc-200">{(data.avg_consolidation_strength ?? data.avg_strength) as number}/100</span></div>
        </div>
        {Array.isArray(data.affected_platforms) && data.affected_platforms.length > 0 && (
          <div>
            <span className="text-zinc-500 text-xs">Affected: </span>
            {(data.affected_platforms as string[]).map((p) => (
              <span key={p} className="px-2 py-0.5 text-xs rounded bg-red-500/10 text-red-300 mr-1">{p}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'talent_migration') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Job Postings:</span> <span className="text-zinc-200">{data.posting_count as number}</span></div>
          <div><span className="text-zinc-500">Companies:</span> <span className="text-zinc-200">{data.unique_companies as number}</span></div>
          <div><span className="text-zinc-500">Tech Signals:</span> <span className="text-zinc-200">{data.tech_signal_count as number}</span></div>
          <div><span className="text-zinc-500">Talent Strength:</span> <span className="text-zinc-200">{data.talent_strength as number}/100</span></div>
        </div>
      </div>
    );
  }

  if (type === 'geo_gap') {
    return (
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-zinc-500">Reference Products:</span> <span className="text-zinc-200">{data.reference_products as number}</span></div>
          <div><span className="text-zinc-500">Target Products:</span> <span className="text-zinc-200">{data.target_products as number}</span></div>
          <div><span className="text-zinc-500">Gap Type:</span> <span className="text-zinc-200">{data.gap_type as string}</span></div>
        </div>
      </div>
    );
  }

  // Generic fallback — render key-value pairs nicely instead of raw JSON
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span className="text-zinc-500 capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
          <span className="text-zinc-200">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatEvidence(amount: number | undefined): string {
  if (!amount) return '0';
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [expandedSignal, setExpandedSignal] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const res = await fetch(`/api/finder/${id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setOpportunity(data.opportunity);
        setSignals(data.signals ?? []);
        setIdeas(data.ideas ?? []);
        setRawEvents(data.rawEvents ?? []);
        setProducts(data.products ?? []);
        setRegulations(data.regulations ?? []);
        setTrajectory(data.trajectory ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [id]);

  const handleFeedback = async (type: string, dismissCategory?: string) => {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        opportunity_id: id,
        dismiss_category: dismissCategory,
      }),
    });
    router.push('/finder');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !opportunity) {
    return (
      <div className="p-8">
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-800 text-red-300 text-sm">
          {error ?? 'Opportunity not found'}
        </div>
        <Link href="/finder" className="text-blue-400 hover:underline text-sm mt-4 block">
          Back to Finder
        </Link>
      </div>
    );
  }

  const score = opportunity.composite_score ?? 0;

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/finder" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Finder
        </Link>
        <span className="text-zinc-600 mx-2">/</span>
        <span className="text-sm text-zinc-300">{opportunity.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">{opportunity.title}</h1>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
              opportunity.type === 'geo_gap' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
              opportunity.type === 'regulatory_gap' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
              opportunity.type === 'convergence' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
              opportunity.type === 'oss_commercial_gap' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
              opportunity.type === 'funding_follows_pain' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
              opportunity.type === 'talent_migration' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' :
              opportunity.type === 'platform_risk' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
              opportunity.type === 'api_sunset_gap' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
              'bg-red-500/20 text-red-300 border-red-500/30'
            }`}>
              {opportunity.type?.replace('_', ' ')}
            </span>
            {opportunity.category && (
              <span className="text-sm text-zinc-400">{opportunity.category}</span>
            )}
            {opportunity.target_geo && (
              <span className="text-sm text-zinc-500">Target: {opportunity.target_geo}</span>
            )}
            {opportunity.reference_geo && (
              <span className="text-sm text-zinc-500">Ref: {opportunity.reference_geo}</span>
            )}
          </div>
        </div>

        <div className={`w-20 h-20 rounded-full flex items-center justify-center border-3 ${
          score >= 75 ? 'border-green-500/50' : score >= 50 ? 'border-yellow-500/50' : 'border-red-500/50'
        }`} style={{ borderWidth: '3px' }}>
          <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
        </div>
      </div>

      {/* Description */}
      {opportunity.description && (
        <div className="mb-8 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <p className="text-sm text-zinc-300 leading-relaxed">{opportunity.description}</p>
        </div>
      )}

      {/* Score Decomposition */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Score Decomposition</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Growth', value: opportunity.growth_score ?? 0, icon: '↗' },
            { label: 'Gap', value: opportunity.gap_score ?? 0, icon: '◉' },
            { label: 'Regulatory', value: opportunity.regulatory_score ?? 0, icon: '⚖' },
            { label: 'Feasibility', value: opportunity.feasibility_score ?? 0, icon: '✓' },
          ].map((s) => (
            <div key={s.label} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-400">{s.icon} {s.label}</span>
                <span className={`text-lg font-bold ${scoreColor(s.value)}`}>{s.value}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800">
                <div className={`h-2 rounded-full ${scoreBg(s.value)}`} style={{ width: `${s.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trajectory */}
      {trajectory && (
        <div className="mb-8 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Score Trajectory</h2>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs text-zinc-500">7d change</span>
              <div className={`text-lg font-bold ${
                (trajectory.delta_7d ?? 0) > 0 ? 'text-green-400' :
                (trajectory.delta_7d ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400'
              }`}>
                {(trajectory.delta_7d ?? 0) > 0 ? '+' : ''}{trajectory.delta_7d ?? 0}
              </div>
            </div>
            <div>
              <span className="text-xs text-zinc-500">30d change</span>
              <div className={`text-lg font-bold ${
                (trajectory.delta_30d ?? 0) > 0 ? 'text-green-400' :
                (trajectory.delta_30d ?? 0) < 0 ? 'text-red-400' : 'text-zinc-400'
              }`}>
                {(trajectory.delta_30d ?? 0) > 0 ? '+' : ''}{trajectory.delta_30d ?? 0}
              </div>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Trend</span>
              <div className={`text-lg font-bold ${
                trajectory.trajectory === 'rising' ? 'text-green-400' :
                trajectory.trajectory === 'falling' ? 'text-red-400' : 'text-zinc-400'
              }`}>
                {trajectory.trajectory ?? 'stable'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signals with expandable evidence */}
      {signals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Signal Evidence ({signals.length})</h2>
          <div className="space-y-2">
            {signals.map((signal) => {
              const isExpanded = expandedSignal === signal.id;
              const matchingRawEvent = rawEvents.find((re) => re.id === (signal as unknown as { raw_event_id?: string }).raw_event_id);
              return (
                <div key={signal.id} className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
                  <button
                    onClick={() => setExpandedSignal(isExpanded ? null : signal.id)}
                    className="w-full flex items-center gap-4 p-3 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <span className={`text-sm font-bold ${scoreColor(signal.strength)}`}>{signal.strength}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{signal.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        <span className="capitalize">{signal.signal_type.replace(/_/g, ' ')}</span>
                        <span className="mx-1.5">·</span>
                        <span>{signal.source}</span>
                        <span className="mx-1.5">·</span>
                        <span>{new Date(signal.detected_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {signal.source_url && (
                        <a
                          href={signal.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Source
                        </a>
                      )}
                      <span className={`text-zinc-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
                      {/* Signal description */}
                      {signal.description && (
                        <p className="text-sm text-zinc-400">{signal.description}</p>
                      )}

                      {/* Signal metadata */}
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">
                          Category: {signal.category ?? 'N/A'}
                        </span>
                        <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">
                          Strength: {signal.strength}/100
                        </span>
                      </div>

                      {/* Raw event data */}
                      {matchingRawEvent && (
                        <div className="mt-2">
                          <div className="text-xs text-zinc-500 font-medium mb-1">Raw Scraped Data</div>
                          <div className="p-3 rounded-lg bg-zinc-800/50 text-xs">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-zinc-500">Source:</span>
                              <span className="text-zinc-300">{matchingRawEvent.source}</span>
                              {matchingRawEvent.source_url && (
                                <a href={matchingRawEvent.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-auto">
                                  View original
                                </a>
                              )}
                            </div>
                            <div className="text-zinc-500 mb-1">
                              Scraped: {new Date(matchingRawEvent.scraped_at).toLocaleString()}
                            </div>
                            {matchingRawEvent.raw_payload && (
                              <details className="mt-2">
                                <summary className="text-zinc-500 cursor-pointer hover:text-zinc-300">
                                  View payload
                                </summary>
                                <pre className="mt-1 text-zinc-400 overflow-x-auto max-h-40 overflow-y-auto">
                                  {JSON.stringify(matchingRawEvent.raw_payload, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ideas */}
      {ideas.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Product Ideas ({ideas.length})</h2>
          <div className="grid gap-4">
            {ideas.map((idea) => (
              <div key={idea.id} className="p-5 rounded-xl bg-zinc-900 border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-100 mb-1">{idea.title}</h3>
                {idea.one_liner && (
                  <p className="text-sm text-zinc-400 mb-3">{idea.one_liner}</p>
                )}
                {idea.core_features.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs text-zinc-500 font-medium">Core Features:</span>
                    <ul className="mt-1 space-y-1">
                      {idea.core_features.map((f, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                          <span className="text-zinc-600 mt-0.5">-</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {idea.target_persona && (
                    <div><span className="text-zinc-500">Persona:</span> <span className="text-zinc-300">{idea.target_persona}</span></div>
                  )}
                  {idea.revenue_model && (
                    <div><span className="text-zinc-500">Revenue:</span> <span className="text-zinc-300">{idea.revenue_model}</span></div>
                  )}
                  {idea.estimated_complexity && (
                    <div><span className="text-zinc-500">Complexity:</span> <span className="text-zinc-300">{idea.estimated_complexity}</span></div>
                  )}
                </div>
                {idea.why_now && (
                  <div className="mt-3 p-2 rounded-lg bg-zinc-800/50">
                    <span className="text-xs text-zinc-500 font-medium">Why now:</span>
                    <p className="text-sm text-zinc-300 mt-0.5">{idea.why_now}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structured Evidence Summary */}
      {opportunity.evidence_summary && Object.keys(opportunity.evidence_summary).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Evidence Summary</h2>
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <EvidenceSummary type={opportunity.type} data={opportunity.evidence_summary} />
          </div>
        </div>
      )}

      {/* Source Products */}
      {products.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Related Products ({products.length})</h2>
          <div className="grid gap-3">
            {products.map((product) => (
              <div key={product.id} className="flex items-center gap-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{product.canonical_name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {product.primary_category && <span className="capitalize">{product.primary_category}</span>}
                    {product.tags && product.tags.length > 0 && (
                      <span className="ml-2">{product.tags.slice(0, 3).join(', ')}</span>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{product.description}</p>
                  )}
                </div>
                {product.website_url && (
                  <a href={product.website_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline flex-shrink-0">
                    Visit
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regulations */}
      {regulations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Related Regulations ({regulations.length})</h2>
          <div className="grid gap-3">
            {regulations.map((reg) => (
              <div key={reg.id} className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-zinc-200">
                    {reg.short_name ?? reg.title}
                  </div>
                  <div className="flex items-center gap-2">
                    {reg.mandatory && (
                      <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-300 border border-red-500/30">
                        Mandatory
                      </span>
                    )}
                    <span className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-400">
                      {reg.jurisdiction}
                    </span>
                  </div>
                </div>
                {reg.summary && (
                  <p className="text-xs text-zinc-400 mb-2">{reg.summary}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  {reg.transition_deadline && (
                    <span>Deadline: {new Date(reg.transition_deadline).toLocaleDateString()}</span>
                  )}
                  {reg.market_impact_score != null && (
                    <span>Impact: {reg.market_impact_score}/100</span>
                  )}
                </div>
                {reg.requirements && reg.requirements.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                      Requirements ({reg.requirements.length})
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {reg.requirements.map((req, i) => (
                        <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                          <span className="text-zinc-600">-</span>
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-6 border-t border-zinc-800">
        <button
          onClick={() => handleFeedback('pursue')}
          className="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
        >
          Pursue
        </button>
        <button
          onClick={() => handleFeedback('save')}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Save
        </button>
        <button
          onClick={() => handleFeedback('archive')}
          className="px-5 py-2.5 rounded-lg bg-zinc-700 text-zinc-200 text-sm font-medium hover:bg-zinc-600 transition-colors"
        >
          Archive
        </button>
        <button
          onClick={() => setShowDismissModal(true)}
          className="px-5 py-2.5 rounded-lg bg-zinc-800 text-red-400 text-sm font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
        >
          Dismiss with Reason
        </button>
      </div>

      {/* Dismiss Modal */}
      {showDismissModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-zinc-100 mb-4">Dismiss Opportunity</h3>
            <p className="text-sm text-zinc-400 mb-4">Select a reason to help the system learn:</p>
            <div className="space-y-2 mb-6">
              {DISMISS_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  onClick={() => {
                    setShowDismissModal(false);
                    handleFeedback('dismiss', reason.value);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                >
                  {reason.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDismissModal(false)}
              className="w-full px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
