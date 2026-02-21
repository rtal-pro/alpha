import type { ScrapeSource, ScrapeParams } from './types';

export interface ScraperRequirement {
  source: ScrapeSource;
  params: ScrapeParams;
}

export interface SectionConfig {
  number: number;
  key: string;
  title: string;
  dependsOn: number[];
  requiredData: ScraperRequirement[];
}

// Section dependency DAG — which sections can run in parallel
export const SECTION_CONFIGS: SectionConfig[] = [
  {
    number: 1,
    key: 'problem_validation',
    title: 'Problem Validation',
    dependsOn: [],
    requiredData: [
      { source: 'reddit', params: { type: 'keyword_search', subreddits: ['SaaS', 'startups', 'smallbusiness', 'Entrepreneur'] } },
      { source: 'indiehackers', params: { type: 'problem_search' } },
      { source: 'producthunt', params: { type: 'category_search' } },
      { source: 'hacker_news', params: { type: 'keyword_search' } },
      { source: 'google_trends', params: { type: 'interest_over_time', geo: 'FR' } },
    ],
  },
  {
    number: 2,
    key: 'market_sizing',
    title: 'Market Sizing (TAM/SAM/SOM)',
    dependsOn: [1],
    requiredData: [
      { source: 'insee', params: { type: 'sector_stats' } },
      { source: 'data_gouv', params: { type: 'company_counts' } },
      { source: 'crunchbase', params: { type: 'sector_funding' } },
    ],
  },
  {
    number: 3,
    key: 'competitive_landscape',
    title: 'Competitive Landscape',
    dependsOn: [1],
    requiredData: [
      { source: 'producthunt', params: { type: 'competitor_search' } },
      { source: 'github', params: { type: 'topic_search' } },
      { source: 'serpapi_g2', params: { type: 'category_products' } },
      { source: 'serpapi_capterra', params: { type: 'category_products' } },
    ],
  },
  {
    number: 4,
    key: 'competitive_moat',
    title: 'Competitive Moat Analysis',
    dependsOn: [3],
    requiredData: [
      { source: 'serpapi_g2', params: { type: 'reviews' } },
    ],
  },
  {
    number: 5,
    key: 'regulatory_compliance',
    title: 'Regulatory & Compliance Scan',
    dependsOn: [],
    requiredData: [
      { source: 'eurlex', params: { type: 'subject_search' } },
      { source: 'legifrance', params: { type: 'keyword_search' } },
    ],
  },
  {
    number: 6,
    key: 'target_persona',
    title: 'Target Persona',
    dependsOn: [1],
    requiredData: [
      { source: 'reddit', params: { type: 'user_analysis' } },
      { source: 'indiehackers', params: { type: 'user_profiles' } },
    ],
  },
  {
    number: 7,
    key: 'business_model',
    title: 'Business Model Design',
    dependsOn: [2, 3, 6],
    requiredData: [
      { source: 'appsumo', params: { type: 'pricing_signals' } },
      { source: 'indiehackers', params: { type: 'revenue_posts' } },
    ],
  },
  {
    number: 8,
    key: 'unit_economics',
    title: 'Unit Economics',
    dependsOn: [7],
    requiredData: [],
  },
  {
    number: 9,
    key: 'go_to_market',
    title: 'Go-to-Market Strategy',
    dependsOn: [6, 7],
    requiredData: [
      { source: 'google_trends', params: { type: 'related_queries' } },
      { source: 'google_autocomplete', params: { type: 'keyword_expansion' } },
    ],
  },
  {
    number: 10,
    key: 'seo_content',
    title: 'SEO & Content Opportunity',
    dependsOn: [9],
    requiredData: [
      { source: 'google_autocomplete', params: { type: 'keyword_expansion' } },
      { source: 'serpapi_serp', params: { type: 'keyword_analysis' } },
    ],
  },
  {
    number: 11,
    key: 'technical_architecture',
    title: 'Technical Architecture',
    dependsOn: [3],
    requiredData: [
      { source: 'github', params: { type: 'stack_analysis' } },
    ],
  },
  {
    number: 12,
    key: 'mvp_scope',
    title: 'MVP Scope & Feature Prioritization',
    dependsOn: [1, 3, 6],
    requiredData: [],
  },
  {
    number: 13,
    key: 'development_timeline',
    title: 'Development Timeline & Milestones',
    dependsOn: [11, 12],
    requiredData: [],
  },
  {
    number: 14,
    key: 'risk_assessment',
    title: 'Risk Assessment',
    dependsOn: [1, 2, 3, 5, 7, 8],
    requiredData: [],
  },
  {
    number: 15,
    key: 'financial_projections',
    title: 'Financial Projections (3 years)',
    dependsOn: [7, 8, 2],
    requiredData: [],
  },
  {
    number: 16,
    key: 'funding_analysis',
    title: 'Funding & Bootstrap Analysis',
    dependsOn: [8, 15],
    requiredData: [
      { source: 'crunchbase', params: { type: 'comparable_funding' } },
    ],
  },
  {
    number: 17,
    key: 'launch_checklist',
    title: 'Launch Checklist',
    dependsOn: [5, 11, 12],
    requiredData: [],
  },
  {
    number: 18,
    key: 'kill_pivot_criteria',
    title: 'Kill / Pivot Criteria',
    dependsOn: [1, 2, 3, 7, 14, 15],
    requiredData: [],
  },
];

export function getSectionConfig(sectionNumber: number): SectionConfig | undefined {
  return SECTION_CONFIGS.find(s => s.number === sectionNumber);
}

export function getReadySections(completedSections: number[]): number[] {
  return SECTION_CONFIGS
    .filter(s => !completedSections.includes(s.number))
    .filter(s => s.dependsOn.every(dep => completedSections.includes(dep)))
    .map(s => s.number);
}
