import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SECTION_CONFIGS } from '@repo/shared';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, ideaDescription, preferences } = body;

    if (!ideaDescription || ideaDescription.length < 10) {
      return NextResponse.json(
        { error: 'Idea description must be at least 10 characters' },
        { status: 400 }
      );
    }

    // Create the analysis
    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        title: title || ideaDescription.slice(0, 80),
        idea_description: ideaDescription,
        preferences: preferences || {
          targetMarket: 'FR',
          soloFounder: true,
          budgetConstraint: 'bootstrap',
        },
        status: 'draft',
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    // Create all 18 sections as pending
    const sectionRows = SECTION_CONFIGS.map((cfg) => ({
      analysis_id: analysis.id,
      section_number: cfg.number,
      section_key: cfg.key,
      title: cfg.title,
      status: 'pending',
    }));

    const { error: sectionsError } = await supabase
      .from('analysis_sections')
      .insert(sectionRows);

    if (sectionsError) throw sectionsError;

    return NextResponse.json({ analysisId: analysis.id }, { status: 201 });
  } catch (error) {
    console.error('Failed to start analysis:', error);
    return NextResponse.json(
      { error: 'Failed to start analysis' },
      { status: 500 }
    );
  }
}
