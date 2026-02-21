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
// --- Original scrapers ---
import { RedditScraper } from '../scrapers/reddit.js';
import { ProductHuntScraper } from '../scrapers/producthunt.js';
import { GitHubScraper } from '../scrapers/github.js';
import { HackerNewsScraper } from '../scrapers/hackernews.js';
import { GoogleTrendsScraper } from '../scrapers/google-trends.js';
import { EurLexScraper } from '../scrapers/eurlex.js';
import { LegifranceScraper } from '../scrapers/legifrance.js';
import { INSEEScraper } from '../scrapers/insee.js';
// --- Community / social ---
import { TwitterScraper } from '../scrapers/twitter.js';
import { StackOverflowScraper } from '../scrapers/stackoverflow.js';
import { IndieHackersScraper } from '../scrapers/indiehackers.js';
// --- Search / trends ---
import { GoogleAutocompleteScraper } from '../scrapers/google-autocomplete.js';
// --- Reviews ---
import { G2Scraper } from '../scrapers/g2.js';
import { CapterraScraper } from '../scrapers/capterra.js';
import { TrustpilotScraper } from '../scrapers/trustpilot.js';
// --- Marketplaces ---
import { ShopifyAppsScraper } from '../scrapers/shopify-apps.js';
import { ChromeWebStoreScraper } from '../scrapers/chrome-webstore.js';
import { ZapierScraper } from '../scrapers/zapier.js';
// --- Funding / traffic ---
import { CrunchbaseScraper } from '../scrapers/crunchbase.js';
import { SimilarWebScraper } from '../scrapers/similarweb.js';
import { BuiltWithScraper } from '../scrapers/builtwith.js';
// --- Government / contracts ---
import { DataGouvScraper } from '../scrapers/data-gouv.js';
import { EUTedScraper } from '../scrapers/eu-ted.js';
import { BOAMPScraper } from '../scrapers/boamp.js';
// --- Jobs / freelance ---
import { JobBoardScraper } from '../scrapers/job-boards.js';
import { UpworkScraper } from '../scrapers/upwork.js';
import { MaltScraper } from '../scrapers/malt.js';
// --- Pricing intelligence ---
import { PricingTrackerScraper } from '../scrapers/pricing-tracker.js';
// --- SaaS-specialized discovery ---
import { BetaListScraper } from '../scrapers/betalist.js';
import { AlternativeToScraper } from '../scrapers/alternativeto.js';
import { AcquireScraper } from '../scrapers/acquire.js';
import { WellfoundScraper } from '../scrapers/wellfound.js';
import { DealroomScraper } from '../scrapers/dealroom.js';
import { OpenStartupsScraper } from '../scrapers/open-startups.js';
import { SaaSHubScraper } from '../scrapers/saashub.js';
import { StarterStoryScraper } from '../scrapers/starter-story.js';

// ---------------------------------------------------------------------------
// Scraper registry — all 36 scrapers registered
// ---------------------------------------------------------------------------

const scraperRegistry: Map<string, BaseScraper> = new Map();

function registerScraper(scraper: BaseScraper): void {
  scraperRegistry.set(scraper.source, scraper);
}

// Original scrapers
registerScraper(new RedditScraper());
registerScraper(new ProductHuntScraper());
registerScraper(new GitHubScraper());
registerScraper(new HackerNewsScraper());
registerScraper(new GoogleTrendsScraper());
registerScraper(new EurLexScraper());
registerScraper(new LegifranceScraper());
registerScraper(new INSEEScraper());
// Community / social
registerScraper(new TwitterScraper());
registerScraper(new StackOverflowScraper());
registerScraper(new IndieHackersScraper());
// Search / trends
registerScraper(new GoogleAutocompleteScraper());
// Reviews
registerScraper(new G2Scraper());
registerScraper(new CapterraScraper());
registerScraper(new TrustpilotScraper());
// Marketplaces
registerScraper(new ShopifyAppsScraper());
registerScraper(new ChromeWebStoreScraper());
registerScraper(new ZapierScraper());
// Funding / traffic
registerScraper(new CrunchbaseScraper());
registerScraper(new SimilarWebScraper());
registerScraper(new BuiltWithScraper());
// Government / contracts
registerScraper(new DataGouvScraper());
registerScraper(new EUTedScraper());
registerScraper(new BOAMPScraper());
// Jobs / freelance
registerScraper(new JobBoardScraper());
registerScraper(new UpworkScraper());
registerScraper(new MaltScraper());
// Pricing intelligence
registerScraper(new PricingTrackerScraper());
// SaaS-specialized discovery
registerScraper(new BetaListScraper());
registerScraper(new AlternativeToScraper());
registerScraper(new AcquireScraper());
registerScraper(new WellfoundScraper());
registerScraper(new DealroomScraper());
registerScraper(new OpenStartupsScraper());
registerScraper(new SaaSHubScraper());
registerScraper(new StarterStoryScraper());

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
