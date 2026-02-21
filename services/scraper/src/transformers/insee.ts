// ---------------------------------------------------------------------------
// INSEE transformer — converts raw INSEE SIRENE API responses into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed INSEEResult (kept inline for independence)
// ---------------------------------------------------------------------------

export interface INSEESectorStats {
  naceCode: string;
  companyCount: number;
  geo: string;
}

export interface INSEECompany {
  siren: string;
  siret: string;
  denomination: string;
  naceCode: string;
  commune: string;
  codePostal: string;
}

// ---------------------------------------------------------------------------
// INSEETransformer
// ---------------------------------------------------------------------------

export class INSEETransformer extends BaseTransformer {
  readonly source = 'insee' as const;

  /**
   * Transform raw INSEE scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'insee')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed INSEESectorStats from sector_stats items.
   */
  toSectorStats(rawItems: RawScrapedItem[]): INSEESectorStats[] {
    return rawItems
      .filter(
        (item) =>
          item.source === 'insee' && item.payload['dataType'] === 'sector_stats',
      )
      .map((item) => ({
        naceCode: String(item.payload['naceCode'] ?? ''),
        companyCount:
          typeof item.payload['companyCount'] === 'number'
            ? item.payload['companyCount']
            : 0,
        geo: String(item.payload['geo'] ?? 'all'),
      }));
  }

  /**
   * Extract typed INSEECompany objects from company_search items.
   */
  toCompanies(rawItems: RawScrapedItem[]): INSEECompany[] {
    return rawItems
      .filter(
        (item) =>
          item.source === 'insee' && item.format === 'insee_etablissement_v1',
      )
      .map((item) => this.toCompany(item))
      .filter((company): company is INSEECompany => company !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const dataType = String(p['dataType'] ?? '');

    if (dataType === 'sector_stats') {
      return this.transformSectorStats(item);
    }

    // Default: company/establishment item
    return this.transformCompany(item);
  }

  private transformSectorStats(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const naceCode = String(p['naceCode'] ?? '');
    if (!naceCode) return null;

    const companyCount =
      typeof p['companyCount'] === 'number' ? p['companyCount'] : 0;
    const geo = String(p['geo'] ?? 'all');

    const categories: string[] = [
      'jurisdiction:FR',
      `nace:${naceCode}`,
      `type:sector_stats`,
    ];
    if (geo !== 'all') categories.push(`geo:${geo}`);

    return {
      source: 'insee',
      externalId: item.entityId,
      title: `NACE ${naceCode} — ${companyCount} active establishments`,
      description:
        `Sector statistics for NACE code ${naceCode}` +
        (geo !== 'all' ? ` in region ${geo}` : ' in France') +
        `: ${companyCount} active establishments.`,
      url: item.url || undefined,
      metrics: {
        companyCount,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        naceCode,
        geo,
        dataType: 'sector_stats',
      },
    };
  }

  private transformCompany(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const denomination = String(p['denomination'] ?? '');
    const siret = String(p['siret'] ?? '');
    if (!denomination && !siret) return null;

    const siren = String(p['siren'] ?? '');
    const naceCode = String(p['naceCode'] ?? '');
    const commune = String(p['commune'] ?? '');
    const codePostal = String(p['codePostal'] ?? '');
    const effectifs = String(p['trancheEffectifs'] ?? '');
    const dateCreation = p['dateCreation'] ? String(p['dateCreation']) : null;

    const categories: string[] = ['jurisdiction:FR', 'type:company'];
    if (naceCode) categories.push(`nace:${naceCode}`);
    if (commune) categories.push(`commune:${commune}`);

    const title = denomination || `SIRET ${siret}`;
    const location = commune && codePostal ? `${commune} (${codePostal})` : commune || codePostal;
    const description = [
      denomination,
      naceCode ? `NACE: ${naceCode}` : null,
      location ? `Location: ${location}` : null,
      effectifs ? `Effectifs: ${effectifs}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    return {
      source: 'insee',
      externalId: item.entityId,
      title,
      description,
      url: item.url || undefined,
      metrics: {},
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        siren,
        siret,
        denomination,
        naceCode,
        commune,
        codePostal,
        trancheEffectifs: effectifs,
        dateCreation,
        searchKeyword: p['searchKeyword'],
        geo: p['geo'],
      },
    };
  }

  private toCompany(item: RawScrapedItem): INSEECompany | null {
    const p = item.payload;

    const denomination = String(p['denomination'] ?? '');
    const siret = String(p['siret'] ?? '');
    if (!denomination && !siret) return null;

    return {
      siren: String(p['siren'] ?? ''),
      siret,
      denomination,
      naceCode: String(p['naceCode'] ?? ''),
      commune: String(p['commune'] ?? ''),
      codePostal: String(p['codePostal'] ?? ''),
    };
  }
}
