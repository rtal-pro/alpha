#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Live smoke test — actually calls real APIs for no-auth scrapers
// Usage: npx tsx scripts/smoke-test.ts [--source=hacker_news]
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from '../src/scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from '../src/transformers/base.js';

// --- No-auth scraper imports ---
import { HackerNewsScraper } from '../src/scrapers/hackernews.js';
import { GoogleAutocompleteScraper } from '../src/scrapers/google-autocomplete.js';
import { EurLexScraper } from '../src/scrapers/eurlex.js';
import { BOAMPScraper } from '../src/scrapers/boamp.js';
import { EUTedScraper } from '../src/scrapers/eu-ted.js';
import { DataGouvScraper } from '../src/scrapers/data-gouv.js';
import { IndieHackersScraper } from '../src/scrapers/indiehackers.js';
import { TrustpilotScraper } from '../src/scrapers/trustpilot.js';
import { ShopifyAppsScraper } from '../src/scrapers/shopify-apps.js';
import { ChromeWebStoreScraper } from '../src/scrapers/chrome-webstore.js';
import { ZapierScraper } from '../src/scrapers/zapier.js';
import { UpworkScraper } from '../src/scrapers/upwork.js';
import { MaltScraper } from '../src/scrapers/malt.js';
import { PricingTrackerScraper } from '../src/scrapers/pricing-tracker.js';
import { BetaListScraper } from '../src/scrapers/betalist.js';
import { AlternativeToScraper } from '../src/scrapers/alternativeto.js';
import { AcquireScraper } from '../src/scrapers/acquire.js';
import { WellfoundScraper } from '../src/scrapers/wellfound.js';
import { DealroomScraper } from '../src/scrapers/dealroom.js';
import { OpenStartupsScraper } from '../src/scrapers/open-startups.js';
import { SaaSHubScraper } from '../src/scrapers/saashub.js';
import { StarterStoryScraper } from '../src/scrapers/starter-story.js';
import { AppSumoScraper } from '../src/scrapers/appsumo.js';
import { YCombinatorScraper } from '../src/scrapers/ycombinator.js';
import { PappersScraper } from '../src/scrapers/pappers.js';

// --- Matching transformers ---
import { HackerNewsTransformer } from '../src/transformers/hackernews.js';
import { GoogleAutocompleteTransformer } from '../src/transformers/google-autocomplete.js';
import { EurLexTransformer } from '../src/transformers/eurlex.js';
import { BOAMPTransformer } from '../src/transformers/boamp.js';
import { EUTedTransformer } from '../src/transformers/eu-ted.js';
import { DataGouvTransformer } from '../src/transformers/data-gouv.js';
import { IndieHackersTransformer } from '../src/transformers/indiehackers.js';
import { TrustpilotTransformer } from '../src/transformers/trustpilot.js';
import { ShopifyAppsTransformer } from '../src/transformers/shopify-apps.js';
import { ChromeWebStoreTransformer } from '../src/transformers/chrome-webstore.js';
import { ZapierTransformer } from '../src/transformers/zapier.js';
import { UpworkTransformer } from '../src/transformers/upwork.js';
import { MaltTransformer } from '../src/transformers/malt.js';
import { PricingTrackerTransformer } from '../src/transformers/pricing-tracker.js';
import { BetaListTransformer } from '../src/transformers/betalist.js';
import { AlternativeToTransformer } from '../src/transformers/alternativeto.js';
import { AcquireTransformer } from '../src/transformers/acquire.js';
import { WellfoundTransformer } from '../src/transformers/wellfound.js';
import { DealroomTransformer } from '../src/transformers/dealroom.js';
import { OpenStartupsTransformer } from '../src/transformers/open-startups.js';
import { SaaSHubTransformer } from '../src/transformers/saashub.js';
import { StarterStoryTransformer } from '../src/transformers/starter-story.js';
import { AppSumoTransformer } from '../src/transformers/appsumo.js';
import { YCombinatorTransformer } from '../src/transformers/ycombinator.js';
import { PappersTransformer } from '../src/transformers/pappers.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

interface SmokeEntry {
  source: string;
  scraper: BaseScraper;
  transformer: BaseTransformer;
}

const entries: SmokeEntry[] = [
  { source: 'hacker_news', scraper: new HackerNewsScraper(), transformer: new HackerNewsTransformer() },
  { source: 'google_autocomplete', scraper: new GoogleAutocompleteScraper(), transformer: new GoogleAutocompleteTransformer() },
  { source: 'eurlex', scraper: new EurLexScraper(), transformer: new EurLexTransformer() },
  { source: 'boamp', scraper: new BOAMPScraper(), transformer: new BOAMPTransformer() },
  { source: 'eu_ted', scraper: new EUTedScraper(), transformer: new EUTedTransformer() },
  { source: 'data_gouv', scraper: new DataGouvScraper(), transformer: new DataGouvTransformer() },
  { source: 'indiehackers', scraper: new IndieHackersScraper(), transformer: new IndieHackersTransformer() },
  { source: 'trustpilot', scraper: new TrustpilotScraper(), transformer: new TrustpilotTransformer() },
  { source: 'shopify_apps', scraper: new ShopifyAppsScraper(), transformer: new ShopifyAppsTransformer() },
  { source: 'chrome_webstore', scraper: new ChromeWebStoreScraper(), transformer: new ChromeWebStoreTransformer() },
  { source: 'zapier', scraper: new ZapierScraper(), transformer: new ZapierTransformer() },
  { source: 'upwork', scraper: new UpworkScraper(), transformer: new UpworkTransformer() },
  { source: 'malt', scraper: new MaltScraper(), transformer: new MaltTransformer() },
  { source: 'pricing_tracker', scraper: new PricingTrackerScraper(), transformer: new PricingTrackerTransformer() },
  { source: 'betalist', scraper: new BetaListScraper(), transformer: new BetaListTransformer() },
  { source: 'alternativeto', scraper: new AlternativeToScraper(), transformer: new AlternativeToTransformer() },
  { source: 'acquire', scraper: new AcquireScraper(), transformer: new AcquireTransformer() },
  { source: 'wellfound', scraper: new WellfoundScraper(), transformer: new WellfoundTransformer() },
  { source: 'dealroom', scraper: new DealroomScraper(), transformer: new DealroomTransformer() },
  { source: 'open_startups', scraper: new OpenStartupsScraper(), transformer: new OpenStartupsTransformer() },
  { source: 'saashub', scraper: new SaaSHubScraper(), transformer: new SaaSHubTransformer() },
  { source: 'starter_story', scraper: new StarterStoryScraper(), transformer: new StarterStoryTransformer() },
  { source: 'appsumo', scraper: new AppSumoScraper(), transformer: new AppSumoTransformer() },
  { source: 'ycombinator', scraper: new YCombinatorScraper(), transformer: new YCombinatorTransformer() },
  { source: 'pappers', scraper: new PappersScraper(), transformer: new PappersTransformer() },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidShape(item: RawScrapedItem): boolean {
  return (
    typeof item.source === 'string' &&
    typeof item.entityId === 'string' &&
    typeof item.url === 'string' &&
    typeof item.payload === 'object' &&
    typeof item.format === 'string' &&
    item.scrapedAt instanceof Date
  );
}

function isValidNormalized(item: NormalizedItem): boolean {
  return (
    typeof item.source === 'string' &&
    typeof item.externalId === 'string' &&
    typeof item.title === 'string' &&
    typeof item.metrics === 'object' &&
    Array.isArray(item.categories) &&
    item.scrapedAt instanceof Date
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const sourceFilter = args.find((a) => a.startsWith('--source='))?.split('=')[1];

  const toRun = sourceFilter
    ? entries.filter((e) => e.source === sourceFilter)
    : entries;

  if (toRun.length === 0) {
    console.error(`No scraper found for source: ${sourceFilter}`);
    console.error(`Available: ${entries.map((e) => e.source).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== Smoke Test: ${toRun.length} source(s) ===\n`);

  const results: { source: string; status: 'PASS' | 'WARN' | 'FAIL'; items: number; normalized: number; durationMs: number; error?: string }[] = [];

  const params: ScrapeParams = {
    type: 'keyword_search',
    keywords: ['saas', 'crm'],
    limit: 3,
  };

  for (const entry of toRun) {
    const start = Date.now();
    try {
      // Scrape
      const rawItems = await entry.scraper.scrape(params);
      const scrapeValid = rawItems.every(isValidShape);

      // Transform
      const normalizedItems = entry.transformer.transform(rawItems);
      const transformValid = normalizedItems.every(isValidNormalized);

      const durationMs = Date.now() - start;

      if (rawItems.length === 0) {
        results.push({ source: entry.source, status: 'WARN', items: 0, normalized: 0, durationMs, error: 'Empty result' });
        console.log(`  WARN  ${entry.source.padEnd(22)} 0 items (empty result) [${durationMs}ms]`);
      } else if (!scrapeValid || !transformValid) {
        results.push({ source: entry.source, status: 'WARN', items: rawItems.length, normalized: normalizedItems.length, durationMs, error: 'Invalid shape' });
        console.log(`  WARN  ${entry.source.padEnd(22)} ${rawItems.length} items, shape issues [${durationMs}ms]`);
      } else {
        results.push({ source: entry.source, status: 'PASS', items: rawItems.length, normalized: normalizedItems.length, durationMs });
        console.log(`  PASS  ${entry.source.padEnd(22)} ${rawItems.length} raw -> ${normalizedItems.length} normalized [${durationMs}ms]`);
      }
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ source: entry.source, status: 'FAIL', items: 0, normalized: 0, durationMs, error: message });
      console.log(`  FAIL  ${entry.source.padEnd(22)} ${message.slice(0, 80)} [${durationMs}ms]`);
    }

    // Rate limit: 2 seconds between calls
    if (toRun.indexOf(entry) < toRun.length - 1) {
      await delay(2000);
    }
  }

  // Summary
  const pass = results.filter((r) => r.status === 'PASS').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;

  console.log(`\n=== Results: ${pass} pass, ${warn} warn, ${fail} fail (of ${results.length}) ===\n`);

  if (fail > 0) {
    console.log('Failures:');
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.source}: ${r.error}`);
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
