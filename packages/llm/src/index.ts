// Client
export { AnthropicClient, MODELS, type ModelId } from "./client/anthropic.js";
export { CostTracker, type CostRecord } from "./client/cost-tracker.js";

// Output
export { OutputParser } from "./output/parser.js";
export { validateSectionOutput, type ValidationResult } from "./output/validator.js";

// Context
export {
  ContextBuilder,
  type SectionConfig,
  type ScrapedDataItem,
  type ParentOutput,
  type ContextBuildResult,
} from "./context/builder.js";

// Prompts – Section 01
export {
  ProblemValidationSchema,
  buildProblemPrompt,
  type ProblemValidationOutput,
  type ProblemPromptPreferences,
} from "./prompts/sections/01-problem.js";

// Prompts – Generic section builder
export {
  GenericSectionSchema,
  buildGenericSectionPrompt,
  type GenericSectionOutput,
  type GenericSectionPreferences,
} from "./prompts/sections/generic-section.js";

// Prompts – Section-specific schemas (02-18)
export {
  MarketSizingSchema,
  type MarketSizingOutput,
  CompetitiveLandscapeSchema,
  type CompetitiveLandscapeOutput,
  CompetitiveMoatSchema,
  type CompetitiveMoatOutput,
  RegulatoryComplianceSchema,
  type RegulatoryComplianceOutput,
  TargetPersonaSchema,
  type TargetPersonaOutput,
  BusinessModelSchema,
  type BusinessModelOutput,
  UnitEconomicsSchema,
  type UnitEconomicsOutput,
  GoToMarketSchema,
  type GoToMarketOutput,
  SeoContentSchema,
  type SeoContentOutput,
  TechnicalArchitectureSchema,
  type TechnicalArchitectureOutput,
  MvpScopeSchema,
  type MvpScopeOutput,
  DevelopmentTimelineSchema,
  type DevelopmentTimelineOutput,
  RiskAssessmentSchema,
  type RiskAssessmentOutput,
  FinancialProjectionsSchema,
  type FinancialProjectionsOutput,
  FundingAnalysisSchema,
  type FundingAnalysisOutput,
  LaunchChecklistSchema,
  type LaunchChecklistOutput,
  KillPivotCriteriaSchema,
  type KillPivotCriteriaOutput,
} from "./prompts/sections/section-schemas.js";

// Orchestrator
export {
  SectionRunner,
  type SectionPreferences,
  type SectionOutput,
} from "./orchestrator/section-runner.js";
export { AnalysisPipeline } from "./orchestrator/pipeline.js";
