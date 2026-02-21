// ---------------------------------------------------------------------------
// G2 transformer — converts raw SerpAPI G2 review data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class G2Transformer extends BaseTransformer {
  readonly source = 'serpapi_g2' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'serpapi_g2')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;
    const reviewCount = typeof p['review_count'] === 'number' ? p['review_count'] : 0;
    const sentimentScore = typeof (p['sentiment'] as Record<string, unknown>)?.['score'] === 'number'
      ? (p['sentiment'] as Record<string, unknown>)['score'] as number
      : 0;
    const position = typeof p['position'] === 'number' ? p['position'] : 0;

    const categories: string[] = ['b2b_reviews'];
    if (p['has_negative_signal']) categories.push('negative_sentiment');
    if (p['has_alternative_mention']) categories.push('alternative_search');
    if (p['has_pricing_mention']) categories.push('pricing_concern');

    return {
      source: 'serpapi_g2',
      externalId: item.entityId,
      title,
      description: p['snippet'] ? String(p['snippet']) : undefined,
      url: item.url,
      metrics: {
        rating,
        reviewCount,
        sentimentScore,
        position,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        productSlug: p['product_slug'],
        sentiment: p['sentiment'],
        hasNegativeSignal: p['has_negative_signal'],
        hasAlternativeMention: p['has_alternative_mention'],
        hasPricingMention: p['has_pricing_mention'],
      },
    };
  }
}
