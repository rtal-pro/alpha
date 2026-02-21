// ---------------------------------------------------------------------------
// BOAMP scraper — Bulletin Officiel des Annonces de Marchés Publics
//
// French public procurement announcements. Complementary to EU TED:
// - Smaller contracts (below EU threshold)
// - Local government needs
// - French-specific compliance requirements
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://www.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records';
const RATE_LIMIT_DELAY_MS = 1_500;

// ---------------------------------------------------------------------------
// BOAMPScraper
// ---------------------------------------------------------------------------

export class BOAMPScraper extends BaseScraper {
  readonly source = 'boamp' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 25;

    if (params.type === 'keyword_search') {
      return this.searchAnnouncements(keywords, limit);
    }
    if (params.type === 'recent_announcements') {
      return this.getRecentAnnouncements(limit);
    }

    throw new Error(`BOAMPScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search announcements
  // -----------------------------------------------------------------------

  private async searchAnnouncements(
    keywords: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.queryBOAMP(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[boamp] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Recent IT/software announcements
  // -----------------------------------------------------------------------

  private async getRecentAnnouncements(limit: number): Promise<RawScrapedItem[]> {
    return this.queryBOAMP('logiciel OR informatique OR numérique OR SaaS', limit);
  }

  // -----------------------------------------------------------------------
  // BOAMP API query
  // -----------------------------------------------------------------------

  private async queryBOAMP(query: string, limit: number): Promise<RawScrapedItem[]> {
    const url = new URL(API_BASE);
    url.searchParams.set('where', `search(objet, "${query}")`);
    url.searchParams.set('order_by', 'dateparution DESC');
    url.searchParams.set('limit', String(Math.min(limit, 100)));

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`BOAMP API error (${response.status})`);
    }

    const body = (await response.json()) as {
      results?: Array<{
        idweb?: string;
        objet?: string;
        denomination?: string;
        dateparution?: string;
        datelimitereponse?: string;
        nature?: string;
        procedure?: string;
        cpv_objet?: string;
        departement?: string;
        region?: string;
      }>;
      total_count?: number;
    };

    const now = new Date();

    return (body.results ?? []).map((record) => {
      const categories = this.inferCategories(record.objet ?? '');

      return {
        source: 'boamp',
        entityId: `boamp:${record.idweb ?? this.hashString(record.objet ?? '')}`,
        url: `https://www.boamp.fr/avis/detail/${record.idweb}`,
        payload: {
          id: record.idweb,
          object: record.objet,
          buyer: record.denomination,
          publication_date: record.dateparution,
          response_deadline: record.datelimitereponse,
          nature: record.nature,
          procedure: record.procedure,
          cpv_code: record.cpv_objet,
          department: record.departement,
          region: record.region,
          categories,
          is_software_related: /logiciel|informatique|numérique|saas|cloud|plateforme/i.test(record.objet ?? ''),
          searchQuery: query,
        },
        format: 'boamp_notice_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategories(text: string): string[] {
    const t = text.toLowerCase();
    const categories: string[] = [];

    if (/\b(logiciel|informatique|numérique|saas|cloud)\b/.test(t)) categories.push('software');
    if (/\b(sécurité|cybersécurité|protection des données)\b/.test(t)) categories.push('cybersecurity');
    if (/\b(gestion|erp|crm|comptabilité)\b/.test(t)) categories.push('business_tools');
    if (/\b(santé|médical|hôpital|patient)\b/.test(t)) categories.push('healthcare');
    if (/\b(formation|éducation|apprentissage)\b/.test(t)) categories.push('education');
    if (/\b(transport|mobilité|véhicule)\b/.test(t)) categories.push('transport');
    if (/\b(énergie|environnement|développement durable)\b/.test(t)) categories.push('environment');

    return categories.length > 0 ? categories : ['government_it'];
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
