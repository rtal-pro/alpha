// ---------------------------------------------------------------------------
// IndieHackers scraper — Cheerio-based scraper for indiehackers.com
//
// IH doesn't have a public API, so we scrape the public group/post feeds.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.indiehackers.com';

/** Be polite — 2s between requests to IH */
const RATE_LIMIT_DELAY_MS = 2_000;

// IH groups relevant to SaaS ideas
const DEFAULT_GROUPS = [
  'saas',
  'product-feedback',
  'growth',
  'idea-feedback',
  'landing-page-feedback',
  'marketing',
  'side-projects',
  'revenue-milestones',
];

// ---------------------------------------------------------------------------
// IndieHackersScraper
// ---------------------------------------------------------------------------

export class IndieHackersScraper extends BaseScraper {
  readonly source = 'indiehackers' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (params.type !== 'keyword_search' && params.type !== 'group_feed') {
      throw new Error(`IndieHackersScraper: unsupported scrape type "${params.type}"`);
    }

    const keywords = params.keywords ?? [];
    const groups = (params as Record<string, unknown>)['groups'] as string[] | undefined ?? DEFAULT_GROUPS;
    const limit = params.limit ?? 20;

    const allItems: RawScrapedItem[] = [];

    if (params.type === 'keyword_search' && keywords.length > 0) {
      for (const keyword of keywords) {
        try {
          const items = await this.retryWithBackoff(
            () => this.searchPosts(keyword, limit),
            2,
          );
          allItems.push(...items);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[indiehackers] Search failed for "${keyword}": ${message}`);
        }
        await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
      }
    }

    if (params.type === 'group_feed') {
      for (const group of groups) {
        try {
          const items = await this.retryWithBackoff(
            () => this.scrapeGroupFeed(group, limit),
            2,
          );
          allItems.push(...items);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[indiehackers] Group feed failed for "${group}": ${message}`);
        }
        await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
      }
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search posts via the IH search page
  // -----------------------------------------------------------------------

  private async searchPosts(keyword: string, limit: number): Promise<RawScrapedItem[]> {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SaaSIdeaEngine/0.1 (market-research)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`IH search failed (${response.status})`);
    }

    const html = await response.text();
    return this.parsePostsFromHtml(html, keyword, limit);
  }

  // -----------------------------------------------------------------------
  // Scrape a group feed
  // -----------------------------------------------------------------------

  private async scrapeGroupFeed(group: string, limit: number): Promise<RawScrapedItem[]> {
    const url = `${BASE_URL}/group/${group}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SaaSIdeaEngine/0.1 (market-research)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`IH group feed failed for "${group}" (${response.status})`);
    }

    const html = await response.text();
    return this.parsePostsFromHtml(html, group, limit);
  }

  // -----------------------------------------------------------------------
  // HTML parsing — extract posts from IH page HTML
  // -----------------------------------------------------------------------

  private parsePostsFromHtml(
    html: string,
    context: string,
    limit: number,
  ): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // IH uses data attributes and specific class patterns for posts.
    // Extract post blocks using regex patterns (lightweight, no cheerio dep needed).
    const postPattern = /class="feed-item[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(\/post\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const titlePattern = /class="feed-item__title[^"]*"[^>]*>([\s\S]*?)<\//;
    const votesPattern = /class="[^"]*vote-count[^"]*"[^>]*>(\d+)/;
    const commentsPattern = /class="[^"]*comment-count[^"]*"[^>]*>(\d+)/;

    // Fallback: look for links to /post/ paths with surrounding content
    const linkPattern = /<a[^>]*href="(\/post\/([a-z0-9-]+))"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null && items.length < limit) {
      const path = match[1]!;
      const postId = match[2]!;
      const linkContent = match[3]!;

      // Extract title (strip tags)
      const title = linkContent.replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 5) continue;

      // Try to extract vote/comment counts from surrounding context
      const surroundingStart = Math.max(0, match.index - 500);
      const surrounding = html.slice(surroundingStart, match.index + match[0].length + 500);
      const votes = votesPattern.exec(surrounding);
      const comments = commentsPattern.exec(surrounding);

      items.push({
        source: 'indiehackers',
        entityId: `ih:${postId}`,
        url: `${BASE_URL}${path}`,
        payload: {
          id: postId,
          title,
          votes: votes ? parseInt(votes[1]!, 10) : 0,
          comments: comments ? parseInt(comments[1]!, 10) : 0,
          searchContext: context,
        },
        format: 'indiehackers_post_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
