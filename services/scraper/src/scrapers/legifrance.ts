// ---------------------------------------------------------------------------
// Legifrance scraper — uses the DILA / PISTE API for French law texts
// ---------------------------------------------------------------------------

import { LEGIFRANCE_API_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

/** Respectful rate limit — 2 000 ms between requests */
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// LegifranceScraper
// ---------------------------------------------------------------------------

export class LegifranceScraper extends BaseScraper {
  readonly source = 'legifrance' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'keyword_search':
        return this.scrapeKeywordSearch(params);
      default:
        throw new Error(
          `LegifranceScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Keyword search — search French law texts by keyword
  // -----------------------------------------------------------------------

  private async scrapeKeywordSearch(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'LegifranceScraper: at least one keyword is required for keyword_search',
      );
    }

    const limit = params.limit ?? 20;
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchTexts(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[legifrance] Failed keyword search for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search texts via PISTE API
  // -----------------------------------------------------------------------

  private async searchTexts(
    keyword: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    if (!LEGIFRANCE_API_KEY) {
      throw new Error(
        'Legifrance API key not configured (LEGIFRANCE_API_KEY)',
      );
    }

    // The PISTE Legifrance API uses a POST-based search endpoint
    const searchUrl = `${API_BASE}/search`;

    const requestBody = {
      recherche: {
        typeRecherche: 'TOUS',
        champs: [
          {
            typeChamp: 'ALL',
            criteres: [
              {
                typeRecherche: 'CONTIENT',
                valeur: keyword,
                operateur: 'ET',
              },
            ],
          },
        ],
        filtres: [],
        pageNumber: 1,
        pageSize: Math.min(limit, 50),
        sort: 'PERTINENCE',
        typePagination: 'DEFAULT',
      },
    };

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'KeyId': LEGIFRANCE_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 429) {
      throw new Error('Legifrance API rate limit hit (429)');
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Legifrance API authentication error (${response.status}) — check LEGIFRANCE_API_KEY`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Legifrance API error (${response.status}) for "${keyword}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      results?: Array<{
        titles?: Array<{ title: string }>;
        id?: string;
        titre?: string;
        textId?: string;
        nature?: string;
        dateTexte?: string;
        dateVersion?: string;
        origin?: string;
        nor?: string;
        num?: string;
        etat?: string;
        [key: string]: unknown;
      }>;
      totalResultNumber?: number;
    };

    const results = body.results ?? [];
    const now = new Date();

    return results.map((result) => {
      const id = String(result.id ?? result.textId ?? '');
      const title =
        result.titre ??
        result.titles?.[0]?.title ??
        '';
      const nature = String(result.nature ?? '');
      const dateTexte = result.dateTexte ?? null;
      const nor = result.nor ?? null;
      const num = result.num ?? null;
      const etat = result.etat ?? null;

      return {
        source: 'legifrance',
        entityId: `legifrance:${id || Buffer.from(title.slice(0, 80)).toString('base64url').slice(0, 32)}`,
        url: id
          ? `https://www.legifrance.gouv.fr/loda/id/${id}`
          : `https://www.legifrance.gouv.fr/`,
        payload: {
          id,
          title,
          nature,
          dateTexte,
          nor,
          num,
          etat,
          searchKeyword: keyword,
        },
        format: 'legifrance_text_v1',
        scrapedAt: now,
      };
    });
  }
}
