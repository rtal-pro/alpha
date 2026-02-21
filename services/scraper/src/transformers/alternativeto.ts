// ---------------------------------------------------------------------------
// AlternativeTo transformer — converts raw AlternativeTo scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class AlternativeToTransformer extends BaseTransformer {
  readonly source = 'alternativeto' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'alternativeto')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const likes = typeof p['likes'] === 'number' ? p['likes'] : 0;
    const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];
    const platforms = Array.isArray(p['platforms']) ? (p['platforms'] as string[]) : [];

    return {
      source: 'alternativeto',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {
        likes,
      },
      categories: tags.map((t) => `alt:${t.toLowerCase()}`),
      scrapedAt: item.scrapedAt,
      metadata: {
        platforms,
        tags,
        context: p['context'],
      },
    };
  }
}
