// ---------------------------------------------------------------------------
// Dedup logic tests — Jaccard similarity and evidence overlap
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Extract the Jaccard similarity logic for unit testing
// (same algorithm used in OpportunityDeduplicator Layer 3)
// ---------------------------------------------------------------------------

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1; // both empty = identical
  const intersection = [...setA].filter((x) => setB.has(x));
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize > 0 ? intersection.length / unionSize : 0;
}

function shouldMerge(
  existingSignals: string[],
  incomingSignals: string[],
  threshold = 0.5,
): boolean {
  const existing = new Set(existingSignals);
  const incoming = new Set(incomingSignals);
  return jaccardSimilarity(existing, incoming) > threshold;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Jaccard similarity', () => {
  it('identical sets have similarity = 1', () => {
    const a = new Set(['sig1', 'sig2', 'sig3']);
    const b = new Set(['sig1', 'sig2', 'sig3']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it('disjoint sets have similarity = 0', () => {
    const a = new Set(['sig1', 'sig2']);
    const b = new Set(['sig3', 'sig4']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('partial overlap produces value between 0 and 1', () => {
    const a = new Set(['sig1', 'sig2', 'sig3']);
    const b = new Set(['sig2', 'sig3', 'sig4']);
    // intersection: {sig2, sig3} = 2, union: {sig1,sig2,sig3,sig4} = 4
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  it('one set contained in the other', () => {
    const a = new Set(['sig1', 'sig2', 'sig3']);
    const b = new Set(['sig1', 'sig2']);
    // intersection: 2, union: 3
    expect(jaccardSimilarity(a, b)).toBeCloseTo(2 / 3, 5);
  });

  it('both empty sets return 1', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it('one empty, one non-empty returns 0', () => {
    const a = new Set<string>();
    const b = new Set(['sig1']);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it('single element match', () => {
    const a = new Set(['sig1']);
    const b = new Set(['sig1']);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it('is symmetric', () => {
    const a = new Set(['sig1', 'sig2', 'sig3']);
    const b = new Set(['sig3', 'sig4', 'sig5']);
    expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
  });
});

describe('shouldMerge (evidence overlap)', () => {
  it('merges when overlap > threshold', () => {
    expect(shouldMerge(
      ['sig1', 'sig2', 'sig3'],
      ['sig1', 'sig2', 'sig3', 'sig4'],
      0.5,
    )).toBe(true);
  });

  it('does not merge when overlap <= threshold', () => {
    expect(shouldMerge(
      ['sig1', 'sig2'],
      ['sig3', 'sig4', 'sig5'],
      0.5,
    )).toBe(false);
  });

  it('does not merge disjoint signals', () => {
    expect(shouldMerge(
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    )).toBe(false);
  });

  it('merges identical signals', () => {
    expect(shouldMerge(
      ['sig1', 'sig2'],
      ['sig1', 'sig2'],
    )).toBe(true);
  });

  it('exact threshold boundary — exactly 0.5 does not merge (strict >)', () => {
    // 2 shared out of 4 total = 0.5 exactly
    expect(shouldMerge(
      ['sig1', 'sig2', 'sig3'],
      ['sig2', 'sig3', 'sig4'],
      0.5,
    )).toBe(false); // 2/4 = 0.5, not > 0.5
  });

  it('respects custom threshold', () => {
    // 1 shared out of 3 = 0.33
    expect(shouldMerge(
      ['sig1', 'sig2'],
      ['sig2', 'sig3'],
      0.3,
    )).toBe(true); // 1/3 = 0.33 > 0.3
  });
});
