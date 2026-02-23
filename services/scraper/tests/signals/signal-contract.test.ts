// ---------------------------------------------------------------------------
// Signal detector contract tests — all 12 detectors tested against interface
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  BaseSignalDetector,
  type DetectedSignal,
  type NormalizedItem,
  type SignalType,
  type ScrapeSource,
  detectSignals,
  getRegisteredDetectors,
} from '../../src/signals/index.js';
import { CommunityDemandDetector } from '../../src/signals/community-demand.js';
import { PainPointClusterDetector } from '../../src/signals/pain-point.js';
import { SearchTrendSurgeDetector } from '../../src/signals/search-trend-surge.js';
import { OSSCommercialGapDetector } from '../../src/signals/oss-commercial-gap.js';
import { PricingFrustrationDetector } from '../../src/signals/pricing-frustration.js';
import { TalentDemandDetector } from '../../src/signals/talent-demand.js';
import { APIDeprecationDetector } from '../../src/signals/api-deprecation.js';
import { FundingSurgeDetector } from '../../src/signals/funding-surge.js';
import { RegulatoryDeadlineDetector } from '../../src/signals/regulatory-deadline.js';
import { MarketConsolidationDetector } from '../../src/signals/market-consolidation.js';
import { EmergingTechAdoptionDetector } from '../../src/signals/emerging-tech-adoption.js';
import { SaaSExitDetector } from '../../src/signals/saas-exit-detector.js';

// ---------------------------------------------------------------------------
// Detector registry
// ---------------------------------------------------------------------------

interface DetectorEntry {
  name: string;
  Ctor: new () => BaseSignalDetector;
}

const allDetectors: DetectorEntry[] = [
  { name: 'CommunityDemandDetector', Ctor: CommunityDemandDetector },
  { name: 'PainPointClusterDetector', Ctor: PainPointClusterDetector },
  { name: 'SearchTrendSurgeDetector', Ctor: SearchTrendSurgeDetector },
  { name: 'OSSCommercialGapDetector', Ctor: OSSCommercialGapDetector },
  { name: 'PricingFrustrationDetector', Ctor: PricingFrustrationDetector },
  { name: 'TalentDemandDetector', Ctor: TalentDemandDetector },
  { name: 'APIDeprecationDetector', Ctor: APIDeprecationDetector },
  { name: 'FundingSurgeDetector', Ctor: FundingSurgeDetector },
  { name: 'RegulatoryDeadlineDetector', Ctor: RegulatoryDeadlineDetector },
  { name: 'MarketConsolidationDetector', Ctor: MarketConsolidationDetector },
  { name: 'EmergingTechAdoptionDetector', Ctor: EmergingTechAdoptionDetector },
  { name: 'SaaSExitDetector', Ctor: SaaSExitDetector },
];

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_SIGNAL_TYPES: Set<string> = new Set([
  'product_launch', 'funding_round', 'traffic_spike', 'review_surge',
  'community_buzz', 'regulatory_event', 'oss_traction', 'company_registration',
  'pricing_change', 'pain_point_cluster', 'search_trend', 'market_entry', 'market_exit',
  'api_deprecation', 'funding_surge', 'regulatory_deadline',
  'market_consolidation', 'emerging_tech_adoption',
]);

function makeSampleItems(): NormalizedItem[] {
  return [
    {
      source: 'reddit',
      externalId: 'r_123',
      title: 'Looking for a CRM alternative to Salesforce',
      description: 'Salesforce is too expensive. Need affordable CRM for small team.',
      url: 'https://reddit.com/r/SaaS/123',
      metrics: { score: 300, numComments: 80, upvoteRatio: 0.95 },
      categories: ['r/SaaS', 'CRM'],
      scrapedAt: new Date(),
      metadata: { subreddit: 'SaaS', author: 'testuser' },
    },
    {
      source: 'hacker_news',
      externalId: 'hn_456',
      title: 'Show HN: Open-source CRM built with Next.js',
      metrics: { score: 200, numComments: 65 },
      categories: ['Show HN'],
      scrapedAt: new Date(),
    },
    {
      source: 'github',
      externalId: 'gh_789',
      title: 'awesome-crm',
      description: 'An open-source CRM platform with 5k stars',
      metrics: { stars: 5000, forks: 800, openIssues: 120 },
      categories: ['typescript', 'crm'],
      scrapedAt: new Date(),
    },
    {
      source: 'google_trends',
      externalId: 'gt_crm',
      title: 'crm software',
      metrics: { interest: 85, interestGrowth: 25 },
      categories: ['search_trend'],
      scrapedAt: new Date(),
    },
    {
      source: 'crunchbase',
      externalId: 'cb_001',
      title: 'NewCRM Inc',
      description: 'Next-gen CRM startup',
      metrics: { moneyRaisedUsd: 10000000, employeeCount: 50 },
      categories: ['CRM', 'SaaS'],
      scrapedAt: new Date(),
    },
    {
      source: 'stackoverflow',
      externalId: 'so_222',
      title: 'How to integrate CRM with billing?',
      metrics: { score: 45, viewCount: 15000, answerCount: 8 },
      categories: ['saas', 'billing', 'crm'],
      scrapedAt: new Date(),
    },
    {
      source: 'job_boards',
      externalId: 'jb_333',
      title: 'Senior CRM Engineer',
      metrics: { salary: 85000 },
      categories: ['engineering', 'crm'],
      scrapedAt: new Date(),
    },
    {
      source: 'acquire',
      externalId: 'acq_444',
      title: 'CRM SaaS for sale - $5k MRR',
      metrics: { mrr: 5000, askingPrice: 150000 },
      categories: ['SaaS', 'CRM'],
      scrapedAt: new Date(),
    },
    {
      source: 'eurlex',
      externalId: 'eu_555',
      title: 'Data Protection Regulation Amendment',
      description: 'New requirements for CRM data handling',
      metrics: {},
      categories: ['regulation', 'data_protection'],
      scrapedAt: new Date(),
    },
    {
      source: 'pricing_tracker',
      externalId: 'pt_666',
      title: 'Salesforce Price Increase Detected',
      metrics: { priceIncrease: 1, freeTierRemoved: 1, newTiersAdded: 0, featureGatingChanged: 1 },
      categories: ['CRM', 'pricing'],
      scrapedAt: new Date(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe('Signal detector contract tests', () => {
  // =========================================================================
  // Static contract
  // =========================================================================
  describe.each(allDetectors)('$name — static contract', ({ Ctor }) => {
    it('extends BaseSignalDetector', () => {
      const detector = new Ctor();
      expect(detector).toBeInstanceOf(BaseSignalDetector);
    });

    it('has non-empty name', () => {
      const detector = new Ctor();
      expect(detector.name.length).toBeGreaterThan(0);
    });

    it('has signalTypes array with valid types', () => {
      const detector = new Ctor();
      expect(Array.isArray(detector.signalTypes)).toBe(true);
      expect(detector.signalTypes.length).toBeGreaterThan(0);
      for (const type of detector.signalTypes) {
        expect(VALID_SIGNAL_TYPES.has(type)).toBe(true);
      }
    });

    it('has supportedSources array', () => {
      const detector = new Ctor();
      expect(Array.isArray(detector.supportedSources)).toBe(true);
      expect(detector.supportedSources.length).toBeGreaterThan(0);
    });

    it('has detect() function', () => {
      const detector = new Ctor();
      expect(typeof detector.detect).toBe('function');
    });
  });

  // =========================================================================
  // Runtime contract
  // =========================================================================
  describe.each(allDetectors)('$name — runtime', ({ Ctor }) => {
    it('detect() returns DetectedSignal[] with valid shape', async () => {
      const detector = new Ctor();
      const items = makeSampleItems();
      const signals = await detector.detect(items);

      expect(Array.isArray(signals)).toBe(true);

      for (const signal of signals) {
        expect(VALID_SIGNAL_TYPES.has(signal.signal_type)).toBe(true);
        expect(typeof signal.title).toBe('string');
        expect(typeof signal.description).toBe('string');
        expect(typeof signal.strength).toBe('number');
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(100);
        expect(typeof signal.category).toBe('string');
        expect(Array.isArray(signal.geo_relevance)).toBe(true);
        expect(signal.occurred_at).toBeInstanceOf(Date);
        expect(typeof signal.evidence).toBe('object');
      }
    });

    it('detect() returns empty array for empty input', async () => {
      const detector = new Ctor();
      const signals = await detector.detect([]);
      expect(signals).toEqual([]);
    });
  });

  // =========================================================================
  // Registry tests
  // =========================================================================
  describe('detector registry', () => {
    it('has 12 detectors registered', () => {
      expect(allDetectors.length).toBe(12);
    });

    it('getRegisteredDetectors() returns all detectors', () => {
      const registered = getRegisteredDetectors();
      expect(registered.length).toBe(12);
      for (const d of registered) {
        expect(typeof d.name).toBe('string');
        expect(Array.isArray(d.signalTypes)).toBe(true);
        expect(Array.isArray(d.supportedSources)).toBe(true);
      }
    });

    it('detectSignals() aggregates results from all detectors', async () => {
      const items = makeSampleItems();
      const signals = await detectSignals(items);

      expect(Array.isArray(signals)).toBe(true);
      // At least some detectors should fire given the rich test data
      // (but we can't guarantee all will, so just check shape)
      for (const signal of signals) {
        expect(VALID_SIGNAL_TYPES.has(signal.signal_type)).toBe(true);
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(100);
      }
    });
  });
});
