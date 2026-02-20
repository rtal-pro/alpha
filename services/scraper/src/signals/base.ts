// ---------------------------------------------------------------------------
// Abstract base class for signal detectors
// ---------------------------------------------------------------------------

export type SignalType =
  | 'product_launch' | 'funding_round' | 'traffic_spike' | 'review_surge'
  | 'community_buzz' | 'regulatory_event' | 'oss_traction' | 'company_registration'
  | 'pricing_change' | 'pain_point_cluster' | 'search_trend' | 'market_entry' | 'market_exit';

export type ScrapeSource =
  | 'reddit' | 'producthunt' | 'github' | 'google_trends' | 'hacker_news'
  | 'crunchbase' | 'appsumo' | 'indiehackers' | 'ycombinator'
  | 'eurlex' | 'legifrance' | 'insee' | 'data_gouv'
  | 'pappers' | 'serpapi_g2' | 'serpapi_capterra' | 'serpapi_serp'
  | 'google_autocomplete';

export interface DetectedSignal {
  signal_type: SignalType;
  title: string;
  description: string;
  strength: number;          // 0–100
  category: string;
  geo_relevance: string[];
  source: ScrapeSource;
  source_url?: string;
  occurred_at: Date;
  product_id?: string;
  raw_event_id?: string;
  evidence: Record<string, unknown>;
}

export interface NormalizedItem {
  source: string;
  externalId: string;
  title: string;
  description?: string;
  url?: string;
  metrics: Record<string, number>;
  categories: string[];
  scrapedAt: Date;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// BaseSignalDetector
// ---------------------------------------------------------------------------

export abstract class BaseSignalDetector {
  /** Human-readable name for this detector */
  abstract readonly name: string;

  /** Which signal type(s) this detector can produce */
  abstract readonly signalTypes: SignalType[];

  /** Which data sources this detector can consume */
  abstract readonly supportedSources: ScrapeSource[];

  /**
   * Analyze normalized items and detect signals.
   * Returns zero or more detected signals.
   */
  abstract detect(items: NormalizedItem[]): Promise<DetectedSignal[]>;

  /**
   * Compute strength (0–100) from a raw metric value using a configurable
   * sigmoid-like curve (min/max saturation thresholds).
   */
  protected computeStrength(
    value: number,
    minThreshold: number,
    maxThreshold: number,
  ): number {
    if (value <= minThreshold) return 0;
    if (value >= maxThreshold) return 100;
    const ratio = (value - minThreshold) / (maxThreshold - minThreshold);
    return Math.round(ratio * 100);
  }
}
