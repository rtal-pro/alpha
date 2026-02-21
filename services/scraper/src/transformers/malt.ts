// ---------------------------------------------------------------------------
// Malt transformer — converts raw Malt.fr freelancer data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class MaltTransformer extends BaseTransformer {
  readonly source = 'malt' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'malt')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? p['profile_slug'] ?? '');
    if (!title) return null;

    const dailyRate = typeof p['daily_rate_eur'] === 'number' ? p['daily_rate_eur'] : 0;
    const totalResults = typeof p['total_results_for_query'] === 'number' ? p['total_results_for_query'] : 0;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : ['freelance'];
    categories.push('malt', 'geo:FR');

    return {
      source: 'malt',
      externalId: item.entityId,
      title,
      description: `Malt freelancer: ${title} — ${dailyRate > 0 ? `${dailyRate}€/day` : 'rate N/A'}`,
      url: item.url,
      metrics: {
        dailyRateEur: dailyRate,
        totalResultsForQuery: totalResults,
        isHighRate: p['is_high_rate'] ? 1 : 0,
        isHighDemand: p['is_high_demand'] ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        profileSlug: p['profile_slug'],
        searchQuery: p['searchQuery'],
        isHighRate: p['is_high_rate'],
        isHighDemand: p['is_high_demand'],
      },
    };
  }
}
