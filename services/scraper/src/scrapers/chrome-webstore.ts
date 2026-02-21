// ---------------------------------------------------------------------------
// Chrome Web Store scraper — Cheerio-based
//
// Chrome extensions reveal:
// - What productivity tools people are building and using
// - User pain with existing workflows
// - Growing tool categories (AI, dev tools, etc.)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://chromewebstore.google.com';
const RATE_LIMIT_DELAY_MS = 2_000;

// Categories relevant to SaaS opportunities
const SAAS_CATEGORIES = [
  'productivity',
  'developer-tools',
  'communication',
  'business-tools',
  'workflow-and-planning',
];

// ---------------------------------------------------------------------------
// ChromeWebStoreScraper
// ---------------------------------------------------------------------------

export class ChromeWebStoreScraper extends BaseScraper {
  readonly source = 'chrome_webstore' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'keyword_search' && keywords.length > 0) {
      return this.searchExtensions(keywords, limit);
    }
    if (params.type === 'category_browse') {
      return this.browseCategories(limit);
    }

    throw new Error(`ChromeWebStoreScraper: unsupported scrape type "${params.type}"`);
  }

  private async searchExtensions(keywords: string[], limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const url = `${BASE_URL}/search/${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`Chrome Web Store search failed (${response.status})`);
        const html = await response.text();
        allItems.push(...this.parseExtensions(html, keyword, limit));
      } catch (err) {
        console.error(`[chrome-webstore] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async browseCategories(limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const category of SAAS_CATEGORIES) {
      try {
        const url = `${BASE_URL}/category/extensions/${category}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`Chrome Web Store category failed (${response.status})`);
        const html = await response.text();
        allItems.push(...this.parseExtensions(html, category, limit));
      } catch (err) {
        console.error(`[chrome-webstore] Category failed for "${category}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Parse extension listings
  // -----------------------------------------------------------------------

  private parseExtensions(html: string, context: string, limit: number): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Chrome Web Store uses detail links with extension IDs
    const extPattern = /href="\/detail\/([^/]+)\/([\w]+)"/gi;
    const userCountPattern = /([\d,]+)\s*users?/i;
    const ratingPattern = /([\d.]+)\s*(?:star|rating)/i;

    let match;
    const seen = new Set<string>();

    while ((match = extPattern.exec(html)) !== null && items.length < limit) {
      const extName = match[1]!;
      const extId = match[2]!;
      if (seen.has(extId)) continue;
      seen.add(extId);

      const start = Math.max(0, match.index - 500);
      const end = Math.min(html.length, match.index + 500);
      const ctx = html.slice(start, end);

      const userMatch = userCountPattern.exec(ctx);
      const ratingMatch = ratingPattern.exec(ctx);

      const users = userMatch ? parseInt(userMatch[1]!.replace(/,/g, ''), 10) : undefined;
      const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : undefined;

      items.push({
        source: 'chrome_webstore',
        entityId: `cws:${extId}`,
        url: `${BASE_URL}/detail/${extName}/${extId}`,
        payload: {
          extension_id: extId,
          extension_name: extName.replace(/-/g, ' '),
          users,
          rating,
          is_popular: users !== undefined && users > 100_000,
          is_growing: users !== undefined && users > 10_000 && users < 100_000,
          is_new: users !== undefined && users < 1_000,
          searchContext: context,
        },
        format: 'chrome_extension_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
