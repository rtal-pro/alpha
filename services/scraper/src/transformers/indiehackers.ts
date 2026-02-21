// ---------------------------------------------------------------------------
// IndieHackers transformer — converts raw IH post data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class IndieHackersTransformer extends BaseTransformer {
  readonly source = 'indiehackers' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'indiehackers')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const votes = typeof p['votes'] === 'number' ? p['votes'] : 0;
    const comments = typeof p['comments'] === 'number' ? p['comments'] : 0;

    const categories: string[] = ['indiehackers'];
    if (p['searchContext']) categories.push(String(p['searchContext']));

    return {
      source: 'indiehackers',
      externalId: item.entityId,
      title,
      url: item.url,
      metrics: {
        votes,
        comments,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        postId: p['id'],
        searchContext: p['searchContext'],
      },
    };
  }
}
