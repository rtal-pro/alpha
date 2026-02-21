// ---------------------------------------------------------------------------
// Pricing Tracker transformer — converts raw Wayback Machine pricing change
// data into NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class PricingTrackerTransformer extends BaseTransformer {
  readonly source = 'pricing_tracker' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'pricing_tracker')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const domain = String(p['domain'] ?? '');
    if (!domain) return null;

    const changeType = String(p['change_type'] ?? 'unknown');
    const snapshotCount = typeof p['snapshot_count'] === 'number' ? p['snapshot_count'] : 0;
    const daysBetween = typeof p['days_between'] === 'number' ? p['days_between'] : 0;

    const oldPrices = Array.isArray(p['old_prices']) ? (p['old_prices'] as string[]) : [];
    const newPrices = Array.isArray(p['new_prices']) ? (p['new_prices'] as string[]) : [];

    const categories: string[] = ['pricing_intelligence'];
    if (p['price_increase']) categories.push('price_increase');
    if (p['free_tier_removed']) categories.push('free_tier_removed');
    if (p['new_tiers_added']) categories.push('new_tiers');
    if (p['feature_gating_changed']) categories.push('feature_gating');

    return {
      source: 'pricing_tracker',
      externalId: item.entityId,
      title: `Pricing change: ${domain} (${changeType})`,
      description: `${domain} pricing changed: ${changeType}. Old: [${oldPrices.join(', ')}] → New: [${newPrices.join(', ')}]`,
      url: item.url,
      metrics: {
        snapshotCount,
        daysBetween,
        priceIncrease: p['price_increase'] ? 1 : 0,
        freeTierRemoved: p['free_tier_removed'] ? 1 : 0,
        newTiersAdded: p['new_tiers_added'] ? 1 : 0,
        featureGatingChanged: p['feature_gating_changed'] ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        domain,
        pricingPath: p['pricing_path'],
        changeType,
        firstSnapshot: p['first_snapshot'],
        lastSnapshot: p['last_snapshot'],
        oldPrices,
        newPrices,
      },
    };
  }
}
