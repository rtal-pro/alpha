// ============================================================
// Section confidence scoring
// ============================================================

/**
 * Score the confidence level of a report section based on data quality,
 * data completeness, and the number of independent sources available.
 *
 * The intuition:
 * - Higher data quality and completeness directly increase confidence.
 * - More independent sources increase confidence with diminishing returns
 *   (modelled via a logarithmic source bonus).
 *
 * @param dataQuality     - Quality metric for the underlying data, 0-1.
 * @param dataCompleteness - Proportion of required data fields present, 0-1.
 * @param sourceCount     - Number of independent data sources used.
 * @returns Confidence score between 0 and 100.
 */
export function scoreSectionConfidence(
  dataQuality: number,
  dataCompleteness: number,
  sourceCount: number,
): number {
  // Clamp inputs to valid ranges
  const quality = clamp01(dataQuality);
  const completeness = clamp01(dataCompleteness);
  const sources = Math.max(0, Math.floor(sourceCount));

  // Base confidence from quality and completeness (equal weight, 0-70 range)
  const baseScore = (quality * 0.5 + completeness * 0.5) * 70;

  // Source diversity bonus: logarithmic scaling with diminishing returns
  // 1 source  -> ~0,   2 sources -> ~10,  3 -> ~16,  5 -> ~23,  8 -> ~30
  const sourceBonus =
    sources >= 1 ? Math.log2(sources) * (30 / Math.log2(8)) : 0;

  // Combine and clamp to 0-100
  const raw = baseScore + sourceBonus;
  const confidence = Math.round(Math.max(0, Math.min(100, raw)));

  return confidence;
}

// ============================================================
// Helpers
// ============================================================

/** Clamp a value to [0, 1]. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
