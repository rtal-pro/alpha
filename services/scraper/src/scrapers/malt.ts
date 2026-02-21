// ---------------------------------------------------------------------------
// Malt scraper — French/European freelance platform
//
// Malt is the #1 freelance platform in France. Reveals:
// - What skills are in demand (= what companies are building)
// - Pricing benchmarks for development projects
// - French market-specific trends
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.malt.fr';
const RATE_LIMIT_DELAY_MS = 2_500;

// ---------------------------------------------------------------------------
// MaltScraper
// ---------------------------------------------------------------------------

export class MaltScraper extends BaseScraper {
  readonly source = 'malt' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type !== 'keyword_search' || keywords.length === 0) {
      throw new Error('MaltScraper: requires keyword_search with keywords');
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchFreelancers(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[malt] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search freelancers (reveals demand)
  // -----------------------------------------------------------------------

  private async searchFreelancers(
    keyword: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = `${BASE_URL}/s?q=${encodeURIComponent(keyword)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Malt search failed (${response.status})`);
    }

    const html = await response.text();
    return this.parseResults(html, keyword, limit);
  }

  // -----------------------------------------------------------------------
  // Parse search results
  // -----------------------------------------------------------------------

  private parseResults(html: string, context: string, limit: number): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract freelancer profile links and surrounding data
    const profilePattern = /href="\/profile\/([\w-]+)"/gi;
    const ratePattern = /(\d+)\s*€\s*\/\s*jour/i;
    const titlePattern = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i;

    let match;
    const seen = new Set<string>();

    // Also try to extract the result count for demand sizing
    const countMatch = html.match(/([\d\s]+)\s*(?:freelances?|résultats?)/i);
    const totalResults = countMatch
      ? parseInt(countMatch[1]!.replace(/\s/g, ''), 10)
      : undefined;

    while ((match = profilePattern.exec(html)) !== null && items.length < limit) {
      const slug = match[1]!;
      if (seen.has(slug)) continue;
      seen.add(slug);

      const start = Math.max(0, match.index - 400);
      const end = Math.min(html.length, match.index + 400);
      const ctx = html.slice(start, end);

      const rateMatch = ratePattern.exec(ctx);
      const titleMatch = titlePattern.exec(ctx);

      const dailyRate = rateMatch ? parseInt(rateMatch[1]!, 10) : undefined;
      const title = titleMatch
        ? titleMatch[1]!.replace(/<[^>]+>/g, '').trim()
        : slug.replace(/-/g, ' ');

      items.push({
        source: 'malt',
        entityId: `malt:${slug}`,
        url: `${BASE_URL}/profile/${slug}`,
        payload: {
          profile_slug: slug,
          title,
          daily_rate_eur: dailyRate,
          total_results_for_query: totalResults,
          is_high_rate: dailyRate !== undefined && dailyRate > 600,
          is_high_demand: totalResults !== undefined && totalResults > 500,
          categories: this.inferCategories(title, context),
          searchQuery: context,
        },
        format: 'malt_freelancer_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategories(title: string, query: string): string[] {
    const text = `${title} ${query}`.toLowerCase();
    const categories: string[] = [];

    if (/\b(développeur|developer|fullstack|backend|frontend)\b/.test(text)) categories.push('devtools');
    if (/\b(data|analyst|scientist|bi)\b/.test(text)) categories.push('data_analytics');
    if (/\b(design|ux|ui|figma|webdesign)\b/.test(text)) categories.push('design');
    if (/\b(marketing|seo|growth|acquisition)\b/.test(text)) categories.push('marketing');
    if (/\b(devops|cloud|aws|infrastructure)\b/.test(text)) categories.push('infrastructure');
    if (/\b(ia|ai|machine learning|ml|deep learning)\b/.test(text)) categories.push('ai_ml');
    if (/\b(product|chef de projet|scrum|agile)\b/.test(text)) categories.push('product_management');

    return categories.length > 0 ? categories : ['general_saas'];
  }
}
