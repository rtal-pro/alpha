import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSectionConfig } from '@repo/shared';
import { authenticateRequest, isAuthError } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { analysisId, sectionNumber } = body;

    if (!analysisId || !sectionNumber) {
      return NextResponse.json(
        { error: 'analysisId and sectionNumber are required' },
        { status: 400 }
      );
    }

    const sectionConfig = getSectionConfig(sectionNumber);
    if (!sectionConfig) {
      return NextResponse.json(
        { error: `Invalid section number: ${sectionNumber}` },
        { status: 400 }
      );
    }

    // Fetch the analysis
    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (analysisError || !analysis) {
      return NextResponse.json(
        { error: 'Analysis not found' },
        { status: 404 }
      );
    }

    // Check dependencies are met
    const { data: completedSections } = await supabase
      .from('analysis_sections')
      .select('section_number')
      .eq('analysis_id', analysisId)
      .eq('status', 'generated');

    const completedNumbers = (completedSections || []).map(
      (s: { section_number: number }) => s.section_number
    );

    const unmetDeps = sectionConfig.dependsOn.filter(
      (dep) => !completedNumbers.includes(dep)
    );

    if (unmetDeps.length > 0) {
      return NextResponse.json(
        {
          error: `Section ${sectionNumber} depends on sections [${unmetDeps.join(', ')}] which are not yet completed`,
        },
        { status: 409 }
      );
    }

    // Mark section as generating
    await supabase
      .from('analysis_sections')
      .update({ status: 'generating', started_at: new Date().toISOString() })
      .eq('analysis_id', analysisId)
      .eq('section_number', sectionNumber);

    // Update analysis status
    await supabase
      .from('analyses')
      .update({ status: 'running' })
      .eq('id', analysisId);

    // Trigger scraping for required data sources
    const scraperServiceUrl = process.env.SCRAPER_SERVICE_URL || 'http://localhost:3001';

    // For MVP: trigger Reddit scrape directly for Section 1
    if (sectionNumber === 1) {
      try {
        const keywords = analysis.idea_description
          .split(/\s+/)
          .filter((w: string) => w.length > 4)
          .slice(0, 5);

        await fetch(`${scraperServiceUrl}/scrape/reddit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords,
            subreddits: ['SaaS', 'startups', 'smallbusiness', 'Entrepreneur'],
            analysisId,
            sectionNumber,
          }),
        }).catch(() => {
          // Scraper service may be offline — continue without scraped data
          console.warn('Scraper service unavailable, continuing without live data');
        });
      } catch {
        // Non-blocking — analysis can proceed with reduced confidence
      }
    }

    // TODO: In production, the LLM orchestrator would be called here
    // For now, return that section generation has been triggered
    return NextResponse.json({
      analysisId,
      sectionNumber,
      status: 'generating',
      message: `Section ${sectionNumber} (${sectionConfig.title}) generation triggered`,
    });
  } catch (error) {
    console.error('Failed to generate section:', error);
    return NextResponse.json(
      { error: 'Failed to generate section' },
      { status: 500 }
    );
  }
}
