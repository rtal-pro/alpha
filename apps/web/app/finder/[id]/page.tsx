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
// Page
// ---------------------------------------------------------------------------

export default function OpportunityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDismissModal, setShowDismissModal] = useState(false);

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

      {/* Signals */}
      {signals.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Signal Evidence ({signals.length})</h2>
          <div className="space-y-2">
            {signals.map((signal) => (
              <div key={signal.id} className="flex items-center gap-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                    <span className={`text-sm font-bold ${scoreColor(signal.strength)}`}>{signal.strength}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200">{signal.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    <span className="capitalize">{signal.signal_type.replace('_', ' ')}</span>
                    <span className="mx-1.5">·</span>
                    <span>{signal.source}</span>
                    <span className="mx-1.5">·</span>
                    <span>{new Date(signal.detected_at).toLocaleDateString()}</span>
                  </div>
                </div>
                {signal.source_url && (
                  <a
                    href={signal.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline flex-shrink-0"
                  >
                    Source
                  </a>
                )}
              </div>
            ))}
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

      {/* Evidence Summary */}
      {opportunity.evidence_summary && Object.keys(opportunity.evidence_summary).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">Evidence Summary</h2>
          <pre className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 overflow-x-auto">
            {JSON.stringify(opportunity.evidence_summary, null, 2)}
          </pre>
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
