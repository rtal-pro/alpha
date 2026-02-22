import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Whitelist of allowed sort columns to prevent column name injection
const VALID_SORT_COLUMNS = [
  'composite_score', 'growth_score', 'gap_score',
  'regulatory_score', 'feasibility_score', 'created_at',
];

// GET /api/finder — list opportunities with filters
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);

  const domain = searchParams.get('domain');
  const type = searchParams.get('type');
  const minScore = searchParams.get('minScore');
  const status = searchParams.get('status') ?? 'new,saved,exploring';
  const rawSortBy = searchParams.get('sortBy') ?? 'composite_score';
  const sortBy = VALID_SORT_COLUMNS.includes(rawSortBy) ? rawSortBy : 'composite_score';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  let query = supabase
    .from('opportunities')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by status
  const statuses = status.split(',').map((s) => s.trim());
  query = query.in('status', statuses);

  // Filter by domain/category
  if (domain && domain !== 'all') {
    query = query.eq('category', domain);
  }

  // Filter by opportunity type
  if (type && type !== 'all') {
    query = query.eq('type', type);
  }

  // Filter by minimum score
  if (minScore) {
    query = query.gte('composite_score', parseInt(minScore));
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    opportunities: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
