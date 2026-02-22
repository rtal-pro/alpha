import type { ZodSchema, ZodTypeDef } from "zod";
import { ProblemValidationSchema } from "../prompts/sections/01-problem.js";
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

/**
 * Registry mapping section keys to their Zod schemas.
 * Expand this as more sections are added.
 */
const SECTION_SCHEMAS: Record<string, ZodSchema<unknown, ZodTypeDef, unknown>> = {
  "01-problem": ProblemValidationSchema,
  "02-market_sizing": MarketSizingSchema,
  "03-competitive_landscape": CompetitiveLandscapeSchema,
  "04-competitive_moat": CompetitiveMoatSchema,
  "05-regulatory_compliance": RegulatoryComplianceSchema,
  "06-target_persona": TargetPersonaSchema,
  "07-business_model": BusinessModelSchema,
  "08-unit_economics": UnitEconomicsSchema,
  "09-go_to_market": GoToMarketSchema,
  "10-seo_content": SeoContentSchema,
  "11-technical_architecture": TechnicalArchitectureSchema,
  "12-mvp_scope": MvpScopeSchema,
  "13-development_timeline": DevelopmentTimelineSchema,
  "14-risk_assessment": RiskAssessmentSchema,
  "15-financial_projections": FinancialProjectionsSchema,
  "16-funding_analysis": FundingAnalysisSchema,
  "17-launch_checklist": LaunchChecklistSchema,
  "18-kill_pivot_criteria": KillPivotCriteriaSchema,
};

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate section output data against the section's registered Zod schema.
 */
export function validateSectionOutput(
  sectionKey: string,
  data: unknown,
): ValidationResult {
  const schema = SECTION_SCHEMAS[sectionKey];

  if (!schema) {
    return {
      valid: false,
      errors: [`No schema registered for section: ${sectionKey}`],
    };
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.issues.map(
    (issue) => `[${issue.path.join(".")}] ${issue.message}`,
  );

  return { valid: false, errors };
}
