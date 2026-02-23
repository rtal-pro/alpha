'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawEvent {
  id: string;
  source: string;
  source_entity_id: string | null;
  source_url: string | null;
  raw_payload: Record<string, unknown>;
  payload_format: string;
  scrape_method: string;
  http_status: number | null;
  scraped_at: string;
  source_published_at: string | null;
}

interface ScrapeJob {
  id: string;
  source: string;
  job_type: string;
  status: string;
  records_scraped: number;
  records_failed: number;
  created_at: string;
  completed_at: string | null;
}

interface Signal {
  id: string;
  signal_type: string;
  category: string | null;
  title: string;
  description: string | null;
  strength: number;
  source: string;
  source_url: string | null;
  occurred_at: string;
  detected_at: string;
}

// ---------------------------------------------------------------------------
// Source badge colors
// ---------------------------------------------------------------------------

const sourceBadgeColors: Record<string, string> = {
  reddit: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  producthunt: 'bg-red-500/20 text-red-300 border-red-500/30',
  github: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  hacker_news: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  google_trends: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  google_autocomplete: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  eurlex: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  legifrance: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  insee: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  twitter: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  stackoverflow: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  indiehackers: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  serpapi_g2: 'bg-red-500/20 text-red-300 border-red-500/30',
  serpapi_capterra: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  trustpilot: 'bg-green-500/20 text-green-300 border-green-500/30',
  shopify_apps: 'bg-green-500/20 text-green-300 border-green-500/30',
  chrome_webstore: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  zapier: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  crunchbase: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  similarweb: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  builtwith: 'bg-green-500/20 text-green-300 border-green-500/30',
  data_gouv: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  eu_ted: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  boamp: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  job_boards: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  upwork: 'bg-green-500/20 text-green-300 border-green-500/30',
  malt: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  pricing_tracker: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  betalist: 'bg-red-500/20 text-red-300 border-red-500/30',
  alternativeto: 'bg-green-500/20 text-green-300 border-green-500/30',
  acquire: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  wellfound: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  dealroom: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  open_startups: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  saashub: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  starter_story: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  appsumo: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  ycombinator: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  pappers: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  serpapi_serp: 'bg-green-500/20 text-green-300 border-green-500/30',
};

function SourceBadge({ source }: { source: string }) {
  const colors = sourceBadgeColors[source] ?? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors}`}>
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'raw_events' | 'scrape_jobs' | 'signals';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RawDataPage() {
  const [tab, setTab] = useState<Tab>('raw_events');
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (tab === 'raw_events') {
        let query = supabase
          .from('raw_events')
          .select('*')
          .order('scraped_at', { ascending: false })
          .limit(100);

        if (sourceFilter !== 'all') {
          query = query.eq('source', sourceFilter);
        }

        const { data, error: err } = await query;
        if (err) throw err;
        setRawEvents((data as RawEvent[]) ?? []);
      } else if (tab === 'scrape_jobs') {
        let query = supabase
          .from('scrape_jobs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (sourceFilter !== 'all') {
          query = query.eq('source', sourceFilter);
        }

        const { data, error: err } = await query;
        if (err) throw err;
        setScrapeJobs((data as ScrapeJob[]) ?? []);
      } else if (tab === 'signals') {
        let query = supabase
          .from('signals')
          .select('*')
          .order('detected_at', { ascending: false })
          .limit(100);

        if (sourceFilter !== 'all') {
          query = query.eq('source', sourceFilter);
        }

        const { data, error: err } = await query;
        if (err) throw err;
        setSignals((data as Signal[]) ?? []);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [tab, sourceFilter, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Raw Data Explorer</h1>
        <p className="text-zinc-400">
          View raw scraped events, job history, and detected signals.
        </p>
      </div>

      {/* Tab bar + filter */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          {(['raw_events', 'scrape_jobs', 'signals'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedRow(null); }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t === 'raw_events' ? 'Raw Events' : t === 'scrape_jobs' ? 'Scrape Jobs' : 'Signals'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="all">All Sources</option>
            <option value="reddit">Reddit</option>
            <option value="producthunt">Product Hunt</option>
            <option value="github">GitHub</option>
            <option value="hacker_news">Hacker News</option>
            <option value="google_trends">Google Trends</option>
            <option value="google_autocomplete">Google Autocomplete</option>
            <option value="eurlex">EUR-Lex</option>
            <option value="legifrance">Legifrance</option>
            <option value="insee">INSEE</option>
            <option value="twitter">Twitter/X</option>
            <option value="stackoverflow">Stack Overflow</option>
            <option value="indiehackers">Indie Hackers</option>
            <option value="serpapi_g2">G2 Reviews</option>
            <option value="serpapi_capterra">Capterra</option>
            <option value="trustpilot">Trustpilot</option>
            <option value="shopify_apps">Shopify Apps</option>
            <option value="chrome_webstore">Chrome Web Store</option>
            <option value="zapier">Zapier</option>
            <option value="crunchbase">Crunchbase</option>
            <option value="similarweb">SimilarWeb</option>
            <option value="builtwith">BuiltWith</option>
            <option value="data_gouv">Data.gouv.fr</option>
            <option value="eu_ted">EU TED</option>
            <option value="boamp">BOAMP</option>
            <option value="job_boards">Job Boards</option>
            <option value="upwork">Upwork</option>
            <option value="malt">Malt</option>
            <option value="pricing_tracker">Pricing Tracker</option>
            <option value="betalist">BetaList</option>
            <option value="alternativeto">AlternativeTo</option>
            <option value="acquire">Acquire.com</option>
            <option value="wellfound">Wellfound</option>
            <option value="dealroom">Dealroom</option>
            <option value="open_startups">Open Startups</option>
            <option value="saashub">SaaSHub</option>
            <option value="starter_story">Starter Story</option>
            <option value="appsumo">AppSumo</option>
            <option value="ycombinator">Y Combinator</option>
            <option value="pappers">Pappers</option>
            <option value="serpapi_serp">SerpAPI SERP</option>
          </select>

          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
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

      {/* Raw Events Table */}
      {!loading && tab === 'raw_events' && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Entity ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Format</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Scraped At</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rawEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                    No raw events found. Run the scraper to collect data.
                  </td>
                </tr>
              ) : (
                rawEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3">
                      <SourceBadge source={event.source} />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300 font-mono truncate max-w-[200px]">
                      <button
                        onClick={() => setExpandedRow(expandedRow === event.id ? null : event.id)}
                        className="hover:text-blue-400 transition-colors text-left"
                      >
                        {event.source_entity_id ?? event.id.slice(0, 8)}
                      </button>
                      {expandedRow === event.id && (
                        <pre className="mt-2 p-3 rounded-lg bg-zinc-900 text-xs text-zinc-400 overflow-x-auto max-w-[600px] max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(event.raw_payload, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{event.payload_format}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {new Date(event.scraped_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {event.source_url ? (
                        <a
                          href={event.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline truncate block max-w-[200px]"
                        >
                          {event.source_url}
                        </a>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Scrape Jobs Table */}
      {!loading && tab === 'scrape_jobs' && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Job Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Records</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {scrapeJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                    No scrape jobs found.
                  </td>
                </tr>
              ) : (
                scrapeJobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3">
                      <SourceBadge source={job.source} />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300">{job.job_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        job.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        job.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                        job.status === 'running' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-zinc-500/20 text-zinc-300'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {job.records_scraped} scraped
                      {job.records_failed > 0 && (
                        <span className="text-red-400 ml-1">/ {job.records_failed} failed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Signals Table */}
      {!loading && tab === 'signals' && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Strength</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Detected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    No signals detected yet. Run the scraper pipeline to detect signals.
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr key={signal.id}>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        {signal.signal_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-200 max-w-[300px] truncate">
                      {signal.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {signal.category ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-zinc-800">
                          <div
                            className={`h-2 rounded-full ${
                              signal.strength >= 75 ? 'bg-green-500' :
                              signal.strength >= 50 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${signal.strength}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400">{signal.strength}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={signal.source} />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400">
                      {new Date(signal.detected_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats footer */}
      {!loading && (
        <div className="mt-4 text-xs text-zinc-600 text-right">
          {tab === 'raw_events' && `${rawEvents.length} events`}
          {tab === 'scrape_jobs' && `${scrapeJobs.length} jobs`}
          {tab === 'signals' && `${signals.length} signals`}
          {sourceFilter !== 'all' && ` (filtered: ${sourceFilter})`}
        </div>
      )}
    </div>
  );
}
