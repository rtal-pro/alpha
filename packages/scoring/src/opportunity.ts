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

// ============================================================
// Scoring function
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
