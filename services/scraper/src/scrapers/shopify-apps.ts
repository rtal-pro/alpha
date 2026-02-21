// ---------------------------------------------------------------------------
// Shopify App Store scraper — Cheerio-based
//
// The Shopify App Store reveals:
// - What merchants need (search trends)
// - Which app categories are growing
// - Review sentiment on existing tools
// - Gaps in the marketplace
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://apps.shopify.com';
const RATE_LIMIT_DELAY_MS = 2_000;

const DEFAULT_CATEGORIES = [
  'marketing',
  'sales',
  'orders-and-shipping',
  'inventory-management',
  'customer-support',
  'reporting',
  'finances',
  'productivity',
  'trust-and-security',
];

// ---------------------------------------------------------------------------
// ShopifyAppsScraper
// ---------------------------------------------------------------------------

export class ShopifyAppsScraper extends BaseScraper {
  readonly source = 'shopify_apps' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'keyword_search' && keywords.length > 0) {
      return this.searchApps(keywords, limit);
    }
    if (params.type === 'category_browse') {
      const categories = (params as Record<string, unknown>)['categories'] as string[] ?? DEFAULT_CATEGORIES;
      return this.browseCategories(categories, limit);
    }

    throw new Error(`ShopifyAppsScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search apps
  // -----------------------------------------------------------------------

  private async searchApps(keywords: string[], limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const url = `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`Shopify search failed (${response.status})`);
        const html = await response.text();
        allItems.push(...this.parseAppListings(html, keyword, limit));
      } catch (err) {
        console.error(`[shopify-apps] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Browse categories
  // -----------------------------------------------------------------------

  private async browseCategories(categories: string[], limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const category of categories) {
      try {
        const url = `${BASE_URL}/categories/${category}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`Shopify category failed (${response.status})`);
        const html = await response.text();
        allItems.push(...this.parseAppListings(html, category, limit));
      } catch (err) {
        console.error(`[shopify-apps] Category failed for "${category}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Parse app listings from HTML
  // -----------------------------------------------------------------------

  private parseAppListings(html: string, context: string, limit: number): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract app links from Shopify App Store listing pages
    const appLinkPattern = /href="\/apps\/([\w-]+)"[^>]*>/gi;
    const ratingPattern = /aria-label="([\d.]+)\s*out\s*of\s*5\s*stars?"/i;
    const reviewCountPattern = /(\d[\d,]*)\s*reviews?/i;
    const pricePattern = /(?:Free|(?:From\s+)?\$[\d.]+\/month|\$[\d.]+)/i;

    let match;
    const seen = new Set<string>();

    while ((match = appLinkPattern.exec(html)) !== null && items.length < limit) {
      const appSlug = match[1]!;
      if (seen.has(appSlug)) continue;
      if (['search', 'categories', 'collections'].includes(appSlug)) continue;
      seen.add(appSlug);

      const start = Math.max(0, match.index - 500);
      const end = Math.min(html.length, match.index + 500);
      const ctx = html.slice(start, end);

      const ratingMatch = ratingPattern.exec(ctx);
      const countMatch = reviewCountPattern.exec(ctx);
      const priceMatch = pricePattern.exec(ctx);

      const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : undefined;
      const reviewCount = countMatch ? parseInt(countMatch[1]!.replace(/,/g, ''), 10) : undefined;
      const price = priceMatch ? priceMatch[0] : undefined;

      items.push({
        source: 'shopify_apps',
        entityId: `shopify_app:${appSlug}`,
        url: `${BASE_URL}/apps/${appSlug}`,
        payload: {
          app_slug: appSlug,
          rating,
          review_count: reviewCount,
          price,
          is_free: price?.toLowerCase() === 'free',
          is_low_rated: rating !== undefined && rating < 3.5,
          is_new: reviewCount !== undefined && reviewCount < 10,
          is_popular: reviewCount !== undefined && reviewCount > 500,
          searchContext: context,
        },
        format: 'shopify_app_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
