// ---------------------------------------------------------------------------
// Google Trends transformer — converts raw SerpAPI Google Trends responses
// into NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed GoogleTrend (kept inline for independence)
// ---------------------------------------------------------------------------

export interface GoogleTrend {
  keyword: string;
  dataType: string;
  averageInterest: number;
  trendSlope: number;
  trendDirection: 'rising' | 'falling' | 'stable';
  relatedQueries: Array<{ query: string; value: number }>;
}

// ---------------------------------------------------------------------------
// GoogleTrendsTransformer
// ---------------------------------------------------------------------------

export class GoogleTrendsTransformer extends BaseTransformer {
  readonly source = 'google_trends' as const;

  /**
   * Transform raw Google Trends scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'google_trends')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed GoogleTrend objects from raw items.
   */
  toGoogleTrends(rawItems: RawScrapedItem[]): GoogleTrend[] {
    return rawItems
      .filter((item) => item.source === 'google_trends')
      .map((item) => this.toTrend(item))
      .filter((trend): trend is GoogleTrend => trend !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const keyword = String(p['keyword'] ?? '');
    if (!keyword) return null;

    const dataType = String(p['dataType'] ?? '');
    const averageInterest =
      typeof p['averageInterest'] === 'number' ? p['averageInterest'] : 0;
    const trendSlope =
      typeof p['trendSlope'] === 'number' ? p['trendSlope'] : 0;
    const geo = String(p['geo'] ?? 'worldwide');

    // Determine trend direction
    const trendDirection =
      trendSlope > 5 ? 'rising' : trendSlope < -5 ? 'falling' : 'stable';

    // Build categories
    const categories: string[] = [`trend:${trendDirection}`, `geo:${geo}`];
    if (dataType) categories.push(`type:${dataType}`);

    // Build description based on data type
    let description: string;
    if (dataType === 'interest_over_time') {
      description =
        `Trend data for "${keyword}": avg interest ${averageInterest.toFixed(1)}, ` +
        `trend ${trendDirection} (slope: ${trendSlope.toFixed(1)})`;
    } else {
      const risingQueries = Array.isArray(p['risingQueries'])
        ? (p['risingQueries'] as Array<{ query: string }>)
        : [];
      description =
        `Related queries for "${keyword}": ` +
        `${risingQueries.length} rising queries`;
    }

    return {
      source: 'google_trends',
      externalId: item.entityId,
      title: `Trend: ${keyword}`,
      description,
      url: item.url,
      metrics: {
        averageInterest,
        trendSlope,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        keyword,
        dataType,
        geo,
        trendDirection,
        timelineData: p['timelineData'],
        risingQueries: p['risingQueries'],
        topQueries: p['topQueries'],
        dataPoints: p['dataPoints'],
      },
    };
  }

  private toTrend(item: RawScrapedItem): GoogleTrend | null {
    const p = item.payload;

    const keyword = String(p['keyword'] ?? '');
    if (!keyword) return null;

    const averageInterest =
      typeof p['averageInterest'] === 'number' ? p['averageInterest'] : 0;
    const trendSlope =
      typeof p['trendSlope'] === 'number' ? p['trendSlope'] : 0;
    const trendDirection: 'rising' | 'falling' | 'stable' =
      trendSlope > 5 ? 'rising' : trendSlope < -5 ? 'falling' : 'stable';

    // Merge rising and top queries
    const risingQueries = Array.isArray(p['risingQueries'])
      ? (p['risingQueries'] as Array<{ query: string; value: number }>)
      : [];
    const topQueries = Array.isArray(p['topQueries'])
      ? (p['topQueries'] as Array<{ query: string; value: number }>)
      : [];

    return {
      keyword,
      dataType: String(p['dataType'] ?? ''),
      averageInterest,
      trendSlope,
      trendDirection,
      relatedQueries: [...risingQueries, ...topQueries],
    };
  }
}
