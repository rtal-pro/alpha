'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn, formatDate, statusColor } from '@/lib/utils';

interface AnalysisSummary {
  id: string;
  idea_description: string;
  target_market: string;
  status: string;
  overall_score: number | null;
  created_at: string;
  sections_completed: number;
  sections_total: number;
}

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch('/api/analyze');
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();
        setAnalyses(data.analyses || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Analysis History</h1>
          <p className="text-zinc-400">View and revisit your past analyses.</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-3/4 mb-3" />
              <div className="h-3 bg-zinc-800 rounded w-1/2 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Analysis History</h1>
        <p className="text-zinc-400">View and revisit your past analyses.</p>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!error && analyses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-300 mb-2">No analyses yet</h3>
          <p className="text-sm text-zinc-500 max-w-md mb-6">
            You haven&apos;t created any analyses yet. Start by analyzing your first SaaS idea.
          </p>
          <Link
            href="/analyzer/new"
            className="px-6 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Analyze an Idea
          </Link>
        </div>
      )}

      {/* Analyses List */}
      {analyses.length > 0 && (
        <div className="space-y-3">
          {analyses.map((analysis) => (
            <Link
              key={analysis.id}
              href={`/analyzer/${analysis.id}`}
              className="block p-6 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium border',
                        statusColor(analysis.status)
                      )}
                    >
                      {analysis.status}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {analysis.target_market}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-zinc-200 mb-1 truncate group-hover:text-zinc-100 transition-colors">
                    {analysis.idea_description}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{formatDate(analysis.created_at)}</span>
                    <span>
                      {analysis.sections_completed}/{analysis.sections_total} sections
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div className="flex-shrink-0 text-right">
                  {analysis.overall_score !== null ? (
                    <div>
                      <div
                        className={cn(
                          'text-2xl font-bold',
                          analysis.overall_score >= 80
                            ? 'text-green-400'
                            : analysis.overall_score >= 60
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        )}
                      >
                        {analysis.overall_score}
                      </div>
                      <div className="text-xs text-zinc-500">/ 100</div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">--</div>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {analysis.sections_total > 0 && (
                <div className="mt-4">
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{
                        width: `${(analysis.sections_completed / analysis.sections_total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
