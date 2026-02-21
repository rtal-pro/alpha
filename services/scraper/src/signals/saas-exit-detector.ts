// ---------------------------------------------------------------------------
// SaaS Exit Detector — detects market exit patterns from Acquire.com listings
// and AlternativeTo "alternatives sought" data
//
// When multiple SaaS products in the same category are listed for sale,
// it can signal:
// - Category saturation (too many players, race to bottom)
// - Founder burnout (market is real but hard to execute in)
// - Opportunity for consolidation or differentiated approach
//
// Combined with AlternativeTo data showing what users want alternatives for,
// we get a picture of categories with both supply exits and demand signals.
// ---------------------------------------------------------------------------

import {
  BaseSignalDetector,
  type DetectedSignal,
  type NormalizedItem,
  type SignalType,
  type ScrapeSource,
} from './base.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MIN_EXIT_CLUSTER = 2;        // Need at least 2 exits in a category
const WINDOW_DAYS = 60;            // Within 60 days
const MIN_ALTERNATIVE_SEEKS = 3;   // AlternativeTo minimum mentions

// Revenue thresholds for weighting
const MRR_TIERS = [
  { min: 0, max: 1_000, weight: 0.5, label: 'pre-revenue' },
  { min: 1_000, max: 5_000, weight: 1.0, label: 'early' },
  { min: 5_000, max: 25_000, weight: 1.5, label: 'growing' },
  { min: 25_000, max: 100_000, weight: 2.0, label: 'established' },
  { min: 100_000, max: Infinity, weight: 2.5, label: 'scaled' },
] as const;

// ---------------------------------------------------------------------------
// SaaSExitDetector
// ---------------------------------------------------------------------------

export class SaaSExitDetector extends BaseSignalDetector {
  readonly name = 'SaaSExitDetector';
  readonly signalTypes: SignalType[] = ['market_exit'];
  readonly supportedSources: ScrapeSource[] = ['acquire', 'alternativeto', 'betalist', 'saashub'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Separate by source type
    const exitListings = recent.filter((i) => i.source === 'acquire');
    const alternativeSeeks = recent.filter((i) =>
      i.source === 'alternativeto' || i.source === 'saashub',
    );
    const newEntrants = recent.filter((i) => i.source === 'betalist');

    // Group exits by category
    const exitsByCategory = this.groupByCategory(exitListings);
    const altsByCategory = this.groupByCategory(alternativeSeeks);
    const entrantsByCategory = this.groupByCategory(newEntrants);

    const signals: DetectedSignal[] = [];

    for (const [category, exits] of Object.entries(exitsByCategory)) {
      if (exits.length < MIN_EXIT_CLUSTER) continue;

      // Compute weighted exit strength based on MRR tiers
      const exitStrength = this.computeExitStrength(exits);

      // Boost if users are also seeking alternatives in this category
      const altCount = (altsByCategory[category] ?? []).length;
      const altBoost = altCount >= MIN_ALTERNATIVE_SEEKS
        ? Math.min(20, altCount * 3)
        : 0;

      // Reduce if new entrants are flooding the market (healthy churn)
      const entrantCount = (entrantsByCategory[category] ?? []).length;
      const entrantDampening = entrantCount > exits.length ? 10 : 0;

      const strength = Math.min(100, Math.max(10,
        exitStrength + altBoost - entrantDampening,
      ));

      // Aggregate revenue data
      const totalMRR = exits.reduce(
        (sum, e) => sum + (e.metrics['mrr'] ?? 0), 0,
      );
      const avgMRR = exits.length > 0 ? Math.round(totalMRR / exits.length) : 0;

      signals.push({
        signal_type: 'market_exit',
        title: `SaaS exit cluster: ${category} (${exits.length} listings)`,
        description:
          `${exits.length} SaaS products in "${category}" listed for sale within ${WINDOW_DAYS} days. ` +
          `Average MRR: $${avgMRR.toLocaleString()}. ` +
          (altCount > 0 ? `${altCount} users seeking alternatives. ` : '') +
          (entrantCount > 0 ? `${entrantCount} new entrants detected. ` : '') +
          `Category may offer consolidation or differentiation opportunity.`,
        strength,
        category,
        geo_relevance: ['GLOBAL'],
        source: 'acquire' as ScrapeSource,
        occurred_at: new Date(),
        evidence: {
          exit_count: exits.length,
          avg_mrr: avgMRR,
          total_mrr: totalMRR,
          alt_seeks: altCount,
          new_entrants: entrantCount,
          exit_listings: exits.slice(0, 5).map((e) => ({
            title: e.title,
            mrr: e.metrics['mrr'] ?? 0,
            url: e.url,
          })),
          mrr_distribution: this.getMRRDistribution(exits),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private groupByCategory(items: NormalizedItem[]): Record<string, NormalizedItem[]> {
    const grouped: Record<string, NormalizedItem[]> = {};

    for (const item of items) {
      // Use first non-meta category, or 'general_saas' as default
      const category = item.categories.find((c) =>
        !c.startsWith('market_exit') && !c.startsWith('alt:') && !c.startsWith('betalist:'),
      ) ?? 'general_saas';

      if (!grouped[category]) grouped[category] = [];
      grouped[category]!.push(item);
    }

    return grouped;
  }

  private computeExitStrength(exits: NormalizedItem[]): number {
    let weightedSum = 0;

    for (const exit of exits) {
      const mrr = exit.metrics['mrr'] ?? 0;
      const tier = MRR_TIERS.find((t) => mrr >= t.min && mrr < t.max) ?? MRR_TIERS[0]!;
      weightedSum += tier.weight;
    }

    // Scale: 2 exits at early stage = 30, 5 exits at growing = 80
    return Math.min(80, Math.round(
      this.computeStrength(weightedSum, 1, 10) * 0.8,
    ));
  }

  private getMRRDistribution(exits: NormalizedItem[]): Record<string, number> {
    const dist: Record<string, number> = {};

    for (const exit of exits) {
      const mrr = exit.metrics['mrr'] ?? 0;
      const tier = MRR_TIERS.find((t) => mrr >= t.min && mrr < t.max) ?? MRR_TIERS[0]!;
      dist[tier.label] = (dist[tier.label] ?? 0) + 1;
    }

    return dist;
  }
}
