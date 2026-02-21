// ---------------------------------------------------------------------------
// BullMQ Worker — enriches products by classifying them via Anthropic Haiku
// ---------------------------------------------------------------------------

import { Worker, type Job } from 'bullmq';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ANTHROPIC_API_KEY,
} from '../config.js';
import { redisConnection, type EnrichJobData } from '../queue.js';

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
// Constants
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'claude-3-5-haiku-20241022';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const PRODUCTS_PER_HAIKU_CALL = 5;

/**
 * Known product categories for classification.
 */
const KNOWN_CATEGORIES = [
  'project_management',
  'crm',
  'marketing_automation',
  'analytics',
  'design_tools',
  'developer_tools',
  'communication',
  'hr_recruitment',
  'finance_accounting',
  'ecommerce',
  'education',
  'healthcare',
  'cybersecurity',
  'ai_ml',
  'data_infrastructure',
  'customer_support',
  'content_management',
  'social_media',
  'productivity',
  'legal_compliance',
  'real_estate',
  'logistics_supply_chain',
  'no_code_low_code',
  'iot',
  'cloud_infrastructure',
  'video_audio',
  'gaming',
  'sustainability',
  'food_beverage',
  'travel_hospitality',
  'other',
] as const;

const BUSINESS_MODELS = [
  'saas_subscription',
  'saas_usage',
  'marketplace',
  'api',
  'freemium',
  'open_core',
  'one_time',
  'hybrid',
] as const;

const FORM_FACTORS = [
  'web',
  'mobile',
  'desktop',
  'api',
  'browser_extension',
  'cli',
  'embedded',
  'multi',
] as const;

const MATURITY_STAGES = [
  'idea',
  'mvp',
  'early',
  'growth',
  'mature',
  'declining',
  'dead',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  canonical_name: string;
  description: string | null;
  tagline: string | null;
  website_url: string | null;
  primary_category: string | null;
  tags: string[];
}

interface ClassificationResult {
  product_id: string;
  primary_category: string;
  secondary_categories: string[];
  business_model: string | null;
  form_factor: string | null;
  maturity: string | null;
}

// ---------------------------------------------------------------------------
// Fetch uncategorized products
// ---------------------------------------------------------------------------

async function fetchProductsToEnrich(
  productIds: string[],
): Promise<ProductRow[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('products')
    .select('id, canonical_name, description, tagline, website_url, primary_category, tags')
    .in('id', productIds)
    .or('primary_category.eq.uncategorized,primary_category.is.null');

  if (error) {
    throw new Error(`Failed to fetch products for enrichment: ${error.message}`);
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Anthropic Haiku API call
// ---------------------------------------------------------------------------

function buildClassificationPrompt(products: ProductRow[]): string {
  const productDescriptions = products.map((p, i) => {
    const parts = [`Product ${i + 1} (ID: ${p.id}):`];
    parts.push(`  Name: ${p.canonical_name}`);
    if (p.description) parts.push(`  Description: ${p.description.slice(0, 300)}`);
    if (p.tagline) parts.push(`  Tagline: ${p.tagline}`);
    if (p.website_url) parts.push(`  Website: ${p.website_url}`);
    if (p.tags?.length) parts.push(`  Tags: ${p.tags.join(', ')}`);
    return parts.join('\n');
  });

  return `You are a product classification expert. Classify each product below into the appropriate categories.

For each product, provide:
1. primary_category: One of: ${KNOWN_CATEGORIES.join(', ')}
2. secondary_categories: Up to 3 additional relevant categories from the same list
3. business_model: One of: ${BUSINESS_MODELS.join(', ')} (or null if unclear)
4. form_factor: One of: ${FORM_FACTORS.join(', ')} (or null if unclear)
5. maturity: One of: ${MATURITY_STAGES.join(', ')} (or null if unclear)

Products to classify:

${productDescriptions.join('\n\n')}

Respond with a JSON array of objects, one per product, in the same order. Each object must have:
{
  "product_id": "<the product ID>",
  "primary_category": "<category>",
  "secondary_categories": ["<cat1>", "<cat2>"],
  "business_model": "<model or null>",
  "form_factor": "<factor or null>",
  "maturity": "<stage or null>"
}

Return ONLY the JSON array, no explanation or markdown fences.`;
}

async function classifyWithHaiku(
  products: ProductRow[],
): Promise<ClassificationResult[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const prompt = buildClassificationPrompt(products);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Anthropic API error (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const result = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Anthropic response');
  }

  // Parse the JSON response — handle possible markdown fences
  let jsonText = textContent.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: ClassificationResult[];
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse Haiku classification response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
      `Raw text: ${jsonText.slice(0, 300)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Haiku response is not an array');
  }

  // Validate and sanitize each result
  return parsed.map((item) => ({
    product_id: String(item.product_id),
    primary_category: KNOWN_CATEGORIES.includes(item.primary_category as typeof KNOWN_CATEGORIES[number])
      ? item.primary_category
      : 'other',
    secondary_categories: Array.isArray(item.secondary_categories)
      ? item.secondary_categories
          .filter((c: string) => KNOWN_CATEGORIES.includes(c as typeof KNOWN_CATEGORIES[number]))
          .slice(0, 3)
      : [],
    business_model: item.business_model && BUSINESS_MODELS.includes(item.business_model as typeof BUSINESS_MODELS[number])
      ? item.business_model
      : null,
    form_factor: item.form_factor && FORM_FACTORS.includes(item.form_factor as typeof FORM_FACTORS[number])
      ? item.form_factor
      : null,
    maturity: item.maturity && MATURITY_STAGES.includes(item.maturity as typeof MATURITY_STAGES[number])
      ? item.maturity
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Update products with classification results
// ---------------------------------------------------------------------------

async function updateProductClassification(
  classification: ClassificationResult,
): Promise<boolean> {
  const client = getSupabaseClient();

  const updatePayload: Record<string, unknown> = {
    primary_category: classification.primary_category,
    secondary_categories: classification.secondary_categories,
    last_updated_at: new Date().toISOString(),
  };

  if (classification.business_model) {
    updatePayload['business_model'] = classification.business_model;
  }
  if (classification.form_factor) {
    updatePayload['form_factor'] = classification.form_factor;
  }
  if (classification.maturity) {
    updatePayload['maturity'] = classification.maturity;
  }

  const { error } = await client
    .from('products')
    .update(updatePayload)
    .eq('id', classification.product_id);

  if (error) {
    console.error(
      `[enrich-worker] Failed to update product ${classification.product_id}: ${error.message}`,
    );
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processEnrichJob(job: Job<EnrichJobData>): Promise<void> {
  const { productIds } = job.data;

  job.log(`Starting enrichment for ${productIds.length} product(s)`);
  await job.updateProgress(0);

  // 1. Fetch products that actually need enrichment
  const products = await fetchProductsToEnrich(productIds);
  job.log(`Found ${products.length} uncategorized product(s) to enrich`);

  if (products.length === 0) {
    job.log('No uncategorized products found — nothing to enrich');
    await job.updateProgress(100);
    return;
  }

  // 2. Process in batches of PRODUCTS_PER_HAIKU_CALL
  let totalClassified = 0;
  let totalUpdated = 0;

  for (let i = 0; i < products.length; i += PRODUCTS_PER_HAIKU_CALL) {
    const batch = products.slice(i, i + PRODUCTS_PER_HAIKU_CALL);
    const batchNum = Math.floor(i / PRODUCTS_PER_HAIKU_CALL) + 1;
    const totalBatches = Math.ceil(products.length / PRODUCTS_PER_HAIKU_CALL);

    job.log(`Classifying batch ${batchNum}/${totalBatches} (${batch.length} products)...`);

    try {
      const classifications = await classifyWithHaiku(batch);
      totalClassified += classifications.length;

      // Update each product with its classification
      for (const classification of classifications) {
        const updated = await updateProductClassification(classification);
        if (updated) {
          totalUpdated++;
        }
      }

      job.log(
        `Batch ${batchNum}: classified ${classifications.length}, updated ${classifications.length} products`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[enrich-worker] Batch ${batchNum} failed: ${msg}`,
      );
      job.log(`Batch ${batchNum} failed: ${msg}`);
      // Continue with remaining batches
    }

    // Update progress proportionally
    const progress = Math.round(((i + batch.length) / products.length) * 100);
    await job.updateProgress(Math.min(progress, 99));

    // Brief pause between Haiku API calls to respect rate limits
    if (i + PRODUCTS_PER_HAIKU_CALL < products.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  await job.updateProgress(100);

  job.log(
    `Enrichment complete: ${totalClassified} classified, ${totalUpdated} updated out of ${products.length} products`,
  );
}

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

export const enrichWorker = new Worker<EnrichJobData>(
  'enrich',
  processEnrichJob,
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60_000, // max 10 jobs per minute to avoid Anthropic rate limits
    },
  },
);

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

enrichWorker.on('completed', (job) => {
  console.log(
    `[enrich-worker] Job ${job.id} completed — enriched ${job.data.productIds.length} product(s)`,
  );
});

enrichWorker.on('failed', (job, err) => {
  console.error(
    `[enrich-worker] Job ${job?.id} failed:`,
    err.message,
  );
});

enrichWorker.on('error', (err) => {
  console.error('[enrich-worker] Worker error:', err.message);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.log('[enrich-worker] Shutting down...');
  await enrichWorker.close();
  console.log('[enrich-worker] Worker closed');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[enrich-worker] Worker started (concurrency=2)');
