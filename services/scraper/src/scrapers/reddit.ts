// ---------------------------------------------------------------------------
// Reddit scraper — uses the official Reddit OAuth API (client-credentials)
// ---------------------------------------------------------------------------

import {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USER_AGENT,
} from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API_BASE = 'https://oauth.reddit.com';

/** Reddit rate limit: 100 req/min => ~600 ms between requests */
const RATE_LIMIT_DELAY_MS = 600;

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// RedditScraper
// ---------------------------------------------------------------------------

export class RedditScraper extends BaseScraper {
  readonly source = 'reddit' as const;
  readonly method = 'api' as const;

  private tokenCache: TokenCache | null = null;

  // -----------------------------------------------------------------------
  // OAuth token management
  // -----------------------------------------------------------------------

  /**
   * Obtain (or reuse) an OAuth2 access token via the client-credentials flow.
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60 s buffer)
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) {
      throw new Error(
        'Reddit OAuth credentials not configured (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET)',
      );
    }

    const credentials = Buffer.from(
      `${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`,
    ).toString('base64');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Reddit OAuth token request failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1_000,
    };

    return this.tokenCache.accessToken;
  }

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (params.type !== 'keyword_search') {
      throw new Error(`RedditScraper: unsupported scrape type "${params.type}"`);
    }

    const keywords = params.keywords ?? [];
    const subreddits = params.subreddits ?? [
      'SaaS',
      'startups',
      'Entrepreneur',
      'microsaas',
    ];
    const limit = params.limit ?? 25;

    if (keywords.length === 0) {
      throw new Error('RedditScraper: at least one keyword is required');
    }

    const token = await this.getAccessToken();
    const allItems: RawScrapedItem[] = [];

    for (const subreddit of subreddits) {
      for (const keyword of keywords) {
        try {
          const items = await this.retryWithBackoff(
            () => this.searchSubreddit(subreddit, keyword, token, limit),
            2, // max retries
          );
          allItems.push(...items);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[reddit] Failed to search r/${subreddit} for "${keyword}": ${message}`,
          );
          // Continue with other subreddit/keyword combos
        }

        // Respect rate limit
        await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
      }
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Subreddit search helper
  // -----------------------------------------------------------------------

  private async searchSubreddit(
    subreddit: string,
    keyword: string,
    token: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/r/${encodeURIComponent(subreddit)}/search`);
    url.searchParams.set('q', keyword);
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('t', 'month');
    url.searchParams.set('limit', String(Math.min(limit, 100)));
    url.searchParams.set('restrict_sr', 'on');
    url.searchParams.set('type', 'link');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': REDDIT_USER_AGENT,
      },
    });

    if (response.status === 429) {
      // Rate limited — throw to trigger retry with backoff
      throw new Error('Reddit API rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Reddit API error (${response.status}) for r/${subreddit}/search?q=${keyword}: ${text}`,
      );
    }

    const body = (await response.json()) as {
      data: {
        children: Array<{
          kind: string;
          data: Record<string, unknown>;
        }>;
      };
    };

    const now = new Date();

    return body.data.children.map((child) => {
      const post = child.data;
      const postId = String(post['id'] ?? '');
      const permalink = String(post['permalink'] ?? '');

      return {
        source: 'reddit',
        entityId: `reddit:${postId}`,
        url: permalink ? `https://www.reddit.com${permalink}` : '',
        payload: {
          id: postId,
          title: post['title'],
          selftext: post['selftext'],
          score: post['score'],
          num_comments: post['num_comments'],
          subreddit: post['subreddit'],
          subreddit_name_prefixed: post['subreddit_name_prefixed'],
          author: post['author'],
          created_utc: post['created_utc'],
          permalink: post['permalink'],
          url: post['url'],
          is_self: post['is_self'],
          link_flair_text: post['link_flair_text'],
          upvote_ratio: post['upvote_ratio'],
          over_18: post['over_18'],
          domain: post['domain'],
          searchKeyword: keyword,
          searchSubreddit: subreddit,
        },
        format: 'reddit_post_v1',
        scrapedAt: now,
      };
    });
  }
}
