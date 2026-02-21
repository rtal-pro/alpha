import { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Inline types (until DB types are generated)                       */
/* ------------------------------------------------------------------ */

export interface AnalysisPreferences {
  targetMarket?: string;
  budget?: string;
  timeline?: string;
  [key: string]: unknown;
}

export interface AnalysisSection {
  id: string;
  analysis_id: string;
  section_number: number;
  section_type: string;
  title: string;
  status: string;
  output_json: Record<string, unknown> | null;
  output_markdown: string | null;
  summary: string | null;
  confidence: number | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  title: string;
  idea_description: string;
  preferences: AnalysisPreferences;
  opportunity_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  sections?: AnalysisSection[];
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Insert a new analysis row.
 */
export async function createAnalysis(
  client: SupabaseClient,
  title: string,
  ideaDescription: string,
  preferences: AnalysisPreferences,
  opportunityId?: string
): Promise<Analysis> {
  const { data, error } = await client
    .from("analyses")
    .insert({
      title,
      idea_description: ideaDescription,
      preferences,
      opportunity_id: opportunityId ?? null,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;
  return data as Analysis;
}

/**
 * Fetch a single analysis by ID, including its related sections.
 */
export async function getAnalysis(
  client: SupabaseClient,
  id: string
): Promise<Analysis> {
  const { data, error } = await client
    .from("analyses")
    .select("*, analysis_sections(*)")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as Analysis;
}

/**
 * Update the status of an analysis.
 */
export async function updateAnalysisStatus(
  client: SupabaseClient,
  id: string,
  status: string
): Promise<Analysis> {
  const { data, error } = await client
    .from("analyses")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Analysis;
}

/**
 * List all analyses ordered by created_at descending.
 */
export async function listAnalyses(
  client: SupabaseClient
): Promise<Analysis[]> {
  const { data, error } = await client
    .from("analyses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Analysis[];
}
