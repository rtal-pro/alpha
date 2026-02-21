// ---------------------------------------------------------------------------
// SaaSHub transformer — converts raw SaaSHub scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class SaaSHubTransformer extends BaseTransformer {
  readonly source = 'saashub' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'saashub')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const score = typeof p['score'] === 'number' ? p['score'] : 0;
    const upvotes = typeof p['upvotes'] === 'number' ? p['upvotes'] : 0;
    const categories = Array.isArray(p['categories']) ? (p['categories'] as string[]) : [];

    return {
      source: 'saashub',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {
        score,
        upvotes,
      },
      categories: categories.map((c) => c.toLowerCase()),
      scrapedAt: item.scrapedAt,
      metadata: {
        context: p['context'],
        score,
      },
    };
  }
}
