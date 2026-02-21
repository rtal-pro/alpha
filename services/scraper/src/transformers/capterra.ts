// ---------------------------------------------------------------------------
// Capterra transformer — converts raw SerpAPI Capterra data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class CapterraTransformer extends BaseTransformer {
  readonly source = 'serpapi_capterra' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'serpapi_capterra')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;
    const reviewCount = typeof p['review_count'] === 'number' ? p['review_count'] : 0;
    const position = typeof p['position'] === 'number' ? p['position'] : 0;

    const categories: string[] = ['b2b_reviews'];
    if (p['is_comparison_page']) categories.push('comparison');
    if (p['has_negative_signal']) categories.push('negative_sentiment');
    if (p['has_pricing_data']) categories.push('pricing_data');

    return {
      source: 'serpapi_capterra',
      externalId: item.entityId,
      title,
      description: p['snippet'] ? String(p['snippet']) : undefined,
      url: item.url,
      metrics: {
        rating,
        reviewCount,
        position,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        searchKeyword: p['searchKeyword'],
        isComparisonPage: p['is_comparison_page'],
        hasNegativeSignal: p['has_negative_signal'],
        hasPricingData: p['has_pricing_data'],
      },
    };
  }
}
