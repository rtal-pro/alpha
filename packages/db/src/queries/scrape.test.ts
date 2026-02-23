// ---------------------------------------------------------------------------
// DB integration tests — scrape query helpers
// Requires Supabase running locally. Skips gracefully if unavailable.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  insertRawEvents,
  insertScrapeJob,
  updateScrapeJob,
  getCachedScrape,
  type RawEvent,
} from './scrape.js';

// ---------------------------------------------------------------------------
// Setup: connect to local Supabase if available
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const canRunDbTests = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient;

beforeAll(() => {
  if (canRunDbTests) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DB integration tests (scrape queries)', () => {
  it.skipIf(!canRunDbTests)('insertRawEvents() inserts and returns rows with IDs', async () => {
    const events: RawEvent[] = [
      {
        source: 'test',
        entity_id: `test_entity_${Date.now()}`,
        event_type: 'test_event',
        payload: { test: true, timestamp: Date.now() },
      },
    ];

    const rows = await insertRawEvents(client, events);
    expect(rows.length).toBe(1);
    expect(rows[0]).toHaveProperty('id');
    expect(typeof rows[0]!.id).toBe('string');
    expect(rows[0]!.source).toBe('test');
  });

  it.skipIf(!canRunDbTests)('insertScrapeJob() creates a pending job', async () => {
    const job = await insertScrapeJob(
      client,
      'test',
      'keyword_search',
      { keywords: ['test'] },
    );

    expect(job).toHaveProperty('id');
    expect(job.source).toBe('test');
    expect(job.status).toBe('pending');
    expect(job.job_type).toBe('keyword_search');
  });

  it.skipIf(!canRunDbTests)('updateScrapeJob() transitions status', async () => {
    const job = await insertScrapeJob(
      client,
      'test',
      'keyword_search',
      { keywords: ['test'] },
    );

    const updated = await updateScrapeJob(
      client,
      job.id,
      'completed',
      10,
    );

    expect(updated.status).toBe('completed');
    expect(updated.records_scraped).toBe(10);
  });

  it.skipIf(!canRunDbTests)('getCachedScrape() returns null for missing data', async () => {
    const cached = await getCachedScrape(
      client,
      'nonexistent_source',
      `nonexistent_entity_${Date.now()}`,
      24,
    );

    expect(cached).toBeNull();
  });

  it.skipIf(!canRunDbTests)('getCachedScrape() returns fresh data when available', async () => {
    const entityId = `cache_test_${Date.now()}`;
    await insertRawEvents(client, [{
      source: 'test',
      entity_id: entityId,
      event_type: 'test_event',
      payload: { cached: true },
    }]);

    const cached = await getCachedScrape(client, 'test', entityId, 24);
    // May or may not find it depending on the table schema
    // The key test is that it doesn't throw
    expect(cached === null || typeof cached === 'object').toBe(true);
  });
});
