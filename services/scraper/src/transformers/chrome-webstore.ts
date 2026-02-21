// ---------------------------------------------------------------------------
// Chrome Web Store transformer — converts raw extension scrape data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class ChromeWebStoreTransformer extends BaseTransformer {
  readonly source = 'chrome_webstore' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'chrome_webstore')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const extensionName = String(p['extension_name'] ?? '');
    if (!extensionName) return null;

    const users = typeof p['users'] === 'number' ? p['users'] : 0;
    const rating = typeof p['rating'] === 'number' ? p['rating'] : 0;

    const categories: string[] = ['browser_extension'];
    if (p['is_popular']) categories.push('popular');
    if (p['is_growing']) categories.push('growing');
    if (p['is_new']) categories.push('new');

    return {
      source: 'chrome_webstore',
      externalId: item.entityId,
      title: extensionName,
      description: `Chrome extension: ${extensionName} — ${users.toLocaleString()} users`,
      url: item.url,
      metrics: {
        users,
        rating,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        extensionId: p['extension_id'],
        isPopular: p['is_popular'],
        isGrowing: p['is_growing'],
        isNew: p['is_new'],
        searchContext: p['searchContext'],
      },
    };
  }
}
