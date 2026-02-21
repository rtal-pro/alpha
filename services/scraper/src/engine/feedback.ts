// ---------------------------------------------------------------------------
// FeedbackLoop — records user actions and adjusts signal weights.
//
// Every dismiss, save, explore, pursue adjusts the scoring system:
// - dismiss: -2% weight on signals that led to the opportunity
// - pursue: +5% weight on signals that led to the opportunity
// - Structural dismissals create category penalties (decay over 3 months)
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedbackType = 'dismiss' | 'save' | 'explore' | 'pursue' | 'archive';

type DismissReason =
  | 'market_too_small'
  | 'too_competitive'
  | 'not_my_expertise'
  | 'bad_timing'
  | 'already_exists_fr'
  | 'not_interesting'
  | 'too_complex'
  | 'wrong_category';

export interface FeedbackEvent {
  type: FeedbackType;
  opportunity_id: string;
  idea_id?: string;
  reason?: string;
  dismiss_category?: DismissReason;
}

const STATUS_MAP: Record<FeedbackType, string> = {
  dismiss: 'dismissed',
  save: 'saved',
  explore: 'exploring',
  pursue: 'pursued',
  archive: 'archived',
};

// Structural dismissal reasons that create category penalties
const STRUCTURAL_DISMISSALS: DismissReason[] = [
  'market_too_small',
  'already_exists_fr',
  'too_competitive',
];

// ---------------------------------------------------------------------------
// FeedbackLoop
// ---------------------------------------------------------------------------

export class FeedbackLoop {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Record a feedback event and trigger weight adjustments.
   */
  async recordFeedback(event: FeedbackEvent): Promise<void> {
    // 1. Store the feedback event
    await this.supabase.from('feedback_events').insert({
      type: event.type,
      opportunity_id: event.opportunity_id,
      idea_id: event.idea_id ?? null,
      reason: event.reason ?? null,
      dismiss_category: event.dismiss_category ?? null,
    });

    // 2. Update opportunity status
    await this.supabase
      .from('opportunities')
      .update({ status: STATUS_MAP[event.type] })
      .eq('id', event.opportunity_id);

    // 3. Adjust weights based on feedback type
    await this.adjustWeights(event);
  }

  /**
   * Get adjusted weights for a domain, applying all historical feedback.
   */
  async getAdjustedWeights(
    domainId: string,
    baseWeights: Record<string, number>,
  ): Promise<Record<string, number>> {
    const { data: adjustments } = await this.supabase
      .from('weight_adjustments')
      .select('*')
      .eq('domain_id', domainId)
      .order('created_at', { ascending: true });

    const weights = { ...baseWeights };

    if (adjustments) {
      for (const adj of adjustments) {
        const current = weights[adj.signal_type] ?? 0.05;
        if (adj.direction === 'up') {
          weights[adj.signal_type] = Math.min(0.5, current * (1 + adj.magnitude));
        } else {
          weights[adj.signal_type] = Math.max(0.01, current * (1 - adj.magnitude));
        }
      }
    }

    // Check for user overrides
    const { data: overrides } = await this.supabase
      .from('weight_overrides')
      .select('*')
      .eq('domain_id', domainId);

    if (overrides) {
      for (const override of overrides) {
        weights[override.signal_type] = override.user_weight;
      }
    }

    // Renormalize to sum to 1.0 (guard against all-zero weights)
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (const key of Object.keys(weights)) {
        weights[key]! /= sum;
      }
    } else {
      // All weights zeroed out — fall back to uniform distribution
      const count = Object.keys(weights).length;
      if (count > 0) {
        const uniform = 1 / count;
        for (const key of Object.keys(weights)) {
          weights[key] = uniform;
        }
      }
    }

    return weights;
  }

  /**
   * Apply category penalties to a score.
   * Penalties decay linearly over their TTL.
   */
  async applyPenalties(score: number, category: string): Promise<number> {
    const { data: penalties } = await this.supabase
      .from('category_penalties')
      .select('*')
      .eq('category', category)
      .gt('expires_at', new Date().toISOString());

    if (!penalties || penalties.length === 0) return score;

    let totalPenalty = 0;

    for (const penalty of penalties) {
      const created = new Date(penalty.created_at).getTime();
      const expires = new Date(penalty.expires_at).getTime();
      const now = Date.now();

      // Linear decay: full magnitude at creation, 0 at expiry
      const totalDuration = expires - created;
      const remaining = (expires - now) / totalDuration;
      totalPenalty += penalty.magnitude * Math.max(0, remaining);
    }

    // Cap total penalty at 50% — never fully suppress a category
    totalPenalty = Math.min(0.5, totalPenalty);

    // Ensure score never goes negative
    return Math.max(0, score * (1 - totalPenalty));
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async adjustWeights(event: FeedbackEvent): Promise<void> {
    // Get the opportunity to find its signals and category
    const { data: opp } = await this.supabase
      .from('opportunities')
      .select('category, source_signals')
      .eq('id', event.opportunity_id)
      .single();

    if (!opp) return;

    // Get signals that led to this opportunity
    const signalIds = opp.source_signals ?? [];
    if (signalIds.length === 0) return;

    const { data: signals } = await this.supabase
      .from('signals')
      .select('signal_type, strength')
      .in('id', signalIds);

    if (!signals || signals.length === 0) return;

    // Determine domain from category (simplified: use general_saas)
    const domainId = this.resolveDomain(opp.category);

    if (event.type === 'dismiss') {
      // Penalize signals: -2% per dismiss
      for (const signal of signals) {
        await this.supabase.from('weight_adjustments').insert({
          domain_id: domainId,
          signal_type: signal.signal_type,
          direction: 'down',
          magnitude: 0.02,
          reason: event.dismiss_category ?? 'dismissed',
          opportunity_id: event.opportunity_id,
        });
      }

      // Create category penalty for structural dismissals
      if (event.dismiss_category && STRUCTURAL_DISMISSALS.includes(event.dismiss_category)) {
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 3 months
        await this.supabase.from('category_penalties').insert({
          category: opp.category,
          penalty_type: event.dismiss_category,
          magnitude: 0.05,
          expires_at: expiresAt.toISOString(),
        });
      }
    }

    if (event.type === 'pursue') {
      // Boost signals: +5% per pursue
      for (const signal of signals) {
        await this.supabase.from('weight_adjustments').insert({
          domain_id: domainId,
          signal_type: signal.signal_type,
          direction: 'up',
          magnitude: 0.05,
          reason: 'pursued',
          opportunity_id: event.opportunity_id,
        });
      }
    }
  }

  private resolveDomain(category: string): string {
    const domainMap: Record<string, string> = {
      payment_processing: 'fintech', banking: 'fintech', lending: 'fintech',
      invoicing: 'fintech', accounting: 'fintech',
      ci_cd: 'devtools', monitoring: 'devtools', testing: 'devtools',
      api_tools: 'devtools', databases: 'devtools', infrastructure: 'devtools',
      gdpr: 'compliance_legal', compliance: 'compliance_legal',
      legal_ops: 'compliance_legal', audit: 'compliance_legal',
      recruitment: 'hr_workforce', payroll: 'hr_workforce',
      onboarding: 'hr_workforce', performance: 'hr_workforce',
      pos: 'restaurant_hospitality', reservations: 'restaurant_hospitality',
      storefront: 'ecommerce', fulfillment: 'ecommerce',
      lms: 'education', assessment: 'education',
      property_management: 'real_estate', listing: 'real_estate',
      telehealth: 'healthcare', ehr: 'healthcare',
    };
    return domainMap[category] ?? 'general_saas';
  }
}
