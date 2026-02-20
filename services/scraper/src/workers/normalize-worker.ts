// ---------------------------------------------------------------------------
// BullMQ Worker — processes normalize jobs from the "normalize" queue
// Fetches raw_events, transforms them via source-specific transformers, and
// upserts into the products, product_metrics, signals, and reviews tables.
// ---------------------------------------------------------------------------

import { Worker, type Job } from 'bullmq';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from '../config.js';
import { redisConnection, type NormalizeJobData } from '../queue.js';
import { BaseTransformer, type NormalizedItem } from '../transformers/base.js';
import { RedditTransformer } from '../transformers/reddit.js';
import { ProductHuntTransformer } from '../transformers/producthunt.js';
import { GitHubTransformer } from '../transformers/github.js';
import { HackerNewsTransformer } from '../transformers/hackernews.js';
import { GoogleTrendsTransformer } from '../transformers/google-trends.js';
import { EurLexTransformer } from '../transformers/eurlex.js';
import { LegifranceTransformer } from '../transformers/legifrance.js';
import { INSEETransformer } from '../transformers/insee.js';
import type { RawScrapedItem } from '../scrapers/base.js';

// ---------------------------------------------------------------------------
// Transformer registry
// ---------------------------------------------------------------------------

const transformerRegistry: Map<string, BaseTransformer> = new Map();

function registerTransformer(transformer: BaseTransformer): void {
  transformerRegistry.set(transformer.source, transformer);
}

registerTransformer(new RedditTransformer());
registerTransformer(new ProductHuntTransformer());
registerTransformer(new GitHubTransformer());
registerTransformer(new HackerNewsTransformer());
registerTransformer(new GoogleTrendsTransformer());
registerTransformer(new EurLexTransformer());
registerTransformer(new LegifranceTransformer());
registerTransformer(new INSEETransformer());

function getTransformerForSource(source: string): BaseTransformer {
  const transformer = transformerRegistry.get(source);
  if (!transformer) {
    throw new Error(
      `No transformer registered for source "${source}". ` +
      `Available: [${Array.from(transformerRegistry.keys()).join(', ')}]`,
    );
  }
  return transformer;
}

// ---------------------------------------------------------------------------
// Supabase client (direct — no @repo/db dependency)
// ---------------------------------------------------------------------------

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Supabase credentials not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

/**
 * Generate a URL-safe slug from a product name.
 * Lowercase, replace spaces/special chars with hyphens, truncate to 100 chars.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric (keep spaces & hyphens)
    .replace(/[\s_]+/g, '-')         // collapse whitespace/underscores to single hyphen
    .replace(/-+/g, '-')             // collapse consecutive hyphens
    .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
    .slice(0, 100);
}

/**
 * Derive a canonical product name from a NormalizedItem.
 * For Reddit posts the title often IS the product mention; we clean it up.
 */
function deriveCanonicalName(item: NormalizedItem): string {
  // Use the title, stripping common prefixes/suffixes
  let name = item.title.trim();
  // Remove common Reddit title patterns like "[D]", "[P]", etc.
  name = name.replace(/^\[.*?\]\s*/, '');
  // Truncate overly long names
  if (name.length > 200) {
    name = name.slice(0, 200);
  }
  return name || 'unknown-product';
}

/**
 * Compute a signal strength (0-1) from metrics.
 */
function computeSignalStrength(metrics: Record<string, number>): number {
  const score = metrics['score'] ?? 0;
  const comments = metrics['numComments'] ?? 0;
  const upvoteRatio = metrics['upvoteRatio'] ?? 0.5;

  // Simple heuristic: combine score, comments, and upvote ratio
  const rawStrength =
    Math.min(score / 500, 1) * 0.4 +
    Math.min(comments / 100, 1) * 0.3 +
    upvoteRatio * 0.3;

  return Math.round(rawStrength * 100) / 100;
}

/**
 * Determine the signal type based on the source and metrics.
 */
function determineSignalType(
  source: string,
  metrics: Record<string, number>,
): string {
  const score = metrics['score'] ?? 0;
  const comments = metrics['numComments'] ?? 0;

  if (source === 'reddit') {
    if (score > 200 || comments > 50) return 'community_buzz';
    return 'community_buzz';
  }
  if (source === 'producthunt') return 'product_launch';
  if (source === 'github') return 'oss_traction';
  if (source === 'hacker_news') return 'community_buzz';
  if (source === 'google_trends') return 'search_spike';
  if (source === 'eurlex' || source === 'legifrance') return 'regulatory_change';
  if (source === 'insee') return 'market_data';
  return 'community_buzz';
}

// ---------------------------------------------------------------------------
// Fetch raw events from Supabase
// ---------------------------------------------------------------------------

async function fetchRawEvents(
  rawEventIds: string[],
): Promise<RawScrapedItem[]> {
  const client = getSupabaseClient();
  const allItems: RawScrapedItem[] = [];

  // Fetch in batches to avoid query size limits
  for (let i = 0; i < rawEventIds.length; i += BATCH_SIZE) {
    const batchIds = rawEventIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await client
      .from('raw_events')
      .select('*')
      .in('id', batchIds);

    if (error) {
      throw new Error(`Failed to fetch raw_events: ${error.message}`);
    }

    if (data) {
      for (const row of data) {
        allItems.push({
          source: row.source,
          entityId: row.source_entity_id ?? row.entity_id ?? '',
          url: row.source_url ?? row.url ?? '',
          payload: row.raw_payload ?? row.payload ?? {},
          format: row.payload_format ?? row.format ?? 'json',
          scrapedAt: new Date(row.scraped_at),
        });
      }
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Upsert products
// ---------------------------------------------------------------------------

interface UpsertedProduct {
  id: string;
  slug: string;
  canonicalName: string;
}

async function upsertProduct(
  item: NormalizedItem,
): Promise<UpsertedProduct> {
  const client = getSupabaseClient();
  const canonicalName = deriveCanonicalName(item);
  const slug = slugify(canonicalName);

  if (!slug) {
    throw new Error(`Could not generate slug for item: ${item.title}`);
  }

  // Try to find existing product by slug
  const { data: existing, error: selectError } = await client
    .from('products')
    .select('id, slug, canonical_name')
    .eq('slug', slug)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to query products: ${selectError.message}`);
  }

  if (existing) {
    // Update last_updated_at and merge source_ids
    const sourceIds = { [item.source]: item.externalId };
    const { error: updateError } = await client
      .from('products')
      .update({
        last_updated_at: new Date().toISOString(),
        source_ids: sourceIds,
        description: item.description ?? existing.description,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.warn(
        `[normalize-worker] Failed to update product ${existing.id}: ${updateError.message}`,
      );
    }

    return {
      id: existing.id,
      slug: existing.slug,
      canonicalName: existing.canonical_name,
    };
  }

  // Insert new product
  const primaryCategory = item.categories[0] ?? 'uncategorized';
  const secondaryCategories = item.categories.slice(1);

  const { data: inserted, error: insertError } = await client
    .from('products')
    .insert({
      canonical_name: canonicalName,
      slug,
      description: item.description,
      website_url: item.url,
      primary_category: primaryCategory,
      secondary_categories: secondaryCategories,
      tags: item.categories,
      source_ids: { [item.source]: item.externalId },
      first_seen_at: item.scrapedAt.toISOString(),
      last_updated_at: new Date().toISOString(),
      is_active: true,
    })
    .select('id, slug, canonical_name')
    .single();

  if (insertError) {
    // Handle race condition: another job may have inserted the same slug
    if (insertError.code === '23505') {
      const { data: raceExisting } = await client
        .from('products')
        .select('id, slug, canonical_name')
        .eq('slug', slug)
        .single();

      if (raceExisting) {
        return {
          id: raceExisting.id,
          slug: raceExisting.slug,
          canonicalName: raceExisting.canonical_name,
        };
      }
    }
    throw new Error(`Failed to insert product: ${insertError.message}`);
  }

  return {
    id: inserted.id,
    slug: inserted.slug,
    canonicalName: inserted.canonical_name,
  };
}

// ---------------------------------------------------------------------------
// Insert product metrics
// ---------------------------------------------------------------------------

interface MetricRow {
  product_id: string;
  source: string;
  metric_key: string;
  metric_value: number;
  observed_at: string;
  raw_event_id?: string;
}

async function insertProductMetrics(
  metricRows: MetricRow[],
): Promise<number> {
  if (metricRows.length === 0) return 0;

  const client = getSupabaseClient();
  let inserted = 0;

  for (let i = 0; i < metricRows.length; i += BATCH_SIZE) {
    const batch = metricRows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from('product_metrics')
      .insert(batch);

    if (error) {
      console.error(
        `[normalize-worker] Failed to insert product_metrics batch: ${error.message}`,
      );
      // Continue with remaining batches
      continue;
    }

    inserted += batch.length;
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Insert signals
// ---------------------------------------------------------------------------

interface SignalRow {
  signal_type: string;
  product_id: string;
  category: string | null;
  title: string;
  description: string | null;
  strength: number;
  geo_relevance: string[];
  source: string;
  source_url: string | null;
  occurred_at: string;
  raw_event_id?: string;
}

async function insertSignals(signalRows: SignalRow[]): Promise<number> {
  if (signalRows.length === 0) return 0;

  const client = getSupabaseClient();
  let inserted = 0;

  for (let i = 0; i < signalRows.length; i += BATCH_SIZE) {
    const batch = signalRows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from('signals')
      .insert(batch);

    if (error) {
      console.error(
        `[normalize-worker] Failed to insert signals batch: ${error.message}`,
      );
      continue;
    }

    inserted += batch.length;
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Insert reviews (for review-type sources)
// ---------------------------------------------------------------------------

interface ReviewRow {
  product_id: string;
  source: string;
  source_review_id: string | null;
  title: string | null;
  body: string | null;
  rating: number | null;
  author_role: string | null;
  published_at: string | null;
  raw_event_id?: string;
}

async function insertReviews(reviewRows: ReviewRow[]): Promise<number> {
  if (reviewRows.length === 0) return 0;

  const client = getSupabaseClient();
  let inserted = 0;

  for (let i = 0; i < reviewRows.length; i += BATCH_SIZE) {
    const batch = reviewRows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from('reviews')
      .insert(batch);

    if (error) {
      console.error(
        `[normalize-worker] Failed to insert reviews batch: ${error.message}`,
      );
      continue;
    }

    inserted += batch.length;
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Review-type sources (sources that produce user reviews)
// ---------------------------------------------------------------------------

const REVIEW_SOURCES = new Set([
  'serpapi_g2',
  'serpapi_capterra',
  'appsumo',
]);

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processNormalizeJob(job: Job<NormalizeJobData>): Promise<void> {
  const { source, rawEventIds, analysisId } = job.data;

  job.log(`Starting normalization for source="${source}", ${rawEventIds.length} raw events`);
  if (analysisId) {
    job.log(`Linked to analysis=${analysisId}`);
  }

  // 1. Fetch raw events
  job.log('Fetching raw events from Supabase...');
  await job.updateProgress(0);

  const rawItems = await fetchRawEvents(rawEventIds);
  job.log(`Fetched ${rawItems.length} raw events`);

  if (rawItems.length === 0) {
    job.log('No raw events found — nothing to normalize');
    await job.updateProgress(100);
    return;
  }

  // 2. Transform via source-specific transformer
  const transformer = getTransformerForSource(source);
  const normalizedItems = transformer.transform(rawItems);
  job.log(`Transformed ${normalizedItems.length} items from ${rawItems.length} raw events`);
  await job.updateProgress(20);

  if (normalizedItems.length === 0) {
    job.log('No items after transformation — nothing to persist');
    await job.updateProgress(100);
    return;
  }

  // 3. For each normalized item: upsert product, insert metrics, create signals
  const allMetrics: MetricRow[] = [];
  const allSignals: SignalRow[] = [];
  const allReviews: ReviewRow[] = [];

  let productsUpserted = 0;

  for (const item of normalizedItems) {
    try {
      // Upsert product
      const product = await upsertProduct(item);
      productsUpserted++;

      // Build metric rows from the item's metrics
      const observedAt = item.scrapedAt.toISOString();
      for (const [key, value] of Object.entries(item.metrics)) {
        if (typeof value === 'number' && !Number.isNaN(value)) {
          allMetrics.push({
            product_id: product.id,
            source: item.source,
            metric_key: key,
            metric_value: value,
            observed_at: observedAt,
          });
        }
      }

      // Build signal row
      const signalType = determineSignalType(item.source, item.metrics);
      const strength = computeSignalStrength(item.metrics);

      allSignals.push({
        signal_type: signalType,
        product_id: product.id,
        category: item.categories[0] ?? null,
        title: item.title.slice(0, 500),
        description: item.description?.slice(0, 1000) ?? null,
        strength,
        geo_relevance: [],
        source: item.source,
        source_url: item.url ?? null,
        occurred_at: observedAt,
      });

      // For review sources, extract reviews
      if (REVIEW_SOURCES.has(item.source)) {
        allReviews.push({
          product_id: product.id,
          source: item.source,
          source_review_id: item.externalId,
          title: item.title.slice(0, 500),
          body: item.description ?? null,
          rating: item.metrics['rating'] ?? null,
          author_role: (item.metadata?.['authorRole'] as string) ?? null,
          published_at: observedAt,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[normalize-worker] Failed to process item "${item.title?.slice(0, 60)}": ${msg}`,
      );
      // Continue with remaining items
    }
  }

  await job.updateProgress(50);
  job.log(`Upserted ${productsUpserted} products`);

  // 4. Batch insert metrics, signals, and reviews
  const metricsInserted = await insertProductMetrics(allMetrics);
  job.log(`Inserted ${metricsInserted} product metrics`);

  const signalsInserted = await insertSignals(allSignals);
  job.log(`Inserted ${signalsInserted} signals`);

  if (allReviews.length > 0) {
    const reviewsInserted = await insertReviews(allReviews);
    job.log(`Inserted ${reviewsInserted} reviews`);
  }

  await job.updateProgress(100);

  job.log(
    `Normalization complete: ${productsUpserted} products, ` +
    `${metricsInserted} metrics, ${signalsInserted} signals` +
    (allReviews.length > 0 ? `, ${allReviews.length} reviews` : ''),
  );
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

export const normalizeWorker = new Worker<NormalizeJobData>(
  'normalize',
  processNormalizeJob,
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

normalizeWorker.on('completed', (job) => {
  console.log(
    `[normalize-worker] Job ${job.id} (${job.data.source}) completed`,
  );
});

normalizeWorker.on('failed', (job, err) => {
  console.error(
    `[normalize-worker] Job ${job?.id} (${job?.data.source}) failed:`,
    err.message,
  );
});

normalizeWorker.on('error', (err) => {
  console.error('[normalize-worker] Worker error:', err.message);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.log('[normalize-worker] Shutting down...');
  await normalizeWorker.close();
  console.log('[normalize-worker] Worker closed');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(
  `[normalize-worker] Worker started (concurrency=5, ` +
  `registered transformers: [${Array.from(transformerRegistry.keys()).join(', ')}])`,
);
