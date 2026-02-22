// ---------------------------------------------------------------------------
// Environment configuration for the scraper service
// ---------------------------------------------------------------------------

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envOptional(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer, got: ${raw}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export const REDIS_URL = env('REDIS_URL', 'redis://localhost:6379');
export const SUPABASE_URL = env('SUPABASE_URL', 'http://localhost:54321');
export const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY', '');
export const SCRAPER_PORT = envInt('SCRAPER_PORT', 3001);

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

export const WEBHOOK_SECRET = env('WEBHOOK_SECRET');

// ---------------------------------------------------------------------------
// Reddit OAuth
// ---------------------------------------------------------------------------

export const REDDIT_CLIENT_ID = envOptional('REDDIT_CLIENT_ID', '');
export const REDDIT_CLIENT_SECRET = envOptional('REDDIT_CLIENT_SECRET', '');
export const REDDIT_USER_AGENT = env(
  'REDDIT_USER_AGENT',
  'SaaSIdeaEngine/0.1 (scraper-service)',
);

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export const GITHUB_TOKEN = envOptional('GITHUB_TOKEN', '');

// ---------------------------------------------------------------------------
// ProductHunt
// ---------------------------------------------------------------------------

export const PRODUCTHUNT_API_TOKEN = envOptional('PRODUCTHUNT_API_TOKEN', '');

// ---------------------------------------------------------------------------
// SerpAPI (Google Trends, G2, Capterra, etc.)
// ---------------------------------------------------------------------------

export const SERPAPI_KEY = envOptional('SERPAPI_KEY', '');

// ---------------------------------------------------------------------------
// Legifrance (DILA / PISTE)
// ---------------------------------------------------------------------------

export const LEGIFRANCE_API_KEY = envOptional('LEGIFRANCE_API_KEY', '');

// ---------------------------------------------------------------------------
// INSEE SIRENE API
// ---------------------------------------------------------------------------

export const SIRENE_API_KEY = envOptional('SIRENE_API_KEY', '');

// ---------------------------------------------------------------------------
// Anthropic (used by enrich-worker for product classification)
// ---------------------------------------------------------------------------

export const ANTHROPIC_API_KEY = envOptional('ANTHROPIC_API_KEY', '');

// ---------------------------------------------------------------------------
// Twitter/X
// ---------------------------------------------------------------------------

export const TWITTER_BEARER_TOKEN = envOptional('TWITTER_BEARER_TOKEN', '');

// ---------------------------------------------------------------------------
// StackOverflow
// ---------------------------------------------------------------------------

export const STACKOVERFLOW_API_KEY = envOptional('STACKOVERFLOW_API_KEY', '');

// ---------------------------------------------------------------------------
// Crunchbase
// ---------------------------------------------------------------------------

export const CRUNCHBASE_API_KEY = envOptional('CRUNCHBASE_API_KEY', '');

// ---------------------------------------------------------------------------
// BuiltWith
// ---------------------------------------------------------------------------

export const BUILTWITH_API_KEY = envOptional('BUILTWITH_API_KEY', '');

// ---------------------------------------------------------------------------
// Startup validation — call this on server boot to surface missing config early
// ---------------------------------------------------------------------------

interface ConfigWarning {
  level: 'error' | 'warn';
  message: string;
}

/**
 * Validates that all required configuration is present and warns about
 * optional credentials that limit scraper functionality.
 * Throws if any critical configuration is missing.
 */
export function validateConfig(): void {
  const warnings: ConfigWarning[] = [];

  // Required config (will throw via env() if missing):
  // REDIS_URL, SUPABASE_URL, WEBHOOK_SECRET — already enforced at import time.

  // Warn about empty Supabase service role key
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push({ level: 'error', message: 'SUPABASE_SERVICE_ROLE_KEY is empty — database operations will fail' });
  }

  // Source-specific API keys — warn if missing
  const optionalKeys: Array<{ name: string; value: string | undefined; sources: string }> = [
    { name: 'REDDIT_CLIENT_ID', value: REDDIT_CLIENT_ID, sources: 'reddit' },
    { name: 'REDDIT_CLIENT_SECRET', value: REDDIT_CLIENT_SECRET, sources: 'reddit' },
    { name: 'GITHUB_TOKEN', value: GITHUB_TOKEN, sources: 'github' },
    { name: 'PRODUCTHUNT_API_TOKEN', value: PRODUCTHUNT_API_TOKEN, sources: 'producthunt' },
    { name: 'SERPAPI_KEY', value: SERPAPI_KEY, sources: 'google_trends, g2, capterra, serpapi_serp' },
    { name: 'LEGIFRANCE_API_KEY', value: LEGIFRANCE_API_KEY, sources: 'legifrance' },
    { name: 'SIRENE_API_KEY', value: SIRENE_API_KEY, sources: 'insee' },
    { name: 'ANTHROPIC_API_KEY', value: ANTHROPIC_API_KEY, sources: 'llm-enrichment' },
    { name: 'TWITTER_BEARER_TOKEN', value: TWITTER_BEARER_TOKEN, sources: 'twitter' },
    { name: 'STACKOVERFLOW_API_KEY', value: STACKOVERFLOW_API_KEY, sources: 'stackoverflow' },
    { name: 'CRUNCHBASE_API_KEY', value: CRUNCHBASE_API_KEY, sources: 'crunchbase' },
    { name: 'BUILTWITH_API_KEY', value: BUILTWITH_API_KEY, sources: 'builtwith' },
  ];

  const missing = optionalKeys.filter((k) => !k.value);
  for (const key of missing) {
    warnings.push({
      level: 'warn',
      message: `${key.name} not set — ${key.sources} scraper(s) will fail`,
    });
  }

  // Report warnings
  const errors = warnings.filter((w) => w.level === 'error');
  const warns = warnings.filter((w) => w.level === 'warn');

  for (const w of warns) {
    console.warn(`[config] WARNING: ${w.message}`);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[config] ERROR: ${e.message}`);
    }
    throw new Error(
      `Configuration validation failed with ${errors.length} error(s). Fix the above issues and restart.`
    );
  }

  if (missing.length > 0) {
    console.warn(`[config] ${missing.length} optional API key(s) not configured — some scrapers will be disabled`);
  } else {
    console.log('[config] All API keys configured');
  }
}

// ---------------------------------------------------------------------------
// Concurrency limits per source — controls how many BullMQ jobs for each
// source can run simultaneously.
// ---------------------------------------------------------------------------

export const CONCURRENCY: Record<string, number> = {
  // Community / social
  reddit: 3,
  hacker_news: 2,
  indiehackers: 2,
  twitter: 2,
  stackoverflow: 2,
  // Product directories
  producthunt: 1,
  appsumo: 1,
  shopify_apps: 1,
  chrome_webstore: 1,
  zapier: 1,
  // Reviews
  serpapi_g2: 1,
  serpapi_capterra: 1,
  trustpilot: 1,
  // Code & OSS
  github: 2,
  // Search & trends
  google_trends: 1,
  google_autocomplete: 2,
  serpapi_serp: 1,
  // Funding & traffic
  crunchbase: 1,
  similarweb: 1,
  builtwith: 1,
  // Regulatory & government
  eurlex: 1,
  legifrance: 1,
  insee: 1,
  data_gouv: 1,
  eu_ted: 1,
  boamp: 1,
  pappers: 1,
  // Jobs & freelance
  job_boards: 1,
  upwork: 1,
  malt: 1,
  // Pricing intelligence
  pricing_tracker: 1,
  // SaaS-specialized discovery
  betalist: 1,
  alternativeto: 1,
  acquire: 1,
  wellfound: 1,
  dealroom: 1,
  open_startups: 1,
  saashub: 1,
  starter_story: 1,
  // Legacy / planned
  ycombinator: 1,
};

// ---------------------------------------------------------------------------
// Source reliability scores — used by signal weighting.
// Higher = more trustworthy data.
// ---------------------------------------------------------------------------

export const SOURCE_RELIABILITY: Record<string, number> = {
  // Government / official sources (highest reliability)
  eurlex: 0.99,
  legifrance: 0.99,
  insee: 0.98,
  eu_ted: 0.97,
  boamp: 0.96,
  data_gouv: 0.95,
  // Code & structured data
  github: 0.95,
  builtwith: 0.90,
  pappers: 0.90,
  // Community (high volume, moderate noise)
  reddit: 0.85,
  hacker_news: 0.85,
  crunchbase: 0.85,
  stackoverflow: 0.85,
  // Product directories
  producthunt: 0.80,
  zapier: 0.80,
  shopify_apps: 0.78,
  chrome_webstore: 0.75,
  // Social / reviews
  twitter: 0.75,
  indiehackers: 0.75,
  appsumo: 0.75,
  serpapi_g2: 0.72,
  serpapi_capterra: 0.70,
  trustpilot: 0.70,
  // Traffic estimates
  similarweb: 0.70,
  // Jobs / freelance
  job_boards: 0.75,
  upwork: 0.70,
  malt: 0.70,
  // Search / trend signals (high noise)
  google_trends: 0.65,
  google_autocomplete: 0.60,
  // Price monitoring (high value but sparse)
  pricing_tracker: 0.85,
  // SaaS-specialized discovery
  dealroom: 0.88,
  wellfound: 0.78,
  betalist: 0.72,
  alternativeto: 0.72,
  saashub: 0.70,
  acquire: 0.80,
  open_startups: 0.82,
  starter_story: 0.65,
  // Additional sources
  ycombinator: 0.88,
  serpapi_serp: 0.65,
};
