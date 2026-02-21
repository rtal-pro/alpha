// ---------------------------------------------------------------------------
// BetaList transformer — converts raw BetaList scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class BetaListTransformer extends BaseTransformer {
  readonly source = 'betalist' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'betalist')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];
    const featuredDate = p['featured_date'] ? String(p['featured_date']) : undefined;

    return {
      source: 'betalist',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {},
      categories: tags.map((t) => `betalist:${t.toLowerCase()}`),
      scrapedAt: item.scrapedAt,
      metadata: {
        stage: p['stage'] ?? 'beta',
        featured_date: featuredDate,
        tags,
      },
    };
  }
}
