#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Compute Geo Gaps — compares product counts per (category, country) between
// reference geos (US, UK, DE) and target geo (FR) to find underserved markets.
//
// Usage: npx tsx scripts/compute-geo-gaps.ts
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TARGET_GEO = 'FR';
const REFERENCE_GEOS = ['US', 'UK', 'DE'];
const MIN_GAP_PERCENT = 30;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('[geo-gaps] Computing geo gaps...');

  // Fetch all active products with hq_country set
  const { data: products, error } = await supabase
    .from('products')
    .select('primary_category, hq_country')
    .eq('is_active', true)
    .not('hq_country', 'is', null);

  if (error) {
    console.error('[geo-gaps] Error fetching products:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('[geo-gaps] No products with hq_country set. Run backfill first.');
    return;
  }

  console.log(`[geo-gaps] Found ${products.length} products with hq_country`);

  // Count products by (category, country)
  const counts = new Map<string, Map<string, number>>();
  for (const p of products) {
    const cat = p.primary_category as string;
    const country = p.hq_country as string;
    if (!counts.has(cat)) counts.set(cat, new Map());
    const catMap = counts.get(cat)!;
    catMap.set(country, (catMap.get(country) ?? 0) + 1);
  }

  // Check if regulations table has relevant data for regulatory boost
  const { data: regulations } = await supabase
    .from('regulations')
    .select('id, regulation_categories(category)')
    .eq('forced_adoption', true)
    .gte('transition_deadline', new Date().toISOString());

  const regulatedCategories = new Set<string>();
  for (const reg of regulations ?? []) {
    for (const rc of (reg.regulation_categories ?? []) as Array<{ category: string }>) {
      regulatedCategories.add(rc.category);
    }
  }

  // Compute gaps
  const gaps: Array<{
    category: string;
    target_geo: string;
    reference_geo: string;
    target_product_count: number;
    reference_product_count: number;
    gap_score: number;
    opportunity_score: number;
    regulatory_boost: number;
    gap_type: string;
    gap_evidence: Record<string, unknown>;
  }> = [];

  for (const [category, catCounts] of counts) {
    const targetCount = catCounts.get(TARGET_GEO) ?? 0;

    for (const refGeo of REFERENCE_GEOS) {
      const refCount = catCounts.get(refGeo) ?? 0;
      if (refCount === 0) continue;

      const gapPercent = ((refCount - targetCount) / refCount) * 100;
      if (gapPercent < MIN_GAP_PERCENT) continue;

      const regulatoryBoost = regulatedCategories.has(category) ? 15 : 0;
      const opportunityScore = Math.min(100, Math.round(gapPercent * 0.7 + regulatoryBoost));

      gaps.push({
        category,
        target_geo: TARGET_GEO,
        reference_geo: refGeo,
        target_product_count: targetCount,
        reference_product_count: refCount,
        gap_score: Math.round(gapPercent),
        opportunity_score: opportunityScore,
        regulatory_boost: regulatoryBoost,
        gap_type: targetCount === 0 ? 'no_presence' : 'underserved',
        gap_evidence: {
          computed_at: new Date().toISOString(),
          total_products_with_geo: products.length,
        },
      });
    }
  }

  if (gaps.length === 0) {
    console.log('[geo-gaps] No significant gaps found.');
    return;
  }

  console.log(`[geo-gaps] Found ${gaps.length} geo gaps (>= ${MIN_GAP_PERCENT}% gap)`);

  // Upsert into geo_gaps table
  const BATCH_SIZE = 50;
  let upserted = 0;

  for (let i = 0; i < gaps.length; i += BATCH_SIZE) {
    const batch = gaps.slice(i, i + BATCH_SIZE);
    const { error: upsertError } = await supabase
      .from('geo_gaps')
      .upsert(batch, { onConflict: 'category,target_geo,reference_geo' });

    if (upsertError) {
      console.error(`[geo-gaps] Upsert error:`, upsertError.message);
      // If upsert fails (e.g. no unique constraint), try insert
      const { error: insertError } = await supabase.from('geo_gaps').insert(batch);
      if (insertError) {
        console.error(`[geo-gaps] Insert fallback error:`, insertError.message);
      } else {
        upserted += batch.length;
      }
    } else {
      upserted += batch.length;
    }
  }

  console.log(`[geo-gaps] Upserted ${upserted} geo gaps`);

  // Show top gaps
  const sorted = gaps.sort((a, b) => b.opportunity_score - a.opportunity_score);
  console.log('\nTop geo gaps:');
  for (const gap of sorted.slice(0, 10)) {
    console.log(
      `  ${gap.category.padEnd(20)} ${gap.reference_geo} (${gap.reference_product_count}) → ` +
      `${gap.target_geo} (${gap.target_product_count}) | gap: ${gap.gap_score}% | score: ${gap.opportunity_score}` +
      (gap.regulatory_boost > 0 ? ` (+${gap.regulatory_boost} regulatory)` : ''),
    );
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
