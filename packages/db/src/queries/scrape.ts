import { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Inline types (until DB types are generated)                       */
/* ------------------------------------------------------------------ */

export interface RawEvent {
  source: string;
  entity_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at?: string;
  [key: string]: unknown;
}

export interface RawEventRow extends RawEvent {
  id: string;
  created_at: string;
}

export interface ScrapeJob {
  id: string;
  source: string;
  job_type: string;
  search_params: Record<string, unknown>;
  status: string;
  records_scraped: number | null;
  error_log: string | null;
  created_at: string;
  updated_at: string;
}

export interface CachedScrapeRow {
  id: string;
  source: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Bulk-insert raw events into the raw_events table.
 */
export async function insertRawEvents(
  client: SupabaseClient,
  events: RawEvent[]
): Promise<RawEventRow[]> {
  const { data, error } = await client
    .from("raw_events")
    .insert(events)
    .select();

  if (error) throw error;
  return (data ?? []) as RawEventRow[];
}

/**
 * Check whether we already have a cached scrape for a given source and entity
 * that is newer than `maxAgeHours`. Returns the cached row if fresh, or null.
 */
export async function getCachedScrape(
  client: SupabaseClient,
  source: string,
  entityId: string,
  maxAgeHours: number
): Promise<CachedScrapeRow | null> {
  const cutoff = new Date(
    Date.now() - maxAgeHours * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await client
    .from("raw_events")
    .select("*")
    .eq("source", source)
    .eq("entity_id", entityId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CachedScrapeRow) ?? null;
}

/**
 * Insert a new scrape job record.
 */
export async function insertScrapeJob(
  client: SupabaseClient,
  source: string,
  jobType: string,
  searchParams: Record<string, unknown>
): Promise<ScrapeJob> {
  const { data, error } = await client
    .from("scrape_jobs")
    .insert({
      source,
      job_type: jobType,
      search_params: searchParams,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return data as ScrapeJob;
}

/**
 * Update a scrape job's status and optional result fields.
 */
export async function updateScrapeJob(
  client: SupabaseClient,
  id: string,
  status: string,
  recordsScraped?: number,
  errorLog?: string
): Promise<ScrapeJob> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (recordsScraped !== undefined) {
    updates.records_scraped = recordsScraped;
  }
  if (errorLog !== undefined) {
    updates.error_log = errorLog;
  }

  const { data, error } = await client
    .from("scrape_jobs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ScrapeJob;
}
