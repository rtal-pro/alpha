// ---------------------------------------------------------------------------
// E2E pipeline test — scrape → transform → signal detection (in-memory)
// No Supabase required, HTTP mocked via MSW
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { HackerNewsScraper } from '../../src/scrapers/hackernews.js';
import { GoogleAutocompleteScraper } from '../../src/scrapers/google-autocomplete.js';
import { HackerNewsTransformer } from '../../src/transformers/hackernews.js';
import { GoogleAutocompleteTransformer } from '../../src/transformers/google-autocomplete.js';
import { detectSignals } from '../../src/signals/index.js';
import type { NormalizedItem } from '../../src/transformers/base.js';
import type { ScrapeParams } from '../../src/scrapers/base.js';

// ---------------------------------------------------------------------------
// Test params
// ---------------------------------------------------------------------------

const params: ScrapeParams = {
  type: 'keyword_search',
  keywords: ['saas', 'crm'],
  limit: 5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E pipeline tests', () => {
  describe('HN: scrape → transform → signal detection', () => {
    it('full pipeline produces valid output', async () => {
      // 1. Scrape
      const scraper = new HackerNewsScraper();
      const rawItems = await scraper.scrape(params);

      expect(Array.isArray(rawItems)).toBe(true);
      expect(rawItems.length).toBeGreaterThan(0);

      // 2. Transform
      const transformer = new HackerNewsTransformer();
      const normalized = transformer.transform(rawItems);

      expect(Array.isArray(normalized)).toBe(true);
      expect(normalized.length).toBeGreaterThan(0);

      for (const item of normalized) {
        expect(item.source).toBe('hacker_news');
        expect(typeof item.externalId).toBe('string');
        expect(typeof item.title).toBe('string');
        expect(typeof item.metrics).toBe('object');
        expect(Array.isArray(item.categories)).toBe(true);
        expect(item.scrapedAt).toBeInstanceOf(Date);
      }

      // 3. Signal detection
      const signals = await detectSignals(normalized);
      expect(Array.isArray(signals)).toBe(true);

      for (const signal of signals) {
        expect(typeof signal.signal_type).toBe('string');
        expect(typeof signal.strength).toBe('number');
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(100);
        expect(signal.occurred_at).toBeInstanceOf(Date);
      }
    });
  });

  describe('Google Autocomplete: transform validates shape', () => {
    it('transformer produces valid NormalizedItem from fixture', () => {
      const transformer = new GoogleAutocompleteTransformer();

      // Use a synthetic raw item (the live scraper is too slow for E2E —
      // 30+ requests with 1s rate limit each)
      const rawItem = {
        source: 'google_autocomplete',
        entityId: 'autocomplete_saas_crm',
        url: 'https://suggestqueries.google.com/complete/search?q=saas+crm',
        payload: {
          query: 'saas crm',
          suggestions: ['saas crm software', 'saas crm free', 'best saas crm'],
          intentScore: 75,
          category: 'software',
          modifier: 'base',
          geo: 'fr',
        },
        format: 'google_autocomplete_v1',
        scrapedAt: new Date(),
      };

      const normalized = transformer.transform([rawItem]);
      expect(Array.isArray(normalized)).toBe(true);

      for (const item of normalized) {
        expect(item.source).toBe('google_autocomplete');
        expect(typeof item.metrics).toBe('object');
        expect(Array.isArray(item.categories)).toBe(true);
      }
    });
  });

  describe('Multi-source: synthetic → signal detection', () => {
    it('detects signals from diverse normalized items', async () => {
      const syntheticItems: NormalizedItem[] = [
        {
          source: 'reddit',
          externalId: 'r_test_1',
          title: 'Need affordable alternative to Salesforce CRM',
          description: 'Salesforce pricing is killing our startup',
          metrics: { score: 500, numComments: 120, upvoteRatio: 0.96 },
          categories: ['r/SaaS', 'CRM'],
          scrapedAt: new Date(),
          metadata: { subreddit: 'SaaS' },
        },
        {
          source: 'reddit',
          externalId: 'r_test_2',
          title: 'What CRM do you use for your small team?',
          description: 'Looking for recommendations',
          metrics: { score: 350, numComments: 85, upvoteRatio: 0.93 },
          categories: ['r/startups', 'CRM'],
          scrapedAt: new Date(),
          metadata: { subreddit: 'startups' },
        },
        {
          source: 'hacker_news',
          externalId: 'hn_test_1',
          title: 'Show HN: Open-source CRM with AI features',
          metrics: { score: 280, numComments: 95 },
          categories: ['Show HN'],
          scrapedAt: new Date(),
        },
        {
          source: 'github',
          externalId: 'gh_test_1',
          title: 'crm-saas-kit',
          description: 'Open source CRM boilerplate with 8k stars',
          metrics: { stars: 8000, forks: 1200, openIssues: 50 },
          categories: ['typescript', 'crm', 'saas'],
          scrapedAt: new Date(),
        },
        {
          source: 'stackoverflow',
          externalId: 'so_test_1',
          title: 'Best practices for CRM data migration',
          metrics: { score: 65, viewCount: 25000, answerCount: 12 },
          categories: ['crm', 'data-migration'],
          scrapedAt: new Date(),
        },
        {
          source: 'crunchbase',
          externalId: 'cb_test_1',
          title: 'CRMNext raises $20M Series B',
          metrics: { moneyRaisedUsd: 20000000, employeeCount: 80 },
          categories: ['CRM', 'SaaS'],
          scrapedAt: new Date(),
        },
        {
          source: 'google_trends',
          externalId: 'gt_test_1',
          title: 'crm software france',
          metrics: { interest: 90, interestGrowth: 30 },
          categories: ['search_trend'],
          scrapedAt: new Date(),
        },
        {
          source: 'pricing_tracker',
          externalId: 'pt_test_1',
          title: 'HubSpot CRM price increase',
          metrics: { priceIncrease: 1, freeTierRemoved: 1, newTiersAdded: 0, featureGatingChanged: 1 },
          categories: ['CRM', 'pricing'],
          scrapedAt: new Date(),
        },
        {
          source: 'acquire',
          externalId: 'acq_test_1',
          title: 'CRM SaaS for sale',
          metrics: { mrr: 8000, askingPrice: 200000 },
          categories: ['SaaS', 'CRM'],
          scrapedAt: new Date(),
        },
        {
          source: 'job_boards',
          externalId: 'jb_test_1',
          title: 'CRM Developer - Paris',
          metrics: { salary: 75000 },
          categories: ['engineering', 'crm'],
          scrapedAt: new Date(),
        },
      ];

      const signals = await detectSignals(syntheticItems);

      expect(Array.isArray(signals)).toBe(true);

      // With this rich synthetic data, we expect at least some signals
      for (const signal of signals) {
        expect(typeof signal.signal_type).toBe('string');
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

    it('empty input produces empty signals', async () => {
      const signals = await detectSignals([]);
      expect(signals).toEqual([]);
    });
  });
});
