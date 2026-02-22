import type { ZodSchema, ZodTypeDef } from "zod";
import { AnthropicClient, MODELS, type ModelId } from "../client/anthropic.js";
import { CostTracker } from "../client/cost-tracker.js";
import {
  ContextBuilder,
  type SectionConfig,
  type ScrapedDataItem,
  type ParentOutput,
} from "../context/builder.js";
import { OutputParser } from "../output/parser.js";
import { validateSectionOutput } from "../output/validator.js";
import {
  ProblemValidationSchema,
  buildProblemPrompt,
  type ProblemPromptPreferences,
} from "../prompts/sections/01-problem.js";
import {
  buildGenericSectionPrompt,
  type GenericSectionPreferences,
} from "../prompts/sections/generic-section.js";
import {
  MarketSizingSchema,
  CompetitiveLandscapeSchema,
  CompetitiveMoatSchema,
  RegulatoryComplianceSchema,
  TargetPersonaSchema,
  BusinessModelSchema,
  UnitEconomicsSchema,
  GoToMarketSchema,
  SeoContentSchema,
  TechnicalArchitectureSchema,
  MvpScopeSchema,
  DevelopmentTimelineSchema,
  RiskAssessmentSchema,
  FinancialProjectionsSchema,
  FundingAnalysisSchema,
  LaunchChecklistSchema,
  KillPivotCriteriaSchema,
} from "../prompts/sections/section-schemas.js";

// ---------------------------------------------------------------------------
// Section registry — maps section keys to their config, schema, and prompt
// builder. Expand this as more sections are added.
// ---------------------------------------------------------------------------

interface SectionDefinition {
  config: SectionConfig;
  schema: ZodSchema<unknown, ZodTypeDef, unknown>;
  buildPrompt: (
    idea: string,
    prefs: SectionPreferences,
    scrapedData: Array<{ source: string; content: string }>,
  ) => { systemPrompt: string; userPrompt: string };
}

/**
 * Helper to create a SectionDefinition that uses the generic prompt builder.
 */
function genericDef(
  key: string,
  title: string,
  schema: ZodSchema<unknown, ZodTypeDef, unknown>,
  dependencies: string[] = [],
  transitiveDependencies: string[] = [],
): SectionDefinition {
  return {
    config: { key, title, dependencies, transitiveDependencies },
    schema,
    buildPrompt: (idea, prefs, data) =>
      buildGenericSectionPrompt(
        title,
        key,
        idea,
        prefs as GenericSectionPreferences,
        data,
      ),
  };
}

const SECTION_REGISTRY: Record<string, SectionDefinition> = {
  "01-problem": {
    config: {
      key: "01-problem",
      title: "Problem Validation",
      dependencies: [],
      transitiveDependencies: [],
    },
    schema: ProblemValidationSchema,
    buildPrompt: (idea, prefs, data) =>
      buildProblemPrompt(idea, prefs as ProblemPromptPreferences, data),
  },

  "02-market_sizing": genericDef(
    "02-market_sizing",
    "Market Sizing (TAM/SAM/SOM)",
    MarketSizingSchema,
    ["01-problem"],
  ),

  "03-competitive_landscape": genericDef(
    "03-competitive_landscape",
    "Competitive Landscape",
    CompetitiveLandscapeSchema,
    ["01-problem"],
  ),

  "04-competitive_moat": genericDef(
    "04-competitive_moat",
    "Competitive Moat Analysis",
    CompetitiveMoatSchema,
    ["03-competitive_landscape"],
  ),

  "05-regulatory_compliance": genericDef(
    "05-regulatory_compliance",
    "Regulatory & Compliance Scan",
    RegulatoryComplianceSchema,
  ),

  "06-target_persona": genericDef(
    "06-target_persona",
    "Target Persona",
    TargetPersonaSchema,
    ["01-problem"],
  ),

  "07-business_model": genericDef(
    "07-business_model",
    "Business Model Design",
    BusinessModelSchema,
    ["02-market_sizing", "03-competitive_landscape", "06-target_persona"],
  ),

  "08-unit_economics": genericDef(
    "08-unit_economics",
    "Unit Economics",
    UnitEconomicsSchema,
    ["07-business_model"],
  ),

  "09-go_to_market": genericDef(
    "09-go_to_market",
    "Go-to-Market Strategy",
    GoToMarketSchema,
    ["06-target_persona", "07-business_model"],
  ),

  "10-seo_content": genericDef(
    "10-seo_content",
    "SEO & Content Opportunity",
    SeoContentSchema,
    ["09-go_to_market"],
  ),

  "11-technical_architecture": genericDef(
    "11-technical_architecture",
    "Technical Architecture",
    TechnicalArchitectureSchema,
    ["03-competitive_landscape"],
  ),

  "12-mvp_scope": genericDef(
    "12-mvp_scope",
    "MVP Scope & Feature Prioritization",
    MvpScopeSchema,
    ["01-problem", "03-competitive_landscape", "06-target_persona"],
  ),

  "13-development_timeline": genericDef(
    "13-development_timeline",
    "Development Timeline & Milestones",
    DevelopmentTimelineSchema,
    ["11-technical_architecture", "12-mvp_scope"],
  ),

  "14-risk_assessment": genericDef(
    "14-risk_assessment",
    "Risk Assessment",
    RiskAssessmentSchema,
    [
      "01-problem",
      "02-market_sizing",
      "03-competitive_landscape",
      "05-regulatory_compliance",
      "07-business_model",
      "08-unit_economics",
    ],
  ),

  "15-financial_projections": genericDef(
    "15-financial_projections",
    "Financial Projections (3 years)",
    FinancialProjectionsSchema,
    ["07-business_model", "08-unit_economics", "02-market_sizing"],
  ),

  "16-funding_analysis": genericDef(
    "16-funding_analysis",
    "Funding & Bootstrap Analysis",
    FundingAnalysisSchema,
    ["08-unit_economics", "15-financial_projections"],
  ),

  "17-launch_checklist": genericDef(
    "17-launch_checklist",
    "Launch Checklist",
    LaunchChecklistSchema,
    ["05-regulatory_compliance", "11-technical_architecture", "12-mvp_scope"],
  ),

  "18-kill_pivot_criteria": genericDef(
    "18-kill_pivot_criteria",
    "Kill / Pivot Criteria",
    KillPivotCriteriaSchema,
    [
      "01-problem",
      "02-market_sizing",
      "03-competitive_landscape",
      "07-business_model",
      "14-risk_assessment",
      "15-financial_projections",
    ],
  ),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectionPreferences {
  targetMarket?: string;
  region?: string;
  additionalContext?: string;
}

export interface SectionOutput {
  sectionKey: string;
  sectionNumber: number;
  data: unknown;
  rawResponse: string;
  parseAttempts: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: ModelId;
}

// ---------------------------------------------------------------------------
// SectionRunner
// ---------------------------------------------------------------------------

/**
 * Runs a single analysis section end-to-end:
 *   build context -> call LLM (Sonnet) -> parse output -> validate -> return
 *
 * On validation failure, retries once with error feedback appended to the prompt.
 */
export class SectionRunner {
  private client: AnthropicClient;
  private costTracker: CostTracker;
  private contextBuilder: ContextBuilder;
  private maxValidationRetries: number;

  constructor(
    client?: AnthropicClient,
    costTracker?: CostTracker,
    contextBuilder?: ContextBuilder,
    maxValidationRetries: number = 1,
  ) {
    this.client = client ?? new AnthropicClient();
    this.costTracker = costTracker ?? new CostTracker();
    this.contextBuilder = contextBuilder ?? new ContextBuilder();
    this.maxValidationRetries = maxValidationRetries;
  }

  /**
   * Run a section of the analysis pipeline.
   */
  async run(
    analysisId: string,
    sectionNumber: number,
    idea: string,
    preferences: SectionPreferences,
    scrapedData: ScrapedDataItem[],
    parentOutputs: ParentOutput[],
  ): Promise<SectionOutput> {
    const sectionKey = this.sectionKeyFromNumber(sectionNumber);
    const definition = SECTION_REGISTRY[sectionKey];

    if (!definition) {
      throw new Error(
        `No section definition registered for section number ${sectionNumber} (key: ${sectionKey})`,
      );
    }

    // Build flat scraped data for prompt builder
    const flatScrapedData = scrapedData.map((item) => ({
      source: item.source,
      content: item.content,
    }));

    // Build prompts
    const { systemPrompt, userPrompt: baseUserPrompt } =
      definition.buildPrompt(idea, preferences, flatScrapedData);

    // Also build context-enriched prompt via ContextBuilder (for parent outputs)
    const contextResult = this.contextBuilder.buildForSection(
      definition.config,
      idea,
      scrapedData,
      parentOutputs,
    );

    // If there are parent outputs, use the context-enriched prompt; otherwise
    // use the section-specific prompt directly (it already includes scraped data).
    const userPrompt =
      parentOutputs.length > 0
        ? `${baseUserPrompt}\n\n---\n\n${contextResult.prompt}`
        : baseUserPrompt;

    const model = MODELS.SONNET;
    const maxTokens = 4096;

    // Call LLM
    const response = await this.client.generate(
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
    );

    // Track cost
    const costRecord = this.costTracker.record(
      analysisId,
      sectionNumber,
      model,
      response.inputTokens,
      response.outputTokens,
    );

    // Parse output
    const parser = new OutputParser(definition.schema, this.client);
    const parseResult = await parser.parse(response.text);

    // Validate
    const validation = validateSectionOutput(sectionKey, parseResult.data);

    if (validation.valid) {
      return {
        sectionKey,
        sectionNumber,
        data: parseResult.data,
        rawResponse: response.text,
        parseAttempts: parseResult.attempts,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd: costRecord.totalCost,
        model,
      };
    }

    // -- Validation failed: retry with error feedback -----------------------
    for (let retry = 0; retry < this.maxValidationRetries; retry++) {
      const errorFeedback = validation.errors?.join("\n") ?? "Unknown validation error";

      const retryUserPrompt =
        `${userPrompt}\n\n` +
        `## Validation Errors From Previous Attempt\n\n` +
        `Your previous response failed validation with the following errors:\n` +
        `${errorFeedback}\n\n` +
        `Please fix these issues and return a corrected JSON object.`;

      const retryResponse = await this.client.generate(
        model,
        systemPrompt,
        retryUserPrompt,
        maxTokens,
      );

      const retryCostRecord = this.costTracker.record(
        analysisId,
        sectionNumber,
        model,
        retryResponse.inputTokens,
        retryResponse.outputTokens,
      );

      const retryParsed = await parser.parse(retryResponse.text);
      const retryValidation = validateSectionOutput(sectionKey, retryParsed.data);

      if (retryValidation.valid) {
        return {
          sectionKey,
          sectionNumber,
          data: retryParsed.data,
          rawResponse: retryResponse.text,
          parseAttempts: parseResult.attempts + retryParsed.attempts,
          inputTokens: response.inputTokens + retryResponse.inputTokens,
          outputTokens: response.outputTokens + retryResponse.outputTokens,
          costUsd: costRecord.totalCost + retryCostRecord.totalCost,
          model,
        };
      }
    }

    // If all retries exhausted, throw with the validation errors
    throw new Error(
      `Section ${sectionKey} failed validation after ${this.maxValidationRetries + 1} attempts. ` +
        `Errors: ${validation.errors?.join("; ") ?? "unknown"}`,
    );
  }

  /**
   * Map a 1-based section number to its registry key.
   * Convention: section 1 -> "01-problem", etc.
   */
  private sectionKeyFromNumber(sectionNumber: number): string {
    const padded = String(sectionNumber).padStart(2, "0");
    // Look up in registry by prefix
    const key = Object.keys(SECTION_REGISTRY).find((k) =>
      k.startsWith(padded),
    );
    return key ?? `${padded}-unknown`;
  }

  /** Expose the cost tracker for external inspection. */
  getCostTracker(): CostTracker {
    return this.costTracker;
  }
}
