// ---------------------------------------------------------------------------
// BuiltWith scraper — tracks technology adoption via the BuiltWith API
//
// BuiltWith reveals:
// - What tech stacks companies are using
// - Technology adoption/abandonment trends
// - Market size for specific tools (number of websites using them)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.builtwith.com';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// BuiltWithScraper
// ---------------------------------------------------------------------------

export class BuiltWithScraper extends BaseScraper {
  readonly source = 'builtwith' as const;
  readonly method = 'api' as const;

  private get apiKey(): string {
    const key = process.env['BUILTWITH_API_KEY'] ?? '';
    if (!key) throw new Error('BUILTWITH_API_KEY not configured');
    return key;
  }

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'technology_lookup') {
      return this.lookupTechnologies(keywords, limit);
    }
    if (params.type === 'domain_lookup') {
      return this.lookupDomains(keywords);
    }
    if (params.type === 'keyword_search') {
      return this.searchTechTrends(keywords, limit);
    }

    throw new Error(`BuiltWithScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Look up technology adoption stats
  // -----------------------------------------------------------------------

  private async lookupTechnologies(
    techNames: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const tech of techNames) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchTechProfile(tech),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[builtwith] Tech lookup failed for "${tech}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems.slice(0, limit);
  }

  private async fetchTechProfile(techName: string): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/v21/api.json`);
    url.searchParams.set('KEY', this.apiKey);
    url.searchParams.set('TECH', techName);
    url.searchParams.set('META', 'yes');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`BuiltWith API error (${response.status})`);
    }

    const data = (await response.json()) as {
      Results?: Array<{
        Result?: {
          Paths?: Array<{
            Technologies?: Array<{
              Name: string;
              Tag: string;
              Categories?: string[];
              CurrentlyUsing?: number;
              HistoricallyUsing?: number;
            }>;
          }>;
        };
      }>;
    };

    const now = new Date();
    const items: RawScrapedItem[] = [];

    for (const result of data.Results ?? []) {
      for (const path of result.Result?.Paths ?? []) {
        for (const tech of path.Technologies ?? []) {
          const churnRate = tech.HistoricallyUsing && tech.CurrentlyUsing
            ? 1 - (tech.CurrentlyUsing / tech.HistoricallyUsing)
            : undefined;

          items.push({
            source: 'builtwith',
            entityId: `builtwith:tech:${this.hashString(tech.Name)}`,
            url: `https://trends.builtwith.com/${tech.Tag}/${tech.Name.replace(/\s+/g, '-')}`,
            payload: {
              name: tech.Name,
              tag: tech.Tag,
              categories: tech.Categories,
              currently_using: tech.CurrentlyUsing,
              historically_using: tech.HistoricallyUsing,
              churn_rate: churnRate,
              is_growing: churnRate !== undefined && churnRate < 0.1,
              is_declining: churnRate !== undefined && churnRate > 0.3,
              searchTech: techName,
            },
            format: 'builtwith_tech_v1',
            scrapedAt: now,
          });
        }
      }
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Look up what tech a domain uses
  // -----------------------------------------------------------------------

  private async lookupDomains(domains: string[]): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const domain of domains) {
      try {
        const url = new URL(`${API_BASE}/v21/api.json`);
        url.searchParams.set('KEY', this.apiKey);
        url.searchParams.set('LOOKUP', domain);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error(`BuiltWith domain lookup error (${response.status})`);

        const data = (await response.json()) as {
          Results?: Array<{
            Result?: {
              Paths?: Array<{
                Technologies?: Array<{
                  Name: string;
                  Tag: string;
                  FirstDetected?: number;
                  LastDetected?: number;
                }>;
              }>;
            };
          }>;
        };

        const now = new Date();

        for (const result of data.Results ?? []) {
          for (const path of result.Result?.Paths ?? []) {
            for (const tech of path.Technologies ?? []) {
              allItems.push({
                source: 'builtwith',
                entityId: `builtwith:${domain}:${this.hashString(tech.Name)}`,
                url: `https://builtwith.com/${domain}`,
                payload: {
                  domain,
                  tech_name: tech.Name,
                  tech_tag: tech.Tag,
                  first_detected: tech.FirstDetected,
                  last_detected: tech.LastDetected,
                },
                format: 'builtwith_domain_v1',
                scrapedAt: now,
              });
            }
          }
        }
      } catch (err) {
        console.error(`[builtwith] Domain lookup failed for "${domain}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search tech trends via free trends page
  // -----------------------------------------------------------------------

  private async searchTechTrends(
    keywords: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const url = `https://trends.builtwith.com/search?q=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`BuiltWith trends search failed (${response.status})`);
        const html = await response.text();

        // Extract tech trend data from HTML
        const trendPattern = /href="\/[\w-]+\/([\w-]+)"/gi;
        const now = new Date();
        let match;
        const seen = new Set<string>();

        while ((match = trendPattern.exec(html)) !== null && allItems.length < limit) {
          const techSlug = match[1]!;
          if (seen.has(techSlug)) continue;
          seen.add(techSlug);

          allItems.push({
            source: 'builtwith',
            entityId: `builtwith:trend:${techSlug}`,
            url: `https://trends.builtwith.com/${techSlug}`,
            payload: {
              tech_slug: techSlug,
              tech_name: techSlug.replace(/-/g, ' '),
              searchKeyword: keyword,
            },
            format: 'builtwith_trend_v1',
            scrapedAt: now,
          });
        }
      } catch (err) {
        console.error(`[builtwith] Trends search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
