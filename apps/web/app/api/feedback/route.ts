import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// POST /api/feedback — record user feedback on an opportunity
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { type, opportunity_id, idea_id, reason, dismiss_category } = body;

  if (!type || !opportunity_id) {
    return NextResponse.json(
      { error: 'Missing required fields: type, opportunity_id' },
      { status: 400 },
    );
  }

  const validTypes = ['dismiss', 'save', 'explore', 'pursue', 'archive'];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid feedback type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 },
    );
  }

  // Insert feedback event
  const { error: feedbackError } = await supabase.from('feedback_events').insert({
    type,
    opportunity_id,
    idea_id: idea_id ?? null,
    reason: reason ?? null,
    dismiss_category: dismiss_category ?? null,
  });

  if (feedbackError) {
    return NextResponse.json({ error: feedbackError.message }, { status: 500 });
  }

  // Update opportunity status
  const statusMap: Record<string, string> = {
    dismiss: 'dismissed',
    save: 'saved',
    explore: 'exploring',
    pursue: 'pursued',
    archive: 'archived',
  };

  const { error: updateError } = await supabase
    .from('opportunities')
    .update({ status: statusMap[type] })
    .eq('id', opportunity_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Forward to scraper service for weight adjustments (async, non-blocking)
  const scraperUrl = process.env.SCRAPER_WEBHOOK_URL;
  if (scraperUrl) {
    fetch(`${scraperUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.SCRAPER_AUTH_TOKEN ?? '',
      },
      body: JSON.stringify({ type, opportunity_id, idea_id, reason, dismiss_category }),
    }).catch(() => {
      // Non-critical — weight adjustments can happen later
    });
  }

  return NextResponse.json({ status: 'ok', type, opportunity_id });
}
