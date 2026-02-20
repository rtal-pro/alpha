import { z } from "zod";

// ---------------------------------------------------------------------------
// Problem Validation – Section 01 Zod Schema
// ---------------------------------------------------------------------------

const ProblemItemSchema = z.object({
  problem: z.string().describe("Clear statement of the problem identified"),
  severity: z
    .enum(["critical", "major", "moderate", "minor"])
    .describe("How severe this problem is for the people experiencing it"),
  frequency: z
    .enum(["daily", "weekly", "monthly", "occasionally"])
    .describe("How often people encounter this problem"),
  who_experiences: z
    .string()
    .describe("Description of the target persona or group affected"),
  evidence: z
    .array(z.string())
    .min(1)
    .describe(
      "Direct quotes, data points, or specific references from the scraped data",
    ),
  current_workaround: z
    .string()
    .describe("What people currently do to work around this problem"),
  willingness_to_pay_signal: z
    .enum(["strong", "moderate", "weak", "none"])
    .describe("Strength of signal that users would pay for a solution"),
});

const SentimentDistributionSchema = z.object({
  frustrated: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of sources expressing frustration"),
  neutral: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of sources with neutral sentiment"),
  seeking_solution: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage of sources actively seeking a solution"),
});

export const ProblemValidationSchema = z.object({
  problems_identified: z
    .array(ProblemItemSchema)
    .describe("List of distinct problems identified from the research data"),

  total_mentions_found: z
    .number()
    .int()
    .min(0)
    .describe("Total number of problem mentions found across all sources"),

  sources_analyzed: z
    .number()
    .int()
    .min(0)
    .describe("Number of distinct sources analyzed"),

  sentiment_distribution: SentimentDistributionSchema.describe(
    "Distribution of sentiment across analyzed sources (should sum to ~100)",
  ),

  problem_exists: z
    .boolean()
    .describe("Overall assessment: does the problem genuinely exist?"),

  problem_severity_overall: z
    .enum(["critical", "significant", "moderate", "low", "unclear"])
    .describe("Overall severity of the problem across all evidence"),

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
    .describe("Executive summary of the problem validation (max 500 chars)"),
});

export type ProblemValidationOutput = z.infer<typeof ProblemValidationSchema>;

// ---------------------------------------------------------------------------
// Prompt builder for Section 01 – Problem Validation
// ---------------------------------------------------------------------------

export interface ProblemPromptPreferences {
  /** The target market or industry vertical. */
  targetMarket?: string;
  /** Geographic focus. */
  region?: string;
  /** Any additional user instructions. */
  additionalContext?: string;
}

/**
 * Build the full system + user prompt for the Problem Validation section.
 *
 * @param idea        - The business idea description.
 * @param prefs       - User preferences / targeting.
 * @param scrapedData - Array of { source, content } from the scraper.
 * @returns           - { systemPrompt, userPrompt }
 */
export function buildProblemPrompt(
  idea: string,
  prefs: ProblemPromptPreferences,
  scrapedData: Array<{ source: string; content: string }>,
): { systemPrompt: string; userPrompt: string } {
  // -- System prompt ------------------------------------------------------
  const systemPrompt = `You are an expert market research analyst specializing in problem validation for SaaS startups. Your job is to analyze research data and determine whether a real, meaningful problem exists that people would pay to solve.

You MUST return your analysis as a single JSON object matching the required schema. Do not include any text outside the JSON.

IMPORTANT RULES:
1. Every claim must be backed by specific evidence from the provided research data. Use direct quotes or precise data references in the "evidence" arrays.
2. Do NOT fabricate or invent evidence. If the data does not support a claim, say so explicitly.
3. If you cannot find sufficient evidence, set "problem_exists" to false and explain in "data_gaps".
4. Confidence scoring:
   - 80-100: Strong, consistent evidence from multiple independent sources.
   - 60-79: Good evidence but some gaps or minor contradictions.
   - 40-59: Mixed signals — evidence exists but is thin or contradictory.
   - 20-39: Weak evidence — mostly anecdotal or from a single source.
   - 0-19: Insufficient data to draw conclusions.
5. Be skeptical. Confirmation bias is the enemy. Actively look for counter-evidence.
6. Distinguish between "people complain about X" and "people would pay to solve X."
7. The summary must be at most 500 characters.`;

  // -- User prompt --------------------------------------------------------
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

Analyze the research data above and produce a Problem Validation report as a JSON object.

Focus on:
1. Identifying distinct, real problems that the target users experience.
2. Grounding every problem in specific evidence from the data — use direct quotes where possible.
3. Assessing severity, frequency, and willingness to pay for each problem.
4. Determining overall whether the problem genuinely exists and is worth solving.
5. Identifying gaps in the data that reduce confidence.

Return ONLY a valid JSON object matching the required schema. No markdown fences, no extra text.`;

  return { systemPrompt, userPrompt };
}
