// ---------------------------------------------------------------------------
// Pappers transformer — converts raw Pappers company registry data into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class PappersTransformer extends BaseTransformer {
  readonly source = 'pappers' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'pappers')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const name = String(p['name'] ?? '');
    if (!name) return null;

    const nafCode = p['naf_code'] ? String(p['naf_code']) : '';
    const city = p['city'] ? String(p['city']) : '';
    const creationDate = p['creation_date'] ? String(p['creation_date']) : '';
    const isSoftware = p['is_software_company'] === true;

    const description =
      `${name} — NAF: ${nafCode}` +
      (city ? `, ${city}` : '') +
      (creationDate ? ` (created: ${creationDate})` : '');

    const categories: string[] = [];
    if (isSoftware) categories.push('software');
    if (nafCode) categories.push(`naf:${nafCode}`);

    return {
      source: 'pappers',
      externalId: item.entityId,
      title: name,
      description,
      url: item.url,
      metrics: {},
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        siren: p['siren'],
        siret: p['siret'],
        naf_code: nafCode,
        creation_date: creationDate,
        city,
        employees: p['employees'],
        revenue: p['revenue'],
        is_software_company: isSoftware,
      },
    };
  }
}
