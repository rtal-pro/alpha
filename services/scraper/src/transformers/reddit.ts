// ---------------------------------------------------------------------------
// Reddit transformer — converts raw Reddit API responses into NormalizedItem
// and typed RedditPost shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed RedditPost (mirrors shared types — kept inline for independence)
// ---------------------------------------------------------------------------

export interface RedditPost {
  subreddit: string;
  title: string;
  selftext?: string;
  score: number;
  numComments: number;
  url: string;
  createdUtc: number;
  author: string;
}

// ---------------------------------------------------------------------------
// RedditTransformer
// ---------------------------------------------------------------------------

export class RedditTransformer extends BaseTransformer {
  readonly source = 'reddit' as const;

  /**
   * Transform raw Reddit scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'reddit')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed RedditPost objects from raw items (for LLM context builder).
   */
  toRedditPosts(rawItems: RawScrapedItem[]): RedditPost[] {
    return rawItems
      .filter((item) => item.source === 'reddit')
      .map((item) => this.toRedditPost(item))
      .filter((post): post is RedditPost => post !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const selftext = p['selftext'] ? String(p['selftext']) : undefined;
    const score = typeof p['score'] === 'number' ? p['score'] : 0;
    const numComments =
      typeof p['num_comments'] === 'number' ? p['num_comments'] : 0;
    const subreddit = String(p['subreddit'] ?? '');
    const author = String(p['author'] ?? '[deleted]');
    const createdUtc =
      typeof p['created_utc'] === 'number' ? p['created_utc'] : 0;
    const postUrl = String(p['url'] ?? item.url);
    const flairText = p['link_flair_text'] ? String(p['link_flair_text']) : null;
    const upvoteRatio =
      typeof p['upvote_ratio'] === 'number' ? p['upvote_ratio'] : 0;

    // Build categories from subreddit + flair
    const categories: string[] = [];
    if (subreddit) categories.push(`r/${subreddit}`);
    if (flairText) categories.push(flairText);

    // Truncate selftext for description (keep full text in metadata)
    const description = selftext
      ? selftext.length > 500
        ? selftext.slice(0, 497) + '...'
        : selftext
      : undefined;

    return {
      source: 'reddit',
      externalId: item.entityId,
      title,
      description,
      url: postUrl,
      metrics: {
        score,
        numComments,
        upvoteRatio,
        createdUtc,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        subreddit,
        author,
        selftext,
        searchKeyword: p['searchKeyword'],
        searchSubreddit: p['searchSubreddit'],
      },
    };
  }

  private toRedditPost(item: RawScrapedItem): RedditPost | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    return {
      subreddit: String(p['subreddit'] ?? ''),
      title,
      selftext: p['selftext'] ? String(p['selftext']) : undefined,
      score: typeof p['score'] === 'number' ? p['score'] : 0,
      numComments:
        typeof p['num_comments'] === 'number' ? p['num_comments'] : 0,
      url: String(p['url'] ?? item.url),
      createdUtc:
        typeof p['created_utc'] === 'number' ? p['created_utc'] : 0,
      author: String(p['author'] ?? '[deleted]'),
    };
  }
}
