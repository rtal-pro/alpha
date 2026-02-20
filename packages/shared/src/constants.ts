// ============================================================
// LLM Models & Pricing
// ============================================================

export const MODELS = {
  SONNET: 'claude-sonnet-4-5-20250929',
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  [MODELS.SONNET]: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  [MODELS.HAIKU]: { input: 0.80 / 1_000_000, output: 4.0 / 1_000_000 },
};

// ============================================================
// Context Window Budgets
// ============================================================

export const MAX_INPUT_TOKENS = 150_000;
export const OUTPUT_RESERVE = 8_000;
export const FIXED_OVERHEAD = 3_000;

// ============================================================
// Default budget per analysis (USD)
// ============================================================

export const DEFAULT_ANALYSIS_BUDGET_USD = 5.0;

// ============================================================
// Scraper config
// ============================================================

export const SCRAPER_CONCURRENCY: Record<string, number> = {
  reddit: 3,
  producthunt: 1,
  github: 2,
  google_trends: 1,
  appsumo: 1,
  indiehackers: 1,
  eurlex: 2,
  legifrance: 1,
  pappers: 1,
  serpapi: 2,
  insee: 2,
  hacker_news: 2,
};

export const CACHE_TTL_HOURS: Record<string, number> = {
  reddit: 24,
  producthunt: 48,
  github: 48,
  google_trends: 168,
  serpapi_g2: 336,
  serpapi_capterra: 336,
  eurlex: 720,
  legifrance: 720,
  insee: 2160,
  data_gouv: 2160,
  appsumo: 48,
  indiehackers: 48,
  hacker_news: 24,
  ycombinator: 720,
};

// ============================================================
// Section numbers
// ============================================================

export const SECTION_KEYS = {
  1: 'problem_validation',
  2: 'market_sizing',
  3: 'competitive_landscape',
  4: 'competitive_moat',
  5: 'regulatory_compliance',
  6: 'target_persona',
  7: 'business_model',
  8: 'unit_economics',
  9: 'go_to_market',
  10: 'seo_content',
  11: 'technical_architecture',
  12: 'mvp_scope',
  13: 'development_timeline',
  14: 'risk_assessment',
  15: 'financial_projections',
  16: 'funding_analysis',
  17: 'launch_checklist',
  18: 'kill_pivot_criteria',
} as const;

export const SECTION_TITLES: Record<number, string> = {
  1: 'Problem Validation',
  2: 'Market Sizing (TAM/SAM/SOM)',
  3: 'Competitive Landscape',
  4: 'Competitive Moat Analysis',
  5: 'Regulatory & Compliance Scan',
  6: 'Target Persona',
  7: 'Business Model Design',
  8: 'Unit Economics',
  9: 'Go-to-Market Strategy',
  10: 'SEO & Content Opportunity',
  11: 'Technical Architecture',
  12: 'MVP Scope & Feature Prioritization',
  13: 'Development Timeline & Milestones',
  14: 'Risk Assessment',
  15: 'Financial Projections (3 years)',
  16: 'Funding & Bootstrap Analysis',
  17: 'Launch Checklist',
  18: 'Kill / Pivot Criteria',
};
