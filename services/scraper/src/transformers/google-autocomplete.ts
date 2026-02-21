// ---------------------------------------------------------------------------
// Google Autocomplete transformer — converts raw suggestion data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class GoogleAutocompleteTransformer extends BaseTransformer {
  readonly source = 'google_autocomplete' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'google_autocomplete')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const query = String(p['query'] ?? '');
    if (!query) return null;

    const intent = String(p['intent'] ?? 'general');
    const position = typeof p['position'] === 'number' ? p['position'] : 10;
    const hasComparison = p['has_comparison'] === true;
    const hasPricingIntent = p['has_pricing_intent'] === true;
    const hasAlternativeIntent = p['has_alternative_intent'] === true;
    const hasPainIntent = p['has_pain_intent'] === true;

    // Higher position = lower relevance; intent quality adds to metrics
    const intentScore =
      (hasComparison ? 25 : 0) +
      (hasPricingIntent ? 20 : 0) +
      (hasAlternativeIntent ? 30 : 0) +
      (hasPainIntent ? 25 : 0);

    const categories: string[] = [`intent:${intent}`];
    if (p['geo']) categories.push(`geo:${p['geo']}`);

    return {
      source: 'google_autocomplete',
      externalId: item.entityId,
      title: query,
      description: `Search suggestion: "${query}" (intent: ${intent})`,
      url: item.url,
      metrics: {
        position,
        intentScore,
        hasComparison: hasComparison ? 1 : 0,
        hasPricingIntent: hasPricingIntent ? 1 : 0,
        hasAlternativeIntent: hasAlternativeIntent ? 1 : 0,
        hasPainIntent: hasPainIntent ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        seedQuery: p['seed_query'],
        intent,
        geo: p['geo'],
      },
    };
  }
}
