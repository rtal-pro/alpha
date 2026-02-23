// ---------------------------------------------------------------------------
// SaaSHub scraper — SaaS comparison, alternatives, and trending tools
//
// SaaSHub is a SaaS-specific directory that tracks:
// - Trending SaaS products (rising usage/mentions)
// - Alternatives & comparisons (shows gaps and opportunities)
// - Category landscapes (market density per vertical)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.saashub.com';
const RATE_LIMIT_DELAY_MS = 2_500;

// ---------------------------------------------------------------------------
// SaaSHubScraper
// ---------------------------------------------------------------------------

export class SaaSHubScraper extends BaseScraper {
  readonly source = 'saashub' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'trending':
        return this.scrapeTrending(params);
      case 'category':
        return this.scrapeCategory(params);
      case 'alternatives':
        return this.scrapeAlternatives(params);
      default:
        throw new Error(`SaaSHubScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Trending SaaS tools
  // -----------------------------------------------------------------------

  private async scrapeTrending(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    // SaaSHub removed /trending — use /best-crm-software as a category page
    const url = `${BASE_URL}/best-crm-software`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'trending'));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific tools
  // -----------------------------------------------------------------------

  private async scrapeCategory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('SaaSHubScraper: category is required');

    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/best-${slug}-software`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'category'));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // Alternatives to a specific product
  // -----------------------------------------------------------------------

  private async scrapeAlternatives(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const product = params.keywords?.[0];
    if (!product) throw new Error('SaaSHubScraper: keyword (product name) required');

    const slug = product.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/${slug}/alternatives`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'alternatives'));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // HTML parsing
  // -----------------------------------------------------------------------

  private async fetchAndParse(url: string, context: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`SaaSHub HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return this.parseCards(html, context);
  }

  private parseCards(html: string, context: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // SaaSHub 2024+ uses <li class="... services-list__item ..."> with schema.org markup
    // Name:   <span itemprop="name">Product</span>
    // Link:   <a href="/product-alternatives" itemprop="url">
    // Rating: <div class="rating">123</div>
    // Desc:   <p class="tagline" itemprop="description">...</p>
    const cardRegex = /<li[^>]*class="[^"]*services-list__item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    const nameRegex = /<span\s+itemprop="name">([^<]+)<\/span>/i;
    const linkRegex = /<a[^>]*href="\/([^"]*-alternatives)"[^>]*itemprop="url"/i;
    const linkRegex2 = /<a[^>]*href="\/([a-z0-9-]+)"[^>]*itemprop="url"/i;
    const ratingRegex = /<div[^>]*class="rating"[^>]*>(\d+)<\/div>/i;
    const descRegex = /<p[^>]*class="tagline"[^>]*(?:itemprop="description")?[^>]*>([^<]*)<\/p>/i;
    const priceRegex = /<span[^>]*class="tag is-price[^"]*"[^>]*>([^<]*)<\/span>/i;
    const featuresRegex = /<p[^>]*class="features-list"[^>]*>([\s\S]*?)<\/p>/i;
    const featureItemRegex = /<span>([^<]*)<\/span>/gi;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card);
      if (!nameMatch) continue;

      const name = nameMatch[1]?.trim() ?? '';
      const linkMatch = linkRegex.exec(card) ?? linkRegex2.exec(card);
      const slug = linkMatch?.[1]?.replace(/-alternatives$/, '') ?? name.toLowerCase().replace(/\s+/g, '-');
      const ratingMatch = ratingRegex.exec(card);
      const score = ratingMatch ? parseInt(ratingMatch[1]!, 10) : 0;
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.trim() ?? '';
      const priceMatch = priceRegex.exec(card);
      const pricing = priceMatch?.[1]?.trim() ?? '';

      const features: string[] = [];
      const featuresBlock = featuresRegex.exec(card);
      if (featuresBlock) {
        let fMatch;
        while ((fMatch = featureItemRegex.exec(featuresBlock[1]!)) !== null) {
          features.push(fMatch[1]!.trim());
        }
      }

      items.push({
        source: 'saashub',
        entityId: `saashub:${slug}`,
        url: `${BASE_URL}/${linkMatch?.[1] ?? slug}`,
        payload: {
          name,
          description,
          score,
          upvotes: score,
          categories: features.slice(0, 3),
          pricing,
          context,
        },
        format: 'saashub_tool_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
