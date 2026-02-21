// ---------------------------------------------------------------------------
// Open Startups scraper — public SaaS metrics (MRR, churn, growth)
//
// Aggregates data from Baremetrics Open Startups and similar public dashboards.
// When founders share their metrics openly, we get validated market data:
// - Real MRR/ARR proves category viability
// - Churn rates indicate product-market fit
// - Growth trends validate or invalidate opportunity hypotheses
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAREMETRICS_URL = 'https://baremetrics.com/open-startups';
const RATE_LIMIT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// OpenStartupsScraper
// ---------------------------------------------------------------------------

export class OpenStartupsScraper extends BaseScraper {
  readonly source = 'open_startups' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'baremetrics':
        return this.scrapeBaremetrics(params);
      case 'all':
        return this.scrapeAll(params);
      default:
        throw new Error(`OpenStartupsScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Baremetrics Open Startups
  // -----------------------------------------------------------------------

  private async scrapeBaremetrics(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 50;
    const items = await this.retryWithBackoff(() => this.fetchAndParseBaremetrics());
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // All sources combined
  // -----------------------------------------------------------------------

  private async scrapeAll(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 50;
    const baremetrics = await this.retryWithBackoff(() => this.fetchAndParseBaremetrics());
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return baremetrics.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Baremetrics parsing
  // -----------------------------------------------------------------------

  private async fetchAndParseBaremetrics(): Promise<RawScrapedItem[]> {
    const response = await fetch(BAREMETRICS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Baremetrics HTTP ${response.status}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Baremetrics lists startups with their MRR, customers, churn
    const cardRegex = /<div[^>]*class="[^"]*startup-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const nameRegex = /<h[23][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const mrrRegex = /(?:MRR|Monthly Revenue)[:\s]*\$?([\d,]+(?:\.\d+)?[KkMm]?)/i;
    const customersRegex = /(?:Customers?|Users?)[:\s]*([\d,]+)/i;
    const churnRegex = /(?:Churn)[:\s]*([\d.]+)%/i;
    const arrRegex = /(?:ARR|Annual Revenue)[:\s]*\$?([\d,]+(?:\.\d+)?[KkMm]?)/i;
    const growthRegex = /(?:Growth|MoM)[:\s]*([+-]?[\d.]+)%/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card);
      if (!nameMatch) continue;

      const href = nameMatch[1] ?? '';
      const name = nameMatch[2]?.trim() ?? '';

      const mrrMatch = mrrRegex.exec(card);
      const mrr = mrrMatch ? this.parseAmount(mrrMatch[1]!) : 0;
      const customersMatch = customersRegex.exec(card);
      const customers = customersMatch ? parseInt(customersMatch[1]!.replace(/,/g, ''), 10) : 0;
      const churnMatch = churnRegex.exec(card);
      const churn = churnMatch ? parseFloat(churnMatch[1]!) : null;
      const arrMatch = arrRegex.exec(card);
      const arr = arrMatch ? this.parseAmount(arrMatch[1]!) : mrr * 12;
      const growthMatch = growthRegex.exec(card);
      const monthlyGrowth = growthMatch ? parseFloat(growthMatch[1]!) : null;

      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      items.push({
        source: 'open_startups',
        entityId: `open_startups:${slug}`,
        url: href.startsWith('http') ? href : `${BAREMETRICS_URL}/${href}`,
        payload: {
          name,
          mrr,
          arr,
          customers,
          churn_rate: churn,
          monthly_growth_pct: monthlyGrowth,
          data_source: 'baremetrics',
          is_public_metrics: true,
        },
        format: 'open_startups_v1',
        scrapedAt: now,
      });
    }

    // Fallback: try JSON API endpoint
    if (items.length === 0) {
      try {
        const apiResponse = await fetch(`${BAREMETRICS_URL}.json`, {
          headers: { Accept: 'application/json' },
        });

        if (apiResponse.ok) {
          const data = (await apiResponse.json()) as {
            startups?: Array<Record<string, unknown>>;
          };

          for (const startup of data.startups ?? []) {
            items.push({
              source: 'open_startups',
              entityId: `open_startups:${startup['slug'] ?? startup['id']}`,
              url: `${BAREMETRICS_URL}/${startup['slug']}`,
              payload: {
                name: startup['name'],
                mrr: startup['mrr'] ?? 0,
                arr: startup['arr'] ?? 0,
                customers: startup['active_customers'] ?? 0,
                churn_rate: startup['user_churn'] ?? null,
                monthly_growth_pct: startup['mrr_growth_rate'] ?? null,
                data_source: 'baremetrics',
                is_public_metrics: true,
              },
              format: 'open_startups_v1',
              scrapedAt: now,
            });
          }
        }
      } catch {
        // API endpoint may not exist, continue with HTML results
      }
    }

    return items;
  }

  private parseAmount(raw: string): number {
    const cleaned = raw.replace(/,/g, '').trim();
    const multiplier = cleaned.toLowerCase().endsWith('k') ? 1_000
      : cleaned.toLowerCase().endsWith('m') ? 1_000_000
      : 1;
    return parseFloat(cleaned.replace(/[KkMm]$/, '')) * multiplier || 0;
  }
}
