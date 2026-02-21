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

// ============================================================
// Domain Profiles (intelligence engine)
// ============================================================

import type { DomainProfile } from './types';

export const DOMAIN_PROFILES: DomainProfile[] = [
  {
    id: 'fintech',
    name: 'Fintech / Payment / Banking',
    signalWeights: {
      product_launch: 0.05, funding_round: 0.15, traffic_spike: 0.05,
      review_surge: 0.05, community_buzz: 0.05, regulatory_event: 0.25,
      oss_traction: 0.03, company_registration: 0.07, pricing_change: 0.08,
      pain_point_cluster: 0.10, search_trend: 0.05, market_entry: 0.04, market_exit: 0.03,
    },
    primarySources: ['eurlex', 'legifrance', 'crunchbase', 'pappers'],
    secondarySources: ['reddit', 'producthunt', 'hacker_news', 'google_trends'],
    irrelevantSources: ['appsumo', 'indiehackers'],
    crossingRules: [
      {
        name: 'regulatory_opportunity',
        description: 'New regulation + no FR solution + growing search demand',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 60 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
      {
        name: 'competitor_gap',
        description: 'US funding + no FR equivalent + pain points detected',
        conditions: [
          { signal_type: 'funding_round', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
    ],
    keywords: ['fintech', 'payment', 'banking', 'neobank', 'lending', 'invoice', 'billing', 'PSD2', 'DORA'],
    categories: ['payment_processing', 'banking', 'lending', 'invoicing', 'accounting', 'expense_management'],
  },
  {
    id: 'devtools',
    name: 'Developer Tools / Infrastructure',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.08, traffic_spike: 0.05,
      review_surge: 0.05, community_buzz: 0.12, regulatory_event: 0.02,
      oss_traction: 0.20, company_registration: 0.03, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.08, market_entry: 0.05, market_exit: 0.02,
    },
    primarySources: ['github', 'hacker_news', 'producthunt', 'reddit'],
    secondarySources: ['google_trends', 'crunchbase', 'serpapi_g2'],
    irrelevantSources: ['legifrance', 'insee', 'pappers'],
    crossingRules: [
      {
        name: 'oss_commercial_gap',
        description: 'Popular OSS tool + community demand + no hosted offering',
        conditions: [
          { signal_type: 'oss_traction', min_strength: 60 },
          { signal_type: 'community_buzz', min_strength: 40 },
        ],
      },
      {
        name: 'pain_point_opportunity',
        description: 'Developer pain + search demand + competitor weakness',
        conditions: [
          { signal_type: 'pain_point_cluster', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    keywords: ['developer tools', 'devops', 'CI/CD', 'API', 'SDK', 'monitoring', 'testing', 'database'],
    categories: ['ci_cd', 'monitoring', 'testing', 'api_tools', 'databases', 'infrastructure'],
  },
  {
    id: 'general_saas',
    name: 'General SaaS',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.10, traffic_spike: 0.08,
      review_surge: 0.08, community_buzz: 0.08, regulatory_event: 0.05,
      oss_traction: 0.05, company_registration: 0.05, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.06, market_exit: 0.05,
    },
    primarySources: ['producthunt', 'reddit', 'google_trends', 'serpapi_g2'],
    secondarySources: ['crunchbase', 'hacker_news', 'appsumo', 'indiehackers'],
    irrelevantSources: ['eurlex', 'legifrance'],
    crossingRules: [
      {
        name: 'geo_gap',
        description: 'Strong US product + growing search FR + no local player',
        conditions: [
          { signal_type: 'product_launch', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
      {
        name: 'convergence',
        description: 'Multiple signal types converging on same category',
        conditions: [
          { signal_type: 'community_buzz', min_strength: 30 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    keywords: ['SaaS', 'B2B', 'software', 'tool', 'platform', 'app'],
    categories: ['project_management', 'crm', 'marketing', 'analytics', 'collaboration', 'automation'],
  },
  {
    id: 'compliance_legal',
    name: 'Compliance & Legal Tech',
    signalWeights: {
      product_launch: 0.05, funding_round: 0.08, traffic_spike: 0.03,
      review_surge: 0.05, community_buzz: 0.03, regulatory_event: 0.30,
      oss_traction: 0.02, company_registration: 0.08, pricing_change: 0.05,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.05, market_exit: 0.04,
    },
    primarySources: ['eurlex', 'legifrance', 'data_gouv', 'pappers'],
    secondarySources: ['crunchbase', 'producthunt', 'google_trends'],
    irrelevantSources: ['github', 'appsumo'],
    crossingRules: [
      {
        name: 'forced_adoption',
        description: 'Mandatory regulation + no solution exists + company registrations in sector',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 70 },
          { signal_type: 'company_registration', min_strength: 30 },
        ],
      },
      {
        name: 'compliance_pain',
        description: 'Regulation complexity + pain points + search demand',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
    ],
    keywords: ['compliance', 'RGPD', 'GDPR', 'legal', 'regulation', 'audit', 'DPO', 'NIS2'],
    categories: ['gdpr', 'compliance', 'legal_ops', 'audit', 'risk_management', 'contract_management'],
  },
  {
    id: 'hr_workforce',
    name: 'HR & Workforce',
    signalWeights: {
      product_launch: 0.08, funding_round: 0.10, traffic_spike: 0.05,
      review_surge: 0.08, community_buzz: 0.05, regulatory_event: 0.15,
      oss_traction: 0.02, company_registration: 0.05, pricing_change: 0.07,
      pain_point_cluster: 0.15, search_trend: 0.10, market_entry: 0.05, market_exit: 0.05,
    },
    primarySources: ['producthunt', 'serpapi_g2', 'crunchbase', 'legifrance'],
    secondarySources: ['reddit', 'google_trends', 'appsumo'],
    irrelevantSources: ['github', 'eurlex'],
    crossingRules: [
      {
        name: 'hr_regulation_gap',
        description: 'New labor law + no tool for compliance + growing complaints',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
      {
        name: 'hr_tool_gap',
        description: 'Popular US HR tool + no FR localization',
        conditions: [
          { signal_type: 'product_launch', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    keywords: ['HR', 'recrutement', 'paie', 'payroll', 'talent', 'onboarding', 'CSE', 'BDESE'],
    categories: ['recruitment', 'payroll', 'onboarding', 'performance', 'benefits', 'workforce_planning'],
  },
  {
    id: 'restaurant_hospitality',
    name: 'Restaurant & Hospitality',
    signalWeights: {
      product_launch: 0.08, funding_round: 0.08, traffic_spike: 0.05,
      review_surge: 0.10, community_buzz: 0.08, regulatory_event: 0.12,
      oss_traction: 0.02, company_registration: 0.10, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.08, market_entry: 0.05, market_exit: 0.04,
    },
    primarySources: ['google_trends', 'serpapi_g2', 'insee', 'pappers'],
    secondarySources: ['producthunt', 'reddit', 'appsumo'],
    irrelevantSources: ['github', 'eurlex'],
    crossingRules: [
      {
        name: 'regulatory_digitization',
        description: 'New mandatory digital requirement for restaurants',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 60 },
          { signal_type: 'company_registration', min_strength: 30 },
        ],
      },
      {
        name: 'market_gap',
        description: 'Popular restaurant tech abroad + no FR equivalent',
        conditions: [
          { signal_type: 'product_launch', min_strength: 40 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    keywords: ['restaurant', 'hotel', 'bar', 'cafe', 'catering', 'POS', 'reservation', 'delivery'],
    categories: ['pos', 'reservations', 'delivery', 'inventory', 'staff_scheduling', 'reviews_management'],
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Medtech',
    signalWeights: {
      product_launch: 0.05, funding_round: 0.10, traffic_spike: 0.03,
      review_surge: 0.05, community_buzz: 0.03, regulatory_event: 0.25,
      oss_traction: 0.02, company_registration: 0.08, pricing_change: 0.05,
      pain_point_cluster: 0.15, search_trend: 0.08, market_entry: 0.06, market_exit: 0.05,
    },
    primarySources: ['eurlex', 'legifrance', 'crunchbase', 'data_gouv'],
    secondarySources: ['producthunt', 'google_trends', 'pappers'],
    irrelevantSources: ['github', 'appsumo', 'indiehackers'],
    crossingRules: [
      {
        name: 'health_regulation',
        description: 'New health regulation + no digital solution + pain points',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 60 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
      {
        name: 'telehealth_gap',
        description: 'Telehealth adoption abroad + demand in FR',
        conditions: [
          { signal_type: 'search_trend', min_strength: 40 },
          { signal_type: 'funding_round', min_strength: 50 },
        ],
      },
    ],
    keywords: ['sante', 'health', 'medecin', 'hopital', 'telemedecine', 'HDS', 'RGPD sante'],
    categories: ['telehealth', 'ehr', 'patient_management', 'health_compliance', 'medical_billing'],
  },
  {
    id: 'ecommerce',
    name: 'E-commerce & Retail Tech',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.08, traffic_spike: 0.10,
      review_surge: 0.10, community_buzz: 0.08, regulatory_event: 0.05,
      oss_traction: 0.05, company_registration: 0.05, pricing_change: 0.10,
      pain_point_cluster: 0.10, search_trend: 0.10, market_entry: 0.05, market_exit: 0.04,
    },
    primarySources: ['producthunt', 'google_trends', 'serpapi_g2', 'appsumo'],
    secondarySources: ['reddit', 'crunchbase', 'hacker_news'],
    irrelevantSources: ['eurlex', 'legifrance', 'data_gouv'],
    crossingRules: [
      {
        name: 'ecom_tool_gap',
        description: 'Growing ecom category + competitor weakness + search demand',
        conditions: [
          { signal_type: 'search_trend', min_strength: 40 },
          { signal_type: 'pain_point_cluster', min_strength: 40 },
        ],
      },
      {
        name: 'pricing_disruption',
        description: 'Competitor price increase + community complaints',
        conditions: [
          { signal_type: 'pricing_change', min_strength: 50 },
          { signal_type: 'community_buzz', min_strength: 30 },
        ],
      },
    ],
    keywords: ['ecommerce', 'shopify', 'marketplace', 'fulfillment', 'dropshipping', 'retail'],
    categories: ['storefront', 'fulfillment', 'marketplace', 'inventory', 'shipping', 'returns'],
  },
  {
    id: 'education',
    name: 'Education & EdTech',
    signalWeights: {
      product_launch: 0.10, funding_round: 0.10, traffic_spike: 0.08,
      review_surge: 0.08, community_buzz: 0.08, regulatory_event: 0.10,
      oss_traction: 0.05, company_registration: 0.05, pricing_change: 0.05,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.05, market_exit: 0.04,
    },
    primarySources: ['producthunt', 'google_trends', 'crunchbase'],
    secondarySources: ['reddit', 'hacker_news', 'appsumo'],
    irrelevantSources: ['pappers', 'insee'],
    crossingRules: [
      {
        name: 'edtech_gap',
        description: 'Popular education tool abroad + growing demand FR',
        conditions: [
          { signal_type: 'product_launch', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 40 },
        ],
      },
      {
        name: 'education_regulation',
        description: 'Education regulation + no digital compliance tool',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 50 },
          { signal_type: 'pain_point_cluster', min_strength: 30 },
        ],
      },
    ],
    keywords: ['education', 'formation', 'LMS', 'edtech', 'elearning', 'school', 'university', 'Qualiopi'],
    categories: ['lms', 'assessment', 'tutoring', 'course_creation', 'student_management'],
  },
  {
    id: 'real_estate',
    name: 'Real Estate & PropTech',
    signalWeights: {
      product_launch: 0.08, funding_round: 0.10, traffic_spike: 0.05,
      review_surge: 0.08, community_buzz: 0.05, regulatory_event: 0.15,
      oss_traction: 0.02, company_registration: 0.08, pricing_change: 0.08,
      pain_point_cluster: 0.12, search_trend: 0.10, market_entry: 0.05, market_exit: 0.04,
    },
    primarySources: ['google_trends', 'crunchbase', 'legifrance', 'pappers'],
    secondarySources: ['producthunt', 'reddit', 'insee'],
    irrelevantSources: ['github', 'appsumo', 'indiehackers'],
    crossingRules: [
      {
        name: 'proptech_regulation',
        description: 'New property regulation + no digital tool + many companies affected',
        conditions: [
          { signal_type: 'regulatory_event', min_strength: 50 },
          { signal_type: 'company_registration', min_strength: 30 },
        ],
      },
      {
        name: 'proptech_gap',
        description: 'US proptech success + no FR equivalent + search demand',
        conditions: [
          { signal_type: 'funding_round', min_strength: 50 },
          { signal_type: 'search_trend', min_strength: 30 },
        ],
      },
    ],
    keywords: ['immobilier', 'real estate', 'proptech', 'gestion locative', 'syndic', 'DPE', 'renovation'],
    categories: ['property_management', 'listing', 'mortgage', 'tenant_management', 'construction'],
  },
];

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
