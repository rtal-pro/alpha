// ---------------------------------------------------------------------------
// Trustpilot transformer — converts raw Trustpilot scrape data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class TrustpilotTransformer extends BaseTransformer {
  readonly source = 'trustpilot' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'trustpilot')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const name = String(p['name'] ?? p['domain'] ?? '');
    if (!name) return null;

    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;
    const reviewCount = typeof p['review_count'] === 'number' ? p['review_count'] : 0;

    const categories: string[] = ['reviews'];
    if (p['is_low_rated']) categories.push('low_rated');
    if (p['has_declining_signal']) categories.push('declining');

    return {
      source: 'trustpilot',
      externalId: item.entityId,
      title: name,
      description: `Trustpilot: ${name} — ${rating}/5 (${reviewCount} reviews)`,
      url: item.url,
      metrics: {
        rating,
        reviewCount,
        isLowRated: p['is_low_rated'] ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        domain: p['domain'],
        searchContext: p['searchContext'],
        isHighlyReviewed: p['is_highly_reviewed'],
        hasDecliningSignal: p['has_declining_signal'],
      },
    };
  }
}
