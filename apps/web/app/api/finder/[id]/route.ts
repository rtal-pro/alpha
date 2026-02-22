import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// GET /api/finder/[id] — get opportunity detail with related data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  // Fetch opportunity
  const { data: opportunity, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !opportunity) {
    return NextResponse.json(
      { error: error?.message ?? 'Not found' },
      { status: 404 },
    );
  }

  // Fetch related signals
  const signalIds = opportunity.source_signals ?? [];
  let signals: unknown[] = [];
  if (signalIds.length > 0) {
    const { data } = await supabase
      .from('signals')
      .select('*')
      .in('id', signalIds.slice(0, 50))
      .order('strength', { ascending: false });
    signals = data ?? [];
  }

  // Fetch related ideas
  const { data: ideas } = await supabase
    .from('ideas')
    .select('*')
    .eq('opportunity_id', id)
    .order('created_at', { ascending: false });

  // Fetch related regulations
  const regulationIds = opportunity.source_regulations ?? [];
  let regulations: unknown[] = [];
  if (regulationIds.length > 0) {
    const { data } = await supabase
      .from('regulations')
      .select('*')
      .in('id', regulationIds.slice(0, 10));
    regulations = data ?? [];
  }

  // Fetch feedback events
  const { data: feedback } = await supabase
    .from('feedback_events')
    .select('*')
    .eq('opportunity_id', id)
    .order('created_at', { ascending: false });

  // Fetch trajectory from materialized view
  const { data: trajectory } = await supabase
    .from('mv_opportunity_trajectories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return NextResponse.json({
    opportunity,
    signals,
    ideas: ideas ?? [],
    regulations,
    feedback: feedback ?? [],
    trajectory,
  });
}
