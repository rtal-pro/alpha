import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET /api/analyze — list analyses for the authenticated user
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50') || 50, 100);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0') || 0, 0);

    const { data: analyses, error, count } = await supabase
      .from('analyses')
      .select(`
        id,
        title,
        idea_description,
        preferences,
        status,
        total_cost_usd,
        created_at,
        completed_at
      `, { count: 'exact' })
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get section completion counts for each analysis
    const analysisIds = (analyses ?? []).map((a) => a.id);
    let sectionCounts: Record<string, { completed: number; total: number }> = {};

    if (analysisIds.length > 0) {
      const { data: sections } = await supabase
        .from('analysis_sections')
        .select('analysis_id, status')
        .in('analysis_id', analysisIds);

      for (const section of sections ?? []) {
        const aid = section.analysis_id as string;
        if (!sectionCounts[aid]) sectionCounts[aid] = { completed: 0, total: 0 };
        sectionCounts[aid].total++;
        if (section.status === 'generated' || section.status === 'locked') {
          sectionCounts[aid].completed++;
        }
      }
    }

    const enriched = (analyses ?? []).map((a) => ({
      ...a,
      sections_completed: sectionCounts[a.id]?.completed ?? 0,
      sections_total: sectionCounts[a.id]?.total ?? 18,
    }));

    return NextResponse.json({
      analyses: enriched,
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to list analyses:', error);
    return NextResponse.json(
      { error: 'Failed to list analyses' },
      { status: 500 }
    );
  }
}
