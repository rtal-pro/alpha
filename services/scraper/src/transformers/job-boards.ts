// ---------------------------------------------------------------------------
// Job Boards transformer — converts raw job listing data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class JobBoardsTransformer extends BaseTransformer {
  readonly source = 'job_boards' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'job_boards')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const company = String(p['company'] ?? '');
    const totalResults = typeof p['total_results'] === 'number' ? p['total_results'] : 0;
    const position = typeof p['position'] === 'number' ? p['position'] : 0;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : [];

    return {
      source: 'job_boards',
      externalId: item.entityId,
      title: `${title} at ${company}`,
      description: p['description_snippet'] ? String(p['description_snippet']) : undefined,
      url: item.url,
      metrics: {
        totalResults,
        position,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        company,
        location: p['location'],
        postedAt: p['posted_at'],
        scheduleType: p['schedule_type'],
        salary: p['salary'],
        searchQuery: p['searchQuery'],
      },
    };
  }
}
