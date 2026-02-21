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
    const url = `${BASE_URL}/trending`;
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
    const url = `${BASE_URL}/c/${slug}`;
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
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
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

    // SaaSHub uses service cards with structured data
    const cardRegex = /<div[^>]*class="[^"]*(?:service-card|saas-card|tool-card)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const nameRegex = /<a[^>]*href="\/([^"]*)"[^>]*class="[^"]*name[^"]*"[^>]*>([^<]*)<\/a>/i;
    const nameRegex2 = /<h[23][^>]*>\s*<a[^>]*href="\/([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const descRegex = /<p[^>]*class="[^"]*(?:desc|tagline)[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
    const scoreRegex = /(?:score|rating)[:\s]*([\d.]+)/i;
    const categoryRegex = /<a[^>]*class="[^"]*category[^"]*"[^>]*>([^<]*)<\/a>/gi;
    const upvoteRegex = /(\d+)\s*(?:upvotes?|likes?|recommendations?)/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card) ?? nameRegex2.exec(card);
      if (!nameMatch) continue;

      const slug = nameMatch[1]?.replace(/\/$/, '') ?? '';
      const name = nameMatch[2]?.trim() ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const scoreMatch = scoreRegex.exec(card);
      const score = scoreMatch ? parseFloat(scoreMatch[1]!) : 0;
      const upvoteMatch = upvoteRegex.exec(card);
      const upvotes = upvoteMatch ? parseInt(upvoteMatch[1]!, 10) : 0;

      const categories: string[] = [];
      let catMatch;
      while ((catMatch = categoryRegex.exec(card)) !== null) {
        categories.push(catMatch[1]!.trim());
      }

      items.push({
        source: 'saashub',
        entityId: `saashub:${slug}`,
        url: `${BASE_URL}/${slug}`,
        payload: {
          name,
          description,
          score,
          upvotes,
          categories,
          context,
        },
        format: 'saashub_tool_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
