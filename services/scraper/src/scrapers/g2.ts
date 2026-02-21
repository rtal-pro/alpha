// ---------------------------------------------------------------------------
// G2 Reviews scraper — uses SerpAPI to scrape G2 product reviews
//
// G2 is the #1 B2B software review site. Reviews reveal:
// - What users love/hate about competitors
// - Feature gaps and unmet needs
// - Switching behavior and pricing pain
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// G2Scraper
// ---------------------------------------------------------------------------

export class G2Scraper extends BaseScraper {
  readonly source = 'serpapi_g2' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('G2Scraper: SERPAPI_KEY not configured');
    }

    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'keyword_search' && keywords.length > 0) {
      return this.searchProducts(keywords, limit);
    }
    if (params.type === 'category_reviews') {
      return this.scrapeCategory(params.category ?? 'saas', limit);
    }

    throw new Error(`G2Scraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search for product reviews on G2
  // -----------------------------------------------------------------------

  private async searchProducts(
    keywords: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.serpSearch(`site:g2.com/products ${keyword} reviews`, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[g2] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Scrape reviews from a G2 category page
  // -----------------------------------------------------------------------

  private async scrapeCategory(
    category: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    try {
      return await this.retryWithBackoff(
        () => this.serpSearch(`site:g2.com/categories/${category}`, limit),
        2,
      );
    } catch (err) {
      console.error(`[g2] Category scrape failed for "${category}": ${err}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // SerpAPI search helper
  // -----------------------------------------------------------------------

  private async serpSearch(
    query: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
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
        displayed_link: string;
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
      .filter((r) => r.link.includes('g2.com'))
      .map((r) => {
        const productSlug = this.extractProductSlug(r.link);
        const rating = r.rich_snippet?.top?.detected_extensions?.rating;
        const reviewCount = r.rich_snippet?.top?.detected_extensions?.reviews;
        const sentiment = this.analyzeSentiment(r.snippet);

        return {
          source: 'serpapi_g2',
          entityId: `g2:${productSlug || this.hashString(r.link)}`,
          url: r.link,
          payload: {
            title: r.title,
            product_slug: productSlug,
            snippet: r.snippet,
            rating,
            review_count: reviewCount,
            sentiment,
            has_negative_signal: sentiment.negative_keywords.length > 0,
            has_alternative_mention: /alternative|competitor|vs|compared/i.test(r.snippet),
            has_pricing_mention: /pric|cost|expensive|cheap|free|afford/i.test(r.snippet),
            position: r.position,
          },
          format: 'g2_review_v1',
          scrapedAt: now,
        };
      });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private extractProductSlug(url: string): string {
    const match = url.match(/g2\.com\/products\/([\w-]+)/);
    return match?.[1] ?? '';
  }

  private analyzeSentiment(text: string): {
    positive_keywords: string[];
    negative_keywords: string[];
    score: number;
  } {
    const positive = ['love', 'great', 'excellent', 'best', 'amazing', 'easy', 'powerful', 'recommend'];
    const negative = ['hate', 'terrible', 'awful', 'expensive', 'slow', 'buggy', 'poor', 'lacks', 'missing', 'frustrating', 'complicated', 'difficult'];

    const lower = text.toLowerCase();
    const foundPositive = positive.filter((w) => lower.includes(w));
    const foundNegative = negative.filter((w) => lower.includes(w));

    const score = foundPositive.length - foundNegative.length * 1.5;

    return {
      positive_keywords: foundPositive,
      negative_keywords: foundNegative,
      score: Math.max(-5, Math.min(5, score)),
    };
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
