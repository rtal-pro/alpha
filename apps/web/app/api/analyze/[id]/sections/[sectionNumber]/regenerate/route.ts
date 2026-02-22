import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST /api/analyze/[id]/sections/[sectionNumber]/regenerate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionNumber: string }> },
) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  const { id: analysisId, sectionNumber: sectionNumberStr } = await params;
  const sectionNumber = parseInt(sectionNumberStr, 10);

  if (isNaN(sectionNumber) || sectionNumber < 1 || sectionNumber > 18) {
    return NextResponse.json(
      { error: 'Invalid section number. Must be between 1 and 18.' },
      { status: 400 }
    );
  }

  try {
    // Verify ownership
    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('id')
      .eq('id', analysisId)
      .eq('user_id', auth.userId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Check section exists and is not locked
    const { data: section, error: sectionError } = await supabase
      .from('analysis_sections')
      .select('*')
      .eq('analysis_id', analysisId)
      .eq('section_number', sectionNumber)
      .single();

    if (sectionError || !section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    if (section.status === 'locked') {
      return NextResponse.json(
        { error: 'Section is locked and cannot be regenerated' },
        { status: 409 }
      );
    }

    // Parse optional feedback from request body
    let feedback: string | null = null;
    try {
      const body = await request.json();
      feedback = body.feedback ?? null;
    } catch {
      // No body is fine
    }

    // Mark as re-generating
    await supabase
      .from('analysis_sections')
      .update({
        status: 'generating',
        generation_count: (section.generation_count || 0) + 1,
        started_at: new Date().toISOString(),
        user_edits: feedback ? { feedback } : section.user_edits,
      })
      .eq('id', section.id);

    return NextResponse.json({
      analysisId,
      sectionNumber,
      status: 'generating',
      generationCount: (section.generation_count || 0) + 1,
    });
  } catch (error) {
    console.error('Failed to regenerate section:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate section' },
      { status: 500 }
    );
  }
}
