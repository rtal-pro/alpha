// ---------------------------------------------------------------------------
// SerpAPI SERP transformer — converts raw Google SERP results into
// NormalizedItem shapes for signal detection.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class SerpAPISerpTransformer extends BaseTransformer {
  readonly source = 'serpapi_serp' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'serpapi_serp')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const resultType = String(p['result_type'] ?? 'organic');

    switch (resultType) {
      case 'organic':
        return this.transformOrganic(item);
      case 'people_also_ask':
        return this.transformPAA(item);
      case 'related_search':
        return this.transformRelated(item);
      case 'search_meta':
        return this.transformMeta(item);
      default:
        return null;
    }
  }

  private transformOrganic(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const title = String(p['title'] ?? '');
    if (!title) return null;

    const position = typeof p['position'] === 'number' ? p['position'] : 0;
    const query = String(p['query'] ?? '');

    const categories: string[] = ['serp:organic'];
    if (p['has_comparison']) categories.push('comparison');
    if (p['has_pricing']) categories.push('pricing');
    if (p['has_review']) categories.push('review');

    return {
      source: 'serpapi_serp',
      externalId: item.entityId,
      title,
      description: p['snippet'] ? String(p['snippet']) : undefined,
      url: item.url,
      metrics: {
        position,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        query,
        displayed_link: p['displayed_link'],
      },
    };
  }

  private transformPAA(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const question = String(p['question'] ?? '');
    if (!question) return null;

    const categories: string[] = ['serp:paa'];
    if (p['has_pain_signal']) categories.push('pain_signal');

    return {
      source: 'serpapi_serp',
      externalId: item.entityId,
      title: question,
      description: p['snippet'] ? String(p['snippet']) : undefined,
      url: item.url,
      metrics: {},
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        query: p['query'],
        has_pain_signal: p['has_pain_signal'],
      },
    };
  }

  private transformRelated(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const relatedQuery = String(p['query'] ?? '');
    if (!relatedQuery) return null;

    return {
      source: 'serpapi_serp',
      externalId: item.entityId,
      title: relatedQuery,
      url: '',
      metrics: {},
      categories: ['serp:related'],
      scrapedAt: item.scrapedAt,
      metadata: {
        original_query: p['original_query'],
      },
    };
  }

  private transformMeta(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const query = String(p['query'] ?? '');
    if (!query) return null;

    const totalResults = typeof p['total_results'] === 'number' ? p['total_results'] : 0;

    return {
      source: 'serpapi_serp',
      externalId: item.entityId,
      title: `Search: "${query}" (${totalResults.toLocaleString()} results)`,
      url: '',
      metrics: {
        total_results: totalResults,
      },
      categories: ['serp:meta'],
      scrapedAt: item.scrapedAt,
      metadata: {
        query,
        total_results: totalResults,
        time_taken: p['time_taken'],
      },
    };
  }
}
