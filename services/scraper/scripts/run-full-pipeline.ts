#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Full Pipeline — chains scraping + products population + intelligence pipeline
//
// Usage: npx tsx scripts/run-full-pipeline.ts [--skip-scrape] [--source=hacker_news]
//
// Steps:
//   1. Run all scrapers (raw_events → normalized items → signals)
//   2. Populate products table
//   3. Run IntelligencePipeline (signals → cross-ref → opportunities → dedup)
// ---------------------------------------------------------------------------

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Set env vars BEFORE importing pipeline (config.ts reads them at import time)
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_KEY;

const args = process.argv.slice(2);
const skipScrape = args.includes('--skip-scrape');
const sourceArg = args.find((a) => a.startsWith('--source='));

async function main() {
  const totalStart = Date.now();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       Full SaaS Idea Engine Pipeline      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Step 1: Run scrapers (includes products population and signal detection)
  if (!skipScrape) {
    console.log('━━━ Step 1: Running all scrapers ━━━\n');
    const scraperCmd = sourceArg
      ? `npx tsx scripts/run-all-scrapers.ts ${sourceArg}`
      : 'npx tsx scripts/run-all-scrapers.ts';

    try {
      execSync(scraperCmd, {
        cwd: import.meta.dirname ?? process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY },
        timeout: 600_000, // 10 min max
      });
    } catch (err) {
      console.error('\nScraper step failed but continuing with pipeline...');
    }
  } else {
    console.log('━━━ Step 1: Skipping scrapers (--skip-scrape) ━━━\n');
  }

  // Step 1b: Compute geo gaps
  console.log('\n━━━ Step 1b: Computing geo gaps ━━━\n');
  try {
    execSync('npx tsx scripts/compute-geo-gaps.ts', {
      cwd: import.meta.dirname ?? process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY },
      timeout: 120_000,
    });
  } catch {
    console.error('\nGeo gaps computation failed but continuing...');
  }

  // Step 2: Show current DB state
  console.log('\n━━━ Step 2: Database State ━━━\n');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [rawCount, productCount, signalCount, oppCount] = await Promise.all([
    supabase.from('raw_events').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('signals').select('id', { count: 'exact', head: true }),
    supabase.from('opportunities').select('id', { count: 'exact', head: true }),
  ]);

  console.log(`  Raw events:    ${rawCount.count ?? 0}`);
  console.log(`  Products:      ${productCount.count ?? 0}`);
  console.log(`  Signals:       ${signalCount.count ?? 0}`);
  console.log(`  Opportunities: ${oppCount.count ?? 0} (before pipeline)\n`);

  // Step 3: Run intelligence pipeline (dynamic import so env vars are set first)
  console.log('━━━ Step 3: Running Intelligence Pipeline ━━━\n');
  const { IntelligencePipeline } = await import('../src/engine/pipeline.js');
  const pipeline = new IntelligencePipeline();
  const result = await pipeline.run();

  // Step 4: Final summary
  const totalMs = Date.now() - totalStart;

  const { count: finalOppCount } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true });

  // Get opportunity type distribution
  const { data: oppTypes } = await supabase
    .from('opportunities')
    .select('type');
  const typeDistrib = new Map<string, number>();
  for (const opp of oppTypes ?? []) {
    const t = opp.type ?? 'unknown';
    typeDistrib.set(t, (typeDistrib.get(t) ?? 0) + 1);
  }

  // Get signal type distribution
  const { data: sigTypes } = await supabase
    .from('signals')
    .select('signal_type');
  const sigDistrib = new Map<string, number>();
  for (const sig of sigTypes ?? []) {
    const t = sig.signal_type ?? 'unknown';
    sigDistrib.set(t, (sigDistrib.get(t) ?? 0) + 1);
  }

  // Get category distribution
  const { data: oppCategories } = await supabase
    .from('opportunities')
    .select('category');
  const catDistrib = new Map<string, number>();
  for (const opp of oppCategories ?? []) {
    const c = opp.category ?? 'unknown';
    catDistrib.set(c, (catDistrib.get(c) ?? 0) + 1);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              PIPELINE RESULTS             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  Signals detected:    ${String(result.signalsDetected).padStart(5)}`);
  console.log(`║  Crossing matches:    ${String(result.crossingMatches).padStart(5)}`);
  console.log(`║  Emergent patterns:   ${String(result.emergentPatterns).padStart(5)}`);
  console.log(`║  Opportunities gen'd: ${String(result.opportunitiesGenerated).padStart(5)}`);
  console.log(`║  Opportunities new:   ${String(result.opportunitiesCreated).padStart(5)}`);
  console.log(`║  Opportunities merge: ${String(result.opportunitiesMerged).padStart(5)}`);
  console.log(`║  Noise filtered:      ${String(result.opportunitiesFilteredAsNoise).padStart(5)}`);
  console.log(`║  Total opportunities: ${String(finalOppCount ?? 0).padStart(5)}`);
  console.log(`║  Total duration:      ${(totalMs / 1000).toFixed(1)}s`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Opportunity Types:');
  for (const [type, count] of [...typeDistrib.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`║    ${type.padEnd(25)} ${String(count).padStart(3)}`);
  }
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Signal Types:');
  for (const [type, count] of [...sigDistrib.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`║    ${type.padEnd(25)} ${String(count).padStart(3)}`);
  }
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Categories:');
  for (const [cat, count] of [...catDistrib.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`║    ${cat.padEnd(25)} ${String(count).padStart(3)}`);
  }
  console.log('╚══════════════════════════════════════════╝\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
