#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Run all no-auth scrapers, store raw_events in Supabase, and detect signals
// Usage: npx tsx scripts/run-all-scrapers.ts [--source=hacker_news]
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import type { RawScrapedItem, ScrapeParams } from '../src/scrapers/base.js';
import type { NormalizedItem } from '../src/transformers/base.js';
import { resolveCategory } from '../src/utils/category-mapper.js';

// --- Scrapers (no-auth + optional-auth) ---
import { HackerNewsScraper } from '../src/scrapers/hackernews.js';
import { GoogleAutocompleteScraper } from '../src/scrapers/google-autocomplete.js';
import { EurLexScraper } from '../src/scrapers/eurlex.js';
import { IndieHackersScraper } from '../src/scrapers/indiehackers.js';
import { TrustpilotScraper } from '../src/scrapers/trustpilot.js';
import { ShopifyAppsScraper } from '../src/scrapers/shopify-apps.js';
import { ChromeWebStoreScraper } from '../src/scrapers/chrome-webstore.js';
import { ZapierScraper } from '../src/scrapers/zapier.js';
import { DataGouvScraper } from '../src/scrapers/data-gouv.js';
import { EUTedScraper } from '../src/scrapers/eu-ted.js';
import { BOAMPScraper } from '../src/scrapers/boamp.js';
import { UpworkScraper } from '../src/scrapers/upwork.js';
import { MaltScraper } from '../src/scrapers/malt.js';
import { PricingTrackerScraper } from '../src/scrapers/pricing-tracker.js';
import { BetaListScraper } from '../src/scrapers/betalist.js';
import { DealroomScraper } from '../src/scrapers/dealroom.js';
import { OpenStartupsScraper } from '../src/scrapers/open-startups.js';
import { SaaSHubScraper } from '../src/scrapers/saashub.js';
import { StarterStoryScraper } from '../src/scrapers/starter-story.js';
import { AppSumoScraper } from '../src/scrapers/appsumo.js';
import { YCombinatorScraper } from '../src/scrapers/ycombinator.js';
import { GitHubScraper } from '../src/scrapers/github.js';
import { StackOverflowScraper } from '../src/scrapers/stackoverflow.js';

// --- Transformers ---
import { HackerNewsTransformer } from '../src/transformers/hackernews.js';
import { GoogleAutocompleteTransformer } from '../src/transformers/google-autocomplete.js';
import { EurLexTransformer } from '../src/transformers/eurlex.js';
import { IndieHackersTransformer } from '../src/transformers/indiehackers.js';
import { TrustpilotTransformer } from '../src/transformers/trustpilot.js';
import { ShopifyAppsTransformer } from '../src/transformers/shopify-apps.js';
import { ChromeWebStoreTransformer } from '../src/transformers/chrome-webstore.js';
import { ZapierTransformer } from '../src/transformers/zapier.js';
import { DataGouvTransformer } from '../src/transformers/data-gouv.js';
import { EUTedTransformer } from '../src/transformers/eu-ted.js';
import { BOAMPTransformer } from '../src/transformers/boamp.js';
import { UpworkTransformer } from '../src/transformers/upwork.js';
import { MaltTransformer } from '../src/transformers/malt.js';
import { PricingTrackerTransformer } from '../src/transformers/pricing-tracker.js';
import { BetaListTransformer } from '../src/transformers/betalist.js';
import { DealroomTransformer } from '../src/transformers/dealroom.js';
import { OpenStartupsTransformer } from '../src/transformers/open-startups.js';
import { SaaSHubTransformer } from '../src/transformers/saashub.js';
import { StarterStoryTransformer } from '../src/transformers/starter-story.js';
import { AppSumoTransformer } from '../src/transformers/appsumo.js';
import { YCombinatorTransformer } from '../src/transformers/ycombinator.js';
import { GitHubTransformer } from '../src/transformers/github.js';
import { StackOverflowTransformer } from '../src/transformers/stackoverflow.js';

// --- Signals ---
import { detectSignals } from '../src/signals/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Per-vertical keywords for targeted scraping across all SaaS domains
const VERTICAL_KEYWORDS: Record<string, string[]> = {
  general_saas: ['saas', 'b2b software', 'micro saas', 'no-code platform', 'workflow automation'],
  fintech: ['fintech', 'payment api', 'invoicing software', 'accounting saas', 'open banking'],
  ecommerce: ['ecommerce software', 'shopify alternative', 'marketplace platform', 'd2c tools'],
  hr_tech: ['hr software', 'payroll saas', 'recruiting tool', 'talent management'],
  marketing: ['marketing automation', 'email marketing', 'seo tool', 'analytics platform'],
  devtools: ['developer tools', 'api platform', 'ci cd', 'devops tool', 'monitoring saas'],
  cybersecurity: ['cybersecurity saas', 'siem tool', 'identity management', 'zero trust'],
  healthcare: ['healthtech', 'telemedicine', 'digital health', 'medical software'],
  ai_ml: ['ai saas', 'llm tool', 'mlops', 'ai agent', 'vector database'],
  compliance: ['compliance software', 'gdpr tool', 'legal tech', 'regtech'],
};

const ALL_KEYWORDS = Object.values(VERTICAL_KEYWORDS).flat();

// ---------------------------------------------------------------------------
// Scraper + transformer pairs
// ---------------------------------------------------------------------------

interface ScraperEntry {
  source: string;
  scraper: { scrape(params: ScrapeParams): Promise<RawScrapedItem[]> };
  transformer: { transform(items: RawScrapedItem[]): NormalizedItem[] };
  params: ScrapeParams;
}

const NO_AUTH_SCRAPERS: ScraperEntry[] = [
  {
    source: 'hacker_news',
    scraper: new HackerNewsScraper(),
    transformer: new HackerNewsTransformer(),
    params: { type: 'keyword_search', keywords: ALL_KEYWORDS.slice(0, 25), limit: 20 },
  },
  {
    source: 'google_autocomplete',
    scraper: new GoogleAutocompleteScraper(),
    transformer: new GoogleAutocompleteTransformer(),
    params: {
      type: 'keyword_search',
      keywords: [
        'saas crm', 'b2b software', 'fintech api', 'accounting software',
        'hr software', 'marketing automation', 'devops tool', 'cybersecurity saas',
        'healthtech platform', 'ai saas tool', 'compliance software', 'ecommerce platform',
        'invoicing software', 'seo tool alternative', 'payroll saas', 'llm tool',
        'identity management', 'analytics platform', 'no-code platform', 'vector database',
        'gdpr tool', 'monitoring saas', 'recruiting tool', 'email marketing tool',
      ],
      limit: 10,
    },
  },
  {
    source: 'eurlex',
    scraper: new EurLexScraper(),
    transformer: new EurLexTransformer(),
    params: {
      type: 'subject_search',
      keywords: [
        'digital services', 'data protection', 'artificial intelligence',
        'cybersecurity', 'financial services regulation', 'health data',
        'e-invoicing', 'digital identity',
      ],
      limit: 10,
    },
  },
  {
    source: 'indiehackers',
    scraper: new IndieHackersScraper(),
    transformer: new IndieHackersTransformer(),
    params: { type: 'keyword_search', keywords: ALL_KEYWORDS.slice(0, 15), limit: 10 },
  },
  {
    source: 'trustpilot',
    scraper: new TrustpilotScraper(),
    transformer: new TrustpilotTransformer(),
    params: {
      type: 'keyword_search',
      keywords: [
        'crm software', 'saas tool', 'accounting software', 'hr software',
        'marketing tool', 'cybersecurity', 'project management', 'invoicing software',
      ],
      limit: 10,
    },
  },
  {
    source: 'shopify_apps',
    scraper: new ShopifyAppsScraper(),
    transformer: new ShopifyAppsTransformer(),
    params: { type: 'keyword_search', keywords: ['crm', 'analytics', 'marketing', 'inventory', 'fulfillment', 'seo'], limit: 10 },
  },
  {
    source: 'chrome_webstore',
    scraper: new ChromeWebStoreScraper(),
    transformer: new ChromeWebStoreTransformer(),
    params: { type: 'keyword_search', keywords: ['saas', 'crm', 'productivity', 'developer tools', 'marketing', 'privacy', 'ai assistant'], limit: 10 },
  },
  {
    source: 'zapier',
    scraper: new ZapierScraper(),
    transformer: new ZapierTransformer(),
    params: { type: 'keyword_search', keywords: ['crm', 'saas', 'accounting', 'marketing', 'ecommerce', 'hr'], limit: 10 },
  },
  {
    source: 'data_gouv',
    scraper: new DataGouvScraper(),
    transformer: new DataGouvTransformer(),
    params: { type: 'keyword_search', keywords: ['entreprises', 'logiciel', 'numerique', 'cybersecurite'], limit: 10 },
  },
  {
    source: 'eu_ted',
    scraper: new EUTedScraper(),
    transformer: new EUTedTransformer(),
    params: {
      type: 'keyword_search',
      keywords: ['software', 'saas', 'cloud', 'cybersecurity', 'digital health', 'compliance platform', 'ai system'],
      limit: 10,
    },
  },
  {
    source: 'boamp',
    scraper: new BOAMPScraper(),
    transformer: new BOAMPTransformer(),
    params: { type: 'keyword_search', keywords: ['logiciel', 'saas', 'cybersecurite', 'facturation electronique'], limit: 10 },
  },
  {
    source: 'upwork',
    scraper: new UpworkScraper(),
    transformer: new UpworkTransformer(),
    params: {
      type: 'keyword_search',
      keywords: ['saas developer', 'crm integration', 'fintech developer', 'ai ml engineer', 'devops engineer', 'cybersecurity analyst'],
      limit: 10,
    },
  },
  {
    source: 'malt',
    scraper: new MaltScraper(),
    transformer: new MaltTransformer(),
    params: { type: 'keyword_search', keywords: ['saas', 'crm', 'fintech', 'devops', 'cybersecurite', 'ia'], limit: 10 },
  },
  {
    source: 'pricing_tracker',
    scraper: new PricingTrackerScraper(),
    transformer: new PricingTrackerTransformer(),
    params: {
      type: 'keyword_search',
      keywords: [
        'intercom.com', 'pipedrive.com', 'freshdesk.com',
        'notion.so', 'linear.app', 'vercel.com', 'gusto.com', 'deel.com',
        'datadog.com', 'snyk.io',
      ],
      limit: 10,
    },
  },
  {
    source: 'betalist',
    scraper: new BetaListScraper(),
    transformer: new BetaListTransformer(),
    params: { type: 'latest', limit: 15 },
  },
  // AlternativeTo, Acquire, Wellfound, Pappers: WAF-blocked (403/SPA) — skipped
  {
    source: 'dealroom',
    scraper: new DealroomScraper(),
    transformer: new DealroomTransformer(),
    params: { type: 'trending', limit: 10 },
  },
  {
    source: 'open_startups',
    scraper: new OpenStartupsScraper(),
    transformer: new OpenStartupsTransformer(),
    params: { type: 'baremetrics', limit: 10 },
  },
  {
    source: 'saashub',
    scraper: new SaaSHubScraper(),
    transformer: new SaaSHubTransformer(),
    params: { type: 'trending', limit: 10 },
  },
  {
    source: 'starter_story',
    scraper: new StarterStoryScraper(),
    transformer: new StarterStoryTransformer(),
    params: { type: 'ideas', limit: 10 },
  },
  {
    source: 'appsumo',
    scraper: new AppSumoScraper(),
    transformer: new AppSumoTransformer(),
    params: { type: 'deals', limit: 15 },
  },
  {
    source: 'ycombinator',
    scraper: new YCombinatorScraper(),
    transformer: new YCombinatorTransformer(),
    params: { type: 'launches', limit: 15 },
  },
  {
    source: 'github',
    scraper: new GitHubScraper(),
    transformer: new GitHubTransformer(),
    params: {
      type: 'topic_search',
      keywords: [
        'saas', 'micro-saas', 'crm', 'fintech', 'devtools', 'ai-agent',
        'vector-database', 'compliance', 'healthtech', 'ecommerce', 'hr-tech',
        'cybersecurity', 'mlops', 'monitoring',
      ],
      limit: 15,
    },
  },
  {
    source: 'stackoverflow',
    scraper: new StackOverflowScraper(),
    transformer: new StackOverflowTransformer(),
    params: {
      type: 'keyword_search',
      keywords: [
        'saas', 'crm api', 'b2b software', 'devops tool', 'payment api',
        'marketing automation', 'ai llm api', 'cybersecurity saas',
        'monitoring tool', 'compliance api',
      ],
      limit: 15,
    },
  },
];

// ---------------------------------------------------------------------------
// Store raw events in Supabase
// ---------------------------------------------------------------------------

async function storeRawEvents(source: string, items: RawScrapedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const rows = items.map((item) => ({
    source,
    source_entity_id: item.entityId,
    source_url: item.url,
    raw_payload: item.payload,
    payload_format: item.format,
    scrape_method: 'api',
    scraped_at: item.scrapedAt.toISOString(),
  }));

  let inserted = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('raw_events')
      .insert(batch)
      .select('id');

    if (error) {
      // If duplicate, that's fine — skip silently
      if (error.code === '23505') {
        // Insert one by one to skip duplicates
        for (const row of batch) {
          const { data: single, error: singleErr } = await supabase
            .from('raw_events')
            .insert(row)
            .select('id');
          if (!singleErr && single) inserted += single.length;
        }
      } else {
        console.error(`  [DB] Error storing ${source}: ${error.message}`);
      }
    } else {
      inserted += data?.length ?? 0;
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Populate products table from normalized items
// ---------------------------------------------------------------------------

async function storeProducts(items: NormalizedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  let upserted = 0;

  for (const item of items) {
    const canonicalName = (item.title ?? '').replace(/^\[.*?\]\s*/, '').slice(0, 200) || 'unknown';
    const slug = canonicalName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);

    if (!slug || slug === 'unknown') continue;

    try {
      const { data: existing } = await supabase
        .from('products')
        .select('id, source_ids')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        // Merge source_ids
        const existingSourceIds = (existing.source_ids ?? {}) as Record<string, string>;
        await supabase.from('products').update({
          last_updated_at: new Date().toISOString(),
          source_ids: { ...existingSourceIds, [item.source]: item.externalId },
        }).eq('id', existing.id);
      } else {
        // Infer canonical category and hq_country
        const text = `${canonicalName} ${item.description ?? ''}`;
        const primaryCategory = resolveCategory(item.categories ?? [], text);
        const hqCountry = inferHqCountry(item);

        const { error } = await supabase.from('products').insert({
          canonical_name: canonicalName,
          slug,
          description: item.description?.slice(0, 2000) ?? null,
          website_url: item.url ?? null,
          primary_category: primaryCategory,
          secondary_categories: item.categories?.slice(1) ?? [],
          tags: item.categories ?? [],
          source_ids: { [item.source]: item.externalId },
          hq_country: hqCountry,
          first_seen_at: item.scrapedAt.toISOString(),
          last_updated_at: new Date().toISOString(),
          is_active: true,
        });
        if (!error) upserted++;
        // Silently skip duplicate slug errors
      }
    } catch {
      // Skip individual item failures
    }
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Infer HQ country from item metadata / categories / source
// ---------------------------------------------------------------------------

function inferHqCountry(item: NormalizedItem): string | null {
  // Check categories for geo: tags
  for (const cat of item.categories ?? []) {
    const match = /^geo:([A-Z]{2})$/i.exec(cat);
    if (match) return match[1]!.toUpperCase();
  }

  // Source-based inference
  if (item.source === 'malt') return 'FR';

  // Check metadata for location hints
  const location = ((item.metadata?.['location'] as string) ?? '').toLowerCase();
  if (/\b(france|paris|lyon|marseille|toulouse|nantes|bordeaux|lille|strasbourg)\b/.test(location)) return 'FR';
  if (/\b(united states|usa|new york|san francisco|silicon valley|seattle|austin|boston)\b/.test(location)) return 'US';
  if (/\b(united kingdom|uk|london|manchester|edinburgh)\b/.test(location)) return 'UK';
  if (/\b(germany|berlin|munich|hamburg|münchen)\b/.test(location)) return 'DE';

  return null;
}

// ---------------------------------------------------------------------------
// Store signals in Supabase
// ---------------------------------------------------------------------------

async function storeSignals(signals: Awaited<ReturnType<typeof detectSignals>>): Promise<number> {
  if (signals.length === 0) return 0;

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
  }));

  const { data, error } = await supabase.from('signals').insert(rows).select('id');
  if (error) {
    console.error(`  [DB] Error storing signals: ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Update scraper_health
// ---------------------------------------------------------------------------

async function updateHealth(
  source: string,
  success: boolean,
  responseMs: number,
  errorMsg?: string,
): Promise<void> {
  let status = 'broken';
  if (success && !errorMsg) status = 'healthy';
  else if (success && errorMsg) status = 'degraded';

  const { error } = await supabase.from('scraper_health').upsert(
    {
      source,
      status,
      last_success: success ? new Date().toISOString() : null,
      last_failure: success ? null : new Date().toISOString(),
      avg_response_ms: responseMs,
      breakage_type: errorMsg ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source' },
  );

  if (error) {
    console.error(`  [DB] Error updating health for ${source}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filterSource = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];

  const scrapers = filterSource
    ? NO_AUTH_SCRAPERS.filter((s) => s.source === filterSource)
    : NO_AUTH_SCRAPERS;

  if (scrapers.length === 0) {
    console.error(`No scraper found for source: ${filterSource}`);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`  Running ${scrapers.length} no-auth scrapers`);
  console.log(`========================================\n`);

  let totalRaw = 0;
  let totalNormalized = 0;
  let totalSignals = 0;
  let totalStored = 0;
  let passed = 0;
  let failed = 0;
  const allNormalized: NormalizedItem[] = [];

  for (const entry of scrapers) {
    const { source, scraper, transformer, params } = entry;
    const start = Date.now();
    process.stdout.write(`  [${source}] Scraping... `);

    // Create scrape job record
    const { data: job } = await supabase
      .from('scrape_jobs')
      .insert({
        source,
        job_type: params.type,
        search_params: params,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    const jobId = job?.id;

    try {
      const rawItems = await scraper.scrape(params);
      const elapsed = Date.now() - start;
      const normalized = transformer.transform(rawItems);
      allNormalized.push(...normalized);

      // Store in Supabase
      const stored = await storeRawEvents(source, rawItems);
      totalStored += stored;

      totalRaw += rawItems.length;
      totalNormalized += normalized.length;
      passed++;

      console.log(
        `OK (${rawItems.length} raw, ${normalized.length} normalized, ${stored} stored, ${elapsed}ms)`,
      );

      // Update scrape job as completed
      if (jobId) {
        await supabase.from('scrape_jobs').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          records_scraped: rawItems.length,
        }).eq('id', jobId);
      }

      // Update health — mark as degraded if 0 items returned
      await updateHealth(source, true, elapsed, rawItems.length === 0 ? 'returned 0 items' : undefined);
    } catch (err) {
      const elapsed = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL (${elapsed}ms): ${msg}`);
      failed++;

      // Update scrape job as failed
      if (jobId) {
        await supabase.from('scrape_jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          records_scraped: 0,
          error_log: JSON.stringify({ message: msg }),
        }).eq('id', jobId);
      }

      await updateHealth(source, false, elapsed, msg);
    }

    // Rate limit between scrapers
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Populate products table from normalized items
  console.log(`\n  Populating products table from ${allNormalized.length} normalized items...`);
  try {
    const productsCreated = await storeProducts(allNormalized);
    console.log(`  Created/updated ${productsCreated} products`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Products population failed: ${msg}`);
  }

  // Detect signals from all normalized items
  console.log(`\n  Detecting signals from ${allNormalized.length} normalized items...`);
  try {
    const signals = await detectSignals(allNormalized);
    const storedSignals = await storeSignals(signals);
    totalSignals = signals.length;
    console.log(`  Detected ${signals.length} signals, stored ${storedSignals} in DB`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Signal detection failed: ${msg}`);
  }

  console.log(`\n========================================`);
  console.log(`  RESULTS`);
  console.log(`========================================`);
  console.log(`  Scrapers:     ${passed} passed, ${failed} failed`);
  console.log(`  Raw items:    ${totalRaw}`);
  console.log(`  Normalized:   ${totalNormalized}`);
  console.log(`  Stored in DB: ${totalStored}`);
  console.log(`  Signals:      ${totalSignals}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
