// ---------------------------------------------------------------------------
// Hacker News scraper — uses the official HN Firebase API and Algolia HN API
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const ALGOLIA_API_BASE = 'https://hn.algolia.com/api/v1';

/** No strict rate limit, but be respectful — 500 ms between requests */
const RATE_LIMIT_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// HackerNewsScraper
// ---------------------------------------------------------------------------

export class HackerNewsScraper extends BaseScraper {
  readonly source = 'hacker_news' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'top_stories':
        return this.scrapeTopStories(params);
      case 'keyword_search':
        return this.scrapeKeywordSearch(params);
      default:
        throw new Error(
          `HackerNewsScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Top stories — fetch from HN Firebase API
  // -----------------------------------------------------------------------

  private async scrapeTopStories(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = Math.min(params.limit ?? 30, 500);

    // 1. Get the list of top story IDs
    const idsResponse = await this.retryWithBackoff(async () => {
      const res = await fetch(`${HN_API_BASE}/topstories.json`);
      if (!res.ok) {
        throw new Error(`HN API error (${res.status}) fetching top stories`);
      }
      return (await res.json()) as number[];
    });

    const storyIds = idsResponse.slice(0, limit);

    // 2. Fetch each story's details (batch in groups to respect rate limits)
    const allItems: RawScrapedItem[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < storyIds.length; i += BATCH_SIZE) {
      const batch = storyIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map((id) =>
          this.retryWithBackoff(() => this.fetchItem(id), 2),
        ),
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          allItems.push(result.value);
        }
      }

      if (i + BATCH_SIZE < storyIds.length) {
        await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
      }
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Keyword search — via Algolia HN API
  // -----------------------------------------------------------------------

  private async scrapeKeywordSearch(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'HackerNewsScraper: at least one keyword is required for keyword_search',
      );
    }

    const limit = Math.min(params.limit ?? 20, 100);
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchAlgolia(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[hacker_news] Failed to search for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Fetch a single HN item by ID
  // -----------------------------------------------------------------------

  private async fetchItem(id: number): Promise<RawScrapedItem | null> {
    const res = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!res.ok) {
      throw new Error(`HN API error (${res.status}) fetching item ${id}`);
    }

    const item = (await res.json()) as Record<string, unknown> | null;
    if (!item || item['type'] !== 'story') return null;

    const storyId = String(item['id'] ?? '');
    const title = String(item['title'] ?? '');
    if (!title) return null;

    return {
      source: 'hacker_news',
      entityId: `hn:${storyId}`,
      url: String(
        item['url'] ?? `https://news.ycombinator.com/item?id=${storyId}`,
      ),
      payload: {
        id: storyId,
        title,
        url: item['url'] ?? null,
        points: item['score'] ?? 0,
        num_comments: item['descendants'] ?? 0,
        author: item['by'] ?? null,
        created_at: item['time']
          ? new Date((item['time'] as number) * 1000).toISOString()
          : null,
        type: item['type'],
        hn_url: `https://news.ycombinator.com/item?id=${storyId}`,
      },
      format: 'hn_story_v1',
      scrapedAt: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // Algolia HN search helper
  // -----------------------------------------------------------------------

  private async searchAlgolia(
    query: string,
    hitsPerPage: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(`${ALGOLIA_API_BASE}/search`);
    url.searchParams.set('query', query);
    url.searchParams.set('tags', 'story');
    url.searchParams.set('hitsPerPage', String(hitsPerPage));

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      throw new Error('Algolia HN API rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Algolia HN API error (${response.status}): ${text}`,
      );
    }

    const body = (await response.json()) as {
      hits: Array<Record<string, unknown>>;
    };

    const now = new Date();

    return body.hits.map((hit) => {
      const objectID = String(hit['objectID'] ?? '');

      return {
        source: 'hacker_news',
        entityId: `hn:${objectID}`,
        url: String(
          hit['url'] ?? `https://news.ycombinator.com/item?id=${objectID}`,
        ),
        payload: {
          id: objectID,
          title: hit['title'],
          url: hit['url'] ?? null,
          points: hit['points'] ?? 0,
          num_comments: hit['num_comments'] ?? 0,
          author: hit['author'] ?? null,
          created_at: hit['created_at'] ?? null,
          hn_url: `https://news.ycombinator.com/item?id=${objectID}`,
          searchQuery: query,
        },
        format: 'hn_story_v1',
        scrapedAt: now,
      };
    });
  }
}
