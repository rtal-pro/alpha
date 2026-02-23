// ---------------------------------------------------------------------------
// Section confidence scoring tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { scoreSectionConfidence } from './section.js';

describe('scoreSectionConfidence', () => {
  it('returns 0 for zero quality and completeness with no sources', () => {
    const score = scoreSectionConfidence(0, 0, 0);
    expect(score).toBe(0);
  });

  it('returns a value between 0 and 100', () => {
    const score = scoreSectionConfidence(0.5, 0.5, 3);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('max quality + completeness with many sources approaches 100', () => {
    const score = scoreSectionConfidence(1, 1, 8);
    expect(score).toBe(100);
  });

  it('diminishing returns for source count', () => {
    const score1 = scoreSectionConfidence(0.8, 0.8, 1);
    const score2 = scoreSectionConfidence(0.8, 0.8, 2);
    const score4 = scoreSectionConfidence(0.8, 0.8, 4);
    const score8 = scoreSectionConfidence(0.8, 0.8, 8);

    // More sources = higher score
    expect(score2).toBeGreaterThan(score1);
    expect(score4).toBeGreaterThan(score2);
    expect(score8).toBeGreaterThan(score4);

    // Each additional doubling contributes less (logarithmic)
    const delta12 = score2 - score1;
    const delta24 = score4 - score2;
    const delta48 = score8 - score4;
    expect(delta12).toBeGreaterThanOrEqual(delta24);
    expect(delta24).toBeGreaterThanOrEqual(delta48);
  });

  it('1 source gives minimal bonus', () => {
    const noSources = scoreSectionConfidence(0.5, 0.5, 0);
    const oneSrc = scoreSectionConfidence(0.5, 0.5, 1);
    // 1 source: log2(1) = 0, so bonus is 0
    expect(oneSrc).toBe(noSources);
  });

  it('clamps quality and completeness to [0, 1]', () => {
    const normal = scoreSectionConfidence(1, 1, 3);
    const overInput = scoreSectionConfidence(2, 2, 3);
    expect(overInput).toBe(normal);
  });

  it('negative inputs are clamped to 0', () => {
    const score = scoreSectionConfidence(-0.5, -0.3, -2);
    expect(score).toBe(0);
  });

  it('quality and completeness have equal weight in base score', () => {
    const highQuality = scoreSectionConfidence(1, 0, 1);
    const highCompleteness = scoreSectionConfidence(0, 1, 1);
    expect(highQuality).toBe(highCompleteness);
  });

  it('returns integer values', () => {
    const score = scoreSectionConfidence(0.73, 0.85, 5);
    expect(Number.isInteger(score)).toBe(true);
  });
});
