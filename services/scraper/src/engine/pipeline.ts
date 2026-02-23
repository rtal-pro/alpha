// ---------------------------------------------------------------------------
// Intelligence Pipeline — orchestrates the full analysis cycle:
//
// 1. Run signal detection on recent normalized data
// 2. Persist signals to database
// 3. Run cross-referencing engine
// 4. Generate opportunities from 4 paths + crossing matches
// 5. Apply feedback penalties
// 6. LLM enrichment (quality filter + actionable insights)
// 7. Deduplicate against existing opportunities
// 8. Persist new opportunities and merge existing ones
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';
import { detectSignals, type DetectedSignal } from '../signals/index.js';
import { CrossReferenceEngine } from './cross-reference.js';
import { OpportunityGenerator, type GeneratedOpportunity } from './opportunity-generator.js';
import { OpportunityDeduplicator } from './dedup.js';
import { FeedbackLoop } from './feedback.js';
import { LLMEnrichment } from './llm-enrichment.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  signalsDetected: number;
  crossingMatches: number;
  emergentPatterns: number;
  opportunitiesGenerated: number;
  opportunitiesEnriched: number;
  opportunitiesFilteredAsNoise: number;
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
  private llmEnrichment: LLMEnrichment;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.crossRef = new CrossReferenceEngine();
    this.generator = new OpportunityGenerator();
    this.dedup = new OpportunityDeduplicator();
    this.feedback = new FeedbackLoop();
    this.llmEnrichment = new LLMEnrichment();
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

    // 6. LLM enrichment — quality filter + actionable insights
    const enriched = await this.llmEnrichment.enrichBatch(penalized);
    const viable = this.llmEnrichment.filterViable(enriched);
    const filteredAsNoise = enriched.length - viable.length;
    console.log(
      `[pipeline] Step 6: Enriched ${enriched.length}, filtered ${filteredAsNoise} as noise`,
    );

    // 7. Deduplicate
    const dedupResults = await this.dedup.dedup(viable);

    // 8. Persist: create new, merge existing
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
      opportunitiesEnriched: enriched.length,
      opportunitiesFilteredAsNoise: filteredAsNoise,
      opportunitiesCreated: created,
      opportunitiesMerged: merged,
      opportunitiesSkipped: skipped,
      durationMs,
    };

    console.log(
      `[pipeline] Complete in ${durationMs}ms: ` +
      `${created} created, ${merged} merged, ${skipped} skipped, ${filteredAsNoise} noise-filtered`,
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async detectNewSignals(): Promise<DetectedSignal[]> {
    // Get recent normalized data that hasn't been signal-checked yet
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const { data: recentProducts, count } = await this.supabase
      .from('products')
      .select('id, canonical_name, primary_category, description, tags, source_ids, website_url', { count: 'exact' })
      .gte('last_updated_at', cutoff.toISOString())
      .limit(500);

    if (!recentProducts || recentProducts.length === 0) return [];

    if (count && count > 500) {
      console.warn(`[pipeline] Truncated products: ${count} available, processing first 500`);
    }

    console.log(`[pipeline] Processing ${recentProducts.length} products (${count} total)`);

    // Log source distribution
    const sourceDistrib = new Map<string, number>();
    for (const p of recentProducts) {
      const sids = p['source_ids'] as Record<string, string> | null;
      const src = sids ? Object.keys(sids)[0] ?? 'unknown' : 'unknown';
      sourceDistrib.set(src, (sourceDistrib.get(src) ?? 0) + 1);
    }
    console.log(`[pipeline] Source distribution:`, Object.fromEntries(sourceDistrib));

    // Extract source_entity_id values to fetch metrics from raw_events
    const entityIds: string[] = [];
    for (const p of recentProducts) {
      const sids = p['source_ids'] as Record<string, string> | null;
      if (sids) {
        entityIds.push(...Object.values(sids));
      }
    }

    // Fetch raw_events to get metrics and metadata
    const metricsMap = new Map<string, Record<string, number>>();
    const metadataMap = new Map<string, Record<string, unknown>>();
    if (entityIds.length > 0) {
      const { data: rawEvents } = await this.supabase
        .from('raw_events')
        .select('source_entity_id, raw_payload')
        .in('source_entity_id', entityIds);

      if (rawEvents) {
        for (const re of rawEvents) {
          const payload = re['raw_payload'] as Record<string, unknown>;
          const eid = re['source_entity_id'] as string;
          const metrics: Record<string, number> = {};

          // Extract numeric metrics from payload
          if (typeof payload['points'] === 'number') metrics['score'] = payload['points'];
          if (typeof payload['score'] === 'number') metrics['score'] = payload['score'];
          if (typeof payload['num_comments'] === 'number') metrics['numComments'] = payload['num_comments'];
          if (typeof payload['comments'] === 'number') metrics['numComments'] = payload['comments'];
          if (typeof payload['stargazers_count'] === 'number') metrics['stars'] = payload['stargazers_count'];
          if (typeof payload['forks_count'] === 'number') metrics['forks'] = payload['forks_count'];
          if (typeof payload['open_issues_count'] === 'number') metrics['openIssues'] = payload['open_issues_count'];
          if (typeof payload['view_count'] === 'number') metrics['views'] = payload['view_count'];
          if (typeof payload['review_count'] === 'number') metrics['reviewCount'] = payload['review_count'];
          if (typeof payload['rating'] === 'number') metrics['rating'] = payload['rating'];
          if (typeof payload['deal_price'] === 'number') metrics['price'] = payload['deal_price'];
          if (typeof payload['views'] === 'number') metrics['views'] = payload['views'];

          metricsMap.set(eid, metrics);

          // Pass through all non-numeric metadata for signal detectors
          // (e.g. seed_query, intent, has_comparison for google_autocomplete)
          const metadata: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(payload)) {
            if (typeof value !== 'number') {
              metadata[key] = value;
            }
          }
          metadataMap.set(eid, metadata);
        }
      }
    }

    // Convert to NormalizedItem format for signal detectors
    const items = recentProducts.map((p: Record<string, unknown>) => {
      const sourceIds = p['source_ids'] as Record<string, string> | null;
      const source = sourceIds ? Object.keys(sourceIds)[0] ?? 'unknown' : 'unknown';
      const entityId = sourceIds ? Object.values(sourceIds)[0] ?? '' : '';
      const metrics = metricsMap.get(entityId) ?? {};
      const metadata = metadataMap.get(entityId);

      return {
        source: source as 'reddit',
        externalId: p['id'] as string,
        title: p['canonical_name'] as string,
        description: (p['description'] as string) ?? undefined,
        url: (p['website_url'] as string) ?? undefined,
        metrics,
        categories: [p['primary_category'] as string, ...((p['tags'] as string[]) ?? [])],
        scrapedAt: new Date(),
        metadata,
      };
    });

    const signals = await detectSignals(items);

    // Link signals to products by matching titles / evidence fields
    const titleToProductId = new Map<string, string>();
    for (const item of items) {
      const key = item.title.toLowerCase().trim();
      if (key && item.externalId) {
        titleToProductId.set(key, item.externalId);
      }
    }

    for (const signal of signals) {
      if (signal.product_id) continue;

      // Try matching by evidence fields
      const evidence = signal.evidence as Record<string, unknown> | undefined;
      const candidates: string[] = [];

      if (evidence?.['repo_name']) candidates.push(String(evidence['repo_name']));
      if (evidence?.['target_product']) candidates.push(String(evidence['target_product']));
      if (evidence?.['company']) candidates.push(String(evidence['company']));

      // Also try signal title words that match product names
      for (const candidate of candidates) {
        const key = candidate.toLowerCase().trim();
        const productId = titleToProductId.get(key);
        if (productId) {
          signal.product_id = productId;
          break;
        }
      }

      // Fallback: fuzzy match signal title against product titles
      if (!signal.product_id) {
        for (const [productTitle, productId] of titleToProductId) {
          if (
            signal.title.toLowerCase().includes(productTitle) ||
            productTitle.includes(signal.title.toLowerCase().slice(0, 30))
          ) {
            signal.product_id = productId;
            break;
          }
        }
      }
    }

    const linked = signals.filter((s) => s.product_id).length;
    if (linked > 0) {
      console.log(`[pipeline] Linked ${linked}/${signals.length} signals to products`);
    }

    return signals;
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
