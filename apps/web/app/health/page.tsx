'use client';

import { useEffect, useState } from 'react';
import { cn, formatDate, statusColor } from '@/lib/utils';

interface ScraperHealth {
  source: string;
  status: 'healthy' | 'degraded' | 'broken' | 'unknown';
  last_success: string | null;
  success_rate: number;
  avg_response_time_ms: number;
  total_runs: number;
  last_error: string | null;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        status === 'unknown'
          ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
          : statusColor(status)
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          status === 'healthy' && 'bg-green-400',
          status === 'degraded' && 'bg-yellow-400',
          status === 'broken' && 'bg-red-400',
          status === 'unknown' && 'bg-zinc-500'
        )}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ResponseTimeBar({ ms }: { ms: number }) {
  const percent = Math.min((ms / 10000) * 100, 100);
  const color =
    ms < 2000 ? 'bg-green-500' : ms < 5000 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums">{ms.toLocaleString()}ms</span>
    </div>
  );
}

export default function HealthPage() {
  const [scrapers, setScrapers] = useState<ScraperHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health/scrapers');
        if (!res.ok) throw new Error('API unavailable');
        const data = await res.json();
        setScrapers(data.scrapers || []);
      } catch {
        setScrapers([]);
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
  }, []);

  const healthySources = scrapers.filter((s) => s.status === 'healthy').length;
  const degradedSources = scrapers.filter((s) => s.status === 'degraded').length;
  const brokenSources = scrapers.filter((s) => s.status === 'broken').length;
  const unknownSources = scrapers.filter((s) => s.status === 'unknown').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Scraper Health</h1>
        <p className="text-zinc-400">
          Monitor the status of each data source used for opportunity discovery.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-400/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{healthySources}</p>
              <p className="text-xs text-zinc-500">Healthy</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-400/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">{degradedSources}</p>
              <p className="text-xs text-zinc-500">Degraded</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-400/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{brokenSources}</p>
              <p className="text-xs text-zinc-500">Broken</p>
            </div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-400/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-400">{unknownSources}</p>
              <p className="text-xs text-zinc-500">Not yet run</p>
            </div>
          </div>
        </div>
      </div>

      {/* Health Table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-zinc-900">
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Source
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Last Success
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Success Rate
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Avg Response Time
              </th>
              <th className="text-left px-6 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Last Error
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-32" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-20" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-28" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-zinc-800 rounded w-36" /></td>
                </tr>
              ))
            ) : (
              scrapers.map((scraper) => (
                <tr
                  key={scraper.source}
                  className="hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-zinc-200">{scraper.source}</span>
                    <span className="block text-xs text-zinc-600 mt-0.5">
                      {scraper.total_runs} total runs
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={scraper.status} />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-zinc-400">
                      {scraper.last_success ? formatDate(scraper.last_success) : 'Never'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {scraper.total_runs === 0 && scraper.success_rate === 0 ? (
                      <span className="text-sm text-zinc-600">-</span>
                    ) : (
                      <span
                        className={cn(
                          'text-sm font-medium tabular-nums',
                          scraper.success_rate >= 90
                            ? 'text-green-400'
                            : scraper.success_rate >= 70
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        )}
                      >
                        {scraper.success_rate.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <ResponseTimeBar ms={scraper.avg_response_time_ms} />
                  </td>
                  <td className="px-6 py-4">
                    {scraper.last_error ? (
                      <span className="text-xs text-red-400 font-mono">{scraper.last_error}</span>
                    ) : (
                      <span className="text-xs text-zinc-600">None</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
