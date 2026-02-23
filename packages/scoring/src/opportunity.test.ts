// ---------------------------------------------------------------------------
// Opportunity scoring tests
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import {
  scoreOpportunity,
  scoreOpportunityEnhanced,
  OPPORTUNITY_WEIGHTS,
  type OpportunitySignals,
  type EnhancedOpportunitySignals,
} from './opportunity.js';

describe('scoreOpportunity', () => {
  it('returns a CompositeScore with all fields', () => {
    const signals: OpportunitySignals = {
      growthSignalStrength: 80,
      competitionDensity: 30,
      regulatoryTrigger: 60,
      geoGapSize: 50,
      feasibilityScore: 90,
    };

    const result = scoreOpportunity(signals);

    expect(result).toHaveProperty('composite');
    expect(result).toHaveProperty('growth');
    expect(result).toHaveProperty('competition');
    expect(result).toHaveProperty('regulatory');
    expect(result).toHaveProperty('geoGap');
    expect(result).toHaveProperty('feasibility');
  });

  it('composite is between 0 and 100', () => {
    const signals: OpportunitySignals = {
      growthSignalStrength: 50,
      competitionDensity: 50,
      regulatoryTrigger: 50,
      geoGapSize: 50,
      feasibilityScore: 50,
    };

    const result = scoreOpportunity(signals);
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });

  it('all sub-scores are between 0 and 100', () => {
    const signals: OpportunitySignals = {
      growthSignalStrength: 75,
      competitionDensity: 20,
      regulatoryTrigger: 60,
      geoGapSize: 80,
      feasibilityScore: 90,
    };

    const result = scoreOpportunity(signals);
    expect(result.growth).toBeGreaterThanOrEqual(0);
    expect(result.growth).toBeLessThanOrEqual(100);
    expect(result.competition).toBeGreaterThanOrEqual(0);
    expect(result.competition).toBeLessThanOrEqual(100);
    expect(result.regulatory).toBeGreaterThanOrEqual(0);
    expect(result.regulatory).toBeLessThanOrEqual(100);
    expect(result.geoGap).toBeGreaterThanOrEqual(0);
    expect(result.geoGap).toBeLessThanOrEqual(100);
    expect(result.feasibility).toBeGreaterThanOrEqual(0);
    expect(result.feasibility).toBeLessThanOrEqual(100);
  });

  it('inverts competition density (low density = high score)', () => {
    const lowCompetition = scoreOpportunity({
      growthSignalStrength: 50,
      competitionDensity: 10,
      regulatoryTrigger: 50,
      geoGapSize: 50,
      feasibilityScore: 50,
    });

    const highCompetition = scoreOpportunity({
      growthSignalStrength: 50,
      competitionDensity: 90,
      regulatoryTrigger: 50,
      geoGapSize: 50,
      feasibilityScore: 50,
    });

    expect(lowCompetition.competition).toBeGreaterThan(highCompetition.competition);
    expect(lowCompetition.composite).toBeGreaterThan(highCompetition.composite);
  });

  it('clamps values below 0 to 0', () => {
    const result = scoreOpportunity({
      growthSignalStrength: -20,
      competitionDensity: -10,
      regulatoryTrigger: -5,
      geoGapSize: -30,
      feasibilityScore: -50,
    });

    expect(result.growth).toBe(0);
    expect(result.regulatory).toBe(0);
    expect(result.geoGap).toBe(0);
    expect(result.feasibility).toBe(0);
  });

  it('clamps values above 100 to 100', () => {
    const result = scoreOpportunity({
      growthSignalStrength: 150,
      competitionDensity: 0,
      regulatoryTrigger: 200,
      geoGapSize: 120,
      feasibilityScore: 300,
    });

    expect(result.growth).toBe(100);
    expect(result.competition).toBe(100);
    expect(result.regulatory).toBe(100);
    expect(result.geoGap).toBe(100);
    expect(result.feasibility).toBe(100);
  });

  it('perfect scores produce composite = 100', () => {
    const result = scoreOpportunity({
      growthSignalStrength: 100,
      competitionDensity: 0,
      regulatoryTrigger: 100,
      geoGapSize: 100,
      feasibilityScore: 100,
    });

    expect(result.composite).toBe(100);
  });

  it('zero scores produce composite = 0', () => {
    const result = scoreOpportunity({
      growthSignalStrength: 0,
      competitionDensity: 100,
      regulatoryTrigger: 0,
      geoGapSize: 0,
      feasibilityScore: 0,
    });

    expect(result.composite).toBe(0);
  });
});

describe('OPPORTUNITY_WEIGHTS', () => {
  it('weight sum equals 1.0', () => {
    const sum = Object.values(OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('all weights are positive', () => {
    for (const weight of Object.values(OPPORTUNITY_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
    }
  });

  it('has exactly 5 factors', () => {
    expect(Object.keys(OPPORTUNITY_WEIGHTS).length).toBe(5);
  });
});

describe('scoreOpportunityEnhanced', () => {
  const baseSignals: EnhancedOpportunitySignals = {
    growthSignalStrength: 70,
    competitionDensity: 30,
    regulatoryTrigger: 50,
    geoGapSize: 60,
    feasibilityScore: 80,
  };

  it('returns all base fields plus enhanced fields', () => {
    const result = scoreOpportunityEnhanced(baseSignals);

    expect(result).toHaveProperty('composite');
    expect(result).toHaveProperty('rawComposite');
    expect(result).toHaveProperty('recencyMultiplier');
    expect(result).toHaveProperty('velocityBonus');
    expect(result).toHaveProperty('diversityBonus');
    expect(result).toHaveProperty('confidence');
  });

  it('recency multiplier is between 0.5 and 1.0', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTimestamps: [new Date(), new Date(Date.now() - 86400000)],
    });

    expect(result.recencyMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(result.recencyMultiplier).toBeLessThanOrEqual(1.0);
  });

  it('recent signals produce higher recency multiplier', () => {
    const recent = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTimestamps: [new Date()],
    });

    const old = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTimestamps: [new Date(Date.now() - 90 * 86400000)],
    });

    expect(recent.recencyMultiplier).toBeGreaterThan(old.recencyMultiplier);
  });

  it('velocity bonus is 0 with no score history', () => {
    const result = scoreOpportunityEnhanced(baseSignals);
    expect(result.velocityBonus).toBe(0);
  });

  it('velocity bonus is 0 with single history entry', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      scoreHistory: [{ score: 50, timestamp: new Date().toISOString() }],
    });
    expect(result.velocityBonus).toBe(0);
  });

  it('velocity bonus is positive with increasing scores', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      scoreHistory: [
        { score: 30, timestamp: new Date(Date.now() - 7 * 86400000).toISOString() },
        { score: 60, timestamp: new Date().toISOString() },
      ],
    });
    expect(result.velocityBonus).toBeGreaterThan(0);
  });

  it('velocity bonus caps at 15', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      scoreHistory: [
        { score: 0, timestamp: new Date(Date.now() - 86400000).toISOString() },
        { score: 100, timestamp: new Date().toISOString() },
      ],
    });
    expect(result.velocityBonus).toBeLessThanOrEqual(15);
  });

  it('diversity bonus increases with more signal types', () => {
    const lowDiversity = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTypeDiversity: 1,
      sourceDiversity: 1,
    });

    const highDiversity = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTypeDiversity: 4,
      sourceDiversity: 3,
    });

    expect(highDiversity.diversityBonus).toBeGreaterThan(lowDiversity.diversityBonus);
  });

  it('diversity bonus caps at 12', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTypeDiversity: 10,
      sourceDiversity: 10,
    });
    expect(result.diversityBonus).toBeLessThanOrEqual(12);
  });

  it('confidence scales with signal count and diversity', () => {
    const lowConfidence = scoreOpportunityEnhanced({
      ...baseSignals,
      signalCount: 1,
      signalTypeDiversity: 1,
      sourceDiversity: 1,
    });

    const highConfidence = scoreOpportunityEnhanced({
      ...baseSignals,
      signalCount: 8,
      signalTypeDiversity: 3,
      sourceDiversity: 3,
    });

    expect(highConfidence.confidence).toBeGreaterThan(lowConfidence.confidence);
  });

  it('enhanced composite is between 0 and 100', () => {
    const result = scoreOpportunityEnhanced({
      ...baseSignals,
      signalTimestamps: [new Date()],
      signalTypeDiversity: 3,
      sourceDiversity: 2,
      signalCount: 5,
      scoreHistory: [
        { score: 40, timestamp: new Date(Date.now() - 86400000).toISOString() },
        { score: 70, timestamp: new Date().toISOString() },
      ],
    });

    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });
});
