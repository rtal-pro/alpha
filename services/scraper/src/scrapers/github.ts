// ---------------------------------------------------------------------------
// GitHub scraper — uses the GitHub REST API v3
// ---------------------------------------------------------------------------

import { GITHUB_TOKEN } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.github.com';

/** 5 000 req/hr with token => ~720 ms between requests */
const RATE_LIMIT_DELAY_MS = 720;

// ---------------------------------------------------------------------------
// GitHubScraper
// ---------------------------------------------------------------------------

export class GitHubScraper extends BaseScraper {
  readonly source = 'github' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'topic_search':
        return this.scrapeTopicSearch(params);
      case 'trending':
        return this.scrapeTrending(params);
      default:
        throw new Error(
          `GitHubScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Topic search — search repos by topic / keywords
  // -----------------------------------------------------------------------

  private async scrapeTopicSearch(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error('GitHubScraper: at least one keyword is required for topic_search');
    }

    const limit = Math.min(params.limit ?? 30, 100);
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchRepos(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[github] Failed to search repos for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Trending — recently created repos with high star velocity
  // -----------------------------------------------------------------------

  private async scrapeTrending(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = Math.min(params.limit ?? 30, 100);
    const daysBack = params.daysBack ?? 7;

    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

    const query = `created:>${sinceStr} stars:>10`;

    const items = await this.retryWithBackoff(
      () => this.searchRepos(query, limit, 'stars', 'desc'),
      2,
    );

    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

    return items;
  }

  // -----------------------------------------------------------------------
  // Search repos helper
  // -----------------------------------------------------------------------

  private async searchRepos(
    query: string,
    perPage: number,
    sort: string = 'stars',
    order: string = 'desc',
  ): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/search/repositories`);
    url.searchParams.set('q', query);
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', order);
    url.searchParams.set('per_page', String(perPage));

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AlphaScraper/1.0',
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const response = await fetch(url.toString(), { headers });

    if (response.status === 429) {
      throw new Error('GitHub API rate limit hit (429)');
    }

    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        const resetAt = response.headers.get('x-ratelimit-reset');
        throw new Error(
          `GitHub API rate limit exhausted. Resets at ${resetAt}`,
        );
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GitHub API error (${response.status}) for query "${query}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      total_count: number;
      items: Array<Record<string, unknown>>;
    };

    const now = new Date();

    return body.items.map((repo) => {
      const id = String(repo['id'] ?? '');
      const fullName = String(repo['full_name'] ?? '');

      return {
        source: 'github',
        entityId: `github:${id}`,
        url: String(repo['html_url'] ?? `https://github.com/${fullName}`),
        payload: {
          id,
          full_name: fullName,
          description: repo['description'],
          stargazers_count: repo['stargazers_count'],
          forks_count: repo['forks_count'],
          watchers_count: repo['watchers_count'],
          open_issues_count: repo['open_issues_count'],
          language: repo['language'],
          topics: repo['topics'],
          created_at: repo['created_at'],
          updated_at: repo['updated_at'],
          pushed_at: repo['pushed_at'],
          homepage: repo['homepage'],
          size: repo['size'],
          default_branch: repo['default_branch'],
          license: repo['license'],
          owner: {
            login: (repo['owner'] as Record<string, unknown>)?.['login'],
            avatar_url: (repo['owner'] as Record<string, unknown>)?.['avatar_url'],
            type: (repo['owner'] as Record<string, unknown>)?.['type'],
          },
          searchQuery: query,
        },
        format: 'github_repo_v1',
        scrapedAt: now,
      };
    });
  }
}
