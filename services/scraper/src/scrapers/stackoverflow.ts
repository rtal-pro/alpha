// ---------------------------------------------------------------------------
// StackOverflow scraper — uses the public StackExchange API v2.3
//
// Captures questions, answers, and tag trends for developer pain detection.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.stackexchange.com/2.3';

/** SO API rate limit: 300 req/day without key, 10k with key => 1s between */
const RATE_LIMIT_DELAY_MS = 1_200;

// ---------------------------------------------------------------------------
// StackOverflowScraper
// ---------------------------------------------------------------------------

export class StackOverflowScraper extends BaseScraper {
  readonly source = 'stackoverflow' as const;
  readonly method = 'api' as const;

  private get apiKey(): string | undefined {
    return process.env['STACKOVERFLOW_API_KEY'] || undefined;
  }

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = Math.min(params.limit ?? 50, 100);
    const daysBack = params.daysBack ?? 30;

    if (params.type === 'keyword_search') {
      return this.searchQuestions(keywords, limit, daysBack);
    }
    if (params.type === 'tag_trending') {
      return this.getTrendingTags(limit);
    }

    throw new Error(`StackOverflowScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search questions by keyword
  // -----------------------------------------------------------------------

  private async searchQuestions(
    keywords: string[],
    limit: number,
    daysBack: number,
  ): Promise<RawScrapedItem[]> {
    if (keywords.length === 0) return [];

    const fromDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchQuestions(keyword, limit, fromDate),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[stackoverflow] Failed to search "${keyword}": ${message}`);
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async fetchQuestions(
    query: string,
    pageSize: number,
    fromDate: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/search/advanced`);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('q', query);
    url.searchParams.set('fromdate', String(fromDate));
    url.searchParams.set('pagesize', String(pageSize));
    url.searchParams.set('site', 'stackoverflow');
    url.searchParams.set('filter', 'withbody');
    if (this.apiKey) url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());

    if (response.status === 429) {
      throw new Error('StackOverflow API rate limit (429)');
    }
    if (!response.ok) {
      throw new Error(`StackOverflow API error (${response.status})`);
    }

    const body = (await response.json()) as {
      items: Array<{
        question_id: number;
        title: string;
        body?: string;
        score: number;
        view_count: number;
        answer_count: number;
        is_answered: boolean;
        creation_date: number;
        tags: string[];
        link: string;
        owner?: { display_name?: string; reputation?: number };
      }>;
      has_more: boolean;
      quota_remaining: number;
    };

    const now = new Date();

    return body.items.map((q) => ({
      source: 'stackoverflow',
      entityId: `stackoverflow:${q.question_id}`,
      url: q.link,
      payload: {
        question_id: q.question_id,
        title: q.title,
        body_snippet: (q.body ?? '').slice(0, 500),
        score: q.score,
        view_count: q.view_count,
        answer_count: q.answer_count,
        is_answered: q.is_answered,
        creation_date: q.creation_date,
        tags: q.tags,
        author_name: q.owner?.display_name,
        author_reputation: q.owner?.reputation ?? 0,
        searchKeyword: query,
      },
      format: 'stackoverflow_question_v1',
      scrapedAt: now,
    }));
  }

  // -----------------------------------------------------------------------
  // Trending tags (shows what tech is growing/declining)
  // -----------------------------------------------------------------------

  private async getTrendingTags(limit: number): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/tags`);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'popular');
    url.searchParams.set('pagesize', String(Math.min(limit, 100)));
    url.searchParams.set('site', 'stackoverflow');
    if (this.apiKey) url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`StackOverflow tags API error (${response.status})`);
    }

    const body = (await response.json()) as {
      items: Array<{
        name: string;
        count: number;
        is_moderator_only: boolean;
        is_required: boolean;
        has_synonyms: boolean;
      }>;
    };

    const now = new Date();

    return body.items.map((tag) => ({
      source: 'stackoverflow',
      entityId: `stackoverflow:tag:${tag.name}`,
      url: `https://stackoverflow.com/questions/tagged/${tag.name}`,
      payload: {
        tag_name: tag.name,
        total_count: tag.count,
        has_synonyms: tag.has_synonyms,
      },
      format: 'stackoverflow_tag_v1',
      scrapedAt: now,
    }));
  }
}
