// ---------------------------------------------------------------------------
// SerpAPI SERP scraper — general Google search results for market intelligence
//
// Uses SerpAPI to fetch Google search results for SaaS-related queries.
// This provides:
// - Search trend signals (what people are searching for)
// - Competitive landscape data (who ranks for key terms)
// - Pain point detection from "People Also Ask" questions
// - Market demand validation from search volume proxies
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://serpapi.com/search.json';
const RATE_LIMIT_DELAY_MS = 2_000;

// Intent modifiers for expanding queries
const INTENT_MODIFIERS = [
  'best', 'alternative to', 'vs', 'pricing',
  'open source', 'free', 'enterprise', 'for startups',
  'France', 'Europe', 'GDPR compliant',
];

// ---------------------------------------------------------------------------
// SerpAPISerpScraper
// ---------------------------------------------------------------------------

export class SerpAPISerpScraper extends BaseScraper {
  readonly source = 'serpapi_serp' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'keyword_search':
        return this.scrapeKeywordSearch(params);
      case 'people_also_ask':
        return this.scrapePeopleAlsoAsk(params);
      case 'related_searches':
        return this.scrapeRelatedSearches(params);
      default:
        throw new Error(`SerpAPISerpScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Keyword search — organic results
  // -----------------------------------------------------------------------

  private async scrapeKeywordSearch(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? ['saas tools'];
    const limit = params.limit ?? 30;
    const geo = params.geo ?? 'fr';

    const items: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      const results = await this.retryWithBackoff(() =>
        this.fetchSerpResults(keyword, geo),
      );
      items.push(...results);
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

      if (items.length >= limit) break;
    }

    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // People Also Ask — pain point detection
  // -----------------------------------------------------------------------

  private async scrapePeopleAlsoAsk(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? ['saas tools'];
    const geo = params.geo ?? 'fr';
    const items: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      const results = await this.retryWithBackoff(() =>
        this.fetchSerpResults(keyword, geo),
      );

      // Filter to only PAA items
      const paaItems = results.filter(
        (r) => (r.payload as Record<string, unknown>)['result_type'] === 'people_also_ask',
      );
      items.push(...paaItems);
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Related searches — trend discovery
  // -----------------------------------------------------------------------

  private async scrapeRelatedSearches(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? ['saas tools'];
    const geo = params.geo ?? 'fr';
    const items: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      const results = await this.retryWithBackoff(() =>
        this.fetchSerpResults(keyword, geo),
      );

      const relatedItems = results.filter(
        (r) => (r.payload as Record<string, unknown>)['result_type'] === 'related_search',
      );
      items.push(...relatedItems);
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // SerpAPI request
  // -----------------------------------------------------------------------

  private async fetchSerpResults(query: string, geo: string): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('SerpAPI key not configured (SERPAPI_KEY)');
    }

    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      gl: geo,
      hl: geo === 'fr' ? 'fr' : 'en',
      num: '20',
      api_key: SERPAPI_KEY,
    });

    const response = await fetch(`${API_URL}?${params.toString()}`);

    if (response.status === 429) {
      throw new Error('SerpAPI rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SerpAPI error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseResults(data, query);
  }

  // -----------------------------------------------------------------------
  // Parse SerpAPI response
  // -----------------------------------------------------------------------

  private parseResults(data: Record<string, unknown>, query: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Organic results
    const organicResults = (data['organic_results'] ?? []) as Array<Record<string, unknown>>;
    for (const result of organicResults) {
      items.push({
        source: 'serpapi_serp',
        entityId: `serp:${query}:${result['position']}`,
        url: String(result['link'] ?? ''),
        payload: {
          title: result['title'],
          snippet: result['snippet'],
          position: result['position'],
          displayed_link: result['displayed_link'],
          query,
          result_type: 'organic',
          // Detect intent from title/snippet
          has_comparison: /vs|versus|alternative|compared/i.test(
            `${result['title']} ${result['snippet']}`,
          ),
          has_pricing: /pricing|price|cost|free|plan/i.test(
            `${result['title']} ${result['snippet']}`,
          ),
          has_review: /review|rating|best|top \d/i.test(
            `${result['title']} ${result['snippet']}`,
          ),
        },
        format: 'serpapi_serp_v1',
        scrapedAt: now,
      });
    }

    // People Also Ask
    const paaResults = (data['related_questions'] ?? []) as Array<Record<string, unknown>>;
    for (let i = 0; i < paaResults.length; i++) {
      const paa = paaResults[i]!;
      items.push({
        source: 'serpapi_serp',
        entityId: `serp:paa:${query}:${i}`,
        url: String(paa['link'] ?? ''),
        payload: {
          question: paa['question'],
          snippet: paa['snippet'],
          title: paa['title'],
          query,
          result_type: 'people_also_ask',
          // Pain intent detection
          has_pain_signal: /problem|issue|not working|expensive|difficult|hate|frustrat/i.test(
            String(paa['question'] ?? ''),
          ),
        },
        format: 'serpapi_serp_v1',
        scrapedAt: now,
      });
    }

    // Related searches
    const relatedSearches = (data['related_searches'] ?? []) as Array<Record<string, unknown>>;
    for (let i = 0; i < relatedSearches.length; i++) {
      const related = relatedSearches[i]!;
      items.push({
        source: 'serpapi_serp',
        entityId: `serp:related:${query}:${i}`,
        url: '',
        payload: {
          query: related['query'],
          original_query: query,
          result_type: 'related_search',
        },
        format: 'serpapi_serp_v1',
        scrapedAt: now,
      });
    }

    // Search information (total results = demand proxy)
    const searchInfo = data['search_information'] as Record<string, unknown> | undefined;
    if (searchInfo) {
      const totalResults = searchInfo['total_results'] as number | undefined;
      if (totalResults !== undefined) {
        items.push({
          source: 'serpapi_serp',
          entityId: `serp:meta:${query}`,
          url: '',
          payload: {
            query,
            total_results: totalResults,
            time_taken: searchInfo['time_taken_displayed'],
            result_type: 'search_meta',
          },
          format: 'serpapi_serp_v1',
          scrapedAt: now,
        });
      }
    }

    return items;
  }
}
