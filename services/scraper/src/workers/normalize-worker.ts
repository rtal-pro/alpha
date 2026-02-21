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
// --- Original transformers ---
import { RedditTransformer } from '../transformers/reddit.js';
import { ProductHuntTransformer } from '../transformers/producthunt.js';
import { GitHubTransformer } from '../transformers/github.js';
import { HackerNewsTransformer } from '../transformers/hackernews.js';
import { GoogleTrendsTransformer } from '../transformers/google-trends.js';
import { EurLexTransformer } from '../transformers/eurlex.js';
import { LegifranceTransformer } from '../transformers/legifrance.js';
import { INSEETransformer } from '../transformers/insee.js';
// --- Community / social ---
import { TwitterTransformer } from '../transformers/twitter.js';
import { StackOverflowTransformer } from '../transformers/stackoverflow.js';
import { IndieHackersTransformer } from '../transformers/indiehackers.js';
// --- Search / trends ---
import { GoogleAutocompleteTransformer } from '../transformers/google-autocomplete.js';
// --- Reviews ---
import { G2Transformer } from '../transformers/g2.js';
import { CapterraTransformer } from '../transformers/capterra.js';
import { TrustpilotTransformer } from '../transformers/trustpilot.js';
// --- Marketplaces ---
import { ShopifyAppsTransformer } from '../transformers/shopify-apps.js';
import { ChromeWebStoreTransformer } from '../transformers/chrome-webstore.js';
import { ZapierTransformer } from '../transformers/zapier.js';
// --- Funding / traffic ---
import { CrunchbaseTransformer } from '../transformers/crunchbase.js';
import { SimilarWebTransformer } from '../transformers/similarweb.js';
import { BuiltWithTransformer } from '../transformers/builtwith.js';
// --- Government / contracts ---
import { DataGouvTransformer } from '../transformers/data-gouv.js';
import { EUTedTransformer } from '../transformers/eu-ted.js';
import { BOAMPTransformer } from '../transformers/boamp.js';
// --- Jobs / freelance ---
import { JobBoardsTransformer } from '../transformers/job-boards.js';
import { UpworkTransformer } from '../transformers/upwork.js';
import { MaltTransformer } from '../transformers/malt.js';
// --- Pricing intelligence ---
import { PricingTrackerTransformer } from '../transformers/pricing-tracker.js';

import type { RawScrapedItem } from '../scrapers/base.js';

// ---------------------------------------------------------------------------
// Transformer registry — all 28 transformers registered
// ---------------------------------------------------------------------------

const transformerRegistry: Map<string, BaseTransformer> = new Map();

function registerTransformer(transformer: BaseTransformer): void {
  transformerRegistry.set(transformer.source, transformer);
}

// Original transformers
registerTransformer(new RedditTransformer());
registerTransformer(new ProductHuntTransformer());
registerTransformer(new GitHubTransformer());
registerTransformer(new HackerNewsTransformer());
registerTransformer(new GoogleTrendsTransformer());
registerTransformer(new EurLexTransformer());
registerTransformer(new LegifranceTransformer());
registerTransformer(new INSEETransformer());
// Community / social
registerTransformer(new TwitterTransformer());
registerTransformer(new StackOverflowTransformer());
registerTransformer(new IndieHackersTransformer());
// Search / trends
registerTransformer(new GoogleAutocompleteTransformer());
// Reviews
registerTransformer(new G2Transformer());
registerTransformer(new CapterraTransformer());
registerTransformer(new TrustpilotTransformer());
// Marketplaces
registerTransformer(new ShopifyAppsTransformer());
registerTransformer(new ChromeWebStoreTransformer());
registerTransformer(new ZapierTransformer());
// Funding / traffic
registerTransformer(new CrunchbaseTransformer());
registerTransformer(new SimilarWebTransformer());
registerTransformer(new BuiltWithTransformer());
// Government / contracts
registerTransformer(new DataGouvTransformer());
registerTransformer(new EUTedTransformer());
registerTransformer(new BOAMPTransformer());
// Jobs / freelance
registerTransformer(new JobBoardsTransformer());
registerTransformer(new UpworkTransformer());
registerTransformer(new MaltTransformer());
// Pricing intelligence
registerTransformer(new PricingTrackerTransformer());

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
 * Compute a source-aware signal strength (0-1).
 * Extends the default heuristic for sources beyond Reddit.
 */
function computeSourceAwareStrength(
  source: string,
  metrics: Record<string, number>,
): number {
  // Source-specific strength computation
  switch (source) {
    case 'twitter': {
      const engagement = metrics['engagement'] ?? 0;
      const followers = metrics['authorFollowers'] ?? 0;
      return Math.round(
        (Math.min(engagement / 500, 1) * 0.6 + Math.min(followers / 50000, 1) * 0.4) * 100,
      ) / 100;
    }
    case 'stackoverflow': {
      const views = metrics['viewCount'] ?? 0;
      const score = metrics['score'] ?? 0;
      return Math.round(
        (Math.min(views / 10000, 1) * 0.5 + Math.min(score / 100, 1) * 0.5) * 100,
      ) / 100;
    }
    case 'crunchbase': {
      const raised = metrics['moneyRaisedUsd'] ?? 0;
      return Math.round(Math.min(raised / 50_000_000, 1) * 100) / 100;
    }
    case 'similarweb': {
      const visits = metrics['monthlyVisits'] ?? 0;
      return Math.round(Math.min(visits / 5_000_000, 1) * 100) / 100;
    }
    case 'serpapi_g2':
    case 'serpapi_capterra':
    case 'trustpilot': {
      const rating = metrics['rating'] ?? 0;
      const reviews = metrics['reviewCount'] ?? 0;
      return Math.round(
        (Math.min(reviews / 500, 1) * 0.6 + (rating / 5) * 0.4) * 100,
      ) / 100;
    }
    case 'shopify_apps':
    case 'chrome_webstore': {
      const reviews = metrics['reviewCount'] ?? metrics['users'] ?? 0;
      return Math.round(Math.min(reviews / 10000, 1) * 100) / 100;
    }
    case 'google_autocomplete': {
      const intentScore = metrics['intentScore'] ?? 0;
      return Math.round(Math.min(intentScore / 100, 1) * 100) / 100;
    }
    case 'pricing_tracker': {
      const changes = (metrics['priceIncrease'] ?? 0) +
        (metrics['freeTierRemoved'] ?? 0) +
        (metrics['newTiersAdded'] ?? 0) +
        (metrics['featureGatingChanged'] ?? 0);
      return Math.round(Math.min(changes / 3, 1) * 100) / 100;
    }
    default:
      return computeSignalStrength(metrics);
  }
}

/**
 * Determine the signal type based on the source and metrics.
 */
function determineSignalType(
  source: string,
  metrics: Record<string, number>,
): string {
  switch (source) {
    // Community / social
    case 'reddit':
    case 'hacker_news':
    case 'indiehackers':
      return 'community_buzz';
    case 'twitter':
      return 'community_buzz';
    case 'stackoverflow':
      return 'pain_point_cluster';
    // Product directories
    case 'producthunt':
      return 'product_launch';
    case 'shopify_apps':
    case 'chrome_webstore':
    case 'zapier':
      return 'market_entry';
    // Reviews
    case 'serpapi_g2':
    case 'serpapi_capterra':
    case 'trustpilot':
      return 'review_surge';
    // Code & OSS
    case 'github':
      return 'oss_traction';
    // Search & trends
    case 'google_trends':
    case 'google_autocomplete':
      return 'search_trend';
    case 'serpapi_serp':
      return 'search_trend';
    // Funding & traffic
    case 'crunchbase':
      return 'funding_round';
    case 'similarweb':
      return 'traffic_spike';
    case 'builtwith':
      return 'oss_traction';
    // Government / regulatory
    case 'eurlex':
    case 'legifrance':
    case 'eu_ted':
    case 'boamp':
    case 'data_gouv':
      return 'regulatory_event';
    case 'insee':
    case 'pappers':
      return 'company_registration';
    // Jobs / freelance
    case 'job_boards':
    case 'upwork':
    case 'malt':
      return 'market_entry';
    // Pricing
    case 'pricing_tracker':
      return 'pricing_change';
    default:
      return 'community_buzz';
  }
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
  'trustpilot',
  'shopify_apps',
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
      const strength = computeSourceAwareStrength(item.source, item.metrics);

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
