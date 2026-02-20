// ---------------------------------------------------------------------------
// OpportunityDeduplicator — 3-layer dedup to prevent duplicate opportunities
//
// Layer 1: Exact match on category + type + target_geo
// Layer 2: Semantic similarity via pgvector (threshold 0.88)
// Layer 3: Evidence overlap (>60% shared source signals)
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';
import type { GeneratedOpportunity } from './opportunity-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExistingOpportunity {
  id: string;
  title: string;
  category: string;
  type: string;
  target_geo: string;
  composite_score: number;
  source_signals: string[];
  score_history: Array<{ score: number; timestamp: string; signal_count: number }>;
  detection_count: number;
  embedding: number[] | null;
  status: string;
}

export interface DedupResult {
  action: 'create' | 'merge' | 'skip';
  opportunity: GeneratedOpportunity;
  existingId?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// OpportunityDeduplicator
// ---------------------------------------------------------------------------

export class OpportunityDeduplicator {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Deduplicate a batch of generated opportunities.
   * Returns actions for each: create, merge with existing, or skip.
   */
  async dedup(opportunities: GeneratedOpportunity[]): Promise<DedupResult[]> {
    const results: DedupResult[] = [];

    for (const opp of opportunities) {
      const result = await this.dedupOne(opp);
      results.push(result);
    }

    const created = results.filter((r) => r.action === 'create').length;
    const merged = results.filter((r) => r.action === 'merge').length;
    const skipped = results.filter((r) => r.action === 'skip').length;

    console.log(
      `[dedup] Processed ${opportunities.length} opportunities: ` +
      `${created} create, ${merged} merge, ${skipped} skip`,
    );

    return results;
  }

  /**
   * Execute merge for a dedup result marked as 'merge'.
   */
  async executeMerge(existingId: string, incoming: GeneratedOpportunity): Promise<void> {
    const { data: existing } = await this.supabase
      .from('opportunities')
      .select('*')
      .eq('id', existingId)
      .single();

    if (!existing) return;

    // Merge signals (deduplicated)
    const mergedSignals = [
      ...new Set([
        ...(existing.source_signals ?? []),
        ...(incoming.source_signals ?? []),
      ]),
    ];

    // Take highest score
    const newScore = Math.max(existing.composite_score ?? 0, incoming.composite_score);

    // Append to score history
    const scoreHistory = existing.score_history ?? [];
    scoreHistory.push({
      score: incoming.composite_score,
      timestamp: new Date().toISOString(),
      signal_count: incoming.source_signals.length,
    });

    // Merge evidence summaries
    const mergedEvidence = {
      ...(existing.evidence_summary ?? {}),
      latest_detection: incoming.evidence_summary,
    };

    await this.supabase
      .from('opportunities')
      .update({
        source_signals: mergedSignals,
        composite_score: newScore,
        score_history: scoreHistory,
        evidence_summary: mergedEvidence,
        last_detected_at: new Date().toISOString(),
        detection_count: (existing.detection_count ?? 1) + 1,
      })
      .eq('id', existingId);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async dedupOne(opp: GeneratedOpportunity): Promise<DedupResult> {
    // Layer 1: Exact match on category + type + target_geo
    const { data: exactMatches } = await this.supabase
      .from('opportunities')
      .select('id, title, category, type, target_geo, composite_score, source_signals, score_history, detection_count, status')
      .eq('category', opp.category)
      .eq('type', opp.type)
      .eq('target_geo', opp.target_geo ?? 'FR')
      .not('status', 'in', '("archived","dismissed")')
      .limit(5);

    if (exactMatches && exactMatches.length > 0) {
      const best = exactMatches[0] as ExistingOpportunity;
      return {
        action: 'merge',
        opportunity: opp,
        existingId: best.id,
        reason: `Exact match: same category "${opp.category}", type "${opp.type}", geo "${opp.target_geo}"`,
      };
    }

    // Layer 2: Semantic similarity via pgvector
    // Only if the incoming opportunity has an embedding
    if (opp.evidence_summary && Object.keys(opp.evidence_summary).length > 0) {
      // We'd need an embedding here — for now, skip if no embedding model is available
      // In production, generate embedding from title + description and call match_opportunities()
    }

    // Layer 3: Evidence overlap (>60% shared source signals)
    if (opp.source_signals.length > 0) {
      const { data: overlapping } = await this.supabase
        .from('opportunities')
        .select('id, title, source_signals, composite_score, detection_count, score_history, status')
        .not('status', 'in', '("archived","dismissed")')
        .overlaps('source_signals', opp.source_signals)
        .limit(10);

      if (overlapping && overlapping.length > 0) {
        for (const existing of overlapping) {
          const existingSignals = new Set(existing.source_signals ?? []);
          const incomingSignals = new Set(opp.source_signals);
          const intersection = [...incomingSignals].filter((s) => existingSignals.has(s));
          const overlapRatio = intersection.length / Math.max(existingSignals.size, 1);

          if (overlapRatio > 0.6) {
            return {
              action: 'merge',
              opportunity: opp,
              existingId: existing.id,
              reason: `Evidence overlap: ${Math.round(overlapRatio * 100)}% shared signals`,
            };
          }
        }
      }
    }

    // No match found — create new
    return {
      action: 'create',
      opportunity: opp,
    };
  }
}
