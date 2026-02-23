// ---------------------------------------------------------------------------
// Pappers scraper — French company registry data (alternative to INPI)
//
// Pappers provides structured access to French business registry data:
// - New company registrations (company_registration signals)
// - Company financials (revenue, employee count)
// - Industry classification (NAF/APE codes)
//
// This is particularly valuable for detecting French SaaS startup creation
// trends by sector.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://api.pappers.fr/v2';
const SEARCH_URL = 'https://www.pappers.fr/recherche';
const RATE_LIMIT_DELAY_MS = 2_000;

// NAF codes relevant to software/SaaS companies
const SAAS_NAF_CODES = [
  '6201Z', // Computer programming activities
  '6202A', // IT consulting
  '6202B', // IT facilities management
  '6209Z', // Other IT services
  '6311Z', // Data processing, hosting
  '6312Z', // Web portals
  '5821Z', // Publishing of computer games
  '5829A', // Publishing of system software
  '5829B', // Publishing of tools software
  '5829C', // Publishing of application software
  '6399Z', // Other information service activities
];

// ---------------------------------------------------------------------------
// PappersScraper
// ---------------------------------------------------------------------------

export class PappersScraper extends BaseScraper {
  readonly source = 'pappers' as const;
  readonly method = 'cheerio' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'new_companies':
        return this.scrapeNewCompanies(params);
      case 'keyword_search':
        return this.scrapeByKeyword(params);
      case 'sector':
        return this.scrapeBySector(params);
      default:
        throw new Error(`PappersScraper: unsupported type "${params.type}"`);
    }
  }

  // -----------------------------------------------------------------------
  // New company registrations (recent creations)
  // -----------------------------------------------------------------------

  private async scrapeNewCompanies(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = params.limit ?? 30;
    const daysBack = params.daysBack ?? 30;

    // Search for recently created software companies
    const items: RawScrapedItem[] = [];

    for (const nafCode of SAAS_NAF_CODES.slice(0, 5)) {
      const url = `${SEARCH_URL}?q=&code_naf=${nafCode}&date_creation_min=${this.daysAgoISO(daysBack)}`;
      const pageItems = await this.retryWithBackoff(() => this.fetchAndParse(url, nafCode));
      items.push(...pageItems);
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

      if (items.length >= limit) break;
    }

    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Keyword search (company name / activity)
  // -----------------------------------------------------------------------

  private async scrapeByKeyword(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keyword = params.keywords?.[0] ?? 'saas';
    const limit = params.limit ?? 20;
    const url = `${SEARCH_URL}?q=${encodeURIComponent(keyword)}`;

    const items = await this.retryWithBackoff(() => this.fetchAndParse(url));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Sector-specific search (by NAF code)
  // -----------------------------------------------------------------------

  private async scrapeBySector(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const nafCode = params.category ?? '6201Z';
    const limit = params.limit ?? 20;
    const url = `${SEARCH_URL}?q=&code_naf=${nafCode}`;

    const items = await this.retryWithBackoff(() => this.fetchAndParse(url, nafCode));
    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    return items.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // HTML parsing
  // -----------------------------------------------------------------------

  private async fetchAndParse(url: string, nafCode?: string): Promise<RawScrapedItem[]> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Pappers HTTP ${response.status}: ${url}`);
    }

    const html = await response.text();
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // Pappers search results use company cards
    const cardRegex = /<div[^>]*class="[^"]*(?:company-card|entreprise-card|search-result)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const nameRegex = /<a[^>]*href="\/entreprise\/([^"]*)"[^>]*>([^<]*)<\/a>/i;
    const sirenRegex = /(?:SIREN|Siren)[:\s]*(\d{9})/i;
    const siretRegex = /(?:SIRET|Siret)[:\s]*(\d{14})/i;
    const nafRegex = /(?:NAF|APE|Code NAF)[:\s]*(\d{4}[A-Z])/i;
    const dateRegex = /(?:Cr[ée]ation|Immatriculation|Date de cr)[:\s]*(\d{2}\/\d{2}\/\d{4})/i;
    const cityRegex = /(?:Siège|Ville|Adresse)[:\s]*([^<\n,]+(?:\d{5})?[^<\n]*)/i;
    const employeeRegex = /(?:Effectif|Salariés?|Employés?)[:\s]*([\d\s-]+)/i;
    const revenueRegex = /(?:CA|Chiffre d'affaires)[:\s]*([\d\s,.]+\s*(?:€|EUR|K€|M€))/i;

    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const card = match[1]!;
      const nameMatch = nameRegex.exec(card);
      if (!nameMatch) continue;

      const slug = nameMatch[1]!;
      const name = nameMatch[2]?.trim() ?? '';
      const sirenMatch = sirenRegex.exec(card);
      const siren = sirenMatch?.[1] ?? '';
      const siretMatch = siretRegex.exec(card);
      const siret = siretMatch?.[1] ?? '';
      const nafMatch = nafRegex.exec(card);
      const companyNaf = nafMatch?.[1] ?? nafCode ?? '';
      const dateMatch = dateRegex.exec(card);
      const creationDate = dateMatch?.[1] ?? '';
      const cityMatch = cityRegex.exec(card);
      const city = cityMatch?.[1]?.trim() ?? '';
      const empMatch = employeeRegex.exec(card);
      const employees = empMatch?.[1]?.trim() ?? '';
      const revMatch = revenueRegex.exec(card);
      const revenue = revMatch?.[1]?.trim() ?? '';

      items.push({
        source: 'pappers',
        entityId: `pappers:${siren || slug}`,
        url: `https://www.pappers.fr/entreprise/${slug}`,
        payload: {
          name,
          siren,
          siret,
          naf_code: companyNaf,
          creation_date: creationDate,
          city,
          employees,
          revenue,
          is_software_company: SAAS_NAF_CODES.includes(companyNaf),
        },
        format: 'pappers_company_v1',
        scrapedAt: now,
      });
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private daysAgoISO(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0]!;
  }
}
