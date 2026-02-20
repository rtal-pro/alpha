'use client';

import { useState, useEffect } from 'react';

interface SourceHealth {
  source: string;
  status: 'healthy' | 'degraded' | 'broken' | 'unknown';
  lastSuccess: string | null;
  successRate7d: number | null;
  avgResponseMs: number | null;
}

const SOURCES: SourceHealth[] = [
  { source: 'reddit', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'producthunt', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'github', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'google_trends', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'hacker_news', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'appsumo', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'indiehackers', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'eurlex', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'legifrance', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
  { source: 'insee', status: 'unknown', lastSuccess: null, successRate7d: null, avgResponseMs: null },
];

function statusBadge(status: string) {
  switch (status) {
    case 'healthy':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Healthy</span>;
    case 'degraded':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">Degraded</span>;
    case 'broken':
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-400/10 text-red-400 border border-red-400/20">Broken</span>;
    default:
      return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-zinc-400/10 text-zinc-400 border border-zinc-400/20">Unknown</span>;
  }
}

export default function HealthPage() {
  const [sources, setSources] = useState<SourceHealth[]>(SOURCES);
  const [serviceStatus, setServiceStatus] = useState<string>('checking...');

  useEffect(() => {
    async function checkHealth() {
      try {
        const scraperUrl = process.env.NEXT_PUBLIC_SCRAPER_SERVICE_URL || 'http://localhost:3001';
        const res = await fetch(`${scraperUrl}/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          setServiceStatus(data.status || 'connected');
          if (data.sources) {
            setSources((prev) =>
              prev.map((s) => ({
                ...s,
                ...data.sources[s.source],
              }))
            );
          }
        } else {
          setServiceStatus('error');
        }
      } catch {
        setServiceStatus('offline');
      }
    }
    checkHealth();
  }, []);

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Scraper Health</h1>
        <p className="text-zinc-400">
          Monitor the status of all data source scrapers.
        </p>
      </div>

      {/* Service Status */}
      <div className="mb-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              serviceStatus === 'healthy' || serviceStatus === 'connected'
                ? 'bg-green-400'
                : serviceStatus === 'offline'
                  ? 'bg-red-400'
                  : 'bg-yellow-400'
            }`}
          />
          <span className="text-sm font-medium text-zinc-300">Scraper Service:</span>
          <span className="text-sm text-zinc-400">{serviceStatus}</span>
        </div>
      </div>

      {/* Sources Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/50 border-b border-zinc-800">
              <th className="text-left px-4 py-3 font-medium text-zinc-400">Source</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-400">Last Success</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-400">Success Rate (7d)</th>
              <th className="text-left px-4 py-3 font-medium text-zinc-400">Avg Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sources.map((source) => (
              <tr key={source.source} className="hover:bg-zinc-900/30 transition-colors">
                <td className="px-4 py-3 font-medium text-zinc-200">{source.source}</td>
                <td className="px-4 py-3">{statusBadge(source.status)}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {source.lastSuccess || 'Never'}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {source.successRate7d != null ? `${(source.successRate7d * 100).toFixed(0)}%` : '-'}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {source.avgResponseMs != null ? `${source.avgResponseMs}ms` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
