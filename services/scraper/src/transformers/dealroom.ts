// ---------------------------------------------------------------------------
// Dealroom transformer — converts raw Dealroom scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class DealroomTransformer extends BaseTransformer {
  readonly source = 'dealroom' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'dealroom')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const format = item.format;

    if (format === 'dealroom_funding_v1') {
      return this.transformFunding(item);
    }

    // Default: company listing
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const totalFunding = typeof p['total_funding'] === 'number' ? p['total_funding'] : 0;
    const employeeCount = typeof p['employee_count'] === 'number' ? p['employee_count'] : 0;
    const growthScore = typeof p['growth_score'] === 'number' ? p['growth_score'] : 0;
    const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];

    return {
      source: 'dealroom',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {
        total_funding: totalFunding,
        employee_count: employeeCount,
        growth_score: growthScore,
      },
      categories: tags.map((t) => typeof t === 'string' ? t.toLowerCase() : String(t)),
      scrapedAt: item.scrapedAt,
      metadata: {
        hq_location: p['hq_location'],
        founded_year: p['founded_year'],
        last_funding_date: p['last_funding_date'],
        last_funding_round: p['last_funding_round'],
        valuation: p['valuation'],
        tags,
      },
    };
  }

  private transformFunding(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const companyName = String(p['company_name'] ?? '');
    if (!companyName) return null;

    const roundType = p['round_type'] ? String(p['round_type']) : 'unknown';
    const amount = typeof p['amount'] === 'number' ? p['amount'] : 0;
    const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];

    return {
      source: 'dealroom',
      externalId: item.entityId,
      title: `${companyName} — ${roundType} round`,
      description: `${companyName} raised ${amount > 0 ? `$${amount.toLocaleString()}` : 'undisclosed'} in a ${roundType} round`,
      url: item.url,
      metrics: {
        amount,
      },
      categories: ['funding', ...tags.map((t) => typeof t === 'string' ? t.toLowerCase() : String(t))],
      scrapedAt: item.scrapedAt,
      metadata: {
        company_name: companyName,
        round_type: roundType,
        date: p['date'],
        investors: p['investors'],
        valuation: p['valuation'],
        hq_country: p['hq_country'],
      },
    };
  }
}
