import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { analysisId, sectionNumber, feedback } = body;

    if (!analysisId || !sectionNumber) {
      return NextResponse.json(
        { error: 'analysisId and sectionNumber are required' },
        { status: 400 }
      );
    }

    // Check section exists and is not locked
    const { data: section, error } = await supabase
      .from('analysis_sections')
      .select('*')
      .eq('analysis_id', analysisId)
      .eq('section_number', sectionNumber)
      .single();

    if (error || !section) {
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

    // TODO: Trigger LLM re-generation with feedback context
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
