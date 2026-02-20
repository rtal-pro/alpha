// ---------------------------------------------------------------------------
// Hacker News transformer — converts raw HN API responses into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed HackerNewsStory (kept inline for independence)
// ---------------------------------------------------------------------------

export interface HackerNewsStory {
  title: string;
  url: string | null;
  points: number;
  numComments: number;
  author: string;
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// HackerNewsTransformer
// ---------------------------------------------------------------------------

export class HackerNewsTransformer extends BaseTransformer {
  readonly source = 'hacker_news' as const;

  /**
   * Transform raw Hacker News scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'hacker_news')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed HackerNewsStory objects from raw items.
   */
  toHackerNewsStories(rawItems: RawScrapedItem[]): HackerNewsStory[] {
    return rawItems
      .filter((item) => item.source === 'hacker_news')
      .map((item) => this.toStory(item))
      .filter((story): story is HackerNewsStory => story !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const storyUrl = p['url'] ? String(p['url']) : null;
    const hnUrl = p['hn_url'] ? String(p['hn_url']) : item.url;
    const points = typeof p['points'] === 'number' ? p['points'] : 0;
    const numComments =
      typeof p['num_comments'] === 'number' ? p['num_comments'] : 0;
    const author = String(p['author'] ?? '');
    const createdAt = p['created_at'] ? String(p['created_at']) : null;

    // Derive a domain category from the URL if available
    const categories: string[] = ['hacker_news'];
    if (storyUrl) {
      try {
        const domain = new URL(storyUrl).hostname.replace('www.', '');
        categories.push(`domain:${domain}`);
      } catch {
        // Invalid URL — skip domain category
      }
    }

    return {
      source: 'hacker_news',
      externalId: item.entityId,
      title,
      description: storyUrl
        ? `${title} (${storyUrl})`
        : title,
      url: storyUrl ?? hnUrl,
      metrics: {
        points,
        numComments,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        author,
        createdAt,
        hnUrl,
        storyUrl,
        searchQuery: p['searchQuery'],
      },
    };
  }

  private toStory(item: RawScrapedItem): HackerNewsStory | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    return {
      title,
      url: p['url'] ? String(p['url']) : null,
      points: typeof p['points'] === 'number' ? p['points'] : 0,
      numComments:
        typeof p['num_comments'] === 'number' ? p['num_comments'] : 0,
      author: String(p['author'] ?? ''),
      createdAt: p['created_at'] ? String(p['created_at']) : null,
    };
  }
}
