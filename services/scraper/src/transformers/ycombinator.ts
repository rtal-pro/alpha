// ---------------------------------------------------------------------------
// Y Combinator transformer — converts raw YC directory/launch data into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class YCombinatorTransformer extends BaseTransformer {
  readonly source = 'ycombinator' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'ycombinator')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const format = item.format;

    if (format === 'yc_launch_v1') {
      return this.transformLaunch(item);
    }

    // Default: company directory listing
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const batch = p['batch'] ? String(p['batch']) : '';
    const industries = Array.isArray(p['industries']) ? (p['industries'] as string[]) : [];
    const teamSize = typeof p['team_size'] === 'number' ? p['team_size'] : 0;

    return {
      source: 'ycombinator',
      externalId: item.entityId,
      title: `${name} (YC ${batch})`,
      description,
      url: item.url,
      metrics: {
        team_size: teamSize,
      },
      categories: industries.map((i) => typeof i === 'string' ? i.toLowerCase() : String(i)),
      scrapedAt: item.scrapedAt,
      metadata: {
        batch,
        status: p['status'],
        location: p['location'],
        website: p['website'],
        is_hiring: p['is_hiring'],
        yc_batch_year: p['yc_batch_year'],
      },
    };
  }

  private transformLaunch(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const title = String(p['title'] ?? '');
    if (!title) return null;

    const score = typeof p['score'] === 'number' ? p['score'] : 0;
    const comments = typeof p['comments'] === 'number' ? p['comments'] : 0;

    return {
      source: 'ycombinator',
      externalId: item.entityId,
      title,
      url: item.url,
      metrics: {
        score,
        numComments: comments,
      },
      categories: ['yc_launch'],
      scrapedAt: item.scrapedAt,
      metadata: {
        hn_id: p['hn_id'],
        is_launch: true,
      },
    };
  }
}
