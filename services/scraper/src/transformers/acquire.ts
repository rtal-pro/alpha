// ---------------------------------------------------------------------------
// Acquire.com transformer — converts raw Acquire.com listings into
// NormalizedItem shapes for signal detection.
//
// Key metrics: MRR, asking_price, revenue_multiple — these feed
// market exit signals and revenue validation.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class AcquireTransformer extends BaseTransformer {
  readonly source = 'acquire' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'acquire')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const mrr = typeof p['mrr'] === 'number' ? p['mrr'] : 0;
    const askingPrice = typeof p['asking_price'] === 'number' ? p['asking_price'] : 0;
    const revenueMultiple = typeof p['revenue_multiple'] === 'number' ? p['revenue_multiple'] : null;
    const industry = p['industry'] ? String(p['industry']) : 'saas';

    return {
      source: 'acquire',
      externalId: item.entityId,
      title: `[For Sale] ${name}`,
      description: description
        ? `${description} | MRR: $${mrr.toLocaleString()} | Asking: $${askingPrice.toLocaleString()}`
        : `SaaS for sale — MRR: $${mrr.toLocaleString()}, Asking: $${askingPrice.toLocaleString()}`,
      url: item.url,
      metrics: {
        mrr,
        asking_price: askingPrice,
        ...(revenueMultiple !== null ? { revenue_multiple: revenueMultiple } : {}),
      },
      categories: [industry, 'market_exit'],
      scrapedAt: item.scrapedAt,
      metadata: {
        listing_type: 'for_sale',
        industry,
        tech_stack: p['tech_stack'],
        revenue_multiple: revenueMultiple,
      },
    };
  }
}
