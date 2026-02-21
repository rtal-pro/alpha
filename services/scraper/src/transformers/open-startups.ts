// ---------------------------------------------------------------------------
// Open Startups transformer — converts raw Baremetrics/Open Startups data
// into NormalizedItem shapes for signal detection.
//
// Key value: real MRR, churn, and growth data from public SaaS metrics.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class OpenStartupsTransformer extends BaseTransformer {
  readonly source = 'open_startups' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'open_startups')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const mrr = typeof p['mrr'] === 'number' ? p['mrr'] : 0;
    const arr = typeof p['arr'] === 'number' ? p['arr'] : mrr * 12;
    const customers = typeof p['customers'] === 'number' ? p['customers'] : 0;
    const churnRate = typeof p['churn_rate'] === 'number' ? p['churn_rate'] : null;
    const monthlyGrowth = typeof p['monthly_growth_pct'] === 'number' ? p['monthly_growth_pct'] : null;

    const description =
      `${name} — MRR: $${mrr.toLocaleString()}, ` +
      `Customers: ${customers}` +
      (churnRate !== null ? `, Churn: ${churnRate}%` : '') +
      (monthlyGrowth !== null ? `, Growth: ${monthlyGrowth > 0 ? '+' : ''}${monthlyGrowth}% MoM` : '');

    return {
      source: 'open_startups',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {
        mrr,
        arr,
        customers,
        ...(churnRate !== null ? { churn_rate: churnRate } : {}),
        ...(monthlyGrowth !== null ? { monthly_growth_pct: monthlyGrowth } : {}),
      },
      categories: ['open_metrics', 'saas'],
      scrapedAt: item.scrapedAt,
      metadata: {
        data_source: p['data_source'],
        is_public_metrics: true,
      },
    };
  }
}
