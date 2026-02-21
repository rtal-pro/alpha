// ---------------------------------------------------------------------------
// AppSumo scraper — lifetime deal marketplace for SaaS products
//
// AppSumo is a marketplace where SaaS founders offer lifetime deals.
// Scraping it reveals:
// - What SaaS categories are launching products (product_launch signals)
// - Pricing frustration data (products offering LTDs often compete on price)
// - Review data and user sentiment from AppSumo ratings
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://appsumo.com';
const RATE_LIMIT_DELAY_MS = 2_500;

// ---------------------------------------------------------------------------
// AppSumoScraper
// ---------------------------------------------------------------------------

export class AppSumoScraper extends BaseScraper {
  readonly source = 'appsumo' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'deals':
        return this.scrapeDeals(params);
      case 'category':
        return this.scrapeCategoryDeals(params);
      case 'best_sellers':
        return this.scrapeBestSellers(params);
      default:
        throw new Error(`AppSumoScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Active deals
  // -----------------------------------------------------------------------

  private async scrapeDeals(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const url = `${BASE_URL}/products/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific deals
  // -----------------------------------------------------------------------

  private async scrapeCategoryDeals(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('AppSumoScraper: category is required');

    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/software/${slug}/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // Best sellers
  // -----------------------------------------------------------------------

  private async scrapeBestSellers(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 20;
    const url = `${BASE_URL}/best-sellers/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // HTML parsing
  // -----------------------------------------------------------------------

  private async fetchAndParse(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`AppSumo HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return this.parseDealCards(html);
  }

  private parseDealCards(html: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // AppSumo uses product cards in their listing pages
    const cardRegex = /<div[^>]*class="[^"]*(?:product-card|deal-card|card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    const nameRegex = /<a[^>]*href="(\/products\/[^"]*)"[^>]*>[\s\S]*?<h[23][^>]*>([^<]*)<\/h[23]>/i;
    const nameRegex2 = /<h[23][^>]*>\s*<a[^>]*href="(\/products\/[^"]*)"[^>]*>([^<]*)<\/a>/i;
    const descRegex = /<p[^>]*class="[^"]*(?:desc|tagline|subtitle)[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
    const priceRegex = /\$(\d+(?:\.\d+)?)/;
    const originalPriceRegex = /(?:was|original|retail|value)[:\s]*\$(\d+(?:,\d+)?(?:\.\d+)?)/i;
    const ratingRegex = /([\d.]+)\s*(?:\/\s*5|stars?|rating)/i;
    const reviewCountRegex = /(\d+)\s*(?:reviews?|ratings?)/i;
    const categoryRegex = /<span[^>]*class="[^"]*(?:category|tag|badge)[^"]*"[^>]*>([^<]*)<\/span>/gi;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card) ?? nameRegex2.exec(card);
      if (!nameMatch) continue;

      const href = nameMatch[1] ?? '';
      const name = nameMatch[2]?.trim() ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const priceMatch = priceRegex.exec(card);
      const dealPrice = priceMatch ? parseFloat(priceMatch[1]!) : 0;
      const origMatch = originalPriceRegex.exec(card);
      const originalPrice = origMatch ? parseFloat(origMatch[1]!.replace(/,/g, '')) : 0;
      const ratingMatch = ratingRegex.exec(card);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]!) : 0;
      const reviewMatch = reviewCountRegex.exec(card);
      const reviewCount = reviewMatch ? parseInt(reviewMatch[1]!, 10) : 0;

      const categories: string[] = [];
      let catMatch;
      while ((catMatch = categoryRegex.exec(card)) !== null) {
        categories.push(catMatch[1]!.trim());
      }

      const slug = href.replace(/^\/products\//, '').replace(/\/$/, '') || name.toLowerCase().replace(/\s+/g, '-');

      items.push({
        source: 'appsumo',
        entityId: `appsumo:${slug}`,
        url: `${BASE_URL}${href}`,
        payload: {
          name,
          description,
          deal_price: dealPrice,
          original_price: originalPrice,
          discount_pct: originalPrice > 0 ? Math.round((1 - dealPrice / originalPrice) * 100) : 0,
          rating,
          review_count: reviewCount,
          categories,
          deal_type: 'lifetime',
        },
        format: 'appsumo_deal_v1',
        scrapedAt: now,
      });
    }

    // Fallback: try __NEXT_DATA__ or embedded JSON
    if (items.length === 0) {
      const nextDataRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
      const nextMatch = nextDataRegex.exec(html);
      if (nextMatch) {
        try {
          const nextData = JSON.parse(nextMatch[1]!) as Record<string, unknown>;
          const pageProps = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown>;
          const products = (pageProps?.['products'] ?? pageProps?.['deals'] ?? []) as Array<Record<string, unknown>>;

          for (const product of products) {
            items.push({
              source: 'appsumo',
              entityId: `appsumo:${product['slug'] ?? product['id']}`,
              url: `${BASE_URL}/products/${product['slug'] ?? product['id']}/`,
              payload: {
                name: product['name'] ?? product['title'],
                description: product['tagline'] ?? product['short_description'],
                deal_price: product['price'] ?? product['deal_price'] ?? 0,
                original_price: product['original_price'] ?? product['retail_price'] ?? 0,
                rating: product['rating'] ?? product['average_rating'] ?? 0,
                review_count: product['review_count'] ?? product['reviews_count'] ?? 0,
                categories: product['categories'] ?? [],
                deal_type: 'lifetime',
              },
              format: 'appsumo_deal_v1',
              scrapedAt: now,
            });
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    }

    return items;
  }
}
