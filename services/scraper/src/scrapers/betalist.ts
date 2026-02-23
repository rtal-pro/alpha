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
      const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/?page=${page}`;
      const pageItems = await this.retryWithBackoff(() => this.fetchAndParse(url));
      items.push(...pageItems);
      if (pageItems.length < 5) break;
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
    const url = `${BASE_URL}/topics/${slug}`;

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
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
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

    // BetaList 2024+ uses simple link + div structure:
    //   <a href="/startups/{slug}">
    //     <div class="font-medium ...">Name</div>
    //   </a>
    //   <div class="text-gray-600 ...">Description</div>
    const startupLinkRegex = /href="\/startups\/([a-z0-9_-]+)"/gi;
    const seen = new Set<string>();

    let linkMatch;
    while ((linkMatch = startupLinkRegex.exec(html)) !== null) {
      const slug = linkMatch[1]!;
      if (slug === 'new' || seen.has(slug)) continue;
      seen.add(slug);

      // Extract name and description from nearby context
      const pos = linkMatch.index;
      const context = html.slice(pos, pos + 500);

      const nameMatch = /class="font-medium[^"]*">([^<]+)<\/div>/i.exec(context);
      const name = nameMatch?.[1]?.trim() ?? slug.replace(/-/g, ' ');

      const descMatch = /class="text-gray-600[^"]*">([^<]+)<\/div>/i.exec(context);
      const description = descMatch?.[1]?.trim() ?? '';

      if (!name || name === slug) continue;

      items.push({
        source: 'betalist',
        entityId: `betalist:${slug}`,
        url: `${BASE_URL}/startups/${slug}`,
        payload: {
          name,
          description,
          tags: [],
          featured_date: now.toISOString(),
          stage: 'beta',
        },
        format: 'betalist_startup_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
