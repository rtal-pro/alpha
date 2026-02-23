#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Backfill Categories — retroactively applies resolveCategory() to all
// existing products and signals in the database.
//
// Usage: npx tsx scripts/backfill-categories.ts
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { resolveCategory } from '../src/utils/category-mapper.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -----------------------------------------------------------------------
  // 1. Backfill products
  // -----------------------------------------------------------------------
  console.log('[backfill] Backfilling product categories...');

  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, canonical_name, primary_category, description, tags, source_ids')
    .order('id');

  if (prodError) {
    console.error('[backfill] Error fetching products:', prodError.message);
    return;
  }

  let productUpdated = 0;
  let hqCountrySet = 0;

  for (const product of products ?? []) {
    const tags = (product.tags as string[]) ?? [];
    const text = `${product.canonical_name ?? ''} ${product.description ?? ''}`;
    const newCategory = resolveCategory(tags, text);

    // Infer hq_country from tags and source
    let hqCountry: string | null = null;
    for (const tag of tags) {
      const match = /^geo:([A-Z]{2})$/i.exec(tag);
      if (match) {
        hqCountry = match[1]!.toUpperCase();
        break;
      }
    }
    const sourceIds = product.source_ids as Record<string, string> | null;
    if (!hqCountry && sourceIds && 'malt' in sourceIds) {
      hqCountry = 'FR';
    }

    const updates: Record<string, unknown> = {};
    if (newCategory !== product.primary_category) {
      updates['primary_category'] = newCategory;
    }
    if (hqCountry) {
      updates['hq_country'] = hqCountry;
      hqCountrySet++;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', product.id);

      if (error) {
        console.error(`[backfill] Product ${product.id}: ${error.message}`);
      } else if (updates['primary_category']) {
        productUpdated++;
      }
    }
  }

  console.log(
    `[backfill] Products: ${productUpdated} categories updated, ` +
    `${hqCountrySet} hq_country set (of ${products?.length ?? 0} total)`,
  );

  // -----------------------------------------------------------------------
  // 2. Backfill signals
  // -----------------------------------------------------------------------
  console.log('[backfill] Backfilling signal categories...');

  const { data: signals, error: sigError } = await supabase
    .from('signals')
    .select('id, category, title, description')
    .order('id');

  if (sigError) {
    console.error('[backfill] Error fetching signals:', sigError.message);
    return;
  }

  let signalUpdated = 0;

  for (const signal of signals ?? []) {
    const oldCategory = signal.category as string;
    const text = `${signal.title ?? ''} ${signal.description ?? ''}`;
    const newCategory = resolveCategory(oldCategory ? [oldCategory] : [], text);

    if (newCategory !== oldCategory) {
      const { error } = await supabase
        .from('signals')
        .update({ category: newCategory })
        .eq('id', signal.id);

      if (error) {
        console.error(`[backfill] Signal ${signal.id}: ${error.message}`);
      } else {
        signalUpdated++;
      }
    }
  }

  console.log(
    `[backfill] Signals: ${signalUpdated} categories updated (of ${signals?.length ?? 0} total)`,
  );

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n[backfill] Done.');
  console.log(`  Products updated: ${productUpdated}`);
  console.log(`  Products with hq_country: ${hqCountrySet}`);
  console.log(`  Signals updated: ${signalUpdated}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
