import { z } from 'zod';

// ============================================================
// Scrape Source types
// ============================================================

export const SCRAPE_SOURCES = [
  'reddit', 'producthunt', 'github', 'google_trends', 'hacker_news',
  'crunchbase', 'appsumo', 'indiehackers', 'ycombinator',
  'eurlex', 'legifrance', 'insee', 'data_gouv',
  'pappers', 'serpapi_g2', 'serpapi_capterra', 'serpapi_serp',
  'google_autocomplete',
] as const;

export type ScrapeSource = typeof SCRAPE_SOURCES[number];

// ============================================================
// Idea / Analysis input
// ============================================================

export const IdeaInputSchema = z.object({
  description: z.string().min(10).max(5000),
  targetMarket: z.string().default('FR'),
  targetUser: z.string().optional(),
  soloFounder: z.boolean().default(true),
  stackPreference: z.string().optional(),
  budgetConstraint: z.enum(['bootstrap', 'small_funding', 'funded']).default('bootstrap'),
});

export type IdeaInput = z.infer<typeof IdeaInputSchema>;

export const AnalysisPreferencesSchema = z.object({
  targetMarket: z.string(),
  targetUser: z.string().optional(),
  soloFounder: z.boolean(),
  stackPreference: z.string().optional(),
  budgetConstraint: z.string(),
  formFactor: z.string().optional(),
});

export type AnalysisPreferences = z.infer<typeof AnalysisPreferencesSchema>;

// ============================================================
// Scraper types
// ============================================================

export interface ScrapeParams {
  type: string;
  keywords?: string[];
  subreddits?: string[];
  category?: string;
  geo?: string;
  daysBack?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface RawScrapedItem {
  source: ScrapeSource;
  entityId: string;
  url: string;
  payload: Record<string, unknown>;
  format: string;
  scrapedAt: Date;
}

export interface NormalizedItem {
  source: ScrapeSource;
  externalId: string;
  title: string;
  description?: string;
  url?: string;
  metrics: Record<string, number>;
  categories: string[];
  scrapedAt: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================
// Scraped data bundle (passed to LLM context builder)
// ============================================================

export interface RedditPost {
  subreddit: string;
  title: string;
  selftext?: string;
  score: number;
  numComments: number;
  url: string;
  createdUtc: number;
  author: string;
}

export interface ProductHuntProduct {
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  topics: string[];
}

export interface GoogleTrendsData {
  keyword: string;
  averageInterest: number;
  direction: 'rising' | 'stable' | 'declining';
  timelineData: Array<{ date: string; value: number }>;
  relatedQueries: string[];
}

export interface ScrapedDataBundle {
  reddit?: RedditPost[];
  producthunt?: ProductHuntProduct[];
  google_trends?: GoogleTrendsData;
  hacker_news?: Array<{ title: string; url: string; points: number; numComments: number }>;
  indiehackers?: Array<{ title: string; excerpt?: string; url: string }>;
  [key: string]: unknown;
}

// ============================================================
// Section output types
// ============================================================

export interface SectionOutput {
  json: Record<string, unknown>;
  markdown: string;
  summary: string;
  confidence: number;
  dataQuality: number;
}

// ============================================================
// Analysis progress
// ============================================================

export type SectionProgressStatus =
  | 'scraping'
  | 'building_context'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'failed';

export interface ProgressUpdate {
  analysisId: string;
  sectionNumber: number;
  status: SectionProgressStatus;
  progress: number;
  message?: string;
  partialContent?: string;
  error?: string;
}

// ============================================================
// Data quality
// ============================================================

export interface DataQualityScore {
  freshness: number;
  completeness: number;
  reliability: number;
  relevance: number;
  composite: number;
}

// ============================================================
// Signal types (for intelligence engine)
// ============================================================

export const SIGNAL_TYPES = [
  'product_launch', 'funding_round', 'traffic_spike', 'review_surge',
  'community_buzz', 'regulatory_event', 'oss_traction', 'company_registration',
  'pricing_change', 'pain_point_cluster', 'search_trend', 'market_entry', 'market_exit',
] as const;

export type SignalType = typeof SIGNAL_TYPES[number];

export interface DetectedSignal {
  signal_type: SignalType;
  title: string;
  description: string;
  strength: number;          // 0-100
  category: string;
  geo_relevance: string[];
  source: ScrapeSource;
  source_url?: string;
  occurred_at: Date;
  product_id?: string;
  raw_event_id?: string;
  evidence: Record<string, unknown>;
}

// ============================================================
// Opportunity types
// ============================================================

export const OPPORTUNITY_TYPES = [
  'geo_gap', 'regulatory_gap', 'convergence', 'competitor_weakness',
] as const;

export type OpportunityType = typeof OPPORTUNITY_TYPES[number];

export interface Opportunity {
  id?: string;
  title: string;
  slug?: string;
  category: string;
  description?: string;
  type: OpportunityType;
  composite_score: number;
  growth_score?: number;
  gap_score?: number;
  regulatory_score?: number;
  feasibility_score?: number;
  source_products: string[];
  source_signals: string[];
  source_regulations: string[];
  evidence_summary?: Record<string, unknown>;
  score_history?: Array<{ score: number; timestamp: Date; signal_count: number }>;
  target_geo?: string;
  reference_geo?: string;
  embedding?: number[];
  detection_count?: number;
  status: string;
}

// ============================================================
// Idea types
// ============================================================

export interface Idea {
  id?: string;
  opportunity_id: string;
  title: string;
  one_liner?: string;
  target_persona?: string;
  core_features: string[];
  differentiation?: string;
  entry_strategy?: string;
  estimated_complexity?: string;
  revenue_model?: string;
  why_now?: string;
  status: 'draft' | 'active' | 'stale' | 'refreshing' | 'archived' | 'pursued';
  freshness?: number;
  expires_at: Date;
}

// ============================================================
// Domain profile types
// ============================================================

export interface DomainProfile {
  id: string;
  name: string;
  signalWeights: Record<SignalType, number>;
  primarySources: ScrapeSource[];
  secondarySources: ScrapeSource[];
  irrelevantSources: ScrapeSource[];
  crossingRules: CrossingRule[];
  keywords: string[];
  categories: string[];
}

export interface CrossingRule {
  name: string;
  description: string;
  conditions: CrossingCondition[];
}

export interface CrossingCondition {
  signal_type: SignalType;
  min_strength?: number;
  min_count?: number;
  time_window_days?: number;
}

// ============================================================
// Feedback types
// ============================================================

export const DISMISS_REASONS = [
  'market_too_small', 'too_competitive', 'not_my_expertise',
  'bad_timing', 'already_exists_fr', 'not_interesting',
  'too_complex', 'wrong_category',
] as const;

export type DismissReason = typeof DISMISS_REASONS[number];

export interface FeedbackEvent {
  type: 'dismiss' | 'save' | 'explore' | 'pursue' | 'archive';
  opportunity_id: string;
  idea_id?: string;
  reason?: string;
  dismiss_category?: DismissReason;
}

// ============================================================
// Source reliability
// ============================================================

export const SOURCE_RELIABILITY: Record<string, number> = {
  eurlex: 0.99,
  legifrance: 0.99,
  insee: 0.98,
  data_gouv: 0.98,
  github: 0.95,
  reddit: 0.85,
  producthunt: 0.80,
  crunchbase: 0.85,
  hacker_news: 0.85,
  serpapi_g2: 0.70,
  serpapi_capterra: 0.70,
  appsumo: 0.75,
  indiehackers: 0.75,
  pappers: 0.90,
  google_trends: 0.65,
  google_autocomplete: 0.60,
};
