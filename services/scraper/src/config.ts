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

export const WEBHOOK_SECRET = envOptional('WEBHOOK_SECRET', '');

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
// Concurrency limits per source — controls how many BullMQ jobs for each
// source can run simultaneously.
// ---------------------------------------------------------------------------

export const CONCURRENCY: Record<string, number> = {
  reddit: 3,
  producthunt: 1,
  github: 2,
  hacker_news: 2,
  google_trends: 1,
  indiehackers: 1,
  ycombinator: 1,
  crunchbase: 1,
  appsumo: 1,
  eurlex: 1,
  legifrance: 1,
  insee: 1,
  data_gouv: 1,
  pappers: 1,
  serpapi_g2: 1,
  serpapi_capterra: 1,
  serpapi_serp: 1,
  google_autocomplete: 2,
};
