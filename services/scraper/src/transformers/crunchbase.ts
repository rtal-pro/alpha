// ---------------------------------------------------------------------------
// Crunchbase transformer — converts raw Crunchbase API data into
// NormalizedItem shapes. Handles both funding round and org formats.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class CrunchbaseTransformer extends BaseTransformer {
  readonly source = 'crunchbase' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'crunchbase')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    if (item.format === 'crunchbase_funding_v1') {
      return this.transformFunding(item);
    }
    return this.transformOrg(item);
  }

  private transformFunding(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const org = String(p['organization'] ?? 'Unknown');
    const investmentType = String(p['investment_type'] ?? 'unknown');
    const moneyRaised = typeof p['money_raised_usd'] === 'number' ? p['money_raised_usd'] : 0;
    const numInvestors = typeof p['num_investors'] === 'number' ? p['num_investors'] : 0;

    const categories: string[] = ['funding'];
    if (p['searchCategory']) categories.push(String(p['searchCategory']));

    return {
      source: 'crunchbase',
      externalId: item.entityId,
      title: `${org} — ${investmentType}`,
      description: `${org} raised ${moneyRaised > 0 ? `$${(moneyRaised / 1_000_000).toFixed(1)}M` : 'undisclosed'} (${investmentType})`,
      url: item.url,
      metrics: {
        moneyRaisedUsd: moneyRaised,
        numInvestors,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        uuid: p['uuid'],
        organization: p['organization'],
        announcedOn: p['announced_on'],
        investmentType,
        currency: p['money_raised_currency'],
        fundedOrgCategories: p['categories'],
        location: p['location'],
        searchCategory: p['searchCategory'],
      },
    };
  }

  private transformOrg(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const name = String(p['name'] ?? 'Unknown');
    const fundingTotal = typeof (p['funding_total'] as Record<string, unknown>)?.['value'] === 'number'
      ? (p['funding_total'] as Record<string, unknown>)['value'] as number
      : 0;
    const rank = typeof p['rank'] === 'number' ? p['rank'] : 999999;

    const categories: string[] = ['company'];
    if (p['searchKeyword']) categories.push(String(p['searchKeyword']));

    return {
      source: 'crunchbase',
      externalId: item.entityId,
      title: name,
      description: p['description'] ? String(p['description']) : undefined,
      url: item.url,
      metrics: {
        fundingTotalUsd: fundingTotal,
        rank,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        uuid: p['uuid'],
        foundedOn: p['founded_on'],
        numEmployees: p['num_employees'],
        lastFundingType: p['last_funding_type'],
        lastFundingAt: p['last_funding_at'],
        orgCategories: p['categories'],
        location: p['location'],
        searchKeyword: p['searchKeyword'],
      },
    };
  }
}
