import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET /api/health/scrapers — scraper health status (no auth required for monitoring)
export async function GET() {
  try {
    const { data: scraperHealth, error } = await supabase
      .from('scraper_health')
      .select('*')
      .order('source', { ascending: true });

    if (error) throw error;

    const scrapers = (scraperHealth ?? []).map((s) => ({
      source: s.source,
      status: s.status === 'unknown'
        ? 'degraded'
        : s.success_rate_7d >= 90
          ? 'healthy'
          : s.success_rate_7d >= 50
            ? 'degraded'
            : 'broken',
      last_success: s.last_success,
      success_rate: s.success_rate_7d ?? 0,
      avg_response_time_ms: s.avg_response_ms ?? 0,
      total_runs: 0,
      last_error: s.breakage_type,
    }));

    return NextResponse.json({ scrapers });
  } catch (error) {
    console.error('Failed to fetch scraper health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scraper health' },
      { status: 500 }
    );
  }
}
