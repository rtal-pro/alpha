import { SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Inline types (until DB types are generated)                       */
/* ------------------------------------------------------------------ */

export interface SectionConfig {
  section_number: number;
  section_key: string;
  title: string;
}

export interface Section {
  id: string;
  analysis_id: string;
  section_number: number;
  section_key: string;
  title: string;
  status: string;
  output_json: Record<string, unknown> | null;
  output_markdown: string | null;
  summary: string | null;
  data_quality_score: number | null;
  confidence_score: number | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  generation_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface SectionExtraFields {
  error_message?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Bulk-insert pending sections for an analysis.
 */
export async function createSections(
  client: SupabaseClient,
  analysisId: string,
  sectionConfigs: SectionConfig[]
): Promise<Section[]> {
  const rows = sectionConfigs.map((cfg) => ({
    analysis_id: analysisId,
    section_number: cfg.section_number,
    section_key: cfg.section_key,
    title: cfg.title,
    status: "pending",
  }));

  const { data, error } = await client
    .from("analysis_sections")
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as Section[];
}

/**
 * Fetch a single section by analysis ID and section number.
 */
export async function getSection(
  client: SupabaseClient,
  analysisId: string,
  sectionNumber: number
): Promise<Section> {
  const { data, error } = await client
    .from("analysis_sections")
    .select("*")
    .eq("analysis_id", analysisId)
    .eq("section_number", sectionNumber)
    .single();

  if (error) throw error;
  return data as Section;
}

/**
 * Update the status of a section, optionally setting extra fields.
 */
export async function updateSectionStatus(
  client: SupabaseClient,
  id: string,
  status: string,
  extraFields?: SectionExtraFields
): Promise<Section> {
  const updates: Record<string, unknown> = {
    status,
    ...extraFields,
  };

  const { data, error } = await client
    .from("analysis_sections")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Section;
}

/**
 * Update section output after successful LLM processing.
 */
export async function updateSectionOutput(
  client: SupabaseClient,
  id: string,
  outputJson: Record<string, unknown>,
  outputMarkdown: string,
  summary: string,
  confidence: number,
  modelUsed: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<Section> {
  const { data, error } = await client
    .from("analysis_sections")
    .update({
      status: "generated",
      output_json: outputJson,
      output_markdown: outputMarkdown,
      summary,
      confidence_score: confidence,
      model_used: modelUsed,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      generation_count: 1, // Will increment in re-gen logic
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Section;
}
