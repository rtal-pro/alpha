// ---------------------------------------------------------------------------
// PricingFrustrationDetector — detects clusters of pricing complaints
// targeting specific products or categories
//
// More specific than PainPointCluster: focuses exclusively on price-related
// pain signals and connects them to specific competitors.
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

const MIN_PRICING_MENTIONS = 1;
const WINDOW_DAYS = 30;

// Pricing-specific patterns with severity weights
const PRICING_PATTERNS: Array<{ pattern: RegExp; severity: number; label: string }> = [
  // Direct price complaints (high severity)
  { pattern: /\b(too expensive|overpriced|rip ?off|highway robbery)\b/i, severity: 3, label: 'price_complaint' },
  { pattern: /price (?:hike|increase|went up|doubled|tripled)/i, severity: 3, label: 'price_increase' },
  { pattern: /\b(can'?t afford|budget|broke the bank)\b/i, severity: 2, label: 'affordability' },

  // Alternative-seeking (strong buying intent)
  { pattern: /\b(free alternative|cheaper alternative|budget.{0,10}option)\b/i, severity: 3, label: 'seeking_alternative' },
  { pattern: /\b(looking for|need|want).{0,20}(cheaper|affordable|free)\b/i, severity: 2, label: 'seeking_cheaper' },
  { pattern: /\b(switched|switching|migrat).{0,15}(because|due to).{0,15}(pric|cost|expensive)\b/i, severity: 3, label: 'switching_price' },

  // Feature-to-price mismatch
  { pattern: /\b(not worth|overcharg|pay.{0,10}(too much|a lot))\b/i, severity: 2, label: 'value_mismatch' },
  { pattern: /\b(basic features?).{0,15}(premium|paid|expensive)\b/i, severity: 2, label: 'feature_gating' },
  { pattern: /\b(used to be free|was free|paywall)\b/i, severity: 2, label: 'freemium_loss' },

  // Per-seat / scaling frustration
  { pattern: /\b(per seat|per user).{0,15}(expensive|adds up|crazy)\b/i, severity: 2, label: 'per_seat_pain' },
  { pattern: /\b(scales? badly|cost scales?|pricing doesn'?t scale)\b/i, severity: 2, label: 'scaling_cost' },
];

// Product name extraction patterns
const PRODUCT_MENTION_PATTERN = /\b(switched? from|left|replaced|ditched|moving away from|cancelled?)\s+([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)?)\b/;

// ---------------------------------------------------------------------------
// PricingFrustrationDetector
// ---------------------------------------------------------------------------

export class PricingFrustrationDetector extends BaseSignalDetector {
  readonly name = 'PricingFrustrationDetector';
  readonly signalTypes: SignalType[] = ['pricing_change'];
  readonly supportedSources: ScrapeSource[] = [
    'reddit', 'hacker_news', 'indiehackers', 'twitter', 'stackoverflow', 'trustpilot',
  ];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Score each item for pricing frustration
    const pricingItems = recent
      .map((item) => {
        const analysis = this.analyzePricing(item);
        return { item, ...analysis };
      })
      .filter((p) => p.score > 0);

    if (pricingItems.length < MIN_PRICING_MENTIONS) return [];

    const signals: DetectedSignal[] = [];

    // Group by mentioned product (if any)
    const byProduct = new Map<string, typeof pricingItems>();
    const noProduct: typeof pricingItems = [];

    for (const pi of pricingItems) {
      if (pi.mentionedProduct) {
        const group = byProduct.get(pi.mentionedProduct) ?? [];
        group.push(pi);
        byProduct.set(pi.mentionedProduct, group);
      } else {
        noProduct.push(pi);
      }
    }

    // Product-specific pricing frustration signals
    for (const [product, items] of byProduct) {
      if (items.length < 2) continue;

      const avgScore = items.reduce((s, p) => s + p.score, 0) / items.length;
      const avgEngagement = items.reduce(
        (s, p) => s + (p.item.metrics['score'] ?? 0), 0,
      ) / items.length;

      const countStrength = this.computeStrength(items.length, 1, 10);
      const scoreStrength = this.computeStrength(avgScore, 1, 8);
      const engageStrength = this.computeStrength(avgEngagement, 10, 100);

      const strength = Math.round(
        countStrength * 0.35 +
        scoreStrength * 0.35 +
        engageStrength * 0.30,
      );

      if (strength < 20) continue;

      // Collect all labels
      const labels = new Set(items.flatMap((i) => i.labels));
      const allCategories = items.flatMap((i) => i.item.categories);
      const text = items.map((i) => `${i.item.title} ${i.item.description ?? ''}`).join(' ');
      const category = resolveCategory(allCategories, text);

      signals.push({
        signal_type: 'pricing_change',
        title: `Pricing frustration: ${product} (${items.length} complaints)`,
        description:
          `${items.length} posts expressing pricing frustration with ${product}. ` +
          `Pain types: ${Array.from(labels).join(', ')}. ` +
          `Average severity: ${avgScore.toFixed(1)}/8, avg engagement: ${Math.round(avgEngagement)}.`,
        strength,
        category,
        geo_relevance: ['GLOBAL'],
        source: items[0]!.item.source as ScrapeSource,
        source_url: items[0]!.item.url,
        occurred_at: new Date(Math.max(...items.map((i) => i.item.scrapedAt.getTime()))),
        evidence: {
          target_product: product,
          complaint_count: items.length,
          avg_severity: avgScore,
          avg_engagement: avgEngagement,
          pain_labels: Array.from(labels),
          top_posts: items.slice(0, 5).map((i) => ({
            title: i.item.title,
            url: i.item.url,
            severity: i.score,
            labels: i.labels,
            engagement: i.item.metrics['score'],
          })),
        },
      });
    }

    // Category-level pricing frustration (no specific product)
    if (noProduct.length >= MIN_PRICING_MENTIONS) {
      // Group by category
      const byCategory = new Map<string, typeof noProduct>();
      for (const pi of noProduct) {
        const txt = `${pi.item.title} ${pi.item.description ?? ''}`;
        const cat = resolveCategory(pi.item.categories, txt);
        const group = byCategory.get(cat) ?? [];
        group.push(pi);
        byCategory.set(cat, group);
      }

      for (const [category, items] of byCategory) {
        if (items.length < MIN_PRICING_MENTIONS) continue;

        const avgScore = items.reduce((s, p) => s + p.score, 0) / items.length;
        const strength = Math.round(
          this.computeStrength(items.length, 2, 15) * 0.5 +
          this.computeStrength(avgScore, 1, 6) * 0.5,
        );

        if (strength < 15) continue;

        const labels = new Set(items.flatMap((i) => i.labels));

        signals.push({
          signal_type: 'pricing_change',
          title: `Category pricing pain: ${category} (${items.length} posts)`,
          description:
            `${items.length} posts about pricing frustration in ${category}. ` +
            `Pain types: ${Array.from(labels).join(', ')}.`,
          strength,
          category,
          geo_relevance: ['GLOBAL'],
          source: items[0]!.item.source as ScrapeSource,
          occurred_at: new Date(),
          evidence: {
            complaint_count: items.length,
            avg_severity: avgScore,
            pain_labels: Array.from(labels),
          },
        });
      }
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private analyzePricing(item: NormalizedItem): {
    score: number;
    labels: string[];
    mentionedProduct: string | null;
  } {
    // Trustpilot provides business-page summaries, not review text
    if (item.source === 'trustpilot') {
      return this.analyzeTrustpilotPricing(item);
    }

    const text = `${item.title} ${item.description ?? ''}`;
    let score = 0;
    const labels: string[] = [];

    for (const { pattern, severity, label } of PRICING_PATTERNS) {
      if (pattern.test(text)) {
        score += severity;
        labels.push(label);
      }
    }

    // Extract mentioned product
    let mentionedProduct: string | null = null;
    const productMatch = PRODUCT_MENTION_PATTERN.exec(text);
    if (productMatch?.[2]) {
      mentionedProduct = productMatch[2].trim();
    }

    return { score: Math.min(score, 8), labels, mentionedProduct };
  }

  private analyzeTrustpilotPricing(item: NormalizedItem): {
    score: number;
    labels: string[];
    mentionedProduct: string | null;
  } {
    let score = 0;
    const labels: string[] = [];

    const rating = item.metrics['rating'] ?? 5;
    const isLowRated = item.metadata?.['isLowRated'] as boolean | undefined;
    const hasDeclining = item.metadata?.['hasDecliningSignal'] as boolean | undefined;
    const searchContext = (item.metadata?.['searchContext'] as string) ?? '';

    // Low rating as frustration proxy
    if (rating <= 2.0 || isLowRated) {
      score += 3;
      labels.push('price_complaint');
    } else if (rating <= 3.0) {
      score += 2;
      labels.push('value_mismatch');
    }

    // Declining satisfaction
    if (hasDeclining) {
      score += 2;
      labels.push('price_increase');
    }

    // Check if the search context was pricing-related
    if (/pric|cost|expensive|cheap|afford|billing/i.test(searchContext)) {
      score += 1;
      labels.push('seeking_alternative');
    }

    // The product is the item title itself (Trustpilot business name)
    const mentionedProduct = item.title || null;

    return { score: Math.min(score, 8), labels, mentionedProduct };
  }
}
