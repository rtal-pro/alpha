// ---------------------------------------------------------------------------
// Zapier App Directory scraper — Cheerio-based
//
// Zapier's app directory shows:
// - Most popular integrations (what tools businesses connect)
// - Emerging app categories
// - Integration gaps (popular apps missing key integrations)
// - "Zap" templates = validated workflows = potential SaaS products
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://zapier.com';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// ZapierScraper
// ---------------------------------------------------------------------------

export class ZapierScraper extends BaseScraper {
  readonly source = 'zapier' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 30;

    if (params.type === 'keyword_search' && keywords.length > 0) {
      return this.searchApps(keywords, limit);
    }
    if (params.type === 'popular_apps') {
      return this.scrapePopularApps(limit);
    }

    throw new Error(`ZapierScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search apps on Zapier
  // -----------------------------------------------------------------------

  private async searchApps(keywords: string[], limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const url = `${BASE_URL}/apps?query=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
            Accept: 'text/html',
          },
        });

        if (!response.ok) throw new Error(`Zapier search failed (${response.status})`);
        const html = await response.text();
        allItems.push(...this.parseAppDirectory(html, keyword, limit));
      } catch (err) {
        console.error(`[zapier] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Scrape popular/trending apps
  // -----------------------------------------------------------------------

  private async scrapePopularApps(limit: number): Promise<RawScrapedItem[]> {
    try {
      const url = `${BASE_URL}/apps`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
          Accept: 'text/html',
        },
      });

      if (!response.ok) throw new Error(`Zapier popular apps failed (${response.status})`);
      const html = await response.text();
      return this.parseAppDirectory(html, 'popular', limit);
    } catch (err) {
      console.error(`[zapier] Popular apps scrape failed: ${err}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Parse app directory
  // -----------------------------------------------------------------------

  private parseAppDirectory(html: string, context: string, limit: number): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Zapier apps page links: /apps/<app-slug>
    const appLinkPattern = /href="\/apps\/([\w-]+)"/gi;
    const integrationCountPattern = /(\d[\d,]*)\s*integrations?/i;
    const categoryPattern = /category[^"]*"[^>]*>([\w\s&]+)</i;

    let match;
    const seen = new Set<string>();

    while ((match = appLinkPattern.exec(html)) !== null && items.length < limit) {
      const appSlug = match[1]!;
      // Skip navigation/utility slugs
      if (['integrations', 'explore', 'pricing'].includes(appSlug)) continue;
      if (seen.has(appSlug)) continue;
      seen.add(appSlug);

      const start = Math.max(0, match.index - 400);
      const end = Math.min(html.length, match.index + 400);
      const ctx = html.slice(start, end);

      const intCountMatch = integrationCountPattern.exec(ctx);
      const catMatch = categoryPattern.exec(ctx);
      const integrationCount = intCountMatch
        ? parseInt(intCountMatch[1]!.replace(/,/g, ''), 10)
        : undefined;

      items.push({
        source: 'zapier',
        entityId: `zapier:${appSlug}`,
        url: `${BASE_URL}/apps/${appSlug}/integrations`,
        payload: {
          app_slug: appSlug,
          app_name: appSlug.replace(/-/g, ' '),
          integration_count: integrationCount,
          category: catMatch ? catMatch[1]!.trim() : undefined,
          is_well_connected: integrationCount !== undefined && integrationCount > 100,
          is_emerging: integrationCount !== undefined && integrationCount < 20,
          searchContext: context,
        },
        format: 'zapier_app_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
