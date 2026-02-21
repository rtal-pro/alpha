// ---------------------------------------------------------------------------
// BuiltWith transformer — converts raw BuiltWith API data into
// NormalizedItem shapes. Handles tech, domain, and trend formats.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class BuiltWithTransformer extends BaseTransformer {
  readonly source = 'builtwith' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'builtwith')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    if (item.format === 'builtwith_domain_v1') {
      return this.transformDomainLookup(item);
    }

    // Tech profile or trend
    const name = String(p['name'] ?? p['tech_name'] ?? p['tech_slug'] ?? '');
    if (!name) return null;

    const currentlyUsing = typeof p['currently_using'] === 'number' ? p['currently_using'] : 0;
    const historicallyUsing = typeof p['historically_using'] === 'number' ? p['historically_using'] : 0;
    const churnRate = typeof p['churn_rate'] === 'number' ? p['churn_rate'] : 0;

    const categories: string[] = ['tech_adoption'];
    if (Array.isArray(p['categories'])) {
      for (const c of p['categories'] as string[]) categories.push(c);
    }
    if (p['is_growing']) categories.push('growing');
    if (p['is_declining']) categories.push('declining');

    return {
      source: 'builtwith',
      externalId: item.entityId,
      title: name,
      description: `Tech: ${name} — ${currentlyUsing.toLocaleString()} current sites`,
      url: item.url,
      metrics: {
        currentlyUsing,
        historicallyUsing,
        churnRate: Math.round(churnRate * 100),
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        tag: p['tag'],
        isGrowing: p['is_growing'],
        isDeclining: p['is_declining'],
        searchTech: p['searchTech'],
        searchKeyword: p['searchKeyword'],
      },
    };
  }

  private transformDomainLookup(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const domain = String(p['domain'] ?? '');
    const techName = String(p['tech_name'] ?? '');
    if (!domain || !techName) return null;

    return {
      source: 'builtwith',
      externalId: item.entityId,
      title: `${domain} uses ${techName}`,
      url: item.url,
      metrics: {},
      categories: ['tech_stack'],
      scrapedAt: item.scrapedAt,
      metadata: {
        domain,
        techName,
        techTag: p['tech_tag'],
        firstDetected: p['first_detected'],
        lastDetected: p['last_detected'],
      },
    };
  }
}
