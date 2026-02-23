// ---------------------------------------------------------------------------
// MarketConsolidationDetector — detects M&A activity, acqui-hires, and
// consolidation patterns that create disruption opportunities
//
// When big players acquire competitors in a category:
// - Customers of acquired product lose features / face integration
// - Prices often increase post-acquisition
// - Niche use cases get deprioritized
// All of these create entry points for nimble new products.
// ---------------------------------------------------------------------------

import {
  BaseSignalDetector,
  type DetectedSignal,
  type NormalizedItem,
  type SignalType,
  type ScrapeSource,
} from './base.js';
import { resolveCategory } from '../utils/category-mapper.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MIN_MENTIONS = 1;
const WINDOW_DAYS = 45;

// M&A / consolidation patterns
const CONSOLIDATION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Direct M&A signals
  { pattern: /\b(acquir|acquisition|bought|purchase|takeover|merger)\b/i, weight: 3, label: 'acquisition' },
  { pattern: /\b(acqui-?hire|talent\s+acquisition|team\s+join)\b/i, weight: 2, label: 'acquihire' },
  { pattern: /\b(merged? with|join forces|consolidat)\b/i, weight: 3, label: 'merger' },

  // Post-acquisition disruption signals
  { pattern: /\b(sunsetting?|shutting\s+down|discontinu|killing|winding down)\b/i, weight: 3, label: 'product_sunset' },
  { pattern: /\b(migrat|forced.{0,10}switch|moving.{0,10}users|transition.{0,10}plan)\b/i, weight: 2, label: 'forced_migration' },
  { pattern: /\b(price.{0,10}(increas|hike|went up)|new\s+pricing)\b/i, weight: 2, label: 'price_hike_post_acquisition' },
  { pattern: /\b(feature.{0,10}(remov|cut|deprecat)|losing\s+feature)\b/i, weight: 2, label: 'feature_removal' },

  // Market reaction
  { pattern: /\b(alternative|replacement|competitor|switch from|looking for)\b/i, weight: 2, label: 'seeking_alternative' },
  { pattern: /\b(what\s+now|what\s+do\s+we|worried|concerned)\b/i, weight: 1, label: 'customer_concern' },
];

// ---------------------------------------------------------------------------
// MarketConsolidationDetector
// ---------------------------------------------------------------------------

export class MarketConsolidationDetector extends BaseSignalDetector {
  readonly name = 'MarketConsolidationDetector';
  readonly signalTypes: SignalType[] = ['market_consolidation'];
  readonly supportedSources: ScrapeSource[] = [
    'crunchbase', 'hacker_news', 'reddit', 'twitter', 'producthunt',
    'ycombinator', 'starter_story', 'indiehackers',
  ];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Score items for consolidation signals
    const scored = recent
      .map((item) => {
        const analysis = this.analyzeConsolidation(item);
        return { item, ...analysis };
      })
      .filter((s) => s.score > 0);

    if (scored.length < MIN_MENTIONS) return [];

    // Group by category
    const byCategory = new Map<string, typeof scored>();
    for (const entry of scored) {
      const text = `${entry.item.title} ${entry.item.description ?? ''}`;
      const category = resolveCategory(entry.item.categories, text);
      const group = byCategory.get(category) ?? [];
      group.push(entry);
      byCategory.set(category, group);
    }

    const signals: DetectedSignal[] = [];

    for (const [category, entries] of byCategory) {
      if (entries.length < MIN_MENTIONS) continue;

      const avgScore = entries.reduce((s, e) => s + e.score, 0) / entries.length;
      const avgEngagement = entries.reduce(
        (s, e) => s + (e.item.metrics['score'] ?? 0), 0,
      ) / entries.length;

      const countStrength = this.computeStrength(entries.length, 1, 10);
      const scoreStrength = this.computeStrength(avgScore, 2, 10);
      const engageStrength = this.computeStrength(avgEngagement, 20, 300);

      const strength = Math.round(
        countStrength * 0.30 +
        scoreStrength * 0.35 +
        engageStrength * 0.35,
      );

      if (strength < 20) continue;

      const allLabels = new Set(entries.flatMap((e) => e.labels));
      const hasDisruption =
        allLabels.has('product_sunset') ||
        allLabels.has('forced_migration') ||
        allLabels.has('feature_removal');
      const hasCustomerConcern =
        allLabels.has('seeking_alternative') ||
        allLabels.has('customer_concern');

      // Boost strength if post-acquisition disruption + customer concern
      const finalStrength = (hasDisruption && hasCustomerConcern)
        ? Math.min(100, strength + 15)
        : strength;

      // Extract mentioned companies/products
      const mentionedProducts = this.extractProducts(entries);

      signals.push({
        signal_type: 'market_consolidation',
        title: `Market consolidation: ${category} (${entries.length} mentions)`,
        description:
          `${entries.length} posts about M&A/consolidation in "${category}". ` +
          `${hasDisruption ? 'Post-acquisition disruption detected. ' : ''}` +
          `${hasCustomerConcern ? 'Customers seeking alternatives. ' : ''}` +
          `Labels: ${Array.from(allLabels).join(', ')}.`,
        strength: finalStrength,
        category,
        geo_relevance: ['GLOBAL'],
        source: entries[0]!.item.source as ScrapeSource,
        source_url: entries[0]!.item.url,
        occurred_at: new Date(Math.max(...entries.map((e) => e.item.scrapedAt.getTime()))),
        evidence: {
          mention_count: entries.length,
          avg_severity: avgScore,
          avg_engagement: avgEngagement,
          has_disruption: hasDisruption,
          has_customer_concern: hasCustomerConcern,
          labels: Array.from(allLabels),
          mentioned_products: mentionedProducts,
          top_posts: entries.slice(0, 5).map((e) => ({
            title: e.item.title,
            url: e.item.url,
            score: e.score,
            labels: e.labels,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private analyzeConsolidation(item: NormalizedItem): {
    score: number;
    labels: string[];
  } {
    const text = `${item.title} ${item.description ?? ''}`;
    let score = 0;
    const labels: string[] = [];

    for (const { pattern, weight, label } of CONSOLIDATION_PATTERNS) {
      if (pattern.test(text)) {
        score += weight;
        labels.push(label);
      }
    }

    return { score: Math.min(score, 12), labels };
  }

  private extractProducts(
    entries: Array<{ item: NormalizedItem }>,
  ): string[] {
    const products = new Set<string>();
    // Look for capitalized product names near M&A keywords
    const pattern = /\b(acquir|bought|merged?|takeover)\w*\s+(?:by\s+)?([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)\b/;

    for (const { item } of entries) {
      const text = `${item.title} ${item.description ?? ''}`;
      const match = pattern.exec(text);
      if (match?.[2]) {
        products.add(match[2].trim());
      }
    }

    return Array.from(products).slice(0, 10);
  }
}
