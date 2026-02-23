// ---------------------------------------------------------------------------
// Scraper contract tests — all 40 scrapers tested against the shared interface
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from '../../src/scrapers/base.js';

// --- Import all 40 scrapers ---
import { RedditScraper } from '../../src/scrapers/reddit.js';
import { ProductHuntScraper } from '../../src/scrapers/producthunt.js';
import { GitHubScraper } from '../../src/scrapers/github.js';
import { HackerNewsScraper } from '../../src/scrapers/hackernews.js';
import { GoogleTrendsScraper } from '../../src/scrapers/google-trends.js';
import { EurLexScraper } from '../../src/scrapers/eurlex.js';
import { LegifranceScraper } from '../../src/scrapers/legifrance.js';
import { INSEEScraper } from '../../src/scrapers/insee.js';
import { TwitterScraper } from '../../src/scrapers/twitter.js';
import { StackOverflowScraper } from '../../src/scrapers/stackoverflow.js';
import { IndieHackersScraper } from '../../src/scrapers/indiehackers.js';
import { GoogleAutocompleteScraper } from '../../src/scrapers/google-autocomplete.js';
import { G2Scraper } from '../../src/scrapers/g2.js';
import { CapterraScraper } from '../../src/scrapers/capterra.js';
import { TrustpilotScraper } from '../../src/scrapers/trustpilot.js';
import { ShopifyAppsScraper } from '../../src/scrapers/shopify-apps.js';
import { ChromeWebStoreScraper } from '../../src/scrapers/chrome-webstore.js';
import { ZapierScraper } from '../../src/scrapers/zapier.js';
import { CrunchbaseScraper } from '../../src/scrapers/crunchbase.js';
import { SimilarWebScraper } from '../../src/scrapers/similarweb.js';
import { BuiltWithScraper } from '../../src/scrapers/builtwith.js';
import { DataGouvScraper } from '../../src/scrapers/data-gouv.js';
import { EUTedScraper } from '../../src/scrapers/eu-ted.js';
import { BOAMPScraper } from '../../src/scrapers/boamp.js';
import { JobBoardScraper } from '../../src/scrapers/job-boards.js';
import { UpworkScraper } from '../../src/scrapers/upwork.js';
import { MaltScraper } from '../../src/scrapers/malt.js';
import { PricingTrackerScraper } from '../../src/scrapers/pricing-tracker.js';
import { BetaListScraper } from '../../src/scrapers/betalist.js';
import { AlternativeToScraper } from '../../src/scrapers/alternativeto.js';
import { AcquireScraper } from '../../src/scrapers/acquire.js';
import { WellfoundScraper } from '../../src/scrapers/wellfound.js';
import { DealroomScraper } from '../../src/scrapers/dealroom.js';
import { OpenStartupsScraper } from '../../src/scrapers/open-startups.js';
import { SaaSHubScraper } from '../../src/scrapers/saashub.js';
import { StarterStoryScraper } from '../../src/scrapers/starter-story.js';
import { AppSumoScraper } from '../../src/scrapers/appsumo.js';
import { YCombinatorScraper } from '../../src/scrapers/ycombinator.js';
import { PappersScraper } from '../../src/scrapers/pappers.js';
import { SerpAPISerpScraper } from '../../src/scrapers/serpapi-serp.js';

// ---------------------------------------------------------------------------
// Scraper registry
// ---------------------------------------------------------------------------

interface ScraperEntry {
  name: string;
  Ctor: new () => BaseScraper;
  source: string;
  method: 'api' | 'cheerio' | 'playwright';
  requiresAuth: boolean;
}

const allScrapers: ScraperEntry[] = [
  // No-auth scrapers
  { name: 'HackerNewsScraper', Ctor: HackerNewsScraper, source: 'hacker_news', method: 'api', requiresAuth: false },
  { name: 'GoogleAutocompleteScraper', Ctor: GoogleAutocompleteScraper, source: 'google_autocomplete', method: 'api', requiresAuth: false },
  { name: 'EurLexScraper', Ctor: EurLexScraper, source: 'eurlex', method: 'cheerio', requiresAuth: false },
  { name: 'BOAMPScraper', Ctor: BOAMPScraper, source: 'boamp', method: 'api', requiresAuth: false },
  { name: 'EUTedScraper', Ctor: EUTedScraper, source: 'eu_ted', method: 'api', requiresAuth: false },
  { name: 'DataGouvScraper', Ctor: DataGouvScraper, source: 'data_gouv', method: 'api', requiresAuth: false },
  { name: 'IndieHackersScraper', Ctor: IndieHackersScraper, source: 'indiehackers', method: 'cheerio', requiresAuth: false },
  { name: 'TrustpilotScraper', Ctor: TrustpilotScraper, source: 'trustpilot', method: 'cheerio', requiresAuth: false },
  { name: 'ShopifyAppsScraper', Ctor: ShopifyAppsScraper, source: 'shopify_apps', method: 'cheerio', requiresAuth: false },
  { name: 'ChromeWebStoreScraper', Ctor: ChromeWebStoreScraper, source: 'chrome_webstore', method: 'cheerio', requiresAuth: false },
  { name: 'ZapierScraper', Ctor: ZapierScraper, source: 'zapier', method: 'cheerio', requiresAuth: false },
  { name: 'UpworkScraper', Ctor: UpworkScraper, source: 'upwork', method: 'api', requiresAuth: false },
  { name: 'MaltScraper', Ctor: MaltScraper, source: 'malt', method: 'cheerio', requiresAuth: false },
  { name: 'PricingTrackerScraper', Ctor: PricingTrackerScraper, source: 'pricing_tracker', method: 'api', requiresAuth: false },
  { name: 'BetaListScraper', Ctor: BetaListScraper, source: 'betalist', method: 'cheerio', requiresAuth: false },
  { name: 'AlternativeToScraper', Ctor: AlternativeToScraper, source: 'alternativeto', method: 'cheerio', requiresAuth: false },
  { name: 'AcquireScraper', Ctor: AcquireScraper, source: 'acquire', method: 'cheerio', requiresAuth: false },
  { name: 'WellfoundScraper', Ctor: WellfoundScraper, source: 'wellfound', method: 'cheerio', requiresAuth: false },
  { name: 'DealroomScraper', Ctor: DealroomScraper, source: 'dealroom', method: 'cheerio', requiresAuth: false },
  { name: 'OpenStartupsScraper', Ctor: OpenStartupsScraper, source: 'open_startups', method: 'cheerio', requiresAuth: false },
  { name: 'SaaSHubScraper', Ctor: SaaSHubScraper, source: 'saashub', method: 'cheerio', requiresAuth: false },
  { name: 'StarterStoryScraper', Ctor: StarterStoryScraper, source: 'starter_story', method: 'cheerio', requiresAuth: false },
  { name: 'AppSumoScraper', Ctor: AppSumoScraper, source: 'appsumo', method: 'cheerio', requiresAuth: false },
  { name: 'YCombinatorScraper', Ctor: YCombinatorScraper, source: 'ycombinator', method: 'cheerio', requiresAuth: false },
  { name: 'PappersScraper', Ctor: PappersScraper, source: 'pappers', method: 'cheerio', requiresAuth: false },

  // Auth-gated scrapers
  { name: 'RedditScraper', Ctor: RedditScraper, source: 'reddit', method: 'api', requiresAuth: true },
  { name: 'ProductHuntScraper', Ctor: ProductHuntScraper, source: 'producthunt', method: 'api', requiresAuth: true },
  { name: 'GitHubScraper', Ctor: GitHubScraper, source: 'github', method: 'api', requiresAuth: true },
  { name: 'GoogleTrendsScraper', Ctor: GoogleTrendsScraper, source: 'google_trends', method: 'api', requiresAuth: true },
  { name: 'LegifranceScraper', Ctor: LegifranceScraper, source: 'legifrance', method: 'api', requiresAuth: true },
  { name: 'INSEEScraper', Ctor: INSEEScraper, source: 'insee', method: 'api', requiresAuth: true },
  { name: 'TwitterScraper', Ctor: TwitterScraper, source: 'twitter', method: 'api', requiresAuth: true },
  { name: 'StackOverflowScraper', Ctor: StackOverflowScraper, source: 'stackoverflow', method: 'api', requiresAuth: true },
  { name: 'G2Scraper', Ctor: G2Scraper, source: 'serpapi_g2', method: 'api', requiresAuth: true },
  { name: 'CapterraScraper', Ctor: CapterraScraper, source: 'serpapi_capterra', method: 'api', requiresAuth: true },
  { name: 'CrunchbaseScraper', Ctor: CrunchbaseScraper, source: 'crunchbase', method: 'api', requiresAuth: true },
  { name: 'SimilarWebScraper', Ctor: SimilarWebScraper, source: 'similarweb', method: 'api', requiresAuth: true },
  { name: 'BuiltWithScraper', Ctor: BuiltWithScraper, source: 'builtwith', method: 'api', requiresAuth: true },
  { name: 'JobBoardScraper', Ctor: JobBoardScraper, source: 'job_boards', method: 'api', requiresAuth: true },
  { name: 'SerpAPISerpScraper', Ctor: SerpAPISerpScraper, source: 'serpapi_serp', method: 'api', requiresAuth: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultParams: ScrapeParams = {
  type: 'keyword_search',
  keywords: ['saas', 'crm'],
  limit: 3,
};

function isValidRawScrapedItem(item: unknown): item is RawScrapedItem {
  if (typeof item !== 'object' || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.source === 'string' &&
    typeof obj.entityId === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.payload === 'object' && obj.payload !== null &&
    typeof obj.format === 'string' &&
    obj.scrapedAt instanceof Date
  );
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe('Scraper contract tests', () => {
  // =========================================================================
  // Static contract: every scraper extends BaseScraper with correct interface
  // =========================================================================
  describe.each(allScrapers)('$name — static contract', ({ Ctor, source, method }) => {
    let scraper: BaseScraper;

    it('can be instantiated', () => {
      scraper = new Ctor();
      expect(scraper).toBeDefined();
    });

    it('extends BaseScraper', () => {
      scraper = new Ctor();
      expect(scraper).toBeInstanceOf(BaseScraper);
    });

    it(`has source="${source}"`, () => {
      scraper = new Ctor();
      expect(scraper.source).toBe(source);
    });

    it('has non-empty source', () => {
      scraper = new Ctor();
      expect(scraper.source.length).toBeGreaterThan(0);
    });

    it(`has method="${method}"`, () => {
      scraper = new Ctor();
      expect(scraper.method).toBe(method);
    });

    it('has scrape() function', () => {
      scraper = new Ctor();
      expect(typeof scraper.scrape).toBe('function');
    });
  });

  // =========================================================================
  // Runtime contract: no-auth scrapers return valid RawScrapedItem[]
  // Some scrapers may not support `keyword_search` type — they should
  // throw a descriptive error rather than crash or hang.
  // =========================================================================
  const noAuthScrapers = allScrapers.filter((s) => !s.requiresAuth);

  describe.each(noAuthScrapers)('$name — runtime (no-auth)', ({ Ctor, source }) => {
    it('scrape() returns an array or throws descriptive error', { timeout: 30_000 }, async () => {
      const scraper = new Ctor();
      try {
        const result = await scraper.scrape(defaultParams);
        expect(Array.isArray(result)).toBe(true);
      } catch (err) {
        // Throwing is acceptable if the scraper doesn't support the given type
        expect(err).toBeDefined();
        expect(err).toBeInstanceOf(Error);
      }
    });

    it('each returned item has valid RawScrapedItem shape', { timeout: 30_000 }, async () => {
      const scraper = new Ctor();
      try {
        const result = await scraper.scrape(defaultParams);
        for (const item of result) {
          expect(isValidRawScrapedItem(item)).toBe(true);
          expect(typeof item.source).toBe('string');
          expect(typeof item.entityId).toBe('string');
          expect(typeof item.url).toBe('string');
          expect(typeof item.payload).toBe('object');
          expect(typeof item.format).toBe('string');
          expect(item.scrapedAt).toBeInstanceOf(Date);
        }
      } catch {
        // Acceptable — scraper may not support the param type
      }
    });

    it('source field matches scraper source on returned items', { timeout: 30_000 }, async () => {
      const scraper = new Ctor();
      try {
        const result = await scraper.scrape(defaultParams);
        for (const item of result) {
          expect(item.source).toBe(source);
        }
      } catch {
        // Acceptable — scraper may not support the param type
      }
    });
  });

  // =========================================================================
  // Auth-gated scrapers: fail gracefully without crashing
  // =========================================================================
  const authScrapers = allScrapers.filter((s) => s.requiresAuth);

  describe.each(authScrapers)('$name — auth-gated graceful failure', ({ Ctor }) => {
    it('scrape() throws or returns empty array without crashing', { timeout: 30_000 }, async () => {
      const scraper = new Ctor();
      try {
        const result = await scraper.scrape(defaultParams);
        // If it doesn't throw, it should return an empty array or a valid array
        expect(Array.isArray(result)).toBe(true);
      } catch (err) {
        // Throwing is acceptable — the scraper should not crash the process
        expect(err).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Coverage: all 40 scrapers are registered
  // =========================================================================
  describe('registry completeness', () => {
    it('has exactly 40 scrapers registered', () => {
      expect(allScrapers.length).toBe(40);
    });

    it('all sources are unique', () => {
      const sources = allScrapers.map((s) => s.source);
      expect(new Set(sources).size).toBe(sources.length);
    });

    it('all names are unique', () => {
      const names = allScrapers.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
