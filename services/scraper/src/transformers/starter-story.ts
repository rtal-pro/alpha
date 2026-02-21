// ---------------------------------------------------------------------------
// Starter Story transformer — converts raw Starter Story scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class StarterStoryTransformer extends BaseTransformer {
  readonly source = 'starter_story' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'starter_story')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const title = String(p['title'] ?? '');
    if (!title) return null;

    const contentType = String(p['content_type'] ?? 'story');
    const categories = Array.isArray(p['categories']) ? (p['categories'] as string[]) : [];
    const revenue = p['revenue'] ? String(p['revenue']) : p['estimated_revenue'] ? String(p['estimated_revenue']) : null;

    const description = contentType === 'idea'
      ? String(p['description'] ?? '')
      : `Founder story: ${title}${revenue ? ` — Revenue: $${revenue}` : ''}`;

    return {
      source: 'starter_story',
      externalId: item.entityId,
      title,
      description: description || undefined,
      url: item.url,
      metrics: {},
      categories: contentType === 'idea'
        ? ['idea', ...categories.map((c) => c.toLowerCase())]
        : ['founder_story'],
      scrapedAt: item.scrapedAt,
      metadata: {
        content_type: contentType,
        revenue,
        founder: p['founder'],
        employees: p['employees'],
      },
    };
  }
}
