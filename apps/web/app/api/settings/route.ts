import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// All credential keys we support
const VALID_KEYS = [
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'PRODUCTHUNT_API_TOKEN',
  'GITHUB_TOKEN',
  'TWITTER_BEARER_TOKEN',
  'STACKOVERFLOW_API_KEY',
  'CRUNCHBASE_API_KEY',
  'BUILTWITH_API_KEY',
  'SERPAPI_KEY',
  'LEGIFRANCE_API_KEY',
  'SIRENE_API_KEY',
];

// GET /api/settings — return all saved credentials (masked)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value, updated_at')
      .in('key', VALID_KEYS);

    if (error) throw error;

    // Mask values — only show last 4 chars
    const masked = (data ?? []).map((row) => ({
      key: row.key,
      value: row.value ? maskValue(row.value) : '',
      hasValue: !!row.value && row.value.length > 0,
      updated_at: row.updated_at,
    }));

    // Return all keys, with info about which ones are set
    const result = VALID_KEYS.map((key) => {
      const existing = masked.find((m) => m.key === key);
      return {
        key,
        masked_value: existing?.value ?? '',
        is_set: existing?.hasValue ?? false,
        updated_at: existing?.updated_at ?? null,
      };
    });

    return NextResponse.json({ settings: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/settings — save credentials
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentials } = body as { credentials: Record<string, string> };

    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json({ error: 'Missing credentials object' }, { status: 400 });
    }

    const updates: { key: string; value: string; updated_at: string }[] = [];

    for (const [key, value] of Object.entries(credentials)) {
      if (!VALID_KEYS.includes(key)) continue;
      if (typeof value !== 'string') continue;
      // Skip empty values and masked placeholder values
      if (!value || value.includes('****')) continue;

      updates.push({
        key,
        value,
        updated_at: new Date().toISOString(),
      });
    }

    if (updates.length > 0) {
      const { error } = await supabase
        .from('app_settings')
        .upsert(updates, { onConflict: 'key' });

      if (error) throw error;
    }

    return NextResponse.json({ saved: updates.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/settings — remove a credential
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || !VALID_KEYS.includes(key)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    const { error } = await supabase
      .from('app_settings')
      .delete()
      .eq('key', key);

    if (error) throw error;

    return NextResponse.json({ deleted: key });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete setting';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function maskValue(value: string): string {
  if (value.length <= 8) return '****' + value.slice(-2);
  return '****' + value.slice(-4);
}
