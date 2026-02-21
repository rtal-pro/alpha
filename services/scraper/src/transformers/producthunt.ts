// ---------------------------------------------------------------------------
// ProductHunt transformer — converts raw ProductHunt API responses into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed ProductHuntPost (kept inline for independence)
// ---------------------------------------------------------------------------

export interface ProductHuntPost {
  name: string;
  tagline: string;
  votesCount: number;
  commentsCount: number;
  website: string | null;
  topics: string[];
  thumbnailUrl: string | null;
}

// ---------------------------------------------------------------------------
// ProductHuntTransformer
// ---------------------------------------------------------------------------

export class ProductHuntTransformer extends BaseTransformer {
  readonly source = 'producthunt' as const;

  /**
   * Transform raw ProductHunt scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'producthunt')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed ProductHuntPost objects from raw items.
   */
  toProductHuntPosts(rawItems: RawScrapedItem[]): ProductHuntPost[] {
    return rawItems
      .filter((item) => item.source === 'producthunt')
      .map((item) => this.toProductHuntPost(item))
      .filter((post): post is ProductHuntPost => post !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const name = String(p['name'] ?? '');
    if (!name) return null;

    const tagline = p['tagline'] ? String(p['tagline']) : undefined;
    const description = p['description'] ? String(p['description']) : undefined;
    const votesCount =
      typeof p['votesCount'] === 'number' ? p['votesCount'] : 0;
    const commentsCount =
      typeof p['commentsCount'] === 'number' ? p['commentsCount'] : 0;
    const website = p['website'] ? String(p['website']) : null;
    const thumbnailUrl = p['thumbnailUrl'] ? String(p['thumbnailUrl']) : null;
    const topics = Array.isArray(p['topics'])
      ? (p['topics'] as string[])
      : [];

    // Build categories from topics
    const categories: string[] = topics.map((t) => `topic:${t}`);

    // Truncate description
    const desc = description
      ? description.length > 500
        ? description.slice(0, 497) + '...'
        : description
      : tagline;

    return {
      source: 'producthunt',
      externalId: item.entityId,
      title: name,
      description: desc,
      url: website ?? item.url,
      metrics: {
        votes: votesCount,
        comments: commentsCount,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        tagline,
        website,
        thumbnailUrl,
        topics,
        productHuntUrl: item.url,
        slug: p['slug'],
        createdAt: p['createdAt'],
      },
    };
  }

  private toProductHuntPost(item: RawScrapedItem): ProductHuntPost | null {
    const p = item.payload;

    const name = String(p['name'] ?? '');
    if (!name) return null;

    return {
      name,
      tagline: String(p['tagline'] ?? ''),
      votesCount:
        typeof p['votesCount'] === 'number' ? p['votesCount'] : 0,
      commentsCount:
        typeof p['commentsCount'] === 'number' ? p['commentsCount'] : 0,
      website: p['website'] ? String(p['website']) : null,
      topics: Array.isArray(p['topics']) ? (p['topics'] as string[]) : [],
      thumbnailUrl: p['thumbnailUrl'] ? String(p['thumbnailUrl']) : null,
    };
  }
}
