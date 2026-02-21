// ---------------------------------------------------------------------------
// SearchTrendSurgeDetector — detects spikes in search demand from Google
// Trends and Google Autocomplete data
//
// Signal: A keyword/category shows a significant increase in search volume
// or autocomplete diversity compared to prior periods.
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

const MIN_SUGGESTIONS = 5;
const SURGE_WINDOW_DAYS = 14;

// Intent types that strongly indicate market opportunity
const HIGH_VALUE_INTENTS = ['comparison', 'pricing', 'problem', 'integration'];

// ---------------------------------------------------------------------------
// SearchTrendSurgeDetector
// ---------------------------------------------------------------------------

export class SearchTrendSurgeDetector extends BaseSignalDetector {
  readonly name = 'SearchTrendSurgeDetector';
  readonly signalTypes: SignalType[] = ['search_trend'];
  readonly supportedSources: ScrapeSource[] = ['google_autocomplete', 'google_trends'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - SURGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    if (recent.length < MIN_SUGGESTIONS) return [];

    // Group by seed query / keyword
    const byKeyword = new Map<string, NormalizedItem[]>();
    for (const item of recent) {
      const keyword = (item.metadata?.['seed_query'] as string) ??
                      (item.metadata?.['searchKeyword'] as string) ??
                      item.title;
      const group = byKeyword.get(keyword) ?? [];
      group.push(item);
      byKeyword.set(keyword, group);
    }

    const signals: DetectedSignal[] = [];

    for (const [keyword, suggestions] of byKeyword) {
      if (suggestions.length < MIN_SUGGESTIONS) continue;

      // Analyze intent distribution
      const intents = suggestions.map((s) =>
        (s.metadata?.['intent'] as string) ?? 'general',
      );
      const highValueCount = intents.filter((i) =>
        HIGH_VALUE_INTENTS.includes(i),
      ).length;
      const intentDiversity = new Set(intents).size;

      // Count specific demand signals
      const comparisonCount = suggestions.filter((s) =>
        s.metadata?.['has_comparison'],
      ).length;
      const pricingCount = suggestions.filter((s) =>
        s.metadata?.['has_pricing_intent'],
      ).length;
      const alternativeCount = suggestions.filter((s) =>
        s.metadata?.['has_alternative_intent'],
      ).length;
      const painCount = suggestions.filter((s) =>
        s.metadata?.['has_pain_intent'],
      ).length;

      // Compute strength
      const volumeStrength = this.computeStrength(suggestions.length, 4, 30);
      const intentStrength = this.computeStrength(highValueCount, 1, 10);
      const diversityStrength = this.computeStrength(intentDiversity, 2, 6);

      const strength = Math.round(
        volumeStrength * 0.35 +
        intentStrength * 0.40 +
        diversityStrength * 0.25,
      );

      if (strength < 15) continue;

      // Infer category from keyword
      const category = this.inferCategory(keyword);

      signals.push({
        signal_type: 'search_trend',
        title: `Search surge: "${keyword}" (${suggestions.length} suggestions)`,
        description:
          `Detected ${suggestions.length} autocomplete suggestions for "${keyword}" ` +
          `with ${highValueCount} high-value intents. ` +
          `Comparisons: ${comparisonCount}, pricing queries: ${pricingCount}, ` +
          `alternative-seeking: ${alternativeCount}, pain indicators: ${painCount}.`,
        strength,
        category,
        geo_relevance: this.inferGeo(suggestions),
        source: 'google_autocomplete',
        occurred_at: new Date(),
        evidence: {
          keyword,
          suggestion_count: suggestions.length,
          high_value_intent_count: highValueCount,
          intent_diversity: intentDiversity,
          comparison_queries: comparisonCount,
          pricing_queries: pricingCount,
          alternative_queries: alternativeCount,
          pain_queries: painCount,
          sample_suggestions: suggestions.slice(0, 8).map((s) => s.title),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategory(keyword: string): string {
    const k = keyword.toLowerCase();
    if (/\b(crm|sales|pipeline)\b/.test(k)) return 'crm';
    if (/\b(invoice|accounting|billing)\b/.test(k)) return 'invoicing';
    if (/\b(payment|stripe|fintech)\b/.test(k)) return 'fintech';
    if (/\b(analytics|tracking|dashboard)\b/.test(k)) return 'analytics';
    if (/\b(ci|cd|deploy|devops|infra)\b/.test(k)) return 'devtools';
    if (/\b(compliance|gdpr|rgpd|privacy)\b/.test(k)) return 'compliance_legal';
    if (/\b(marketing|seo|email|campaign)\b/.test(k)) return 'marketing';
    if (/\b(project|task|kanban|agile)\b/.test(k)) return 'project_management';
    if (/\b(ecommerce|shop|store|marketplace)\b/.test(k)) return 'ecommerce';
    if (/\b(ai|ml|llm|gpt|chatbot)\b/.test(k)) return 'ai_ml';
    return 'general_saas';
  }

  private inferGeo(items: NormalizedItem[]): string[] {
    const geos = new Set<string>();
    for (const item of items) {
      const geo = item.metadata?.['geo'] as string | undefined;
      if (geo) {
        geos.add(geo.toUpperCase());
      }
    }
    if (geos.size === 0) geos.add('GLOBAL');
    return Array.from(geos);
  }
}
