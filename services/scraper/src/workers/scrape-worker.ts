// ---------------------------------------------------------------------------
// BullMQ Worker — processes scrape jobs from the "scrape" queue
// ---------------------------------------------------------------------------

import { Worker, type Job } from 'bullmq';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  REDIS_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CONCURRENCY,
} from '../config.js';
import { redisConnection, type ScrapeJobData } from '../queue.js';
import { BaseScraper, type RawScrapedItem } from '../scrapers/base.js';
import { RedditScraper } from '../scrapers/reddit.js';

// ---------------------------------------------------------------------------
// Scraper registry — add new scrapers here as they are implemented
// ---------------------------------------------------------------------------

const scraperRegistry: Map<string, BaseScraper> = new Map();

function registerScraper(scraper: BaseScraper): void {
  scraperRegistry.set(scraper.source, scraper);
}

// Register available scrapers
registerScraper(new RedditScraper());

function getScraperForSource(source: string): BaseScraper {
  const scraper = scraperRegistry.get(source);
  if (!scraper) {
    throw new Error(
      `No scraper registered for source "${source}". ` +
      `Available: [${Array.from(scraperRegistry.keys()).join(', ')}]`,
    );
  }
  return scraper;
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
// Persist raw items to Supabase raw_events table
// ---------------------------------------------------------------------------

async function persistRawItems(
  items: RawScrapedItem[],
  jobMeta: { jobId: string; source: string; analysisId?: string },
): Promise<string[]> {
  if (items.length === 0) return [];

  const client = getSupabaseClient();

  const rows = items.map((item) => ({
    source: item.source,
    entity_id: item.entityId,
    url: item.url,
    payload: item.payload,
    format: item.format,
    scraped_at: item.scrapedAt.toISOString(),
    job_id: jobMeta.jobId,
    analysis_id: jobMeta.analysisId ?? null,
  }));

  // Insert in batches to avoid payload size limits
  const BATCH_SIZE = 50;
  const insertedIds: string[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await client
      .from('raw_events')
      .upsert(batch, { onConflict: 'entity_id' })
      .select('id');

    if (error) {
      console.error(
        `[scrape-worker] Supabase insert error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`,
        error.message,
      );
      throw new Error(`Failed to persist raw events: ${error.message}`);
    }

    if (data) {
      insertedIds.push(...data.map((row: { id: string }) => row.id));
    }
  }

  return insertedIds;
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processScrapeJob(job: Job<ScrapeJobData>): Promise<void> {
  const { source, params, triggeredBy, analysisId, sectionNumber } = job.data;

  job.log(`Starting scrape for source="${source}" triggeredBy="${triggeredBy}"`);
  if (analysisId) {
    job.log(`Linked to analysis=${analysisId}, section=${sectionNumber}`);
  }

  // 1. Get the scraper
  const scraper = getScraperForSource(source);

  // 2. Execute the scrape
  job.log(`Scraping with method="${scraper.method}"...`);
  await job.updateProgress(10);

  const rawItems = await scraper.scrape(params as Parameters<typeof scraper.scrape>[0]);

  job.log(`Scraped ${rawItems.length} raw items from ${source}`);
  await job.updateProgress(60);

  if (rawItems.length === 0) {
    job.log('No items scraped — nothing to persist');
    await job.updateProgress(100);
    return;
  }

  // 3. Persist to Supabase
  job.log('Persisting raw items to Supabase...');

  const insertedIds = await persistRawItems(rawItems, {
    jobId: String(job.id ?? ''),
    source,
    analysisId,
  });

  job.log(`Persisted ${insertedIds.length} items to raw_events`);
  await job.updateProgress(100);
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

const totalConcurrency = Math.max(
  ...Object.values(CONCURRENCY),
  1,
);

export const scrapeWorker = new Worker<ScrapeJobData>(
  'scrape',
  processScrapeJob,
  {
    connection: redisConnection,
    concurrency: totalConcurrency,
    limiter: {
      max: 10,
      duration: 60_000, // max 10 jobs per minute across all sources
    },
  },
);

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

scrapeWorker.on('completed', (job) => {
  console.log(
    `[scrape-worker] Job ${job.id} (${job.data.source}) completed`,
  );
});

scrapeWorker.on('failed', (job, err) => {
  console.error(
    `[scrape-worker] Job ${job?.id} (${job?.data.source}) failed:`,
    err.message,
  );
});

scrapeWorker.on('error', (err) => {
  console.error('[scrape-worker] Worker error:', err.message);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.log('[scrape-worker] Shutting down...');
  await scrapeWorker.close();
  console.log('[scrape-worker] Worker closed');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(
  `[scrape-worker] Worker started (concurrency=${totalConcurrency}, ` +
  `registered sources: [${Array.from(scraperRegistry.keys()).join(', ')}])`,
);
