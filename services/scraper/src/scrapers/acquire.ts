// ---------------------------------------------------------------------------
// Acquire.com (formerly MicroAcquire) scraper — SaaS businesses for sale
//
// When founders list their SaaS on Acquire.com, it generates:
// - Market exit signals (category exits indicate saturation or founder burnout)
// - Revenue validation (asking price implies revenue multiples)
// - Category gap signals (many exits = opportunity to build better)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://acquire.com';
const API_URL = 'https://api.acquire.com/api/v1';
const RATE_LIMIT_DELAY_MS = 3_000;

// Revenue ranges for signal strength
const REVENUE_RANGES = [
  { label: '<$1K MRR', min: 0, max: 1_000 },
  { label: '$1K-$5K MRR', min: 1_000, max: 5_000 },
  { label: '$5K-$25K MRR', min: 5_000, max: 25_000 },
  { label: '$25K-$100K MRR', min: 25_000, max: 100_000 },
  { label: '$100K+ MRR', min: 100_000, max: Infinity },
] as const;

// ---------------------------------------------------------------------------
// AcquireScraper
// ---------------------------------------------------------------------------

export class AcquireScraper extends BaseScraper {
  readonly source = 'acquire' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'listings':
        return this.scrapeListings(params);
      case 'category':
        return this.scrapeCategoryListings(params);
      default:
        throw new Error(`AcquireScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Browse all listings
  // -----------------------------------------------------------------------

  private async scrapeListings(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const url = `${BASE_URL}/marketplace`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific listings
  // -----------------------------------------------------------------------

  private async scrapeCategoryListings(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('AcquireScraper: category is required');

    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/marketplace?industry=${slug}`;
    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // HTML parsing
  // -----------------------------------------------------------------------

  private async fetchAndParse(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Acquire.com HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    return this.parseListingCards(html);
  }

  private parseListingCards(html: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Acquire.com listings follow a card pattern
    const cardRegex = /<div[^>]*class="[^"]*listing-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
    const titleRegex = /<h[23][^>]*>([^<]*)<\/h[23]>/i;
    const linkRegex = /<a[^>]*href="([^"]*\/startup\/[^"]*)"[^>]*>/i;
    const revenueRegex = /(?:MRR|Revenue|ARR)[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(?:\/\s*mo|MRR)?/i;
    const askingPriceRegex = /(?:Asking|Price)[:\s]*\$?([\d,]+(?:\.\d+)?[KkMm]?)/i;
    const descRegex = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
    const industryRegex = /(?:Industry|Category)[:\s]*([^<\n]+)/i;
    const techRegex = /(?:Tech Stack|Built with)[:\s]*([^<\n]+)/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const titleMatch = titleRegex.exec(card);
      if (!titleMatch) continue;

      const name = titleMatch[1]?.trim() ?? '';
      const linkMatch = linkRegex.exec(card);
      const href = linkMatch?.[1] ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';

      // Parse revenue data
      const revenueMatch = revenueRegex.exec(card);
      const mrr = revenueMatch ? this.parseMoneyValue(revenueMatch[1]!) : 0;
      const askingMatch = askingPriceRegex.exec(card);
      const askingPrice = askingMatch ? this.parseMoneyValue(askingMatch[1]!) : 0;

      const industryMatch = industryRegex.exec(card);
      const industry = industryMatch?.[1]?.trim() ?? 'saas';
      const techMatch = techRegex.exec(card);
      const techStack = techMatch?.[1]?.trim() ?? '';

      const entityId = href.replace(/^.*\/startup\//, '') || name.toLowerCase().replace(/\s+/g, '-');

      items.push({
        source: 'acquire',
        entityId: `acquire:${entityId}`,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        payload: {
          name,
          description,
          mrr,
          asking_price: askingPrice,
          revenue_multiple: mrr > 0 && askingPrice > 0 ? Math.round(askingPrice / (mrr * 12) * 10) / 10 : null,
          industry,
          tech_stack: techStack,
          listing_type: 'for_sale',
        },
        format: 'acquire_listing_v1',
        scrapedAt: now,
      });
    }

    // Fallback: try __NEXT_DATA__ JSON (Next.js SSR)
    if (items.length === 0) {
      const nextDataRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
      const nextMatch = nextDataRegex.exec(html);
      if (nextMatch) {
        try {
          const nextData = JSON.parse(nextMatch[1]!) as Record<string, unknown>;
          const pageProps = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown>;
          const listings = (pageProps?.['listings'] ?? pageProps?.['startups'] ?? []) as Array<Record<string, unknown>>;

          for (const listing of listings) {
            items.push({
              source: 'acquire',
              entityId: `acquire:${listing['slug'] ?? listing['id'] ?? ''}`,
              url: `${BASE_URL}/startup/${listing['slug'] ?? listing['id']}`,
              payload: {
                name: listing['title'] ?? listing['name'],
                description: listing['description'] ?? listing['tagline'],
                mrr: listing['mrr'] ?? listing['monthly_revenue'] ?? 0,
                asking_price: listing['asking_price'] ?? listing['price'] ?? 0,
                industry: listing['industry'] ?? listing['category'] ?? 'saas',
                tech_stack: listing['tech_stack'] ?? '',
                listing_type: 'for_sale',
              },
              format: 'acquire_listing_v1',
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

  private parseMoneyValue(raw: string): number {
    const cleaned = raw.replace(/,/g, '').trim();
    const multiplier = cleaned.toLowerCase().endsWith('k') ? 1_000
      : cleaned.toLowerCase().endsWith('m') ? 1_000_000
      : 1;
    return parseFloat(cleaned.replace(/[KkMm]$/, '')) * multiplier || 0;
  }
}
