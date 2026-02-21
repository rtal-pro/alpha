// ---------------------------------------------------------------------------
// Starter Story scraper — SaaS case studies with real revenue data
//
// Starter Story publishes interviews with SaaS founders including:
// - Exact revenue figures (MRR, revenue growth)
// - How they got their first customers
// - Market validation strategies
// - What worked / what didn't
//
// This data helps validate opportunity hypotheses with real-world examples.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.starterstory.com';
const RATE_LIMIT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// StarterStoryScraper
// ---------------------------------------------------------------------------

export class StarterStoryScraper extends BaseScraper {
  readonly source = 'starter_story' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'ideas':
        return this.scrapeIdeas(params);
      case 'stories':
        return this.scrapeStories(params);
      case 'category':
        return this.scrapeByCategory(params);
      default:
        throw new Error(`StarterStoryScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Business ideas (curated idea listings)
  // -----------------------------------------------------------------------

  private async scrapeIdeas(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const url = `${BASE_URL}/ideas`;
    const items = await this.retryWithBackoff(() => this.fetchAndParseIdeas(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Founder stories (interviews with revenue data)
  // -----------------------------------------------------------------------

  private async scrapeStories(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 20;
    const url = `${BASE_URL}/stories`;
    const items = await this.retryWithBackoff(() => this.fetchAndParseStories(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Category-specific stories
  // -----------------------------------------------------------------------

  private async scrapeByCategory(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) throw new Error('StarterStoryScraper: category is required');

    const slug = category.toLowerCase().replace(/\s+/g, '-');
    const url = `${BASE_URL}/explore/${slug}`;
    const items = await this.retryWithBackoff(() => this.fetchAndParseStories(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, params.limit ?? 20);
  }

  // -----------------------------------------------------------------------
  // Parsing — Ideas page
  // -----------------------------------------------------------------------

  private async fetchAndParseIdeas(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`StarterStory HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Ideas are listed as cards with title, description, revenue potential
    const cardRegex = /<div[^>]*class="[^"]*idea-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const titleRegex = /<h[23][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const descRegex = /<p[^>]*>([\s\S]*?)<\/p>/i;
    const revenueRegex = /\$?([\d,]+(?:\.\d+)?[KkMm]?)(?:\s*\/\s*mo| MRR| per month| revenue)/i;
    const categoryRegex = /<span[^>]*class="[^"]*(?:category|tag|badge)[^"]*"[^>]*>([^<]*)<\/span>/gi;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const titleMatch = titleRegex.exec(card);
      if (!titleMatch) continue;

      const href = titleMatch[1] ?? '';
      const title = titleMatch[2]?.trim() ?? '';
      const descMatch = descRegex.exec(card);
      const description = descMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const revenueMatch = revenueRegex.exec(card);
      const estimatedRevenue = revenueMatch ? revenueMatch[1]! : null;

      const categories: string[] = [];
      let catMatch;
      while ((catMatch = categoryRegex.exec(card)) !== null) {
        categories.push(catMatch[1]!.trim());
      }

      const slug = href.replace(/^\/ideas\//, '').replace(/\/$/, '') || title.toLowerCase().replace(/\s+/g, '-');

      items.push({
        source: 'starter_story',
        entityId: `starter_story:idea:${slug}`,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        payload: {
          title,
          description,
          estimated_revenue: estimatedRevenue,
          categories,
          content_type: 'idea',
        },
        format: 'starter_story_idea_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Parsing — Stories page
  // -----------------------------------------------------------------------

  private async fetchAndParseStories(url: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`StarterStory HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Stories are listed as interview cards with business name + revenue
    const cardRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    const titleRegex = /<h[23][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const revenueRegex = /\$?([\d,]+(?:\.\d+)?[KkMm]?)(?:\s*\/\s*mo(?:nth)?| MRR| per month| monthly| revenue)/i;
    const founderRegex = /(?:founded by|by|founder)[:\s]*([^<,]+)/i;
    const employeeRegex = /(\d+)\s*(?:employees?|team members?)/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const titleMatch = titleRegex.exec(card);
      if (!titleMatch) continue;

      const href = titleMatch[1] ?? '';
      const title = titleMatch[2]?.replace(/<[^>]+>/g, '').trim() ?? '';
      const revenueMatch = revenueRegex.exec(card);
      const revenue = revenueMatch ? revenueMatch[1]! : null;
      const founderMatch = founderRegex.exec(card);
      const founder = founderMatch?.[1]?.trim() ?? null;
      const employeeMatch = employeeRegex.exec(card);
      const employees = employeeMatch ? parseInt(employeeMatch[1]!, 10) : null;

      const slug = href.replace(/^\/stories\//, '').replace(/\/$/, '') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      items.push({
        source: 'starter_story',
        entityId: `starter_story:story:${slug}`,
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        payload: {
          title,
          revenue,
          founder,
          employees,
          content_type: 'story',
        },
        format: 'starter_story_story_v1',
        scrapedAt: now,
      });
    }

    return items;
  }
}
