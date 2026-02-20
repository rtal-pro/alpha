// ---------------------------------------------------------------------------
// Intelligence Pipeline — orchestrates the full analysis cycle:
//
// 1. Run signal detection on recent normalized data
// 2. Run cross-referencing engine
// 3. Generate opportunities from 4 paths + crossing matches
// 4. Deduplicate against existing opportunities
// 5. Apply feedback penalties
// 6. Persist new opportunities and merge existing ones
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';
import { detectSignals, type DetectedSignal } from '../signals/index.js';
import { CrossReferenceEngine } from './cross-reference.js';
import { OpportunityGenerator, type GeneratedOpportunity } from './opportunity-generator.js';
import { OpportunityDeduplicator } from './dedup.js';
import { FeedbackLoop } from './feedback.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  signalsDetected: number;
  crossingMatches: number;
  emergentPatterns: number;
  opportunitiesGenerated: number;
  opportunitiesCreated: number;
  opportunitiesMerged: number;
  opportunitiesSkipped: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// IntelligencePipeline
// ---------------------------------------------------------------------------

export class IntelligencePipeline {
  private supabase: SupabaseClient;
  private crossRef: CrossReferenceEngine;
  private generator: OpportunityGenerator;
  private dedup: OpportunityDeduplicator;
  private feedback: FeedbackLoop;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.crossRef = new CrossReferenceEngine();
    this.generator = new OpportunityGenerator();
    this.dedup = new OpportunityDeduplicator();
    this.feedback = new FeedbackLoop();
  }

  /**
   * Run the full intelligence pipeline.
   */
  async run(): Promise<PipelineResult> {
    const start = Date.now();
    console.log('[pipeline] Starting intelligence pipeline...');

    // 1. Detect signals from recent normalized data
    const signals = await this.detectNewSignals();
    console.log(`[pipeline] Step 1: Detected ${signals.length} new signals`);

    // 2. Persist signals to database
    await this.persistSignals(signals);

    // 3. Run cross-referencing engine
    const { crossingMatches, emergentPatterns } = await this.crossRef.runFullCrossReference();
    console.log(
      `[pipeline] Step 3: ${crossingMatches.length} crossing matches, ` +
      `${emergentPatterns.length} emergent patterns`,
    );

    // 4. Generate opportunities from all sources
    const fromPaths = await this.generator.generateAll();
    const fromCrossRef = this.generator.fromCrossReferences(crossingMatches, emergentPatterns);
    const allCandidates = [...fromPaths, ...fromCrossRef];
    console.log(`[pipeline] Step 4: ${allCandidates.length} opportunity candidates`);

    // 5. Apply feedback penalties
    const penalized = await this.applyPenalties(allCandidates);

    // 6. Deduplicate
    const dedupResults = await this.dedup.dedup(penalized);

    // 7. Persist: create new, merge existing
    let created = 0;
    let merged = 0;
    let skipped = 0;

    const toCreate: GeneratedOpportunity[] = [];

    for (const result of dedupResults) {
      if (result.action === 'create') {
        toCreate.push(result.opportunity);
      } else if (result.action === 'merge' && result.existingId) {
        await this.dedup.executeMerge(result.existingId, result.opportunity);
        merged++;
      } else {
        skipped++;
      }
    }

    const createdIds = await this.generator.persist(toCreate);
    created = createdIds.length;

    const durationMs = Date.now() - start;

    const result: PipelineResult = {
      signalsDetected: signals.length,
      crossingMatches: crossingMatches.length,
      emergentPatterns: emergentPatterns.length,
      opportunitiesGenerated: allCandidates.length,
      opportunitiesCreated: created,
      opportunitiesMerged: merged,
      opportunitiesSkipped: skipped,
      durationMs,
    };

    console.log(
      `[pipeline] Complete in ${durationMs}ms: ` +
      `${created} created, ${merged} merged, ${skipped} skipped`,
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async detectNewSignals(): Promise<DetectedSignal[]> {
    // Get recent normalized data that hasn't been signal-checked yet
    // For now, use product_metrics as a proxy for "recently normalized"
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const { data: recentProducts } = await this.supabase
      .from('products')
      .select('id, canonical_name, primary_category, description, tags')
      .gte('last_updated_at', cutoff.toISOString())
      .limit(200);

    if (!recentProducts || recentProducts.length === 0) return [];

    // Convert to NormalizedItem format for signal detectors
    const items = recentProducts.map((p: Record<string, unknown>) => ({
      source: 'reddit' as const, // Will be enriched when we have source tracking
      externalId: p['id'] as string,
      title: p['canonical_name'] as string,
      description: (p['description'] as string) ?? undefined,
      url: undefined,
      metrics: {},
      categories: [p['primary_category'] as string, ...((p['tags'] as string[]) ?? [])],
      scrapedAt: new Date(),
    }));

    return detectSignals(items);
  }

  private async persistSignals(signals: DetectedSignal[]): Promise<void> {
    if (signals.length === 0) return;

    const rows = signals.map((s) => ({
      signal_type: s.signal_type,
      category: s.category,
      title: s.title,
      description: s.description,
      strength: s.strength,
      geo_relevance: s.geo_relevance,
      source: s.source,
      source_url: s.source_url ?? null,
      occurred_at: s.occurred_at.toISOString(),
      product_id: s.product_id ?? null,
      raw_event_id: s.raw_event_id ?? null,
    }));

    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await this.supabase.from('signals').insert(batch);
      if (error) {
        console.error(`[pipeline] Signal insert error:`, error.message);
      }
    }
  }

  private async applyPenalties(
    opportunities: GeneratedOpportunity[],
  ): Promise<GeneratedOpportunity[]> {
    const result: GeneratedOpportunity[] = [];

    for (const opp of opportunities) {
      const penalizedScore = await this.feedback.applyPenalties(
        opp.composite_score,
        opp.category,
      );

      result.push({
        ...opp,
        composite_score: Math.round(penalizedScore),
      });
    }

    return result;
  }
}
