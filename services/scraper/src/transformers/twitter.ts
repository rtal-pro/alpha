// ---------------------------------------------------------------------------
// Twitter transformer — converts raw X API v2 responses into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class TwitterTransformer extends BaseTransformer {
  readonly source = 'twitter' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'twitter')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const text = String(p['text'] ?? '');
    if (!text) return null;

    const title = text.length > 120 ? text.slice(0, 117) + '...' : text;
    const likeCount = typeof p['like_count'] === 'number' ? p['like_count'] : 0;
    const retweetCount = typeof p['retweet_count'] === 'number' ? p['retweet_count'] : 0;
    const replyCount = typeof p['reply_count'] === 'number' ? p['reply_count'] : 0;
    const quoteCount = typeof p['quote_count'] === 'number' ? p['quote_count'] : 0;
    const impressionCount = typeof p['impression_count'] === 'number' ? p['impression_count'] : 0;
    const authorFollowers = typeof p['author_followers'] === 'number' ? p['author_followers'] : 0;

    const engagement = likeCount + retweetCount + replyCount + quoteCount;

    const categories: string[] = [];
    if (p['searchKeyword']) categories.push(String(p['searchKeyword']));

    return {
      source: 'twitter',
      externalId: item.entityId,
      title,
      description: text,
      url: item.url,
      metrics: {
        likeCount,
        retweetCount,
        replyCount,
        quoteCount,
        impressionCount,
        authorFollowers,
        engagement,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        authorUsername: p['author_username'],
        authorName: p['author_name'],
        authorVerified: p['author_verified'],
        createdAt: p['created_at'],
        contextAnnotations: p['context_annotations'],
        searchKeyword: p['searchKeyword'],
      },
    };
  }
}
