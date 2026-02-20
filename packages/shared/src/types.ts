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
