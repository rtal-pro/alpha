import { z } from "zod";
import { GenericSectionSchema } from "./generic-section.js";

// ---------------------------------------------------------------------------
// Section 02 – Market Sizing (TAM/SAM/SOM)
// ---------------------------------------------------------------------------

export const MarketSizingSchema = GenericSectionSchema.extend({
  tam: z
    .number()
    .describe("Total Addressable Market estimate in USD"),
  sam: z
    .number()
    .describe("Serviceable Addressable Market estimate in USD"),
  som: z
    .number()
    .describe("Serviceable Obtainable Market estimate in USD"),
  methodology: z
    .string()
    .describe("Description of the methodology used to derive TAM/SAM/SOM"),
  assumptions: z
    .array(z.string())
    .describe("Key assumptions underlying the market size estimates"),
});

export type MarketSizingOutput = z.infer<typeof MarketSizingSchema>;

// ---------------------------------------------------------------------------
// Section 03 – Competitive Landscape
// ---------------------------------------------------------------------------

const CompetitorSchema = z.object({
  name: z.string().describe("Competitor name"),
  strengths: z
    .array(z.string())
    .describe("Key strengths of this competitor"),
  weaknesses: z
    .array(z.string())
    .describe("Key weaknesses of this competitor"),
  market_share: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Estimated market share percentage (0-100), if known"),
});

export const CompetitiveLandscapeSchema = GenericSectionSchema.extend({
  competitors: z
    .array(CompetitorSchema)
    .describe("List of identified competitors with analysis"),
});

export type CompetitiveLandscapeOutput = z.infer<typeof CompetitiveLandscapeSchema>;

// ---------------------------------------------------------------------------
// Section 04 – Competitive Moat Analysis
// ---------------------------------------------------------------------------

export const CompetitiveMoatSchema = GenericSectionSchema;
export type CompetitiveMoatOutput = z.infer<typeof CompetitiveMoatSchema>;

// ---------------------------------------------------------------------------
// Section 05 – Regulatory & Compliance Scan
// ---------------------------------------------------------------------------

export const RegulatoryComplianceSchema = GenericSectionSchema;
export type RegulatoryComplianceOutput = z.infer<typeof RegulatoryComplianceSchema>;

// ---------------------------------------------------------------------------
// Section 06 – Target Persona
// ---------------------------------------------------------------------------

export const TargetPersonaSchema = GenericSectionSchema;
export type TargetPersonaOutput = z.infer<typeof TargetPersonaSchema>;

// ---------------------------------------------------------------------------
// Section 07 – Business Model Design
// ---------------------------------------------------------------------------

const PricingTierSchema = z.object({
  name: z.string().describe("Tier name (e.g. Free, Starter, Pro, Enterprise)"),
  price: z.string().describe("Price point or range (e.g. '$29/mo', 'Custom')"),
  features: z
    .array(z.string())
    .describe("Key features included in this tier"),
});

export const BusinessModelSchema = GenericSectionSchema.extend({
  revenue_model: z
    .string()
    .describe(
      "Primary revenue model (e.g. subscription, usage-based, freemium, marketplace)",
    ),
  pricing_tiers: z
    .array(PricingTierSchema)
    .describe("Proposed pricing tiers"),
  unit_economics_summary: z
    .string()
    .describe("High-level summary of expected unit economics"),
});

export type BusinessModelOutput = z.infer<typeof BusinessModelSchema>;

// ---------------------------------------------------------------------------
// Section 08 – Unit Economics
// ---------------------------------------------------------------------------

export const UnitEconomicsSchema = GenericSectionSchema;
export type UnitEconomicsOutput = z.infer<typeof UnitEconomicsSchema>;

// ---------------------------------------------------------------------------
// Section 09 – Go-to-Market Strategy
// ---------------------------------------------------------------------------

export const GoToMarketSchema = GenericSectionSchema;
export type GoToMarketOutput = z.infer<typeof GoToMarketSchema>;

// ---------------------------------------------------------------------------
// Section 10 – SEO & Content Opportunity
// ---------------------------------------------------------------------------

export const SeoContentSchema = GenericSectionSchema;
export type SeoContentOutput = z.infer<typeof SeoContentSchema>;

// ---------------------------------------------------------------------------
// Section 11 – Technical Architecture
// ---------------------------------------------------------------------------

export const TechnicalArchitectureSchema = GenericSectionSchema;
export type TechnicalArchitectureOutput = z.infer<typeof TechnicalArchitectureSchema>;

// ---------------------------------------------------------------------------
// Section 12 – MVP Scope & Feature Prioritization
// ---------------------------------------------------------------------------

export const MvpScopeSchema = GenericSectionSchema;
export type MvpScopeOutput = z.infer<typeof MvpScopeSchema>;

// ---------------------------------------------------------------------------
// Section 13 – Development Timeline & Milestones
// ---------------------------------------------------------------------------

export const DevelopmentTimelineSchema = GenericSectionSchema;
export type DevelopmentTimelineOutput = z.infer<typeof DevelopmentTimelineSchema>;

// ---------------------------------------------------------------------------
// Section 14 – Risk Assessment
// ---------------------------------------------------------------------------

export const RiskAssessmentSchema = GenericSectionSchema;
export type RiskAssessmentOutput = z.infer<typeof RiskAssessmentSchema>;

// ---------------------------------------------------------------------------
// Section 15 – Financial Projections (3 years)
// ---------------------------------------------------------------------------

const YearProjectionSchema = z.object({
  revenue: z.number().describe("Projected revenue in USD"),
  costs: z.number().describe("Projected total costs in USD"),
  profit: z.number().describe("Projected profit (revenue - costs) in USD"),
  customers: z
    .number()
    .int()
    .describe("Projected number of paying customers"),
});

export const FinancialProjectionsSchema = GenericSectionSchema.extend({
  year1: YearProjectionSchema.describe("Year 1 financial projections"),
  year2: YearProjectionSchema.describe("Year 2 financial projections"),
  year3: YearProjectionSchema.describe("Year 3 financial projections"),
});

export type FinancialProjectionsOutput = z.infer<typeof FinancialProjectionsSchema>;

// ---------------------------------------------------------------------------
// Section 16 – Funding & Bootstrap Analysis
// ---------------------------------------------------------------------------

export const FundingAnalysisSchema = GenericSectionSchema;
export type FundingAnalysisOutput = z.infer<typeof FundingAnalysisSchema>;

// ---------------------------------------------------------------------------
// Section 17 – Launch Checklist
// ---------------------------------------------------------------------------

export const LaunchChecklistSchema = GenericSectionSchema;
export type LaunchChecklistOutput = z.infer<typeof LaunchChecklistSchema>;

// ---------------------------------------------------------------------------
// Section 18 – Kill / Pivot Criteria
// ---------------------------------------------------------------------------

export const KillPivotCriteriaSchema = GenericSectionSchema;
export type KillPivotCriteriaOutput = z.infer<typeof KillPivotCriteriaSchema>;
