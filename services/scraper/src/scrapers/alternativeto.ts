// ---------------------------------------------------------------------------
// AlternativeTo scraper — discovers what users want alternatives for
//
// When users search for alternatives to a product, it signals:
// - Pain with the existing product (opportunity for improvement)
// - Validated demand for the product category
// - Specific feature gaps users want filled
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.alternativeto.net';
const RATE_LIMIT_DELAY_MS = 2_500;

// Categories most relevant to SaaS idea detection
const SAAS_CATEGORIES = [
  'project-management', 'crm', 'email-marketing', 'accounting',
  'customer-support', 'analytics', 'collaboration', 'cloud-storage',
  'invoicing', 'time-tracking', 'hr-management', 'video-conferencing',
  'e-commerce', 'payment-processing', 'marketing-automation',
  'developer-tools', 'database', 'api-management', 'ci-cd',
  'monitoring', 'security', 'identity-management',
];

// ---------------------------------------------------------------------------
// AlternativeToScraper
// ---------------------------------------------------------------------------

export class AlternativeToScraper extends BaseScraper {
  readonly source = 'alternativeto' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'trending':
        return this.scrapeTrending(params);
      case 'alternatives_for':
        return this.scrapeAlternativesFor(params);
      case 'category':
        return this.scrapeCategory(params);
      default:
        throw new Error(`AlternativeToScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Trending software (most searched-for alternatives)
  // -----------------------------------------------------------------------

  private async scrapeTrending(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const url = `${BASE_URL}/browse/trending/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'trending'));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Alternatives for a specific product (e.g., "Slack", "Jira")
  // -----------------------------------------------------------------------

  private async scrapeAlternativesFor(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const product = params.keywords?.[0];
    if (!product) throw new Error('AlternativeToScraper: keyword (product name) required');

    const slug = product.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/software/${slug}/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'alternatives'));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // Category browsing (SaaS-specific categories)
  // -----------------------------------------------------------------------

  private async scrapeCategory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('AlternativeToScraper: category is required');

    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/category/${slug}/`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, 'category'));
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
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`AlternativeTo HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return this.parseListings(html, context);
  }

  private parseListings(html: string, context: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // AlternativeTo uses structured app cards
    const cardRegex = /<div[^>]*class="[^"]*app-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const nameRegex = /<a[^>]*class="[^"]*name[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const descRegex = /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
    const likesRegex = /(\d+)\s*(?:likes?|upvotes?)/i;
    const platformRegex = /<span[^>]*class="[^"]*platform[^"]*"[^>]*>([^<]*)<\/span>/gi;
    const tagRegex = /<a[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]*)<\/a>/gi;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card);
      if (!nameMatch) continue;

      const href = nameMatch[1] ?? '';
      const name = nameMatch[2]?.trim() ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const likesMatch = likesRegex.exec(card);
      const likes = likesMatch ? parseInt(likesMatch[1]!, 10) : 0;

      const platforms: string[] = [];
      let platMatch;
      while ((platMatch = platformRegex.exec(card)) !== null) {
        platforms.push(platMatch[1]!.trim());
      }

      const tags: string[] = [];
      let tagMatch;
      while ((tagMatch = tagRegex.exec(card)) !== null) {
        tags.push(tagMatch[1]!.trim());
      }

      const slug = href.replace(/^\/software\//, '').replace(/\/$/, '') || name.toLowerCase().replace(/\s+/g, '-');

      items.push({
        source: 'alternativeto',
        entityId: `alternativeto:${slug}`,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        payload: {
          name,
          description,
          likes,
          platforms,
          tags,
          context, // 'trending', 'alternatives', or 'category'
        },
        format: 'alternativeto_app_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
