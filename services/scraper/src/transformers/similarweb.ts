// ---------------------------------------------------------------------------
// SimilarWeb transformer — converts raw SerpAPI traffic data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class SimilarWebTransformer extends BaseTransformer {
  readonly source = 'similarweb' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'similarweb')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const domain = String(p['domain'] ?? '');
    const title = String(p['title'] ?? domain);
    if (!title) return null;

    const monthlyVisits = typeof p['monthly_visits'] === 'number' ? p['monthly_visits'] : 0;
    const globalRank = typeof p['global_rank'] === 'number' ? p['global_rank'] : 0;
    const bounceRate = typeof p['bounce_rate'] === 'number' ? p['bounce_rate'] : 0;

    const categories: string[] = ['traffic_analytics'];
    if (p['has_growth_signal']) categories.push('growing');
    if (p['has_decline_signal']) categories.push('declining');

    return {
      source: 'similarweb',
      externalId: item.entityId,
      title,
      description: p['snippet'] ? String(p['snippet']) : undefined,
      url: item.url,
      metrics: {
        monthlyVisits,
        globalRank,
        bounceRate,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        domain,
        avgVisitDuration: p['avg_visit_duration'],
        hasGrowthSignal: p['has_growth_signal'],
        hasDeclineSignal: p['has_decline_signal'],
        searchKeyword: p['searchKeyword'],
      },
    };
  }
}
