// ---------------------------------------------------------------------------
// Y Combinator scraper — YC company directory
//
// YC's public company directory provides structured data about all YC-backed
// startups. This data feeds product_launch, funding_round, and market_entry
// signals — YC companies are by definition VC-validated.
//
// Sources:
//  - YC Company Directory (workatastartup.com + ycombinator.com/companies)
//  - YC Launch page (news.ycombinator.com/launches)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIRECTORY_URL = 'https://www.ycombinator.com/companies';
const LAUNCH_URL = 'https://news.ycombinator.com/launches';
const RATE_LIMIT_DELAY_MS = 2_000;

// Batch sizes for YC categories
const YC_INDUSTRIES = [
  'B2B', 'SaaS', 'Fintech', 'Developer+Tools', 'Healthcare',
  'Education', 'AI', 'Marketplace', 'Analytics', 'Security',
  'Infrastructure', 'Open+Source', 'Compliance',
];

// ---------------------------------------------------------------------------
// YCombinatorScraper
// ---------------------------------------------------------------------------

export class YCombinatorScraper extends BaseScraper {
  readonly source = 'ycombinator' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'directory':
        return this.scrapeDirectory(params);
      case 'launches':
        return this.scrapeLaunches(params);
      case 'category':
        return this.scrapeByIndustry(params);
      default:
        throw new Error(`YCombinatorScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // YC Company Directory
  // -----------------------------------------------------------------------

  private async scrapeDirectory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    // YC directory supports query params for filtering
    const batch = params.keywords?.[0] ?? 'SaaS';
    const url = `${DIRECTORY_URL}?industry=${encodeURIComponent(batch)}&batch=&status=Active`;

    const items = await this.retryWithBackoff(() => this.fetchAndParseDirectory(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // YC Launch posts (Show HN-style but from YC companies)
  // -----------------------------------------------------------------------

  private async scrapeLaunches(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 20;
    const items = await this.retryWithBackoff(() => this.fetchAndParseLaunches());
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Industry-specific YC companies
  // -----------------------------------------------------------------------

  private async scrapeByIndustry(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const industry = params.category ?? 'SaaS';
    const limit = params.limit ?? 20;
    const url = `${DIRECTORY_URL}?industry=${encodeURIComponent(industry)}&status=Active`;

    const items = await this.retryWithBackoff(() => this.fetchAndParseDirectory(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Directory parsing
  // -----------------------------------------------------------------------

  private async fetchAndParseDirectory(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`YC Directory HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // YC directory is a Next.js app — try __NEXT_DATA__ first
    const nextDataRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
    const nextMatch = nextDataRegex.exec(html);

    if (nextMatch) {
      try {
        const nextData = JSON.parse(nextMatch[1]!) as Record<string, unknown>;
        const props = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown>;
        const companies = (props?.['companies'] ?? props?.['results'] ?? []) as Array<Record<string, unknown>>;

        for (const company of companies) {
          const slug = (company['slug'] ?? company['id'] ?? '') as string;
          items.push({
            source: 'ycombinator',
            entityId: `yc:${slug}`,
            url: `${DIRECTORY_URL}/${slug}`,
            payload: {
              name: company['name'],
              description: company['one_liner'] ?? company['long_description'] ?? company['description'],
              batch: company['batch'] ?? company['batch_name'],
              status: company['status'] ?? 'Active',
              team_size: company['team_size'] ?? company['num_founders'],
              location: company['location'] ?? company['city'],
              industries: company['industries'] ?? company['tags'] ?? [],
              website: company['website'] ?? company['url'],
              is_hiring: company['is_hiring'] ?? false,
              yc_batch_year: this.extractBatchYear(company['batch'] as string),
            },
            format: 'yc_company_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Fallback to HTML parsing below
      }
    }

    // Fallback: HTML card parsing
    if (items.length === 0) {
      const cardRegex = /<a[^>]*href="\/companies\/([^"]*)"[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      const nameRegex = /<span[^>]*class="[^"]*company-name[^"]*"[^>]*>([^<]*)<\/span>/i;
      const descRegex = /<span[^>]*class="[^"]*(?:one-liner|description)[^"]*"[^>]*>([^<]*)<\/span>/i;
      const batchRegex = /<span[^>]*class="[^"]*batch[^"]*"[^>]*>([^<]*)<\/span>/i;

      let match;
      while ((match = cardRegex.exec(html)) !== null) {
        const slug = match[1]!;
        const card = match[2]!;
        const nameMatch = nameRegex.exec(card);
        const descMatch = descRegex.exec(card);
        const batchMatch = batchRegex.exec(card);

        items.push({
          source: 'ycombinator',
          entityId: `yc:${slug}`,
          url: `${DIRECTORY_URL}/${slug}`,
          payload: {
            name: nameMatch?.[1]?.trim() ?? slug,
            description: descMatch?.[1]?.trim() ?? '',
            batch: batchMatch?.[1]?.trim() ?? '',
            status: 'Active',
            industries: [],
          },
          format: 'yc_company_v1',
          scrapedAt: now,
        });
      }
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Launch page parsing
  // -----------------------------------------------------------------------

  private async fetchAndParseLaunches(): Promise<RawScrapedItem[]> {
    const response = await fetch(LAUNCH_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`YC Launches HTTP ${response.status}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // HN Launch posts follow standard HN story format
    const storyRegex = /<tr[^>]*class="[^"]*athing[^"]*"[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/tr>\s*<tr>([\s\S]*?)<\/tr>/gi;
    const titleRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*titlelink[^"]*"[^>]*>([\s\S]*?)<\/a>/i;
    const titleRegex2 = /<span class="titleline"><a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const scoreRegex = /(\d+)\s*points?/i;
    const commentsRegex = /(\d+)\s*comments?/i;

    let match;
    while ((match = storyRegex.exec(html)) !== null) {
      const id = match[1]!;
      const titleRow = match[2]!;
      const subRow = match[3]!;

      const titleMatch = titleRegex.exec(titleRow) ?? titleRegex2.exec(titleRow);
      if (!titleMatch) continue;

      const url = titleMatch[1] ?? '';
      const title = titleMatch[2]?.replace(/<[^>]+>/g, '').trim() ?? '';

      // Only include "Launch YC" posts
      if (!title.includes('Launch YC') && !title.includes('YC ')) continue;

      const scoreMatch = scoreRegex.exec(subRow);
      const score = scoreMatch ? parseInt(scoreMatch[1]!, 10) : 0;
      const commMatch = commentsRegex.exec(subRow);
      const comments = commMatch ? parseInt(commMatch[1]!, 10) : 0;

      items.push({
        source: 'ycombinator',
        entityId: `yc:launch:${id}`,
        url: url.startsWith('http') ? url : `https://news.ycombinator.com/item?id=${id}`,
        payload: {
          title,
          score,
          comments,
          hn_id: id,
          is_launch: true,
        },
        format: 'yc_launch_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private extractBatchYear(batch?: string): number | null {
    if (!batch) return null;
    const yearMatch = /(\d{4})/.exec(batch);
    return yearMatch ? parseInt(yearMatch[1]!, 10) : null;
  }
}
