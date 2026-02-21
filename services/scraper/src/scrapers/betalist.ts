// ---------------------------------------------------------------------------
// BetaList scraper — discovers early-stage startups before they go mainstream
//
// BetaList is a curated directory of upcoming startups. Scraping it surfaces
// products in pre-launch / beta that are not yet on ProductHunt or Crunchbase.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://betalist.com';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// BetaListScraper
// ---------------------------------------------------------------------------

export class BetaListScraper extends BaseScraper {
  readonly source = 'betalist' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'latest':
        return this.scrapeLatest(params);
      case 'category':
        return this.scrapeCategory(params);
      default:
        throw new Error(`BetaListScraper: unsupported scrape type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Latest startups
  // -----------------------------------------------------------------------

  private async scrapeLatest(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const pages = Math.ceil(limit / 15);
    const items: RawScrapedItem[] = [];

    for (let page = 1; page <= pages; page++) {
      const url = page === 1 ? `${BASE_URL}/startups` : `${BASE_URL}/startups?page=${page}`;
      const pageItems = await this.retryWithBackoff(() => this.fetchAndParse(url));
      items.push(...pageItems);
      if (pageItems.length < 15) break;
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific startups
  // -----------------------------------------------------------------------

  private async scrapeCategory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('BetaListScraper: category is required');

    const limit = params.limit ?? 20;
    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/markets/${slug}`;

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
      throw new Error(`BetaList HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return this.parseStartupCards(html);
  }

  private parseStartupCards(html: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract startup cards using regex (cheerio not imported — lightweight approach)
    // BetaList uses structured data in startup listings
    const cardRegex = /<article[^>]*class="[^"]*startupCard[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
    const titleRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const descRegex = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
    const tagRegex = /<a[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]*)<\/a>/gi;
    const dateRegex = /data-featured="([^"]*)"/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const titleMatch = titleRegex.exec(card);
      if (!titleMatch) continue;

      const href = titleMatch[1] ?? '';
      const name = titleMatch[2]?.trim() ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const dateMatch = dateRegex.exec(card);
      const featuredDate = dateMatch?.[1] ?? now.toISOString();

      const tags: string[] = [];
      let tagMatch;
      while ((tagMatch = tagRegex.exec(card)) !== null) {
        tags.push(tagMatch[1]!.trim());
      }

      const entityId = href.replace(/^\/startups\//, '') || name.toLowerCase().replace(/\s+/g, '-');

      items.push({
        source: 'betalist',
        entityId: `betalist:${entityId}`,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        payload: {
          name,
          description,
          tags,
          featured_date: featuredDate,
          stage: 'beta',
        },
        format: 'betalist_startup_v1',
        scrapedAt: now,
      });
    }

    // Fallback: try JSON-LD structured data
    if (items.length === 0) {
      const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
      let jsonMatch;
      while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(jsonMatch[1]!) as Record<string, unknown>;
          if (data['@type'] === 'SoftwareApplication' || data['@type'] === 'Product') {
            items.push({
              source: 'betalist',
              entityId: `betalist:${(data['name'] as string ?? '').toLowerCase().replace(/\s+/g, '-')}`,
              url: (data['url'] as string) ?? '',
              payload: {
                name: data['name'],
                description: data['description'],
                tags: [],
                stage: 'beta',
              },
              format: 'betalist_startup_v1',
              scrapedAt: now,
            });
          }
        } catch {
          // Invalid JSON-LD, skip
        }
      }
    }

    return items;
  }
}
