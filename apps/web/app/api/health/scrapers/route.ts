import { NextResponse } from 'next/server';

// All 40 registered scraper sources
const ALL_SOURCES = [
  'reddit',
  'producthunt',
  'github',
  'hacker_news',
  'google_trends',
  'eurlex',
  'legifrance',
  'insee',
  'twitter',
  'stackoverflow',
  'indiehackers',
  'google_autocomplete',
  'serpapi_g2',
  'serpapi_capterra',
  'trustpilot',
  'shopify_apps',
  'chrome_webstore',
  'zapier',
  'crunchbase',
  'similarweb',
  'builtwith',
  'data_gouv',
  'eu_ted',
  'boamp',
  'job_boards',
  'upwork',
  'malt',
  'pricing_tracker',
  'betalist',
  'alternativeto',
  'acquire',
  'wellfound',
  'dealroom',
  'open_startups',
  'saashub',
  'starter_story',
  'appsumo',
  'ycombinator',
  'pappers',
  'serpapi_serp',
] as const;

// Human-readable labels for sources
const SOURCE_LABELS: Record<string, string> = {
  reddit: 'Reddit',
  producthunt: 'Product Hunt',
  github: 'GitHub',
  hacker_news: 'Hacker News',
  google_trends: 'Google Trends',
  eurlex: 'EUR-Lex',
  legifrance: 'Legifrance',
  insee: 'INSEE',
  twitter: 'Twitter/X',
  stackoverflow: 'Stack Overflow',
  indiehackers: 'Indie Hackers',
  google_autocomplete: 'Google Autocomplete',
  serpapi_g2: 'G2 Reviews',
  serpapi_capterra: 'Capterra',
  trustpilot: 'Trustpilot',
  shopify_apps: 'Shopify Apps',
  chrome_webstore: 'Chrome Web Store',
  zapier: 'Zapier',
  crunchbase: 'Crunchbase',
  similarweb: 'SimilarWeb',
  builtwith: 'BuiltWith',
  data_gouv: 'Data.gouv.fr',
  eu_ted: 'EU TED',
  boamp: 'BOAMP',
  job_boards: 'Job Boards',
  upwork: 'Upwork',
  malt: 'Malt',
  pricing_tracker: 'Pricing Tracker',
  betalist: 'BetaList',
  alternativeto: 'AlternativeTo',
  acquire: 'Acquire.com',
  wellfound: 'Wellfound',
  dealroom: 'Dealroom',
  open_startups: 'Open Startups',
  saashub: 'SaaSHub',
  starter_story: 'Starter Story',
  appsumo: 'AppSumo',
  ycombinator: 'Y Combinator',
  pappers: 'Pappers',
  serpapi_serp: 'SerpAPI SERP',
};

export async function GET() {
  try {
    // Query scraper_health table for real data via direct fetch
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const res = await fetch(`${baseUrl}/rest/v1/scraper_health?select=*`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      cache: 'no-store',
    });

    let healthRows: Record<string, unknown>[] | null = null;
    let error: { message: string } | null = null;

    if (res.ok) {
      healthRows = await res.json();
    } else {
      error = { message: `HTTP ${res.status}: ${await res.text()}` };
    }

    // Build a map of existing health data
    const healthMap = new Map<string, Record<string, unknown>>();
    if (healthRows) {
      for (const row of healthRows) {
        healthMap.set(row.source as string, row);
      }
    }

    // Build response for all 40 sources
    const scrapers = ALL_SOURCES.map((source) => {
      const row = healthMap.get(source);
      if (row) {
        return {
          source: SOURCE_LABELS[source] ?? source,
          source_key: source,
          status: row.status === 'healthy' ? 'healthy' : row.status === 'degraded' ? 'degraded' : row.status === 'broken' ? 'broken' : 'unknown',
          last_success: row.last_success ?? null,
          success_rate: row.success_rate_7d != null ? Number(row.success_rate_7d) * 100 : 0,
          avg_response_time_ms: row.avg_response_ms ?? 0,
          total_runs: 0, // Not tracked in this table
          last_error: row.breakage_type ?? null,
        };
      }

      // No health data yet for this source
      return {
        source: SOURCE_LABELS[source] ?? source,
        source_key: source,
        status: 'unknown' as const,
        last_success: null,
        success_rate: 0,
        avg_response_time_ms: 0,
        total_runs: 0,
        last_error: null,
      };
    });

    return NextResponse.json({ scrapers });
  } catch (err) {
    console.error('Health API error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch scraper health' },
      { status: 500 },
    );
  }
}
