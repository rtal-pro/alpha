// ---------------------------------------------------------------------------
// AppSumo transformer — converts raw AppSumo deal listings into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class AppSumoTransformer extends BaseTransformer {
  readonly source = 'appsumo' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'appsumo')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const dealPrice = typeof p['deal_price'] === 'number' ? p['deal_price'] : 0;
    const originalPrice = typeof p['original_price'] === 'number' ? p['original_price'] : 0;
    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;
    const reviewCount = typeof p['review_count'] === 'number' ? p['review_count'] : 0;
    const discountPct = typeof p['discount_pct'] === 'number' ? p['discount_pct'] : 0;
    const categories = Array.isArray(p['categories']) ? (p['categories'] as string[]) : [];

    return {
      source: 'appsumo',
      externalId: item.entityId,
      title: name,
      description: description
        ? `${description} | Deal: $${dealPrice} (was $${originalPrice})`
        : `AppSumo deal: $${dealPrice} lifetime`,
      url: item.url,
      metrics: {
        deal_price: dealPrice,
        original_price: originalPrice,
        discount_pct: discountPct,
        rating,
        review_count: reviewCount,
      },
      categories: categories.map((c) => c.toLowerCase()),
      scrapedAt: item.scrapedAt,
      metadata: {
        deal_type: p['deal_type'],
        rating,
        review_count: reviewCount,
      },
    };
  }
}
