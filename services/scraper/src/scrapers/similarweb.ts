// ---------------------------------------------------------------------------
// SimilarWeb scraper — tracks website traffic trends via SerpAPI
//
// Traffic data reveals:
// - Which SaaS products are growing vs declining
// - Market size validation (monthly visits ≈ active users)
// - Geographic distribution of users
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// SimilarWebScraper
// ---------------------------------------------------------------------------

export class SimilarWebScraper extends BaseScraper {
  readonly source = 'similarweb' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('SimilarWebScraper: SERPAPI_KEY not configured');
    }

    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type !== 'keyword_search' || keywords.length === 0) {
      throw new Error('SimilarWebScraper: requires keyword_search with keywords (domain names or product names)');
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchTrafficData(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[similarweb] Failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Fetch traffic data via SerpAPI Google search
  // -----------------------------------------------------------------------

  private async fetchTrafficData(
    keyword: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    // Use SerpAPI to search for SimilarWeb traffic data
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', `site:similarweb.com ${keyword} traffic`);
    url.searchParams.set('num', String(Math.min(limit, 10)));
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
      }>;
    };

    const results = body.organic_results ?? [];
    const now = new Date();

    return results
      .filter((r) => r.link.includes('similarweb.com'))
      .map((r) => {
        const domain = this.extractDomain(r.link);
        const trafficData = this.extractTrafficFromSnippet(r.snippet);

        return {
          source: 'similarweb',
          entityId: `similarweb:${domain || this.hashString(r.link)}`,
          url: r.link,
          payload: {
            domain,
            title: r.title,
            snippet: r.snippet,
            ...trafficData,
            searchKeyword: keyword,
          },
          format: 'similarweb_traffic_v1',
          scrapedAt: now,
        };
      });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private extractDomain(url: string): string {
    const match = url.match(/similarweb\.com\/website\/([\w.-]+)/);
    return match?.[1] ?? '';
  }

  private extractTrafficFromSnippet(snippet: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    // Extract monthly visits
    const visitsMatch = snippet.match(/([\d.]+)\s*([KMB])\s*(?:monthly\s*)?visits?/i);
    if (visitsMatch) {
      const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[visitsMatch[2]!.toUpperCase()] ?? 1;
      data['monthly_visits'] = parseFloat(visitsMatch[1]!) * multiplier;
    }

    // Extract ranking
    const rankMatch = snippet.match(/#?([\d,]+)\s*(?:global|country)?\s*rank/i);
    if (rankMatch) {
      data['global_rank'] = parseInt(rankMatch[1]!.replace(/,/g, ''), 10);
    }

    // Extract bounce rate
    const bounceMatch = snippet.match(/([\d.]+)%\s*bounce\s*rate/i);
    if (bounceMatch) {
      data['bounce_rate'] = parseFloat(bounceMatch[1]!);
    }

    // Extract average visit duration
    const durationMatch = snippet.match(/([\d:]+)\s*avg\.?\s*visit\s*duration/i);
    if (durationMatch) {
      data['avg_visit_duration'] = durationMatch[1];
    }

    // Detect growth/decline signals
    data['has_growth_signal'] = /\b(growing|increased|up|rising|surging)\b/i.test(snippet);
    data['has_decline_signal'] = /\b(declining|decreased|down|falling|dropping)\b/i.test(snippet);

    return data;
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
