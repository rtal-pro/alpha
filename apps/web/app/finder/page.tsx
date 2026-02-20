'use client';

import { useState } from 'react';

const domains = ['All Domains', 'CRM', 'E-commerce', 'FinTech', 'HealthTech', 'EdTech', 'DevTools', 'MarTech'];
const regions = ['All Regions', 'FR', 'US', 'EU', 'Global'];
const scoreRanges = ['Any Score', '90+', '80+', '70+', '60+', '50+'];

export default function FinderPage() {
  const [domain, setDomain] = useState('All Domains');
  const [region, setRegion] = useState('All Regions');
  const [score, setScore] = useState('Any Score');

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Idea Finder</h1>
        <p className="text-zinc-400">
          Browse discovered SaaS opportunities from automated scraping.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 mb-8 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Domain</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Minimum Score</label>
          <select
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {scoreRanges.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
            Apply Filters
          </button>
        </div>
      </div>

      {/* Empty State */}
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">
          No opportunities found yet
        </h3>
        <p className="text-sm text-zinc-500 max-w-md mb-6">
          Run the scraper to discover SaaS opportunities from forums, reviews,
          and communities. Opportunities will appear here once discovered.
        </p>
        <button className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors">
          Learn how to run the scraper
        </button>
      </div>
    </div>
  );
}
