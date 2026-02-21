// ---------------------------------------------------------------------------
// Google Trends scraper — uses SerpAPI's Google Trends endpoint
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json';

/** SerpAPI plan-dependent — use 2 000 ms as safe default */
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// GoogleTrendsScraper
// ---------------------------------------------------------------------------

export class GoogleTrendsScraper extends BaseScraper {
  readonly source = 'google_trends' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'interest_over_time':
        return this.scrapeInterestOverTime(params);
      case 'related_queries':
        return this.scrapeRelatedQueries(params);
      default:
        throw new Error(
          `GoogleTrendsScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Interest over time
  // -----------------------------------------------------------------------

  private async scrapeInterestOverTime(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'GoogleTrendsScraper: at least one keyword is required for interest_over_time',
      );
    }

    const geo = params.geo ?? ''; // empty = worldwide
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchInterestOverTime(keyword, geo),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[google_trends] Failed interest_over_time for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Related queries
  // -----------------------------------------------------------------------

  private async scrapeRelatedQueries(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'GoogleTrendsScraper: at least one keyword is required for related_queries',
      );
    }

    const geo = params.geo ?? '';
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchRelatedQueries(keyword, geo),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[google_trends] Failed related_queries for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Fetch interest over time from SerpAPI
  // -----------------------------------------------------------------------

  private async fetchInterestOverTime(
    keyword: string,
    geo: string,
  ): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('SerpAPI key not configured (SERPAPI_KEY)');
    }

    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google_trends');
    url.searchParams.set('q', keyword);
    url.searchParams.set('data_type', 'TIMESERIES');
    url.searchParams.set('api_key', SERPAPI_KEY);
    if (geo) url.searchParams.set('geo', geo);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      throw new Error('SerpAPI rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SerpAPI error (${response.status}) for keyword "${keyword}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      interest_over_time?: {
        timeline_data?: Array<{
          date: string;
          timestamp: string;
          values: Array<{ query: string; value: string; extracted_value: number }>;
        }>;
      };
      search_metadata?: Record<string, unknown>;
    };

    const timelineData = body.interest_over_time?.timeline_data ?? [];

    // Compute trend metrics from the data points
    const values = timelineData.map((point) => {
      const val = point.values?.[0]?.extracted_value ?? 0;
      return val;
    });

    const averageInterest =
      values.length > 0
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : 0;

    // Simple trend slope: difference between last and first quarters
    let trendSlope = 0;
    if (values.length >= 4) {
      const quarter = Math.floor(values.length / 4);
      const firstQuarterAvg =
        values.slice(0, quarter).reduce((s, v) => s + v, 0) / quarter;
      const lastQuarterAvg =
        values.slice(-quarter).reduce((s, v) => s + v, 0) / quarter;
      trendSlope = lastQuarterAvg - firstQuarterAvg;
    }

    const now = new Date();

    return [
      {
        source: 'google_trends',
        entityId: `gtrends:iot:${keyword.toLowerCase().replace(/\s+/g, '_')}`,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}`,
        payload: {
          keyword,
          dataType: 'interest_over_time',
          geo: geo || 'worldwide',
          timelineData: timelineData.map((point) => ({
            date: point.date,
            timestamp: point.timestamp,
            value: point.values?.[0]?.extracted_value ?? 0,
          })),
          averageInterest,
          trendSlope,
          dataPoints: values.length,
        },
        format: 'google_trends_iot_v1',
        scrapedAt: now,
      },
    ];
  }

  // -----------------------------------------------------------------------
  // Fetch related queries from SerpAPI
  // -----------------------------------------------------------------------

  private async fetchRelatedQueries(
    keyword: string,
    geo: string,
  ): Promise<RawScrapedItem[]> {
    if (!SERPAPI_KEY) {
      throw new Error('SerpAPI key not configured (SERPAPI_KEY)');
    }

    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google_trends');
    url.searchParams.set('q', keyword);
    url.searchParams.set('data_type', 'RELATED_QUERIES');
    url.searchParams.set('api_key', SERPAPI_KEY);
    if (geo) url.searchParams.set('geo', geo);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (response.status === 429) {
      throw new Error('SerpAPI rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `SerpAPI error (${response.status}) for related queries "${keyword}": ${text}`,
      );
    }

    const body = (await response.json()) as {
      related_queries?: {
        rising?: Array<{ query: string; value: number; link: string }>;
        top?: Array<{ query: string; value: number; link: string }>;
      };
    };

    const rising = body.related_queries?.rising ?? [];
    const top = body.related_queries?.top ?? [];

    const now = new Date();

    return [
      {
        source: 'google_trends',
        entityId: `gtrends:rq:${keyword.toLowerCase().replace(/\s+/g, '_')}`,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(keyword)}`,
        payload: {
          keyword,
          dataType: 'related_queries',
          geo: geo || 'worldwide',
          risingQueries: rising.map((q) => ({
            query: q.query,
            value: q.value,
          })),
          topQueries: top.map((q) => ({
            query: q.query,
            value: q.value,
          })),
        },
        format: 'google_trends_rq_v1',
        scrapedAt: now,
      },
    ];
  }
}
