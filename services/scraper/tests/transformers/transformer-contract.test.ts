// ---------------------------------------------------------------------------
// Transformer contract tests — all 40 transformers tested against the shared interface
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { BaseTransformer, type NormalizedItem } from '../../src/transformers/base.js';
import type { RawScrapedItem } from '../../src/scrapers/base.js';
import { rawItemFactories } from '../fixtures/raw-items.js';

// --- Import all 40 transformers ---
import { RedditTransformer } from '../../src/transformers/reddit.js';
import { ProductHuntTransformer } from '../../src/transformers/producthunt.js';
import { GitHubTransformer } from '../../src/transformers/github.js';
import { HackerNewsTransformer } from '../../src/transformers/hackernews.js';
import { GoogleTrendsTransformer } from '../../src/transformers/google-trends.js';
import { EurLexTransformer } from '../../src/transformers/eurlex.js';
import { LegifranceTransformer } from '../../src/transformers/legifrance.js';
import { INSEETransformer } from '../../src/transformers/insee.js';
import { TwitterTransformer } from '../../src/transformers/twitter.js';
import { StackOverflowTransformer } from '../../src/transformers/stackoverflow.js';
import { IndieHackersTransformer } from '../../src/transformers/indiehackers.js';
import { GoogleAutocompleteTransformer } from '../../src/transformers/google-autocomplete.js';
import { G2Transformer } from '../../src/transformers/g2.js';
import { CapterraTransformer } from '../../src/transformers/capterra.js';
import { TrustpilotTransformer } from '../../src/transformers/trustpilot.js';
import { ShopifyAppsTransformer } from '../../src/transformers/shopify-apps.js';
import { ChromeWebStoreTransformer } from '../../src/transformers/chrome-webstore.js';
import { ZapierTransformer } from '../../src/transformers/zapier.js';
import { CrunchbaseTransformer } from '../../src/transformers/crunchbase.js';
import { SimilarWebTransformer } from '../../src/transformers/similarweb.js';
import { BuiltWithTransformer } from '../../src/transformers/builtwith.js';
import { DataGouvTransformer } from '../../src/transformers/data-gouv.js';
import { EUTedTransformer } from '../../src/transformers/eu-ted.js';
import { BOAMPTransformer } from '../../src/transformers/boamp.js';
import { JobBoardsTransformer } from '../../src/transformers/job-boards.js';
import { UpworkTransformer } from '../../src/transformers/upwork.js';
import { MaltTransformer } from '../../src/transformers/malt.js';
import { PricingTrackerTransformer } from '../../src/transformers/pricing-tracker.js';
import { BetaListTransformer } from '../../src/transformers/betalist.js';
import { AlternativeToTransformer } from '../../src/transformers/alternativeto.js';
import { AcquireTransformer } from '../../src/transformers/acquire.js';
import { WellfoundTransformer } from '../../src/transformers/wellfound.js';
import { DealroomTransformer } from '../../src/transformers/dealroom.js';
import { OpenStartupsTransformer } from '../../src/transformers/open-startups.js';
import { SaaSHubTransformer } from '../../src/transformers/saashub.js';
import { StarterStoryTransformer } from '../../src/transformers/starter-story.js';
import { AppSumoTransformer } from '../../src/transformers/appsumo.js';
import { YCombinatorTransformer } from '../../src/transformers/ycombinator.js';
import { PappersTransformer } from '../../src/transformers/pappers.js';
import { SerpAPISerpTransformer } from '../../src/transformers/serpapi-serp.js';

// ---------------------------------------------------------------------------
// Transformer registry
// ---------------------------------------------------------------------------

interface TransformerEntry {
  name: string;
  Ctor: new () => BaseTransformer;
  source: string;
}

const allTransformers: TransformerEntry[] = [
  { name: 'RedditTransformer', Ctor: RedditTransformer, source: 'reddit' },
  { name: 'ProductHuntTransformer', Ctor: ProductHuntTransformer, source: 'producthunt' },
  { name: 'GitHubTransformer', Ctor: GitHubTransformer, source: 'github' },
  { name: 'HackerNewsTransformer', Ctor: HackerNewsTransformer, source: 'hacker_news' },
  { name: 'GoogleTrendsTransformer', Ctor: GoogleTrendsTransformer, source: 'google_trends' },
  { name: 'EurLexTransformer', Ctor: EurLexTransformer, source: 'eurlex' },
  { name: 'LegifranceTransformer', Ctor: LegifranceTransformer, source: 'legifrance' },
  { name: 'INSEETransformer', Ctor: INSEETransformer, source: 'insee' },
  { name: 'TwitterTransformer', Ctor: TwitterTransformer, source: 'twitter' },
  { name: 'StackOverflowTransformer', Ctor: StackOverflowTransformer, source: 'stackoverflow' },
  { name: 'IndieHackersTransformer', Ctor: IndieHackersTransformer, source: 'indiehackers' },
  { name: 'GoogleAutocompleteTransformer', Ctor: GoogleAutocompleteTransformer, source: 'google_autocomplete' },
  { name: 'G2Transformer', Ctor: G2Transformer, source: 'serpapi_g2' },
  { name: 'CapterraTransformer', Ctor: CapterraTransformer, source: 'serpapi_capterra' },
  { name: 'TrustpilotTransformer', Ctor: TrustpilotTransformer, source: 'trustpilot' },
  { name: 'ShopifyAppsTransformer', Ctor: ShopifyAppsTransformer, source: 'shopify_apps' },
  { name: 'ChromeWebStoreTransformer', Ctor: ChromeWebStoreTransformer, source: 'chrome_webstore' },
  { name: 'ZapierTransformer', Ctor: ZapierTransformer, source: 'zapier' },
  { name: 'CrunchbaseTransformer', Ctor: CrunchbaseTransformer, source: 'crunchbase' },
  { name: 'SimilarWebTransformer', Ctor: SimilarWebTransformer, source: 'similarweb' },
  { name: 'BuiltWithTransformer', Ctor: BuiltWithTransformer, source: 'builtwith' },
  { name: 'DataGouvTransformer', Ctor: DataGouvTransformer, source: 'data_gouv' },
  { name: 'EUTedTransformer', Ctor: EUTedTransformer, source: 'eu_ted' },
  { name: 'BOAMPTransformer', Ctor: BOAMPTransformer, source: 'boamp' },
  { name: 'JobBoardsTransformer', Ctor: JobBoardsTransformer, source: 'job_boards' },
  { name: 'UpworkTransformer', Ctor: UpworkTransformer, source: 'upwork' },
  { name: 'MaltTransformer', Ctor: MaltTransformer, source: 'malt' },
  { name: 'PricingTrackerTransformer', Ctor: PricingTrackerTransformer, source: 'pricing_tracker' },
  { name: 'BetaListTransformer', Ctor: BetaListTransformer, source: 'betalist' },
  { name: 'AlternativeToTransformer', Ctor: AlternativeToTransformer, source: 'alternativeto' },
  { name: 'AcquireTransformer', Ctor: AcquireTransformer, source: 'acquire' },
  { name: 'WellfoundTransformer', Ctor: WellfoundTransformer, source: 'wellfound' },
  { name: 'DealroomTransformer', Ctor: DealroomTransformer, source: 'dealroom' },
  { name: 'OpenStartupsTransformer', Ctor: OpenStartupsTransformer, source: 'open_startups' },
  { name: 'SaaSHubTransformer', Ctor: SaaSHubTransformer, source: 'saashub' },
  { name: 'StarterStoryTransformer', Ctor: StarterStoryTransformer, source: 'starter_story' },
  { name: 'AppSumoTransformer', Ctor: AppSumoTransformer, source: 'appsumo' },
  { name: 'YCombinatorTransformer', Ctor: YCombinatorTransformer, source: 'ycombinator' },
  { name: 'PappersTransformer', Ctor: PappersTransformer, source: 'pappers' },
  { name: 'SerpAPISerpTransformer', Ctor: SerpAPISerpTransformer, source: 'serpapi_serp' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidNormalizedItem(item: unknown): item is NormalizedItem {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.source === 'string' &&
    typeof obj.externalId === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.metrics === 'object' && obj.metrics !== null &&
    Array.isArray(obj.categories) &&
    obj.scrapedAt instanceof Date
  );
}

function makeForeignItem(): RawScrapedItem {
  return {
    source: '__foreign_source__',
    entityId: 'foreign_123',
    url: 'https://example.com/foreign',
    payload: { title: 'Foreign item' },
    format: 'foreign_v1',
    scrapedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe('Transformer contract tests', () => {
  // =========================================================================
  // Static contract
  // =========================================================================
  describe.each(allTransformers)('$name — static contract', ({ Ctor, source }) => {
    it('extends BaseTransformer', () => {
      const transformer = new Ctor();
      expect(transformer).toBeInstanceOf(BaseTransformer);
    });

    it('has non-empty source', () => {
      const transformer = new Ctor();
      expect(transformer.source.length).toBeGreaterThan(0);
    });

    it(`has source="${source}"`, () => {
      const transformer = new Ctor();
      expect(transformer.source).toBe(source);
    });

    it('has transform() function', () => {
      const transformer = new Ctor();
      expect(typeof transformer.transform).toBe('function');
    });
  });

  // =========================================================================
  // Runtime contract: transform valid fixtures
  // =========================================================================
  describe.each(allTransformers)('$name — runtime', ({ Ctor, source }) => {
    it('transform() returns NormalizedItem[] with valid shape', () => {
      const transformer = new Ctor();
      const factory = rawItemFactories[source];
      if (!factory) {
        // Skip if no fixture factory exists for this source
        return;
      }

      const rawItems = [factory()];
      const result = transformer.transform(rawItems);

      expect(Array.isArray(result)).toBe(true);

      for (const item of result) {
        expect(isValidNormalizedItem(item)).toBe(true);
        expect(typeof item.source).toBe('string');
        expect(typeof item.externalId).toBe('string');
        expect(typeof item.title).toBe('string');
        expect(typeof item.metrics).toBe('object');
        // Verify metrics values are numbers
        for (const [key, value] of Object.entries(item.metrics)) {
          expect(typeof key).toBe('string');
          expect(typeof value).toBe('number');
        }
        expect(Array.isArray(item.categories)).toBe(true);
        expect(item.scrapedAt).toBeInstanceOf(Date);
      }
    });

    it('source field matches transformer source', () => {
      const transformer = new Ctor();
      const factory = rawItemFactories[source];
      if (!factory) return;

      const result = transformer.transform([factory()]);
      for (const item of result) {
        expect(item.source).toBe(source);
      }
    });

    it('empty input returns empty output', () => {
      const transformer = new Ctor();
      const result = transformer.transform([]);
      expect(result).toEqual([]);
    });

    it('foreign-source items are filtered out', () => {
      const transformer = new Ctor();
      const result = transformer.transform([makeForeignItem()]);
      expect(result.length).toBe(0);
    });
  });

  // =========================================================================
  // Coverage: all 40 transformers registered
  // =========================================================================
  describe('registry completeness', () => {
    it('has exactly 40 transformers registered', () => {
      expect(allTransformers.length).toBe(40);
    });

    it('all sources are unique', () => {
      const sources = allTransformers.map((t) => t.source);
      expect(new Set(sources).size).toBe(sources.length);
    });

    it('every transformer has a matching fixture factory', () => {
      for (const { source } of allTransformers) {
        expect(rawItemFactories[source]).toBeDefined();
      }
    });
  });
});
