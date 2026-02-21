// ---------------------------------------------------------------------------
// BOAMP transformer — converts raw French public procurement data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class BOAMPTransformer extends BaseTransformer {
  readonly source = 'boamp' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'boamp')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const object = String(p['object'] ?? '');
    if (!object) return null;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : ['government_procurement'];
    categories.push('geo:FR');

    return {
      source: 'boamp',
      externalId: item.entityId,
      title: object.length > 200 ? object.slice(0, 197) + '...' : object,
      description: `BOAMP: ${p['buyer'] ?? 'Unknown buyer'} — ${object.slice(0, 300)}`,
      url: item.url,
      metrics: {
        isSoftwareRelated: p['is_software_related'] ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        announcementId: p['id'],
        buyer: p['buyer'],
        publicationDate: p['publication_date'],
        responseDeadline: p['response_deadline'],
        nature: p['nature'],
        procedure: p['procedure'],
        cpvCode: p['cpv_code'],
        department: p['department'],
        region: p['region'],
        searchQuery: p['searchQuery'],
      },
    };
  }
}
