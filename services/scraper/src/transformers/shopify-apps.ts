// ---------------------------------------------------------------------------
// Shopify Apps transformer — converts raw Shopify App Store scrape data
// into NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class ShopifyAppsTransformer extends BaseTransformer {
  readonly source = 'shopify_apps' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'shopify_apps')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const appSlug = String(p['app_slug'] ?? '');
    if (!appSlug) return null;

    const title = appSlug.replace(/-/g, ' ');
    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;
    const reviewCount = typeof p['review_count'] === 'number' ? p['review_count'] : 0;

    const categories: string[] = ['ecommerce', 'shopify'];
    if (p['is_free']) categories.push('free_tool');
    if (p['is_low_rated']) categories.push('low_rated');
    if (p['is_popular']) categories.push('popular');

    return {
      source: 'shopify_apps',
      externalId: item.entityId,
      title,
      description: `Shopify app: ${title} — ${rating}/5 (${reviewCount} reviews)`,
      url: item.url,
      metrics: {
        rating,
        reviewCount,
        isFree: p['is_free'] ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        appSlug,
        price: p['price'],
        isNew: p['is_new'],
        isPopular: p['is_popular'],
        isLowRated: p['is_low_rated'],
        searchContext: p['searchContext'],
      },
    };
  }
}
