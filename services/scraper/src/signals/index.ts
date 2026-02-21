// ---------------------------------------------------------------------------
// Signal detection registry — run all detectors against normalized items
// ---------------------------------------------------------------------------

import { BaseSignalDetector, type DetectedSignal, type NormalizedItem } from './base.js';
import { CommunityDemandDetector } from './community-demand.js';
import { PainPointClusterDetector } from './pain-point.js';
import { SearchTrendSurgeDetector } from './search-trend-surge.js';
import { OSSCommercialGapDetector } from './oss-commercial-gap.js';
import { PricingFrustrationDetector } from './pricing-frustration.js';
import { TalentDemandDetector } from './talent-demand.js';
import { APIDeprecationDetector } from './api-deprecation.js';
import { FundingSurgeDetector } from './funding-surge.js';
import { RegulatoryDeadlineDetector } from './regulatory-deadline.js';
import { MarketConsolidationDetector } from './market-consolidation.js';
import { EmergingTechAdoptionDetector } from './emerging-tech-adoption.js';

// Re-export types
export type { DetectedSignal, NormalizedItem, SignalType, ScrapeSource } from './base.js';
export { BaseSignalDetector } from './base.js';

// ---------------------------------------------------------------------------
// Detector registry
// ---------------------------------------------------------------------------

const detectors: BaseSignalDetector[] = [
  new CommunityDemandDetector(),
  new PainPointClusterDetector(),
  new SearchTrendSurgeDetector(),
  new OSSCommercialGapDetector(),
  new PricingFrustrationDetector(),
  new TalentDemandDetector(),
  new APIDeprecationDetector(),
  new FundingSurgeDetector(),
  new RegulatoryDeadlineDetector(),
  new MarketConsolidationDetector(),
  new EmergingTechAdoptionDetector(),
];

/**
 * Run all registered signal detectors against a set of normalized items.
 * Returns all detected signals from all detectors.
 */
export async function detectSignals(items: NormalizedItem[]): Promise<DetectedSignal[]> {
  const results = await Promise.allSettled(
    detectors.map((detector) => detector.detect(items)),
  );

  const signals: DetectedSignal[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const detector = detectors[i]!;

    if (result.status === 'fulfilled') {
      signals.push(...result.value);
    } else {
      console.error(
        `[signals] Detector "${detector.name}" failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason,
      );
    }
  }

  return signals;
}

/**
 * Get all registered detectors (for health checks, diagnostics).
 */
export function getRegisteredDetectors(): { name: string; signalTypes: string[]; supportedSources: string[] }[] {
  return detectors.map((d) => ({
    name: d.name,
    signalTypes: [...d.signalTypes],
    supportedSources: [...d.supportedSources],
  }));
}
