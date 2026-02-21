// ---------------------------------------------------------------------------
// Dealroom scraper — European startup database with funding/valuation data
//
// Dealroom tracks 2M+ companies worldwide with a strong European focus.
// Provides funding rounds, valuation estimates, team data, and growth metrics.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://dealroom.co';
const APP_URL = 'https://app.dealroom.co';
const RATE_LIMIT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// DealroomScraper
// ---------------------------------------------------------------------------

export class DealroomScraper extends BaseScraper {
  readonly source = 'dealroom' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'trending':
        return this.scrapeTrending(params);
      case 'funding_rounds':
        return this.scrapeFundingRounds(params);
      case 'category':
        return this.scrapeByCategory(params);
      default:
        throw new Error(`DealroomScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Trending startups (recently funded / high-growth)
  // -----------------------------------------------------------------------

  private async scrapeTrending(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const geo = params.geo ?? 'europe';
    const url = `${APP_URL}/companies?sort=-total_funding&hq_regions=${encodeURIComponent(geo)}&type=startup`;

    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Recent funding rounds
  // -----------------------------------------------------------------------

  private async scrapeFundingRounds(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const daysBack = params.daysBack ?? 30;
    const url = `${APP_URL}/transactions/rounds?sort=-date&days_back=${daysBack}`;

    const items = await this.retryWithBackoff(() => this.fetchAndParseFunding(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific companies
  // -----------------------------------------------------------------------

  private async scrapeByCategory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('DealroomScraper: category is required');

    const limit = params.limit ?? 20;
    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${APP_URL}/companies?tags=${encodeURIComponent(slug)}&sort=-total_funding&type=startup`;

    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Parsing helpers
  // -----------------------------------------------------------------------

  private async fetchAndParse(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Dealroom HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Dealroom uses a SPA but includes __NEXT_DATA__ or Apollo state
    const stateRegex = /window\.__(?:NEXT_DATA__|APOLLO_STATE__|NUXT__|dealroomState)__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/;
    const stateMatch = stateRegex.exec(html);

    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]!) as Record<string, unknown>;
        const companies = this.extractCompanies(state);

        for (const company of companies) {
          items.push({
            source: 'dealroom',
            entityId: `dealroom:${company['slug'] ?? company['id']}`,
            url: `${APP_URL}/companies/${company['slug'] ?? company['id']}`,
            payload: {
              name: company['name'],
              description: company['tagline'] ?? company['short_description'],
              hq_location: company['hq_city'] ?? company['hq_country'],
              founded_year: company['launch_year'] ?? company['founded_year'],
              total_funding: company['total_funding'] ?? company['total_funding_usd'],
              last_funding_date: company['last_funding_date'],
              last_funding_round: company['last_funding_round_type'],
              valuation: company['valuation'],
              employee_count: company['employee_count'] ?? company['team_size'],
              tags: company['tags'] ?? company['industries'] ?? [],
              growth_score: company['growth_score'] ?? company['dealroom_signal'],
            },
            format: 'dealroom_company_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Skip malformed state
      }
    }

    // Fallback: structured card parsing
    if (items.length === 0) {
      const rowRegex = /<tr[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
      const nameRegex = /<a[^>]*href="\/companies\/([^"]*)"[^>]*>([^<]*)<\/a>/i;
      const fundingRegex = /[\$€]([\d,.]+[KkMmBb]?)/;

      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const row = match[1]!;
        const nameMatch = nameRegex.exec(row);
        if (!nameMatch) continue;

        const fundingMatch = fundingRegex.exec(row);

        items.push({
          source: 'dealroom',
          entityId: `dealroom:${nameMatch[1]}`,
          url: `${APP_URL}/companies/${nameMatch[1]}`,
          payload: {
            name: nameMatch[2]?.trim() ?? '',
            total_funding: fundingMatch?.[1] ?? 'undisclosed',
            tags: [],
          },
          format: 'dealroom_company_v1',
          scrapedAt: now,
        });
      }
    }

    return items;
  }

  private async fetchAndParseFunding(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Dealroom HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Try to extract funding round data from the page state
    const stateRegex = /window\.__(?:NEXT_DATA__|APOLLO_STATE__|dealroomState)__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/;
    const stateMatch = stateRegex.exec(html);

    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]!) as Record<string, unknown>;
        const rounds = this.extractFundingRounds(state);

        for (const round of rounds) {
          const company = round['company'] as Record<string, unknown> | undefined;
          items.push({
            source: 'dealroom',
            entityId: `dealroom:round:${round['id'] ?? `${company?.['slug']}-${round['date']}`}`,
            url: `${APP_URL}/companies/${company?.['slug'] ?? ''}`,
            payload: {
              company_name: company?.['name'] ?? round['company_name'],
              round_type: round['round_type'] ?? round['type'],
              amount: round['amount'] ?? round['amount_usd'],
              date: round['date'],
              investors: round['investors'] ?? [],
              valuation: round['valuation_pre'] ?? round['valuation_post'],
              hq_country: company?.['hq_country'] ?? round['country'],
              tags: company?.['tags'] ?? [],
            },
            format: 'dealroom_funding_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Skip
      }
    }

    return items;
  }

  private extractCompanies(state: Record<string, unknown>): Array<Record<string, unknown>> {
    // Navigate various possible state shapes
    const paths = [
      ['props', 'pageProps', 'companies'],
      ['props', 'pageProps', 'data', 'companies'],
      ['data', 'companies'],
    ];

    for (const path of paths) {
      let current: unknown = state;
      for (const key of path) {
        current = (current as Record<string, unknown>)?.[key];
      }
      if (Array.isArray(current)) return current as Array<Record<string, unknown>>;
    }

    // Try to find companies in Apollo cache
    const entries = Object.entries(state);
    const companies: Array<Record<string, unknown>> = [];
    for (const [key, value] of entries) {
      if (key.startsWith('Company:') && typeof value === 'object' && value !== null) {
        companies.push(value as Record<string, unknown>);
      }
    }

    return companies;
  }

  private extractFundingRounds(state: Record<string, unknown>): Array<Record<string, unknown>> {
    const paths = [
      ['props', 'pageProps', 'rounds'],
      ['props', 'pageProps', 'data', 'rounds'],
      ['data', 'funding_rounds'],
    ];

    for (const path of paths) {
      let current: unknown = state;
      for (const key of path) {
        current = (current as Record<string, unknown>)?.[key];
      }
      if (Array.isArray(current)) return current as Array<Record<string, unknown>>;
    }

    return [];
  }
}
