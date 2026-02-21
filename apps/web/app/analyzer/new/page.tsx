'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const markets = [
  { value: 'FR', label: 'France (FR)' },
  { value: 'US', label: 'United States (US)' },
  { value: 'EU', label: 'Europe (EU)' },
  { value: 'Global', label: 'Global' },
];

const budgets = [
  { value: 'bootstrap', label: 'Bootstrap (< $1K/mo)' },
  { value: 'small_funding', label: 'Small Funding ($1K - $10K/mo)' },
  { value: 'funded', label: 'Funded ($10K+/mo)' },
];

export default function NewAnalysisPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    idea_description: '',
    target_market: 'FR',
    target_user: '',
    solo_founder: true,
    budget_constraint: 'bootstrap',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.idea_description.slice(0, 80),
          ideaDescription: formData.idea_description,
          preferences: {
            targetMarket: formData.target_market,
            targetUser: formData.target_user || undefined,
            soloFounder: formData.solo_founder,
            budgetConstraint: formData.budget_constraint,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      router.push(`/analyzer/${data.analysisId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Analyze a SaaS Idea</h1>
        <p className="text-zinc-400">
          Describe your idea and we&apos;ll generate an 18-section deep analysis with market data,
          competitive landscape, and actionable scoring.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Idea Description */}
        <div className="space-y-2">
          <label htmlFor="idea_description" className="block text-sm font-medium text-zinc-300">
            Idea Description <span className="text-red-400">*</span>
          </label>
          <textarea
            id="idea_description"
            name="idea_description"
            required
            rows={5}
            value={formData.idea_description}
            onChange={handleChange}
            placeholder="Describe your SaaS idea in detail. What problem does it solve? Who is it for? What makes it unique?"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-vertical"
          />
          <p className="text-xs text-zinc-500">
            Be as specific as possible. The more detail you provide, the better the analysis.
          </p>
        </div>

        {/* Target Market */}
        <div className="space-y-2">
          <label htmlFor="target_market" className="block text-sm font-medium text-zinc-300">
            Target Market
          </label>
          <select
            id="target_market"
            name="target_market"
            value={formData.target_market}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            {markets.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Target User */}
        <div className="space-y-2">
          <label htmlFor="target_user" className="block text-sm font-medium text-zinc-300">
            Target User
          </label>
          <input
            type="text"
            id="target_user"
            name="target_user"
            value={formData.target_user}
            onChange={handleChange}
            placeholder="e.g., Small business owners, DevOps engineers, Marketing managers"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
          <p className="text-xs text-zinc-500">
            Optional. Specify the primary user persona for more targeted analysis.
          </p>
        </div>

        {/* Solo Founder */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="solo_founder"
            name="solo_founder"
            checked={formData.solo_founder}
            onChange={handleChange}
            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-blue-600 focus:ring-blue-600 focus:ring-offset-0"
          />
          <label htmlFor="solo_founder" className="text-sm font-medium text-zinc-300">
            Solo founder
          </label>
          <span className="text-xs text-zinc-500">
            Analysis will be tailored for a single person building and launching.
          </span>
        </div>

        {/* Budget Constraint */}
        <div className="space-y-2">
          <label htmlFor="budget_constraint" className="block text-sm font-medium text-zinc-300">
            Budget Constraint
          </label>
          <select
            id="budget_constraint"
            name="budget_constraint"
            value={formData.budget_constraint}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            {budgets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={isSubmitting || !formData.idea_description.trim()}
            className="w-full sm:w-auto px-8 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Starting Analysis...
              </>
            ) : (
              'Start Analysis'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
