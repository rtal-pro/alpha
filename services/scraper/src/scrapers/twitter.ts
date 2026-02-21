// ---------------------------------------------------------------------------
// Twitter/X scraper — uses the X API v2 (Bearer token, app-only auth)
//
// Searches for SaaS-related tweets, product mentions, complaints, and trends.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.twitter.com/2';

/** X API rate limit: 300 req/15min on app-only => ~3s between requests */
const RATE_LIMIT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// TwitterScraper
// ---------------------------------------------------------------------------

export class TwitterScraper extends BaseScraper {
  readonly source = 'twitter' as const;
  readonly method = 'api' as const;

  private get bearerToken(): string {
    const token = process.env['TWITTER_BEARER_TOKEN'] ?? '';
    if (!token) throw new Error('TWITTER_BEARER_TOKEN not configured');
    return token;
  }

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (params.type !== 'keyword_search') {
      throw new Error(`TwitterScraper: unsupported scrape type "${params.type}"`);
    }

    const keywords = params.keywords ?? [];
    const limit = Math.min(params.limit ?? 100, 100);

    if (keywords.length === 0) {
      throw new Error('TwitterScraper: at least one keyword is required');
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchTweets(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[twitter] Failed to search for "${keyword}": ${message}`);
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search helper
  // -----------------------------------------------------------------------

  private async searchTweets(
    keyword: string,
    maxResults: number,
  ): Promise<RawScrapedItem[]> {
    // Build query: exclude retweets, require minimum engagement
    const query = `${keyword} -is:retweet lang:en`;

    const url = new URL(`${API_BASE}/tweets/search/recent`);
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', String(Math.min(maxResults, 100)));
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,context_annotations,lang');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,name,public_metrics,verified');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    if (response.status === 429) {
      throw new Error('Twitter API rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twitter API error (${response.status}): ${text}`);
    }

    const body = (await response.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at?: string;
        author_id?: string;
        public_metrics?: {
          retweet_count: number;
          reply_count: number;
          like_count: number;
          quote_count: number;
          impression_count?: number;
        };
        context_annotations?: Array<{
          domain: { id: string; name: string };
          entity: { id: string; name: string };
        }>;
      }>;
      includes?: {
        users?: Array<{
          id: string;
          username: string;
          name: string;
          public_metrics?: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
          };
          verified?: boolean;
        }>;
      };
      meta?: {
        result_count: number;
        next_token?: string;
      };
    };

    if (!body.data || body.data.length === 0) return [];

    const now = new Date();
    const userMap = new Map(
      (body.includes?.users ?? []).map((u) => [u.id, u]),
    );

    return body.data.map((tweet) => {
      const author = tweet.author_id ? userMap.get(tweet.author_id) : undefined;
      const metrics = tweet.public_metrics;

      return {
        source: 'twitter',
        entityId: `twitter:${tweet.id}`,
        url: `https://twitter.com/i/status/${tweet.id}`,
        payload: {
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.author_id,
          author_username: author?.username,
          author_name: author?.name,
          author_followers: author?.public_metrics?.followers_count ?? 0,
          author_verified: author?.verified ?? false,
          retweet_count: metrics?.retweet_count ?? 0,
          reply_count: metrics?.reply_count ?? 0,
          like_count: metrics?.like_count ?? 0,
          quote_count: metrics?.quote_count ?? 0,
          impression_count: metrics?.impression_count ?? 0,
          context_annotations: tweet.context_annotations ?? [],
          searchKeyword: keyword,
        },
        format: 'twitter_tweet_v2',
        scrapedAt: now,
      };
    });
  }
}
