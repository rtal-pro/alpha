// ---------------------------------------------------------------------------
// BullMQ queue definitions for the scraper service
// ---------------------------------------------------------------------------

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { REDIS_URL } from './config.js';

// ---------------------------------------------------------------------------
// Shared Redis connection for all queues
// ---------------------------------------------------------------------------

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  console.error('[queue] Redis connection error:', err.message);
});

// ---------------------------------------------------------------------------
// Job data interfaces
// ---------------------------------------------------------------------------

export interface ScrapeJobData {
  /** Which source to scrape (reddit, producthunt, github, ...) */
  source: string;
  /** Source-specific parameters (keywords, subreddits, category, etc.) */
  params: Record<string, unknown>;
  /** Job priority — lower number = higher priority */
  priority: number;
  /** Who/what triggered this scrape (e.g. 'webhook', 'scheduler', 'manual') */
  triggeredBy: string;
  /** Optional link to a running analysis */
  analysisId?: string;
  /** Section number within the analysis that needs this data */
  sectionNumber?: number;
}

export interface NormalizeJobData {
  /** Which source the raw items came from */
  source: string;
  /** IDs of the raw_events rows to normalize */
  rawEventIds: string[];
  /** Optional link to a running analysis */
  analysisId?: string;
  /** Section number within the analysis that needs this data */
  sectionNumber?: number;
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export const scrapeQueue = new Queue<ScrapeJobData>('scrape', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 72 * 3600, count: 1000 },
  },
});

export const normalizeQueue = new Queue<NormalizeJobData>('normalize', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2_000,
    },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 72 * 3600, count: 1000 },
  },
});
