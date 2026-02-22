import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Authenticate the request using Supabase Auth.
 * Extracts the JWT from the Authorization header and verifies it.
 * Returns the authenticated user or a 401 response.
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token' },
      { status: 401 },
    );
  }

  return { userId: user.id };
}

/**
 * Helper to check if the result is an error response.
 */
export function isAuthError(result: { userId: string } | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
