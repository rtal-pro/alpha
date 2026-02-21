// ---------------------------------------------------------------------------
// Job Board scraper — aggregates job postings to detect talent demand signals
//
// Talent demand = market demand. A surge in hiring for a specific tech stack
// or SaaS category signals market growth and opportunity.
//
// Uses SerpAPI to search job listings from multiple boards.
// ---------------------------------------------------------------------------

import { SERPAPI_KEY } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERPAPI_BASE = 'https://serpapi.com/search.json';

/** SerpAPI rate limit: depends on plan, ~1 req/s is safe */
const RATE_LIMIT_DELAY_MS = 2_000;

// Job search queries that signal SaaS category growth
const DEFAULT_JOB_QUERIES = [
  'SaaS product manager',
  'SaaS engineer',
  'fintech developer',
  'compliance software',
  'devtools engineer',
  'API integration',
  'data privacy officer',
  'GDPR compliance',
  'open source maintainer',
];

// ---------------------------------------------------------------------------
// JobBoardScraper
// ---------------------------------------------------------------------------

export class JobBoardScraper extends BaseScraper {
  readonly source = 'job_boards' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (params.type !== 'keyword_search') {
      throw new Error(`JobBoardScraper: unsupported scrape type "${params.type}"`);
    }

    if (!SERPAPI_KEY) {
      throw new Error('JobBoardScraper: SERPAPI_KEY not configured');
    }

    const keywords = params.keywords ?? DEFAULT_JOB_QUERIES;
    const geo = params.geo ?? 'France';
    const limit = params.limit ?? 10;

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchJobs(keyword, geo, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[job-boards] Failed to search "${keyword}": ${message}`);
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Search jobs via SerpAPI Google Jobs
  // -----------------------------------------------------------------------

  private async searchJobs(
    query: string,
    location: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(SERPAPI_BASE);
    url.searchParams.set('engine', 'google_jobs');
    url.searchParams.set('q', query);
    url.searchParams.set('location', location);
    url.searchParams.set('api_key', SERPAPI_KEY!);

    const response = await fetch(url.toString());

    if (response.status === 429) {
      throw new Error('SerpAPI rate limit (429)');
    }
    if (!response.ok) {
      throw new Error(`SerpAPI error (${response.status})`);
    }

    const body = (await response.json()) as {
      jobs_results?: Array<{
        title: string;
        company_name: string;
        location: string;
        description: string;
        detected_extensions?: {
          posted_at?: string;
          schedule_type?: string;
          salary?: string;
        };
        job_id?: string;
        related_links?: Array<{ link: string; text: string }>;
        thumbnail?: string;
      }>;
      search_metadata?: {
        total_results?: number;
      };
    };

    const jobs = (body.jobs_results ?? []).slice(0, limit);
    const now = new Date();

    return jobs.map((job, index) => {
      const categories = this.inferCategories(job.title, job.description);

      return {
        source: 'job_boards',
        entityId: `job:${job.job_id ?? this.hashString(`${job.company_name}:${job.title}`)}`,
        url: job.related_links?.[0]?.link ?? '',
        payload: {
          title: job.title,
          company: job.company_name,
          location: job.location,
          description_snippet: job.description.slice(0, 500),
          posted_at: job.detected_extensions?.posted_at,
          schedule_type: job.detected_extensions?.schedule_type,
          salary: job.detected_extensions?.salary,
          categories,
          searchQuery: query,
          position: index,
          total_results: body.search_metadata?.total_results,
        },
        format: 'job_board_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategories(title: string, description: string): string[] {
    const text = `${title} ${description}`.toLowerCase();
    const categories: string[] = [];

    if (/\b(saas|software as a service)\b/.test(text)) categories.push('general_saas');
    if (/\b(fintech|financial|banking|payment)\b/.test(text)) categories.push('fintech');
    if (/\b(devtools|developer tools|api|sdk|infrastructure)\b/.test(text)) categories.push('devtools');
    if (/\b(compliance|gdpr|rgpd|privacy|legal|audit)\b/.test(text)) categories.push('compliance_legal');
    if (/\b(marketing|growth|seo|analytics)\b/.test(text)) categories.push('marketing');
    if (/\b(ai|machine learning|llm|artificial intelligence)\b/.test(text)) categories.push('ai_ml');
    if (/\b(ecommerce|e-commerce|shopify|marketplace)\b/.test(text)) categories.push('ecommerce');
    if (/\b(healthcare|health ?tech|medical)\b/.test(text)) categories.push('healthcare');
    if (/\b(cybersecurity|security|soc|pentest)\b/.test(text)) categories.push('cybersecurity');
    if (/\b(data|analytics|bi|business intelligence)\b/.test(text)) categories.push('data_analytics');

    return categories.length > 0 ? categories : ['general_saas'];
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
