// ---------------------------------------------------------------------------
// Wellfound (formerly AngelList Talent) scraper — startup jobs & discovery
//
// Wellfound provides rich data about startups: funding stage, team size,
// market, and most importantly — what they're hiring for (indicating growth).
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://wellfound.com';
const RATE_LIMIT_DELAY_MS = 3_000;

// SaaS-relevant role categories for filtering
const SAAS_ROLE_KEYWORDS = [
  'software engineer', 'full stack', 'backend', 'frontend',
  'product manager', 'designer', 'data engineer', 'devops',
  'machine learning', 'ai', 'sales', 'marketing', 'growth',
  'customer success', 'support', 'engineering manager',
];

// ---------------------------------------------------------------------------
// WellfoundScraper
// ---------------------------------------------------------------------------

export class WellfoundScraper extends BaseScraper {
  readonly source = 'wellfound' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'startups':
        return this.scrapeStartups(params);
      case 'jobs':
        return this.scrapeJobs(params);
      default:
        throw new Error(`WellfoundScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Discover startups
  // -----------------------------------------------------------------------

  private async scrapeStartups(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const category = params.category ?? 'saas';
    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/startups/${slug}`;

    const items = await this.retryWithBackoff(() => this.fetchAndParseStartups(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Startup job listings (reveals what's being built and where)
  // -----------------------------------------------------------------------

  private async scrapeJobs(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const keywords = params.keywords ?? ['saas'];
    const geo = params.geo ?? 'europe';
    const keyword = keywords[0] ?? 'saas';
    const url = `${BASE_URL}/jobs?q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(geo)}`;

    const items = await this.retryWithBackoff(() => this.fetchAndParseJobs(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // HTML parsing — Startups
  // -----------------------------------------------------------------------

  private async fetchAndParseStartups(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Wellfound HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Try __NEXT_DATA__ first (Wellfound is a Next.js app)
    const nextDataRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
    const nextMatch = nextDataRegex.exec(html);

    if (nextMatch) {
      try {
        const nextData = JSON.parse(nextMatch[1]!) as Record<string, unknown>;
        const props = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown>;
        const startups = (props?.['startups'] ?? props?.['companies'] ?? []) as Array<Record<string, unknown>>;

        for (const startup of startups) {
          items.push({
            source: 'wellfound',
            entityId: `wellfound:${startup['slug'] ?? startup['id']}`,
            url: `${BASE_URL}/company/${startup['slug'] ?? startup['id']}`,
            payload: {
              name: startup['name'],
              description: startup['highConcept'] ?? startup['productDescription'] ?? startup['description'],
              stage: startup['stage'] ?? startup['companySize'],
              team_size: startup['teamSize'] ?? startup['companySize'],
              funding_stage: startup['fundingStage'],
              total_raised: startup['totalRaised'],
              markets: startup['markets'] ?? startup['tags'] ?? [],
              location: startup['location'] ?? startup['locationTags'],
              job_count: startup['jobListingsCount'] ?? startup['openJobCount'] ?? 0,
            },
            format: 'wellfound_startup_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Fallback to HTML parsing below
      }
    }

    // Fallback: HTML card parsing
    if (items.length === 0) {
      const cardRegex = /<div[^>]*class="[^"]*styles_component[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
      const nameRegex = /<a[^>]*href="\/company\/([^"]*)"[^>]*>([^<]*)<\/a>/i;
      const descRegex = /<span[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]*)<\/span>/i;

      let match;
      while ((match = cardRegex.exec(html)) !== null) {
        const card = match[1]!;
        const nameMatch = nameRegex.exec(card);
        if (!nameMatch) continue;

        items.push({
          source: 'wellfound',
          entityId: `wellfound:${nameMatch[1]}`,
          url: `${BASE_URL}/company/${nameMatch[1]}`,
          payload: {
            name: nameMatch[2]?.trim() ?? '',
            description: descRegex.exec(card)?.[1]?.trim() ?? '',
            stage: '',
            team_size: 0,
            markets: [],
            job_count: 0,
          },
          format: 'wellfound_startup_v1',
          scrapedAt: now,
        });
      }
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // HTML parsing — Jobs
  // -----------------------------------------------------------------------

  private async fetchAndParseJobs(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Wellfound HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Try __NEXT_DATA__ JSON
    const nextDataRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
    const nextMatch = nextDataRegex.exec(html);

    if (nextMatch) {
      try {
        const nextData = JSON.parse(nextMatch[1]!) as Record<string, unknown>;
        const props = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown>;
        const jobs = (props?.['jobListings'] ?? props?.['jobs'] ?? []) as Array<Record<string, unknown>>;

        for (const job of jobs) {
          const company = job['startup'] as Record<string, unknown> | undefined;
          items.push({
            source: 'wellfound',
            entityId: `wellfound:job:${job['slug'] ?? job['id']}`,
            url: `${BASE_URL}/jobs/${job['slug'] ?? job['id']}`,
            payload: {
              title: job['title'],
              company_name: company?.['name'] ?? job['companyName'],
              company_slug: company?.['slug'],
              location: job['location'] ?? job['locationNames'],
              remote: job['remote'] ?? false,
              salary_min: job['compensationMin'] ?? job['salaryMin'],
              salary_max: job['compensationMax'] ?? job['salaryMax'],
              equity_min: job['equityMin'],
              equity_max: job['equityMax'],
              role_type: job['roleType'] ?? job['type'],
              markets: company?.['markets'] ?? [],
              funding_stage: company?.['fundingStage'],
            },
            format: 'wellfound_job_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return items;
  }
}
