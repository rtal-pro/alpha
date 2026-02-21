'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { cn, formatDate, statusColor } from '@/lib/utils';

interface Section {
  id: string;
  section_number: number;
  title: string;
  status: 'pending' | 'generating' | 'generated' | 'locked';
  content: string | null;
  confidence_score: number | null;
  data_sources: string[];
}

interface Analysis {
  id: string;
  idea_description: string;
  target_market: string;
  target_user: string | null;
  solo_founder: boolean;
  budget_constraint: string;
  status: string;
  overall_score: number | null;
  created_at: string;
  sections: Section[];
}

const SECTION_TITLES: Record<number, string> = {
  1: 'Executive Summary',
  2: 'Problem Analysis',
  3: 'Target Market',
  4: 'Market Size (TAM/SAM/SOM)',
  5: 'Competitive Landscape',
  6: 'Unique Value Proposition',
  7: 'Business Model',
  8: 'Pricing Strategy',
  9: 'Go-to-Market Strategy',
  10: 'Technical Architecture',
  11: 'MVP Feature Set',
  12: 'Development Roadmap',
  13: 'Team Requirements',
  14: 'Financial Projections',
  15: 'Risk Analysis',
  16: 'Legal & Compliance',
  17: 'KPIs & Metrics',
  18: 'Final Score & Recommendation',
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
        </svg>
      );
    case 'generating':
      return (
        <svg className="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    case 'generated':
      return (
        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'locked':
      return (
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
        </svg>
      );
  }
}

export default function AnalysisViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const analysisId = params.id as string;

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selectedSection, setSelectedSection] = useState<number>(
    Number(searchParams.get('section')) || 1
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${analysisId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch analysis: ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  // Fetch analysis data on mount
  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Subscribe to Supabase Realtime for progress updates
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    try {
      const supabase = createClient();
      channel = supabase
        .channel(`analysis-${analysisId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'analysis_sections',
            filter: `analysis_id=eq.${analysisId}`,
          },
          (payload) => {
            const updated = payload.new as Section;
            setAnalysis((prev) => {
              if (!prev) return prev;
              const sections = prev.sections.map((s) =>
                s.section_number === updated.section_number ? { ...s, ...updated } : s
              );
              return { ...prev, sections };
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'analyses',
            filter: `id=eq.${analysisId}`,
          },
          (payload) => {
            const updated = payload.new as Partial<Analysis>;
            setAnalysis((prev) => (prev ? { ...prev, ...updated } : prev));
          }
        )
        .subscribe();
    } catch {
      // Supabase env vars may not be set; silently ignore
    }

    return () => {
      if (channel) {
        const supabase = createClient();
        supabase.removeChannel(channel);
      }
    };
  }, [analysisId]);

  const currentSection = analysis?.sections?.find((s) => s.section_number === selectedSection);

  const handleRegenerate = async (sectionNumber: number) => {
    try {
      await fetch(`/api/analyze/${analysisId}/sections/${sectionNumber}/regenerate`, {
        method: 'POST',
      });
      // Optimistically set status to generating
      setAnalysis((prev) => {
        if (!prev) return prev;
        const sections = prev.sections.map((s) =>
          s.section_number === sectionNumber ? { ...s, status: 'generating' as const, content: null } : s
        );
        return { ...prev, sections };
      });
    } catch {
      // ignore for now
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <svg className="animate-spin w-8 h-8 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-zinc-400 text-sm">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-red-400/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-2">Failed to load analysis</h3>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={() => router.push('/history')}
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            Back to History
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  // Build section list (1-18), using analysis data if available or defaults
  const sections: Section[] = Array.from({ length: 18 }, (_, i) => {
    const num = i + 1;
    const existing = analysis.sections?.find((s) => s.section_number === num);
    return (
      existing || {
        id: `placeholder-${num}`,
        section_number: num,
        title: SECTION_TITLES[num] || `Section ${num}`,
        status: 'pending' as const,
        content: null,
        confidence_score: null,
        data_sources: [],
      }
    );
  });

  const activeSection = sections.find((s) => s.section_number === selectedSection) || sections[0];

  return (
    <div className="flex h-screen">
      {/* Left Sidebar - Section List */}
      <div className="w-72 border-r border-zinc-800 bg-zinc-950 overflow-y-auto flex-shrink-0">
        {/* Analysis Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn('px-2 py-0.5 rounded text-xs font-medium border', statusColor(analysis.status))}>
              {analysis.status}
            </span>
            {analysis.overall_score !== null && (
              <span className="text-xs text-zinc-400">
                Score: {analysis.overall_score}/100
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate" title={analysis.idea_description}>
            {analysis.idea_description}
          </p>
          <p className="text-xs text-zinc-600 mt-1">{formatDate(analysis.created_at)}</p>
        </div>

        {/* Section List */}
        <nav className="p-2">
          <ul className="space-y-0.5">
            {sections.map((section) => (
              <li key={section.section_number}>
                <button
                  onClick={() => setSelectedSection(section.section_number)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                    selectedSection === section.section_number
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  )}
                >
                  <StatusIcon status={section.status} />
                  <span className="flex-1 truncate">
                    <span className="text-zinc-500 mr-1.5">{section.section_number}.</span>
                    {section.title || SECTION_TITLES[section.section_number]}
                  </span>
                  {section.confidence_score !== null && (
                    <span className="text-xs text-zinc-500">{section.confidence_score}%</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Right Panel - Section Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-4xl">
          {/* Section Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-zinc-500 text-sm font-mono">
                {activeSection.section_number}/18
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium border',
                  statusColor(activeSection.status)
                )}
              >
                {activeSection.status}
              </span>
              {activeSection.confidence_score !== null && (
                <span className="text-sm text-zinc-400">
                  Confidence: {activeSection.confidence_score}%
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-zinc-100">
              {activeSection.title || SECTION_TITLES[activeSection.section_number]}
            </h2>
          </div>

          {/* Section Content */}
          {activeSection.status === 'pending' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">
                This section is pending generation. It will be processed in order.
              </p>
            </div>
          )}

          {activeSection.status === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="animate-spin w-8 h-8 text-yellow-400 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-yellow-400 text-sm font-medium mb-1">Generating...</p>
              <p className="text-zinc-500 text-xs">
                AI is analyzing this section. This may take a moment.
              </p>
            </div>
          )}

          {(activeSection.status === 'generated' || activeSection.status === 'locked') &&
            activeSection.content && (
              <div>
                {/* Rendered Content */}
                <div
                  className="prose prose-invert prose-zinc max-w-none mb-8
                    prose-headings:text-zinc-200 prose-p:text-zinc-300
                    prose-strong:text-zinc-200 prose-code:text-blue-400
                    prose-li:text-zinc-300 prose-a:text-blue-400
                    prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800"
                  dangerouslySetInnerHTML={{ __html: activeSection.content }}
                />

                {/* Data Sources */}
                {activeSection.data_sources && activeSection.data_sources.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-zinc-800">
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      Data Sources
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {activeSection.data_sources.map((source, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-xs text-zinc-400"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-6 pt-6 border-t border-zinc-800 flex gap-3">
                  <button
                    onClick={() => handleRegenerate(activeSection.section_number)}
                    disabled={activeSection.status === 'locked'}
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Re-generate
                  </button>
                  <button
                    disabled
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 opacity-50 cursor-not-allowed flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    disabled
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 opacity-50 cursor-not-allowed flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Lock
                  </button>
                </div>
              </div>
            )}

          {/* Navigation between sections */}
          <div className="mt-8 pt-6 border-t border-zinc-800 flex justify-between">
            <button
              onClick={() => setSelectedSection(Math.max(1, selectedSection - 1))}
              disabled={selectedSection === 1}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setSelectedSection(Math.min(18, selectedSection + 1))}
              disabled={selectedSection === 18}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
