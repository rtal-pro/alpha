// ---------------------------------------------------------------------------
// EU TED (Tenders Electronic Daily) scraper — EU public procurement API
//
// Public contracts reveal:
// - What governments are buying (SaaS opportunity signals)
// - Budget sizes for specific categories
// - Digitization mandates requiring new software
// - Which incumbents win contracts (competitive landscape)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://ted.europa.eu/api/v3.0';
const RATE_LIMIT_DELAY_MS = 1_500;

// CPV codes relevant to SaaS / software
const SAAS_CPV_CODES = [
  '72000000', // IT services
  '72200000', // Software programming and consultancy
  '72210000', // Programming services of packaged software
  '72212000', // Programming services of application software
  '72300000', // Data services
  '72400000', // Internet services
  '48000000', // Software packages and information systems
  '48100000', // Industry-specific software
  '48200000', // Networking software
  '48300000', // Document management software
  '48400000', // Business transaction and personal business software
  '48600000', // Database and operating software
  '48700000', // Software package utilities
  '48800000', // Information systems and servers
  '79000000', // Business services
];

// ---------------------------------------------------------------------------
// EUTedScraper
// ---------------------------------------------------------------------------

export class EUTedScraper extends BaseScraper {
  readonly source = 'eu_ted' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 25;
    const geo = params.geo ?? 'FR';

    if (params.type === 'keyword_search') {
      return this.searchTenders(keywords, geo, limit);
    }
    if (params.type === 'recent_tenders') {
      return this.getRecentSoftwareTenders(geo, limit);
    }

    throw new Error(`EUTedScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search tenders by keyword
  // -----------------------------------------------------------------------

  private async searchTenders(
    keywords: string[],
    country: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.queryTED(keyword, country, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[eu-ted] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Recent software-related tenders
  // -----------------------------------------------------------------------

  private async getRecentSoftwareTenders(
    country: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    return this.queryTED('software OR logiciel OR SaaS', country, limit);
  }

  // -----------------------------------------------------------------------
  // TED API query
  // -----------------------------------------------------------------------

  private async queryTED(
    query: string,
    country: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    // TED search API
    const url = new URL(`${API_BASE}/notices/search`);

    const searchBody = {
      query: query,
      fields: ['title', 'summary', 'buyer', 'cpv-code', 'value', 'deadline'],
      page: 1,
      limit: Math.min(limit, 50),
      scope: 'ALL',
      sortField: 'publication-date',
      sortOrder: 'DESC',
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!response.ok) {
      // Fallback to simple GET search if POST API fails
      return this.fallbackSearch(query, country, limit);
    }

    const body = (await response.json()) as {
      notices?: Array<{
        'ND': string;
        'TI': string;   // title
        'CY': string;   // country
        'DD': string;   // deadline date
        'PD': string;   // publication date
        'AC': string;   // activity
        'NC': string;   // notice code
        'PR': string;   // procedure
        'OL': string;   // original language
        'RC': string;   // NUTS region code
        'TVL'?: string; // total value low
        'TVH'?: string; // total value high
        'TY': string;   // type
      }>;
      total?: number;
    };

    const now = new Date();

    return (body.notices ?? []).map((notice) => ({
      source: 'eu_ted',
      entityId: `ted:${notice.ND}`,
      url: `https://ted.europa.eu/en/notice/-/detail/${notice.ND}`,
      payload: {
        notice_id: notice.ND,
        title: notice.TI,
        country: notice.CY,
        deadline: notice.DD,
        publication_date: notice.PD,
        procedure_type: notice.PR,
        notice_type: notice.TY,
        region_code: notice.RC,
        value_low: notice.TVL ? parseFloat(notice.TVL) : undefined,
        value_high: notice.TVH ? parseFloat(notice.TVH) : undefined,
        is_france: notice.CY === 'FR',
        is_software_related: true,
        categories: this.inferCategories(notice.TI),
        searchQuery: query,
      },
      format: 'eu_ted_notice_v1',
      scrapedAt: now,
    }));
  }

  // -----------------------------------------------------------------------
  // Fallback: scrape TED search page
  // -----------------------------------------------------------------------

  private async fallbackSearch(
    query: string,
    country: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = `https://ted.europa.eu/en/search/result?query=${encodeURIComponent(query)}&country=${country}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`TED fallback search failed (${response.status})`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Extract notice links from TED search results
    const noticePattern = /\/notice\/-\/detail\/(\d+-\d+)/g;
    const titlePattern = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;

    let match;
    const seen = new Set<string>();

    while ((match = noticePattern.exec(html)) !== null && items.length < limit) {
      const noticeId = match[1]!;
      if (seen.has(noticeId)) continue;
      seen.add(noticeId);

      items.push({
        source: 'eu_ted',
        entityId: `ted:${noticeId}`,
        url: `https://ted.europa.eu/en/notice/-/detail/${noticeId}`,
        payload: {
          notice_id: noticeId,
          searchQuery: query,
          country,
        },
        format: 'eu_ted_notice_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategories(title: string): string[] {
    const t = (title ?? '').toLowerCase();
    const categories: string[] = [];

    if (/\b(software|logiciel|saas|cloud|platform)\b/.test(t)) categories.push('software');
    if (/\b(security|sécurité|cybersec|firewall)\b/.test(t)) categories.push('cybersecurity');
    if (/\b(data|données|analytics|bi)\b/.test(t)) categories.push('data_analytics');
    if (/\b(health|santé|médical|hôpital)\b/.test(t)) categories.push('healthcare');
    if (/\b(finance|comptab|invoic|factur)\b/.test(t)) categories.push('fintech');
    if (/\b(training|formation|learn|e-learn)\b/.test(t)) categories.push('education');

    return categories.length > 0 ? categories : ['government_it'];
  }
}
