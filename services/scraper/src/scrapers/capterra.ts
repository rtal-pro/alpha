// ---------------------------------------------------------------------------
// Capterra Reviews scraper — uses SerpAPI to scrape Capterra listings
//
// Capterra is a major B2B review platform. Complements G2 with:
// - SMB-focused reviews (different audience than G2)
// - Pricing transparency
// - Feature comparison data
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// CapterraScraper
// ---------------------------------------------------------------------------

export class CapterraScraper extends BaseScraper {
  readonly source = 'serpapi_capterra' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('CapterraScraper: SERPAPI_KEY not configured');
    }

    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type !== 'keyword_search' || keywords.length === 0) {
      throw new Error('CapterraScraper: requires keyword_search type with keywords');
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchCapterra(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[capterra] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async searchCapterra(
    keyword: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', `site:capterra.com ${keyword} software reviews`);
    url.searchParams.set('num', String(Math.min(limit, 20)));
    url.searchParams.set('api_key', SERPAPI_KEY!);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`SerpAPI error (${response.status})`);
    }

    const body = (await response.json()) as {
      organic_results?: Array<{
        position: number;
        title: string;
        link: string;
        snippet: string;
        rich_snippet?: {
          top?: {
            detected_extensions?: {
              rating?: number;
              reviews?: number;
            };
          };
        };
      }>;
    };

    const results = body.organic_results ?? [];
    const now = new Date();

    return results
      .filter((r) => r.link.includes('capterra.com'))
      .map((r) => {
        const rating = r.rich_snippet?.top?.detected_extensions?.rating;
        const reviewCount = r.rich_snippet?.top?.detected_extensions?.reviews;

        return {
          source: 'serpapi_capterra',
          entityId: `capterra:${this.hashString(r.link)}`,
          url: r.link,
          payload: {
            title: r.title,
            snippet: r.snippet,
            rating,
            review_count: reviewCount,
            is_comparison_page: /compare|vs|alternative/i.test(r.title),
            has_pricing_data: /\$|\€|free|pric/i.test(r.snippet),
            has_negative_signal: /cons|lacks|missing|frustrat|difficult|expensive/i.test(r.snippet),
            searchKeyword: keyword,
            position: r.position,
          },
          format: 'capterra_review_v1',
          scrapedAt: now,
        };
      });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
