// ---------------------------------------------------------------------------
// Wellfound transformer — converts raw Wellfound scraped items into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class WellfoundTransformer extends BaseTransformer {
  readonly source = 'wellfound' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'wellfound')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const format = item.format;

    if (format === 'wellfound_job_v1') {
      return this.transformJob(item);
    }

    // Default: startup listing
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const jobCount = typeof p['job_count'] === 'number' ? p['job_count'] : 0;
    const teamSize = typeof p['team_size'] === 'number' ? p['team_size'] : 0;
    const markets = Array.isArray(p['markets']) ? (p['markets'] as string[]) : [];

    return {
      source: 'wellfound',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {
        job_count: jobCount,
        team_size: teamSize,
      },
      categories: markets.map((m) => typeof m === 'string' ? m.toLowerCase() : String(m)),
      scrapedAt: item.scrapedAt,
      metadata: {
        stage: p['stage'],
        funding_stage: p['funding_stage'],
        total_raised: p['total_raised'],
        location: p['location'],
        markets,
      },
    };
  }

  private transformJob(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const title = String(p['title'] ?? '');
    if (!title) return null;

    const companyName = p['company_name'] ? String(p['company_name']) : '';
    const markets = Array.isArray(p['markets']) ? (p['markets'] as string[]) : [];
    const salaryMin = typeof p['salary_min'] === 'number' ? p['salary_min'] : 0;
    const salaryMax = typeof p['salary_max'] === 'number' ? p['salary_max'] : 0;

    return {
      source: 'wellfound',
      externalId: item.entityId,
      title: `${title} at ${companyName}`,
      description: `${title} at ${companyName}${p['remote'] ? ' (Remote)' : ''}`,
      url: item.url,
      metrics: {
        salary_min: salaryMin,
        salary_max: salaryMax,
      },
      categories: markets.map((m) => typeof m === 'string' ? m.toLowerCase() : String(m)),
      scrapedAt: item.scrapedAt,
      metadata: {
        company: companyName,
        company_slug: p['company_slug'],
        location: p['location'],
        remote: p['remote'],
        role_type: p['role_type'],
        funding_stage: p['funding_stage'],
        equity_min: p['equity_min'],
        equity_max: p['equity_max'],
      },
    };
  }
}
