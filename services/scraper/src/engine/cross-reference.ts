// ---------------------------------------------------------------------------
// Cross-Referencing Engine — evaluates domain-specific crossing rules against
// accumulated signals to detect emergent opportunities.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';
import type { DetectedSignal, SignalType } from '../signals/base.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossingRule {
  name: string;
  description: string;
  conditions: CrossingCondition[];
}

export interface CrossingCondition {
  signal_type: SignalType;
  min_strength?: number;
  min_count?: number;
  time_window_days?: number;
}

export interface DomainProfile {
  id: string;
  name: string;
  signalWeights: Record<string, number>;
  crossingRules: CrossingRule[];
  categories: string[];
}

export interface CrossingMatch {
  rule: CrossingRule;
  domain: DomainProfile;
  category: string;
  matchedSignals: DetectedSignal[];
  confidence: number;
}

export interface EmergentPattern {
  type: 'temporal_convergence' | 'signal_acceleration';
  category: string;
  signals: DetectedSignal[];
  description: string;
  strength: number;
}

// ---------------------------------------------------------------------------
// Domain profiles (inline subset — in production, import from @repo/shared)
// ---------------------------------------------------------------------------

const DOMAIN_PROFILES: DomainProfile[] = [
  {
    id: 'fintech',
    name: 'Fintech',
    signalWeights: {
      product_launch: 0.05, funding_round: 0.15, traffic_spike: 0.05,
      review_surge: 0.05, community_buzz: 0.05, regulatory_event: 0.25,
      oss_traction: 0.03, company_registration: 0.07, pricing_change: 0.08,
      pain_point_cluster: 0.10, search_trend: 0.05, market_entry: 0.04, market_exit: 0.03,
    },
    crossingRules: [
      {
        name: 'regulatory_opportunity',
        description: 'New regulation + no FR solution + growing search demand',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 60 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
      {
        name: 'competitor_gap',
        description: 'US funding + no FR equivalent + pain points detected',
        conditions: [
          { signal_type: 'funding_round', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
    ],
    categories: ['payment_processing', 'banking', 'lending', 'invoicing', 'accounting'],
  },
  {
    id: 'devtools',
    name: 'Developer Tools',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.08, traffic_spike: 0.05,
      review_surge: 0.05, community_buzz: 0.12, regulatory_event: 0.02,
      oss_traction: 0.20, company_registration: 0.03, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.08, market_entry: 0.05, market_exit: 0.02,
    },
    crossingRules: [
      {
        name: 'oss_commercial_gap',
        description: 'Popular OSS tool + community demand + no hosted offering',
        conditions: [
          { signal_type: 'oss_traction', min_strength: 60 },
          { signal_type: 'community_buzz', min_strength: 40 },
        ],
      },
      {
        name: 'pain_point_opportunity',
        description: 'Developer pain + search demand + competitor weakness',
        conditions: [
          { signal_type: 'pain_point_cluster', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    categories: ['ci_cd', 'monitoring', 'testing', 'api_tools', 'databases', 'infrastructure'],
  },
  {
    id: 'general_saas',
    name: 'General SaaS',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.10, traffic_spike: 0.08,
      review_surge: 0.08, community_buzz: 0.08, regulatory_event: 0.05,
      oss_traction: 0.05, company_registration: 0.05, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.06, market_exit: 0.05,
    },
    crossingRules: [
      {
        name: 'geo_gap',
        description: 'Strong US product + growing search FR + no local player',
        conditions: [
          { signal_type: 'product_launch', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
      {
        name: 'convergence',
        description: 'Multiple signal types converging on same category',
        conditions: [
          { signal_type: 'community_buzz', min_strength: 30 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    categories: ['project_management', 'crm', 'marketing', 'analytics', 'collaboration', 'automation'],
  },
  {
    id: 'compliance_legal',
    name: 'Compliance & Legal',
    signalWeights: {
      product_launch: 0.05, funding_round: 0.08, traffic_spike: 0.03,
      review_surge: 0.05, community_buzz: 0.03, regulatory_event: 0.30,
      oss_traction: 0.02, company_registration: 0.08, pricing_change: 0.05,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.05, market_exit: 0.04,
    },
    crossingRules: [
      {
        name: 'forced_adoption',
        description: 'Mandatory regulation + no solution + company registrations in sector',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 70 },
          { signal_type: 'company_registration', min_strength: 30 },
        ],
      },
      {
        name: 'compliance_pain',
        description: 'Regulation complexity + pain points + search demand',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
    ],
    categories: ['gdpr', 'compliance', 'legal_ops', 'audit', 'risk_management'],
  },
];

// ---------------------------------------------------------------------------
// CrossReferenceEngine
// ---------------------------------------------------------------------------

export class CrossReferenceEngine {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Evaluate all crossing rules for a given category against recent signals.
   * Returns matched rules with their evidence.
   */
  async evaluateCrossingRules(
    category: string,
    timeWindowDays: number = 30,
  ): Promise<CrossingMatch[]> {
    const matches: CrossingMatch[] = [];
    const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);

    // Fetch recent signals for this category
    const { data: signals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('category', category)
      .gte('detected_at', cutoff.toISOString())
      .order('strength', { ascending: false });

    if (!signals || signals.length === 0) return [];

    // Get feedback-adjusted weights if available
    const weights = await this.getAdjustedWeights(category);

    // Check each domain's crossing rules
    for (const domain of DOMAIN_PROFILES) {
      if (!domain.categories.includes(category) && domain.id !== 'general_saas') {
        continue;
      }

      for (const rule of domain.crossingRules) {
        const matchResult = this.checkRule(rule, signals as DetectedSignal[], cutoff);
        if (matchResult) {
          // Compute confidence based on signal strengths and weights
          const confidence = this.computeConfidence(
            matchResult,
            weights ?? domain.signalWeights,
          );

          matches.push({
            rule,
            domain,
            category,
            matchedSignals: matchResult,
            confidence,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Detect emergent patterns across all categories:
   * - Temporal convergence: 3+ signal types in same category within 14 days
   * - Signal acceleration: frequency doubling compared to previous period
   */
  async detectEmergentPatterns(
    timeWindowDays: number = 14,
  ): Promise<EmergentPattern[]> {
    const patterns: EmergentPattern[] = [];
    const cutoff = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);
    const priorCutoff = new Date(cutoff.getTime() - timeWindowDays * 24 * 60 * 60 * 1000);

    // Fetch recent signals grouped by category
    const { data: recentSignals } = await this.supabase
      .from('signals')
      .select('*')
      .gte('detected_at', cutoff.toISOString())
      .order('detected_at', { ascending: false });

    if (!recentSignals || recentSignals.length === 0) return [];

    // Group by category
    const byCategory = new Map<string, typeof recentSignals>();
    for (const signal of recentSignals) {
      const cat = signal.category ?? 'uncategorized';
      const group = byCategory.get(cat) ?? [];
      group.push(signal);
      byCategory.set(cat, group);
    }

    // Check for temporal convergence
    for (const [category, signals] of byCategory) {
      const uniqueTypes = new Set(signals.map((s: { signal_type: string }) => s.signal_type));

      if (uniqueTypes.size >= 3) {
        const avgStrength = signals.reduce(
          (sum: number, s: { strength: number }) => sum + s.strength, 0,
        ) / signals.length;

        patterns.push({
          type: 'temporal_convergence',
          category,
          signals: signals as DetectedSignal[],
          description:
            `${uniqueTypes.size} different signal types detected in "${category}" ` +
            `within ${timeWindowDays} days: ${Array.from(uniqueTypes).join(', ')}`,
          strength: Math.min(100, Math.round(avgStrength * (uniqueTypes.size / 3))),
        });
      }
    }

    // Check for signal acceleration (compare current vs prior period)
    const { data: priorSignals } = await this.supabase
      .from('signals')
      .select('category, signal_type')
      .gte('detected_at', priorCutoff.toISOString())
      .lt('detected_at', cutoff.toISOString());

    if (priorSignals && priorSignals.length > 0) {
      const priorCounts = new Map<string, number>();
      for (const s of priorSignals) {
        const key = `${s.category}::${s.signal_type}`;
        priorCounts.set(key, (priorCounts.get(key) ?? 0) + 1);
      }

      for (const [category, signals] of byCategory) {
        const currentCounts = new Map<string, number>();
        for (const s of signals) {
          const key = `${category}::${s.signal_type}`;
          currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
        }

        for (const [key, currentCount] of currentCounts) {
          const priorCount = priorCounts.get(key) ?? 0;
          // Frequency doubling: current >= 2 * prior (with minimum threshold)
          if (priorCount >= 2 && currentCount >= priorCount * 2) {
            const [, signalType] = key.split('::');
            const relatedSignals = signals.filter(
              (s: { signal_type: string }) => s.signal_type === signalType,
            );

            patterns.push({
              type: 'signal_acceleration',
              category,
              signals: relatedSignals as DetectedSignal[],
              description:
                `Signal "${signalType}" in "${category}" accelerated from ` +
                `${priorCount} to ${currentCount} occurrences (${Math.round(currentCount / priorCount)}x increase)`,
              strength: Math.min(100, Math.round(50 + (currentCount / priorCount) * 15)),
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Run full cross-referencing: check all categories with recent signals.
   */
  async runFullCrossReference(): Promise<{
    crossingMatches: CrossingMatch[];
    emergentPatterns: EmergentPattern[];
  }> {
    // Get all categories that have recent signals
    const { data: categories } = await this.supabase
      .from('signals')
      .select('category')
      .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .not('category', 'is', null);

    const uniqueCategories = [...new Set((categories ?? []).map((c: { category: string }) => c.category))];

    // Evaluate crossing rules for each category
    const allMatches: CrossingMatch[] = [];
    for (const category of uniqueCategories) {
      const matches = await this.evaluateCrossingRules(category);
      allMatches.push(...matches);
    }

    // Detect emergent patterns
    const emergentPatterns = await this.detectEmergentPatterns();

    console.log(
      `[cross-reference] Found ${allMatches.length} crossing matches and ` +
      `${emergentPatterns.length} emergent patterns across ${uniqueCategories.length} categories`,
    );

    return { crossingMatches: allMatches, emergentPatterns };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private checkRule(
    rule: CrossingRule,
    signals: DetectedSignal[],
    cutoff: Date,
  ): DetectedSignal[] | null {
    const matched: DetectedSignal[] = [];

    for (const condition of rule.conditions) {
      const windowMs = (condition.time_window_days ?? 30) * 24 * 60 * 60 * 1000;
      const conditionCutoff = new Date(Date.now() - windowMs);
      const effectiveCutoff = conditionCutoff > cutoff ? conditionCutoff : cutoff;

      const matchingSignals = signals.filter(
        (s) =>
          s.signal_type === condition.signal_type &&
          (s.strength ?? 0) >= (condition.min_strength ?? 0) &&
          new Date(s.occurred_at) >= effectiveCutoff,
      );

      if (matchingSignals.length < (condition.min_count ?? 1)) {
        return null; // Rule not satisfied
      }

      matched.push(...matchingSignals);
    }

    return matched.length > 0 ? matched : null;
  }

  private computeConfidence(
    signals: DetectedSignal[],
    weights: Record<string, number>,
  ): number {
    if (signals.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = weights[signal.signal_type] ?? 0.05;
      weightedSum += signal.strength * weight;
      totalWeight += weight;
    }

    // Normalize to 0-100
    const base = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Bonus for signal diversity
    const uniqueTypes = new Set(signals.map((s) => s.signal_type)).size;
    const diversityBonus = Math.min(20, uniqueTypes * 5);

    return Math.min(100, Math.round(base + diversityBonus));
  }

  private async getAdjustedWeights(
    category: string,
  ): Promise<Record<string, number> | null> {
    // Check for user overrides first
    const { data: overrides } = await this.supabase
      .from('weight_overrides')
      .select('signal_type, user_weight');

    if (overrides && overrides.length > 0) {
      const weights: Record<string, number> = {};
      for (const o of overrides) {
        weights[o.signal_type] = o.user_weight;
      }
      return weights;
    }

    // Check for feedback-adjusted weights
    const { data: adjustments } = await this.supabase
      .from('weight_adjustments')
      .select('signal_type, direction, magnitude')
      .order('created_at', { ascending: true });

    if (!adjustments || adjustments.length === 0) return null;

    // Find the matching domain for this category
    const domain = DOMAIN_PROFILES.find((d) => d.categories.includes(category));
    if (!domain) return null;

    const weights = { ...domain.signalWeights };

    for (const adj of adjustments) {
      const current = weights[adj.signal_type] ?? 0.05;
      if (adj.direction === 'up') {
        weights[adj.signal_type] = Math.min(0.5, current * (1 + adj.magnitude));
      } else {
        weights[adj.signal_type] = Math.max(0.01, current * (1 - adj.magnitude));
      }
    }

    // Renormalize
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key of Object.keys(weights)) {
        weights[key]! /= sum;
      }
    }

    return weights;
  }
}
