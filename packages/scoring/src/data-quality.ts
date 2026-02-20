import { SOURCE_RELIABILITY, type DataQualityScore } from '@repo/shared';

// ============================================================
// Max age (in hours) per source — data older than this is stale
// ============================================================

export const MAX_AGE_HOURS: Record<string, number> = {
  reddit: 24,
  producthunt: 48,
  github: 48,
  google_trends: 168,
  hacker_news: 24,
  crunchbase: 720,
  appsumo: 48,
  indiehackers: 48,
  ycombinator: 720,
  eurlex: 720,
  legifrance: 720,
  insee: 2160,
  data_gouv: 2160,
  pappers: 720,
  serpapi_g2: 336,
  serpapi_capterra: 336,
  serpapi_serp: 168,
  google_autocomplete: 168,
};

const DEFAULT_MAX_AGE_HOURS = 168; // 1 week fallback

// ============================================================
// Individual scoring functions
// ============================================================

/**
 * Score how fresh scraped data is relative to the source's max allowed age.
 * Returns a value between 0 (completely stale) and 1 (perfectly fresh).
 *
 * Uses a linear decay: freshness = 1 - (ageHours / maxAgeHours), clamped to [0, 1].
 */
export function scoreFreshness(scrapedAt: Date, source: string): number {
  const maxAge = MAX_AGE_HOURS[source] ?? DEFAULT_MAX_AGE_HOURS;
  const ageMs = Date.now() - scrapedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours <= 0) return 1;
  if (ageHours >= maxAge) return 0;

  return 1 - ageHours / maxAge;
}

/**
 * Score how complete a data record is based on the presence of non-null,
 * non-undefined required fields.
 * Returns a value between 0 (nothing present) and 1 (all fields present).
 */
export function scoreCompleteness(
  data: Record<string, unknown>,
  requiredFields: string[],
): number {
  if (requiredFields.length === 0) return 1;

  const presentCount = requiredFields.filter((field) => {
    const value = data[field];
    return value !== null && value !== undefined;
  }).length;

  return presentCount / requiredFields.length;
}

// ============================================================
// Aggregate data quality score
// ============================================================

export interface DataQualityInput {
  scrapedAt: Date;
  source: string;
  data: Record<string, unknown>;
}

/**
 * Compute an aggregate DataQualityScore across a collection of scraped items.
 *
 * - freshness:    average freshness across all items
 * - completeness: average completeness across all items
 * - reliability:  weighted average of SOURCE_RELIABILITY per source
 * - relevance:    proportion of items that are both reasonably fresh (>0.3) and complete (>0.5)
 * - composite:    weighted blend of the four sub-scores
 */
export function scoreDataQuality(
  items: DataQualityInput[],
  requiredFields: string[],
): DataQualityScore {
  if (items.length === 0) {
    return {
      freshness: 0,
      completeness: 0,
      reliability: 0,
      relevance: 0,
      composite: 0,
    };
  }

  // Per-item scores
  const freshnessScores = items.map((item) =>
    scoreFreshness(item.scrapedAt, item.source),
  );
  const completenessScores = items.map((item) =>
    scoreCompleteness(item.data, requiredFields),
  );
  const reliabilityScores = items.map(
    (item) => SOURCE_RELIABILITY[item.source] ?? 0.5,
  );

  // Averages
  const avgFreshness = average(freshnessScores);
  const avgCompleteness = average(completenessScores);
  const avgReliability = average(reliabilityScores);

  // Relevance: proportion of items that meet minimum freshness AND completeness thresholds
  const relevantCount = items.filter((_, i) => {
    return freshnessScores[i] > 0.3 && completenessScores[i] > 0.5;
  }).length;
  const relevance = relevantCount / items.length;

  // Composite: weighted blend
  const composite =
    avgFreshness * 0.25 +
    avgCompleteness * 0.25 +
    avgReliability * 0.3 +
    relevance * 0.2;

  return {
    freshness: round(avgFreshness),
    completeness: round(avgCompleteness),
    reliability: round(avgReliability),
    relevance: round(relevance),
    composite: round(composite),
  };
}

// ============================================================
// Helpers
// ============================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
