// ---------------------------------------------------------------------------
// Trustpilot scraper — Cheerio-based scraper for trustpilot.com
//
// Trustpilot captures B2C/B2B sentiment. Useful for:
// - SaaS products with direct consumer usage
// - Support quality signals
// - Brand reputation trends
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.trustpilot.com';
const RATE_LIMIT_DELAY_MS = 2_500;

// ---------------------------------------------------------------------------
// TrustpilotScraper
// ---------------------------------------------------------------------------

export class TrustpilotScraper extends BaseScraper {
  readonly source = 'trustpilot' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'keyword_search' && keywords.length > 0) {
      return this.searchBusinesses(keywords, limit);
    }
    if (params.type === 'category_browse') {
      return this.browseCategory(params.category ?? 'software_company', limit);
    }

    throw new Error(`TrustpilotScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search businesses
  // -----------------------------------------------------------------------

  private async searchBusinesses(
    keywords: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchSearchResults(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[trustpilot] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async fetchSearchResults(
    query: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Trustpilot search failed (${response.status})`);
    }

    const html = await response.text();
    return this.parseSearchResults(html, query, limit);
  }

  // -----------------------------------------------------------------------
  // Browse category
  // -----------------------------------------------------------------------

  private async browseCategory(
    category: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = `${BASE_URL}/categories/${category}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Trustpilot category browse failed (${response.status})`);
    }

    const html = await response.text();
    return this.parseSearchResults(html, category, limit);
  }

  // -----------------------------------------------------------------------
  // HTML parsing
  // -----------------------------------------------------------------------

  private parseSearchResults(
    html: string,
    context: string,
    limit: number,
  ): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract business cards from Trustpilot search results
    // Trustpilot uses structured data we can extract
    const businessPattern = /href="\/review\/([\w.-]+)"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    const ratingPattern = /data-rating="([\d.]+)"/;
    const reviewCountPattern = /(\d[\d,]*)\s*reviews?/i;
    const namePattern = /<span[^>]*class="[^"]*business-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i;

    // Simpler approach: look for review links with surrounding context
    const linkPattern = /href="\/review\/([\w.-]+)"/gi;
    let match;
    const seen = new Set<string>();

    while ((match = linkPattern.exec(html)) !== null && items.length < limit) {
      const domain = match[1]!;
      if (seen.has(domain)) continue;
      seen.add(domain);

      // Extract surrounding context
      const start = Math.max(0, match.index - 800);
      const end = Math.min(html.length, match.index + 800);
      const ctx = html.slice(start, end);

      const ratingMatch = ratingPattern.exec(ctx);
      const countMatch = reviewCountPattern.exec(ctx);
      const nameMatch = namePattern.exec(ctx);

      const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : undefined;
      const reviewCount = countMatch ? parseInt(countMatch[1]!.replace(/,/g, ''), 10) : undefined;
      const name = nameMatch ? nameMatch[1]!.replace(/<[^>]+>/g, '').trim() : domain;

      items.push({
        source: 'trustpilot',
        entityId: `trustpilot:${domain}`,
        url: `${BASE_URL}/review/${domain}`,
        payload: {
          domain,
          name,
          rating,
          review_count: reviewCount,
          is_low_rated: rating !== undefined && rating < 3.0,
          is_highly_reviewed: reviewCount !== undefined && reviewCount > 100,
          has_declining_signal: rating !== undefined && rating < 2.5,
          searchContext: context,
        },
        format: 'trustpilot_business_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
