// ============================================================
// Opportunity scoring — composite score from market signals
// ============================================================

// ============================================================
// Weights for each scoring factor
// ============================================================

export const OPPORTUNITY_WEIGHTS = {
  growth: 0.3,
  competition: 0.25,
  regulatory: 0.2,
  geoGap: 0.15,
  feasibility: 0.1,
} as const;

// ============================================================
// Input / Output interfaces
// ============================================================

/** Raw signals fed into the opportunity scorer. */
export interface OpportunitySignals {
  /** Strength of growth indicators (e.g. search trend slope, community buzz). 0-100. */
  growthSignalStrength: number;

  /** Density of existing competitors in the space. 0-100 (100 = extremely crowded). */
  competitionDensity: number;

  /** Whether a regulatory trigger exists that creates opportunity. 0-100. */
  regulatoryTrigger: number;

  /** Size of the geographic / market gap. 0-100 (100 = wide-open gap). */
  geoGapSize: number;

  /** Technical and operational feasibility for a solo/small team. 0-100. */
  feasibilityScore: number;
}

/** Extended signals for the enhanced scoring pipeline. */
export interface EnhancedOpportunitySignals extends OpportunitySignals {
  /** Timestamps of source signals (for recency decay). */
  signalTimestamps?: Date[];

  /** Number of distinct signal types contributing to this opportunity. */
  signalTypeDiversity?: number;

  /** Number of distinct data sources contributing. */
  sourceDiversity?: number;

  /** Score history for velocity calculation: [{score, timestamp}]. */
  scoreHistory?: Array<{ score: number; timestamp: string }>;

  /** Total number of source signals. */
  signalCount?: number;
}

/** Scored output with per-factor breakdown and weighted composite. */
export interface CompositeScore {
  /** Weighted composite score, 0-100. */
  composite: number;

  /** Growth signal sub-score, 0-100. */
  growth: number;

  /** Competition sub-score, 0-100 (higher = less competition = better). */
  competition: number;

  /** Regulatory opportunity sub-score, 0-100. */
  regulatory: number;

  /** Geographic gap sub-score, 0-100. */
  geoGap: number;

  /** Feasibility sub-score, 0-100. */
  feasibility: number;
}

/** Enhanced scored output with bonus breakdown. */
export interface EnhancedCompositeScore extends CompositeScore {
  /** Raw composite before bonuses. */
  rawComposite: number;

  /** Recency multiplier applied (0.5–1.0). */
  recencyMultiplier: number;

  /** Velocity bonus added (0–15 points). */
  velocityBonus: number;

  /** Diversity bonus added (0–12 points). */
  diversityBonus: number;

  /** Confidence level based on data quality (0–100). */
  confidence: number;
}

// ============================================================
// Scoring function (original — kept for backward compat)
// ============================================================

/**
 * Compute a composite opportunity score from raw market signals.
 *
 * Each factor is normalised to 0-100. Competition density is inverted
 * so that lower density produces a higher sub-score. The composite is
 * a weighted average of all sub-scores.
 */
export function scoreOpportunity(signals: OpportunitySignals): CompositeScore {
  const growth = clamp(signals.growthSignalStrength);
  // Invert competition: low density = high score
  const competition = clamp(100 - signals.competitionDensity);
  const regulatory = clamp(signals.regulatoryTrigger);
  const geoGap = clamp(signals.geoGapSize);
  const feasibility = clamp(signals.feasibilityScore);

  const composite = round(
    growth * OPPORTUNITY_WEIGHTS.growth +
      competition * OPPORTUNITY_WEIGHTS.competition +
      regulatory * OPPORTUNITY_WEIGHTS.regulatory +
      geoGap * OPPORTUNITY_WEIGHTS.geoGap +
      feasibility * OPPORTUNITY_WEIGHTS.feasibility,
  );

  return {
    composite,
    growth: round(growth),
    competition: round(competition),
    regulatory: round(regulatory),
    geoGap: round(geoGap),
    feasibility: round(feasibility),
  };
}

// ============================================================
// Enhanced scoring (v2) — recency decay, velocity, diversity
// ============================================================

/**
 * Enhanced scoring that rewards:
 * 1. Recency — newer signals are worth more (exponential decay)
 * 2. Velocity — score increasing over time = accelerating opportunity
 * 3. Diversity — signals from many types/sources = higher conviction
 * 4. Confidence — more data = more reliable score
 */
export function scoreOpportunityEnhanced(
  signals: EnhancedOpportunitySignals,
): EnhancedCompositeScore {
  // Compute base score
  const base = scoreOpportunity(signals);

  // 1. Recency decay: exponential decay over 90 days
  const recencyMultiplier = computeRecencyMultiplier(signals.signalTimestamps);

  // 2. Velocity bonus: score acceleration
  const velocityBonus = computeVelocityBonus(signals.scoreHistory);

  // 3. Diversity bonus: more signal types & sources = more conviction
  const diversityBonus = computeDiversityBonus(
    signals.signalTypeDiversity ?? 1,
    signals.sourceDiversity ?? 1,
  );

  // 4. Confidence from data quantity and diversity
  const confidence = computeConfidence(
    signals.signalCount ?? 1,
    signals.signalTypeDiversity ?? 1,
    signals.sourceDiversity ?? 1,
  );

  // Apply multipliers and bonuses
  const enhanced = clamp(
    base.composite * recencyMultiplier + velocityBonus + diversityBonus,
  );

  return {
    ...base,
    composite: round(enhanced),
    rawComposite: base.composite,
    recencyMultiplier: round(recencyMultiplier),
    velocityBonus: round(velocityBonus),
    diversityBonus: round(diversityBonus),
    confidence: round(confidence),
  };
}

// ============================================================
// Recency decay
// ============================================================

/** Half-life for signal freshness: 30 days. */
const RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimum multiplier (very old signals). */
const MIN_RECENCY = 0.5;

function computeRecencyMultiplier(timestamps?: Date[]): number {
  if (!timestamps || timestamps.length === 0) return 1.0;

  const now = Date.now();
  let totalWeight = 0;

  for (const ts of timestamps) {
    const age = now - ts.getTime();
    // Exponential decay: e^(-ln(2) * age / half_life)
    const weight = Math.exp(-0.693 * age / RECENCY_HALF_LIFE_MS);
    totalWeight += weight;
  }

  const avgWeight = totalWeight / timestamps.length;
  // Scale to [MIN_RECENCY, 1.0]
  return MIN_RECENCY + avgWeight * (1 - MIN_RECENCY);
}

// ============================================================
// Velocity bonus
// ============================================================

/** Max bonus points from velocity. */
const MAX_VELOCITY_BONUS = 15;

function computeVelocityBonus(
  scoreHistory?: Array<{ score: number; timestamp: string }>,
): number {
  if (!scoreHistory || scoreHistory.length < 2) return 0;

  // Sort by timestamp ascending
  const sorted = [...scoreHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Compute slope: (latest - earliest) / time_span_days
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const timeDeltaDays = Math.max(
    1,
    (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) /
    (24 * 60 * 60 * 1000),
  );

  const scoreDelta = last.score - first.score;
  const dailyVelocity = scoreDelta / timeDeltaDays;

  // Positive velocity = accelerating opportunity
  if (dailyVelocity <= 0) return 0;

  // Scale: 1 point/day = 7 bonus, 2+/day = max 15
  return Math.min(MAX_VELOCITY_BONUS, dailyVelocity * 7);
}

// ============================================================
// Diversity bonus
// ============================================================

/** Max bonus points from diversity. */
const MAX_DIVERSITY_BONUS = 12;

function computeDiversityBonus(
  signalTypeDiversity: number,
  sourceDiversity: number,
): number {
  // Signal type diversity: 1 type = 0, 2 = +3, 3 = +5, 4+ = +7
  const typeBonus = signalTypeDiversity <= 1 ? 0
    : signalTypeDiversity === 2 ? 3
    : signalTypeDiversity === 3 ? 5
    : 7;

  // Source diversity: 1 source = 0, 2 = +2, 3+ = +5
  const sourceBonus = sourceDiversity <= 1 ? 0
    : sourceDiversity === 2 ? 2
    : 5;

  return Math.min(MAX_DIVERSITY_BONUS, typeBonus + sourceBonus);
}

// ============================================================
// Confidence
// ============================================================

function computeConfidence(
  signalCount: number,
  typeDiversity: number,
  sourceDiversity: number,
): number {
  // More signals = higher confidence (diminishing returns)
  const countConfidence = Math.min(40, signalCount * 5);
  // More signal types = higher confidence
  const typeConfidence = Math.min(30, typeDiversity * 10);
  // More sources = higher confidence
  const sourceConfidence = Math.min(30, sourceDiversity * 10);

  return clamp(countConfidence + typeConfidence + sourceConfidence);
}

// ============================================================
// Helpers
// ============================================================

/** Clamp a value to [0, 100]. */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Round to two decimal places. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
