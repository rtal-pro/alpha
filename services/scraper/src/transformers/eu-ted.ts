// ---------------------------------------------------------------------------
// EU TED transformer — converts raw EU public procurement data into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class EUTedTransformer extends BaseTransformer {
  readonly source = 'eu_ted' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'eu_ted')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title && !p['notice_id']) return null;

    const valueLow = typeof p['value_low'] === 'number' ? p['value_low'] : 0;
    const valueHigh = typeof p['value_high'] === 'number' ? p['value_high'] : 0;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : ['government_procurement'];
    if (p['is_france']) categories.push('geo:FR');

    return {
      source: 'eu_ted',
      externalId: item.entityId,
      title: title || `TED Notice ${p['notice_id']}`,
      description: `EU tender: ${title} (${p['country'] ?? 'EU'})`,
      url: item.url,
      metrics: {
        valueLow,
        valueHigh,
        estimatedValue: valueHigh > 0 ? valueHigh : valueLow,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        noticeId: p['notice_id'],
        country: p['country'],
        deadline: p['deadline'],
        publicationDate: p['publication_date'],
        procedureType: p['procedure_type'],
        noticeType: p['notice_type'],
        regionCode: p['region_code'],
        isFrance: p['is_france'],
        isSoftwareRelated: p['is_software_related'],
        searchQuery: p['searchQuery'],
      },
    };
  }
}
