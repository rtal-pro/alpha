// ---------------------------------------------------------------------------
// Zapier transformer — converts raw Zapier app directory data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class ZapierTransformer extends BaseTransformer {
  readonly source = 'zapier' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'zapier')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const appName = String(p['app_name'] ?? p['app_slug'] ?? '');
    if (!appName) return null;

    const integrationCount = typeof p['integration_count'] === 'number' ? p['integration_count'] : 0;

    const categories: string[] = ['automation', 'integrations'];
    if (p['category']) categories.push(String(p['category']));
    if (p['is_well_connected']) categories.push('well_connected');
    if (p['is_emerging']) categories.push('emerging');

    return {
      source: 'zapier',
      externalId: item.entityId,
      title: appName,
      description: `Zapier app: ${appName} — ${integrationCount} integrations`,
      url: item.url,
      metrics: {
        integrationCount,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        appSlug: p['app_slug'],
        category: p['category'],
        isWellConnected: p['is_well_connected'],
        isEmerging: p['is_emerging'],
        searchContext: p['searchContext'],
      },
    };
  }
}
