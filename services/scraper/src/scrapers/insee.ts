// ---------------------------------------------------------------------------
// INSEE SIRENE scraper — uses the INSEE SIRENE V3.11 API for French company
// statistics and search.
// ---------------------------------------------------------------------------

import { SIRENE_API_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.insee.fr/entreprises/sirene/V3.11';

/** 30 req/min => 2 000 ms between requests */
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// INSEEScraper
// ---------------------------------------------------------------------------

export class INSEEScraper extends BaseScraper {
  readonly source = 'insee' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'sector_stats':
        return this.scrapeSectorStats(params);
      case 'company_search':
        return this.scrapeCompanySearch(params);
      default:
        throw new Error(
          `INSEEScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Sector stats — company counts by NACE code
  // -----------------------------------------------------------------------

  private async scrapeSectorStats(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'INSEEScraper: at least one NACE code or keyword is required for sector_stats',
      );
    }

    const geo = params.geo ?? ''; // department code or empty for all France
    const allItems: RawScrapedItem[] = [];

    for (const naceCode of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchSectorStats(naceCode, geo),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[insee] Failed sector_stats for NACE "${naceCode}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Company search — search establishments by criteria
  // -----------------------------------------------------------------------

  private async scrapeCompanySearch(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'INSEEScraper: at least one keyword is required for company_search',
      );
    }

    const limit = params.limit ?? 20;
    const geo = params.geo ?? '';
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchCompanies(keyword, limit, geo),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[insee] Failed company_search for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Fetch sector stats from SIRENE API
  // -----------------------------------------------------------------------

  private async fetchSectorStats(
    naceCode: string,
    geo: string,
  ): Promise<RawScrapedItem[]> {
    if (!SIRENE_API_KEY) {
      throw new Error(
        'SIRENE API key not configured (SIRENE_API_KEY)',
      );
    }

    // Build the query filter for the SIRENE API
    // activitePrincipaleEtablissement is the NACE code field
    const queryParts: string[] = [
      `activitePrincipaleEtablissement:"${naceCode}"`,
      'etatAdministratifEtablissement:A', // only active establishments
    ];

    if (geo) {
      queryParts.push(`codeCommuneEtablissement:${geo}*`);
    }

    const url = new URL(`${API_BASE}/siret`);
    url.searchParams.set('q', queryParts.join(' AND '));
    url.searchParams.set('nombre', '0'); // we only want the count header
    url.searchParams.set('champs', 'siren'); // minimal fields

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${SIRENE_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      throw new Error('INSEE SIRENE API rate limit hit (429)');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `INSEE SIRENE API authentication error (${response.status}) — check SIRENE_API_KEY`,
      );
    }

    if (response.status === 404) {
      // No results found for this query — return a zero-count item
      return [
        this.buildSectorStatsItem(naceCode, geo, 0),
      ];
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `INSEE SIRENE API error (${response.status}) for NACE "${naceCode}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      header?: {
        total?: number;
        debut?: number;
        nombre?: number;
      };
    };

    const totalCount = body.header?.total ?? 0;

    return [this.buildSectorStatsItem(naceCode, geo, totalCount)];
  }

  // -----------------------------------------------------------------------
  // Search companies via SIRENE API
  // -----------------------------------------------------------------------

  private async searchCompanies(
    keyword: string,
    limit: number,
    geo: string,
  ): Promise<RawScrapedItem[]> {
    if (!SIRENE_API_KEY) {
      throw new Error(
        'SIRENE API key not configured (SIRENE_API_KEY)',
      );
    }

    // Build query — search by denomination (company name)
    const queryParts: string[] = [
      `denominationUniteLegale:"${keyword}"`,
      'etatAdministratifEtablissement:A',
    ];

    if (geo) {
      queryParts.push(`codeCommuneEtablissement:${geo}*`);
    }

    const url = new URL(`${API_BASE}/siret`);
    url.searchParams.set('q', queryParts.join(' AND '));
    url.searchParams.set('nombre', String(Math.min(limit, 100)));
    url.searchParams.set(
      'champs',
      [
        'siren',
        'siret',
        'denominationUniteLegale',
        'activitePrincipaleEtablissement',
        'codeCommuneEtablissement',
        'codePostalEtablissement',
        'libelleCommuneEtablissement',
        'trancheEffectifsEtablissement',
        'dateCreationEtablissement',
      ].join(','),
    );

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${SIRENE_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      throw new Error('INSEE SIRENE API rate limit hit (429)');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `INSEE SIRENE API authentication error (${response.status}) — check SIRENE_API_KEY`,
      );
    }

    if (response.status === 404) {
      // No results
      return [];
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `INSEE SIRENE API error (${response.status}) for "${keyword}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      header?: { total?: number };
      etablissements?: Array<{
        siren: string;
        siret: string;
        uniteLegale?: {
          denominationUniteLegale?: string;
          [key: string]: unknown;
        };
        adresseEtablissement?: {
          codeCommuneEtablissement?: string;
          codePostalEtablissement?: string;
          libelleCommuneEtablissement?: string;
          [key: string]: unknown;
        };
        activitePrincipaleEtablissement?: string;
        trancheEffectifsEtablissement?: string;
        dateCreationEtablissement?: string;
        [key: string]: unknown;
      }>;
    };

    const etablissements = body.etablissements ?? [];
    const now = new Date();

    return etablissements.map((etab) => {
      const siret = String(etab.siret ?? '');
      const siren = String(etab.siren ?? '');
      const denomination =
        etab.uniteLegale?.denominationUniteLegale ?? '';
      const naceCode =
        etab.activitePrincipaleEtablissement ?? '';
      const commune =
        etab.adresseEtablissement?.libelleCommuneEtablissement ?? '';
      const codePostal =
        etab.adresseEtablissement?.codePostalEtablissement ?? '';
      const effectifs =
        etab.trancheEffectifsEtablissement ?? '';
      const dateCreation =
        etab.dateCreationEtablissement ?? '';

      return {
        source: 'insee',
        entityId: `insee:${siret || siren}`,
        url: `https://www.sirene.fr/sirene/public/recherche?recherche=${siret || siren}`,
        payload: {
          siren,
          siret,
          denomination,
          naceCode,
          commune,
          codePostal,
          trancheEffectifs: effectifs,
          dateCreation,
          searchKeyword: keyword,
          geo: geo || 'all',
        },
        format: 'insee_etablissement_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Build a sector stats item
  // -----------------------------------------------------------------------

  private buildSectorStatsItem(
    naceCode: string,
    geo: string,
    totalCount: number,
  ): RawScrapedItem {
    return {
      source: 'insee',
      entityId: `insee:sector:${naceCode}:${geo || 'FR'}`,
      url: `https://www.sirene.fr/sirene/public/recherche`,
      payload: {
        naceCode,
        geo: geo || 'all',
        companyCount: totalCount,
        dataType: 'sector_stats',
      },
      format: 'insee_sector_stats_v1',
      scrapedAt: new Date(),
    };
  }
}
