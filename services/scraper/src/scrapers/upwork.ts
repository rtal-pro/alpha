// ---------------------------------------------------------------------------
// Upwork scraper — tracks freelance demand via RSS feeds and search
//
// Freelance demand = business demand. When companies pay freelancers to
// build something, it signals:
// - Validated willingness to pay
// - Product gap (no existing SaaS solves it)
// - Category growth
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RSS_BASE = 'https://www.upwork.com/ab/feed/jobs/rss';
const RATE_LIMIT_DELAY_MS = 2_000;

// High-signal Upwork categories for SaaS ideas
const DEFAULT_QUERIES = [
  'saas development',
  'api integration',
  'automation workflow',
  'dashboard development',
  'crm customization',
  'data analytics tool',
  'compliance software',
  'fintech application',
  'ai chatbot',
  'no-code tool',
];

// ---------------------------------------------------------------------------
// UpworkScraper
// ---------------------------------------------------------------------------

export class UpworkScraper extends BaseScraper {
  readonly source = 'upwork' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? DEFAULT_QUERIES;
    const limit = params.limit ?? 20;

    if (params.type !== 'keyword_search') {
      throw new Error(`UpworkScraper: unsupported scrape type "${params.type}"`);
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchRSS(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[upwork] RSS fetch failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Fetch Upwork RSS feed for a search query
  // -----------------------------------------------------------------------

  private async fetchRSS(query: string, limit: number): Promise<RawScrapedItem[]> {
    const url = `${RSS_BASE}?q=${encodeURIComponent(query)}&sort=recency&paging=0%3B${limit}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Upwork RSS failed (${response.status})`);
    }

    const xml = await response.text();
    return this.parseRSS(xml, query);
  }

  // -----------------------------------------------------------------------
  // Parse RSS XML
  // -----------------------------------------------------------------------

  private parseRSS(xml: string, searchQuery: string): RawScrapedItem[] {
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract <item> blocks from RSS
    const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemPattern.exec(xml)) !== null) {
      const itemXml = match[1]!;

      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link');
      const description = this.extractTag(itemXml, 'description');
      const pubDate = this.extractTag(itemXml, 'pubDate');

      if (!title || !link) continue;

      // Extract budget/rate info from description
      const budget = this.extractBudget(description ?? '');
      const skills = this.extractSkills(description ?? '');
      const categories = this.inferCategories(title, description ?? '');

      items.push({
        source: 'upwork',
        entityId: `upwork:${this.hashString(link)}`,
        url: link,
        payload: {
          title,
          description: (description ?? '').slice(0, 500),
          published_at: pubDate,
          budget_type: budget.type,
          budget_amount: budget.amount,
          skills,
          categories,
          is_high_budget: budget.amount !== undefined && budget.amount > 5000,
          is_recurring: /\b(ongoing|monthly|retainer|long.?term)\b/i.test(description ?? ''),
          searchQuery,
        },
        format: 'upwork_job_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private extractTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return (match?.[1] ?? match?.[2])?.trim();
  }

  private extractBudget(text: string): { type: string; amount?: number } {
    const fixedMatch = text.match(/Budget:\s*\$?([\d,]+)/i);
    if (fixedMatch) {
      return { type: 'fixed', amount: parseInt(fixedMatch[1]!.replace(/,/g, ''), 10) };
    }

    const hourlyMatch = text.match(/\$([\d.]+)\s*-\s*\$([\d.]+)\/hr/i);
    if (hourlyMatch) {
      const avg = (parseFloat(hourlyMatch[1]!) + parseFloat(hourlyMatch[2]!)) / 2;
      return { type: 'hourly', amount: Math.round(avg * 160) }; // Estimate monthly
    }

    return { type: 'unknown' };
  }

  private extractSkills(text: string): string[] {
    const skillsMatch = text.match(/Skills?:\s*([\s\S]*?)(?:<br|$)/i);
    if (!skillsMatch) return [];

    return skillsMatch[1]!
      .replace(/<[^>]+>/g, '')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 30);
  }

  private inferCategories(title: string, description: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    const categories: string[] = [];

    if (/\b(saas|b2b|subscription)\b/.test(text)) categories.push('general_saas');
    if (/\b(api|integration|automation|zapier|webhook)\b/.test(text)) categories.push('automation');
    if (/\b(dashboard|analytics|reporting|bi)\b/.test(text)) categories.push('analytics');
    if (/\b(ai|ml|chatbot|gpt|llm|nlp)\b/.test(text)) categories.push('ai_ml');
    if (/\b(fintech|payment|invoice|accounting)\b/.test(text)) categories.push('fintech');
    if (/\b(ecommerce|shopify|woocommerce|marketplace)\b/.test(text)) categories.push('ecommerce');
    if (/\b(crm|sales|lead|pipeline)\b/.test(text)) categories.push('crm');
    if (/\b(compliance|gdpr|privacy|legal)\b/.test(text)) categories.push('compliance_legal');
    if (/\b(devops|ci|cd|infrastructure|cloud)\b/.test(text)) categories.push('devtools');

    return categories.length > 0 ? categories : ['general_saas'];
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
