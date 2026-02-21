// ---------------------------------------------------------------------------
// data.gouv.fr transformer — converts raw French open data API responses
// into NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class DataGouvTransformer extends BaseTransformer {
  readonly source = 'data_gouv' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'data_gouv')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const views = typeof p['views'] === 'number' ? p['views'] : 0;
    const followers = typeof p['followers'] === 'number' ? p['followers'] : 0;
    const reuses = typeof p['reuses'] === 'number' ? p['reuses'] : 0;
    const resourceCount = typeof p['resource_count'] === 'number' ? p['resource_count'] : 0;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : ['government'];

    return {
      source: 'data_gouv',
      externalId: item.entityId,
      title,
      description: p['description'] ? String(p['description']) : undefined,
      url: item.url,
      metrics: {
        views,
        followers,
        reuses,
        resourceCount,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        datasetId: p['id'],
        organization: p['organization'],
        createdAt: p['created_at'],
        lastModified: p['last_modified'],
        frequency: p['frequency'],
        tags: p['tags'],
        resourceFormats: p['resource_formats'],
        isHighInterest: p['is_high_interest'],
        searchQuery: p['searchQuery'],
      },
    };
  }
}
