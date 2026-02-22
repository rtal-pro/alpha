import { z } from "zod";

// ---------------------------------------------------------------------------
// Generic Section – Reusable Zod Schema & Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Generic schema shared by sections that do not require a specialized output
 * structure. Sections with unique output needs (e.g. market sizing, competitive
 * landscape) extend or replace this schema in section-schemas.ts.
 */
export const GenericSectionSchema = z.object({
  analysis: z
    .string()
    .describe("Main analysis text covering the section topic in depth"),

  key_findings: z
    .array(z.string())
    .min(1)
    .describe("Key findings extracted from the analysis"),

  recommendations: z
    .array(z.string())
    .describe("Actionable recommendations based on the analysis"),

  risks: z
    .array(z.string())
    .describe("Identified risks relevant to this section"),

  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Confidence score 0-100 in the analysis. Lower if data is sparse or contradictory.",
    ),

  data_gaps: z
    .array(z.string())
    .describe(
      "Areas where more data would improve confidence in the analysis",
    ),

  summary: z
    .string()
    .max(500)
    .describe("Executive summary of the section analysis (max 500 chars)"),
});

export type GenericSectionOutput = z.infer<typeof GenericSectionSchema>;

// ---------------------------------------------------------------------------
// Preferences (mirrors ProblemPromptPreferences)
// ---------------------------------------------------------------------------

export interface GenericSectionPreferences {
  /** The target market or industry vertical. */
  targetMarket?: string;
  /** Geographic focus. */
  region?: string;
  /** Any additional user instructions. */
  additionalContext?: string;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build system + user prompts for any analysis section.
 *
 * The prompts are dynamically tailored using the section title and key so
 * that the same builder can serve all generic (and some specialised) sections.
 *
 * @param sectionTitle - Human-readable section title (e.g. "Market Sizing (TAM/SAM/SOM)").
 * @param sectionKey   - Machine key (e.g. "market_sizing").
 * @param idea         - The business idea description.
 * @param prefs        - User preferences / targeting.
 * @param scrapedData  - Array of { source, content } from the scraper.
 * @returns            - { systemPrompt, userPrompt }
 */
export function buildGenericSectionPrompt(
  sectionTitle: string,
  sectionKey: string,
  idea: string,
  prefs: GenericSectionPreferences,
  scrapedData: Array<{ source: string; content: string }>,
): { systemPrompt: string; userPrompt: string } {
  // -- System prompt --------------------------------------------------------
  const systemPrompt = `You are an expert SaaS startup analyst. Your current task is to produce a detailed "${sectionTitle}" analysis for a business idea.

You MUST return your analysis as a single JSON object matching the required schema. Do not include any text outside the JSON.

IMPORTANT RULES:
1. Every claim must be backed by specific evidence from the provided research data when available. Use direct quotes or precise data references where possible.
2. Do NOT fabricate or invent evidence. If the data does not support a claim, say so explicitly.
3. If you cannot find sufficient evidence, explain in "data_gaps" and lower your confidence score accordingly.
4. Confidence scoring:
   - 80-100: Strong, consistent evidence from multiple independent sources.
   - 60-79: Good evidence but some gaps or minor contradictions.
   - 40-59: Mixed signals — evidence exists but is thin or contradictory.
   - 20-39: Weak evidence — mostly anecdotal or from a single source.
   - 0-19: Insufficient data to draw conclusions.
5. Be skeptical and objective. Actively look for counter-evidence and risks.
6. The summary must be at most 500 characters.
7. Section key for reference: "${sectionKey}".`;

  // -- User prompt ----------------------------------------------------------
  const targetMarketClause = prefs.targetMarket
    ? `\nTarget market: ${prefs.targetMarket}`
    : "";
  const regionClause = prefs.region ? `\nRegion focus: ${prefs.region}` : "";
  const additionalClause = prefs.additionalContext
    ? `\nAdditional context: ${prefs.additionalContext}`
    : "";

  const dataSection =
    scrapedData.length > 0
      ? scrapedData
          .map(
            (item, idx) =>
              `### Source ${idx + 1}: ${item.source}\n\n${item.content}`,
          )
          .join("\n\n---\n\n")
      : "No research data available. Base your analysis solely on your knowledge, and set confidence very low.";

  const userPrompt = `## Business Idea

${idea}${targetMarketClause}${regionClause}${additionalClause}

## Research Data

${dataSection}

## Instructions

Analyze the research data above and produce a "${sectionTitle}" report as a JSON object.

Focus on:
1. Providing a thorough, evidence-based analysis relevant to ${sectionTitle.toLowerCase()}.
2. Grounding findings in specific evidence from the data — use direct quotes where possible.
3. Offering actionable, specific recommendations.
4. Identifying risks and potential pitfalls.
5. Noting gaps in the data that reduce confidence.

Return ONLY a valid JSON object matching the required schema. No markdown fences, no extra text.`;

  return { systemPrompt, userPrompt };
}
