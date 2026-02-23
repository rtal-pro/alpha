// ---------------------------------------------------------------------------
// Data quality scoring tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  scoreFreshness,
  scoreCompleteness,
  scoreDataQuality,
  MAX_AGE_HOURS,
  type DataQualityInput,
} from './data-quality.js';

describe('scoreFreshness', () => {
  it('returns 1 for just-scraped data', () => {
    const score = scoreFreshness(new Date(), 'reddit');
    expect(score).toBeCloseTo(1, 1);
  });

  it('returns 0 for data older than max age', () => {
    const maxAge = MAX_AGE_HOURS['reddit']!; // 24h
    const oldDate = new Date(Date.now() - (maxAge + 1) * 60 * 60 * 1000);
    const score = scoreFreshness(oldDate, 'reddit');
    expect(score).toBe(0);
  });

  it('returns value between 0 and 1 for data within max age', () => {
    const maxAge = MAX_AGE_HOURS['reddit']!;
    const halfAgeDate = new Date(Date.now() - (maxAge / 2) * 60 * 60 * 1000);
    const score = scoreFreshness(halfAgeDate, 'reddit');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(score).toBeCloseTo(0.5, 1);
  });

  it('uses source-specific max age', () => {
    const now = new Date();
    const age36h = new Date(Date.now() - 36 * 60 * 60 * 1000);

    // Reddit has 24h max age — 36h old data should be stale (0)
    const redditScore = scoreFreshness(age36h, 'reddit');
    expect(redditScore).toBe(0);

    // GitHub has 48h max age — 36h old data should still be fresh
    const githubScore = scoreFreshness(age36h, 'github');
    expect(githubScore).toBeGreaterThan(0);
  });

  it('uses default max age for unknown sources', () => {
    const score = scoreFreshness(new Date(), 'unknown_source');
    expect(score).toBeCloseTo(1, 1);
  });

  it('handles future dates gracefully (returns 1)', () => {
    const futureDate = new Date(Date.now() + 3600000);
    const score = scoreFreshness(futureDate, 'reddit');
    expect(score).toBe(1);
  });
});

describe('scoreCompleteness', () => {
  it('returns 1 when all required fields are present', () => {
    const data = { name: 'Test', url: 'https://example.com', score: 5 };
    const score = scoreCompleteness(data, ['name', 'url', 'score']);
    expect(score).toBe(1);
  });

  it('returns 0 when no required fields are present', () => {
    const data = { unrelated: 'field' };
    const score = scoreCompleteness(data, ['name', 'url', 'score']);
    expect(score).toBe(0);
  });

  it('returns proportional score for partial completeness', () => {
    const data = { name: 'Test', url: null, score: undefined };
    const score = scoreCompleteness(data, ['name', 'url', 'score']);
    expect(score).toBeCloseTo(1 / 3, 2);
  });

  it('returns 1 for empty required fields list', () => {
    const score = scoreCompleteness({}, []);
    expect(score).toBe(1);
  });

  it('treats null and undefined as missing', () => {
    const data = { a: null, b: undefined, c: 'present' };
    const score = scoreCompleteness(data, ['a', 'b', 'c']);
    expect(score).toBeCloseTo(1 / 3, 2);
  });

  it('treats zero and empty string as present', () => {
    const data = { a: 0, b: '', c: false };
    const score = scoreCompleteness(data, ['a', 'b', 'c']);
    expect(score).toBe(1);
  });
});

describe('scoreDataQuality', () => {
  it('returns all zeroes for empty input', () => {
    const result = scoreDataQuality([], ['name']);
    expect(result.freshness).toBe(0);
    expect(result.completeness).toBe(0);
    expect(result.reliability).toBe(0);
    expect(result.relevance).toBe(0);
    expect(result.composite).toBe(0);
  });

  it('returns all fields in the result', () => {
    const items: DataQualityInput[] = [{
      scrapedAt: new Date(),
      source: 'reddit',
      data: { name: 'Test', url: 'https://example.com' },
    }];

    const result = scoreDataQuality(items, ['name', 'url']);
    expect(result).toHaveProperty('freshness');
    expect(result).toHaveProperty('completeness');
    expect(result).toHaveProperty('reliability');
    expect(result).toHaveProperty('relevance');
    expect(result).toHaveProperty('composite');
  });

  it('fresh complete data from reliable source scores high', () => {
    const items: DataQualityInput[] = [{
      scrapedAt: new Date(),
      source: 'eurlex', // 0.99 reliability
      data: { name: 'Test', url: 'https://example.com' },
    }];

    const result = scoreDataQuality(items, ['name', 'url']);
    expect(result.freshness).toBeGreaterThan(0.9);
    expect(result.completeness).toBe(1);
    expect(result.reliability).toBeGreaterThan(0.9);
    expect(result.composite).toBeGreaterThan(0.7);
  });

  it('composite is weighted: 0.25*fresh + 0.25*complete + 0.3*reliability + 0.2*relevance', () => {
    const items: DataQualityInput[] = [{
      scrapedAt: new Date(),
      source: 'reddit',
      data: { name: 'Test' },
    }];

    const result = scoreDataQuality(items, ['name']);

    // Verify composite is in valid range
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
  });

  it('all scores are between 0 and 1', () => {
    const items: DataQualityInput[] = [
      { scrapedAt: new Date(), source: 'reddit', data: { name: 'A' } },
      { scrapedAt: new Date(Date.now() - 86400000 * 30), source: 'github', data: {} },
    ];

    const result = scoreDataQuality(items, ['name', 'url']);
    expect(result.freshness).toBeGreaterThanOrEqual(0);
    expect(result.freshness).toBeLessThanOrEqual(1);
    expect(result.completeness).toBeGreaterThanOrEqual(0);
    expect(result.completeness).toBeLessThanOrEqual(1);
    expect(result.reliability).toBeGreaterThanOrEqual(0);
    expect(result.reliability).toBeLessThanOrEqual(1);
    expect(result.relevance).toBeGreaterThanOrEqual(0);
    expect(result.relevance).toBeLessThanOrEqual(1);
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
  });
});
