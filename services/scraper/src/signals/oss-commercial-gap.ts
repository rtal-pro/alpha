// ---------------------------------------------------------------------------
// OSSCommercialGapDetector — detects popular open source projects that lack
// a commercial hosted/managed offering
//
// Signal: GitHub repo with high stars/growth + community demand for hosted
// version but no clear commercial player in the market.
// ---------------------------------------------------------------------------

import {
  BaseSignalDetector,
  type DetectedSignal,
  type NormalizedItem,
  type SignalType,
  type ScrapeSource,
} from './base.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MIN_STARS = 500;
const MIN_RECENT_STARS = 50; // Stars gained in scrape window
const WINDOW_DAYS = 30;

// Indicators that users want a hosted version
const HOSTED_DEMAND_PATTERNS = [
  /\b(hosted|managed|cloud|saas)\b/i,
  /\b(deploy|self-host|docker|kubernetes|helm)\b/i,
  /\b(setup is|installation|configure|maintenance)\b/i,
  /\b(hard to|difficult|complex|painful)\s+(set ?up|install|deploy|maintain)/i,
  /\b(wish|want|need).{0,20}(hosted|managed|service)/i,
];

// ---------------------------------------------------------------------------
// OSSCommercialGapDetector
// ---------------------------------------------------------------------------

export class OSSCommercialGapDetector extends BaseSignalDetector {
  readonly name = 'OSSCommercialGapDetector';
  readonly signalTypes: SignalType[] = ['oss_traction'];
  readonly supportedSources: ScrapeSource[] = ['github', 'reddit', 'hacker_news'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Separate GitHub repos from community discussions
    const repos = recent.filter((i) => i.source === 'github');
    const discussions = recent.filter((i) => i.source !== 'github');

    const signals: DetectedSignal[] = [];

    for (const repo of repos) {
      const stars = repo.metrics['stars'] ?? repo.metrics['score'] ?? 0;
      const recentStars = repo.metrics['recent_stars'] ?? repo.metrics['stars_gained'] ?? 0;
      const forks = repo.metrics['forks'] ?? 0;
      const openIssues = repo.metrics['open_issues'] ?? 0;

      // Filter: needs meaningful traction
      if (stars < MIN_STARS && recentStars < MIN_RECENT_STARS) continue;

      // Check if community discussions mention hosting demand
      const repoName = repo.title.toLowerCase();
      const relatedDiscussions = discussions.filter((d) => {
        const text = `${d.title} ${d.description ?? ''}`.toLowerCase();
        return text.includes(repoName) || text.includes(repo.externalId);
      });

      const hostedDemandScore = this.scoreHostedDemand(repo, relatedDiscussions);
      if (hostedDemandScore === 0 && stars < 2000) continue;

      // Compute signal strength
      const starStrength = this.computeStrength(stars, 200, 10_000);
      const growthStrength = this.computeStrength(recentStars, 20, 500);
      const forkStrength = this.computeStrength(forks, 50, 2_000);
      const demandStrength = hostedDemandScore;

      const strength = Math.round(
        starStrength * 0.25 +
        growthStrength * 0.30 +
        forkStrength * 0.10 +
        demandStrength * 0.35,
      );

      if (strength < 20) continue;

      const category = this.inferCategory(repo);

      signals.push({
        signal_type: 'oss_traction',
        title: `OSS commercial gap: ${repo.title} (${stars} stars)`,
        description:
          `${repo.title} has ${stars} GitHub stars and ${recentStars} recent stars. ` +
          `${relatedDiscussions.length} community discussions found. ` +
          `Hosted demand score: ${hostedDemandScore}/100.`,
        strength,
        category,
        geo_relevance: ['GLOBAL'],
        source: 'github',
        source_url: repo.url,
        occurred_at: repo.scrapedAt,
        evidence: {
          repo_name: repo.title,
          stars,
          recent_stars: recentStars,
          forks,
          open_issues: openIssues,
          hosted_demand_score: hostedDemandScore,
          related_discussion_count: relatedDiscussions.length,
          top_discussions: relatedDiscussions.slice(0, 3).map((d) => ({
            title: d.title,
            url: d.url,
            source: d.source,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private scoreHostedDemand(
    repo: NormalizedItem,
    discussions: NormalizedItem[],
  ): number {
    let score = 0;
    const allText = [
      repo.description ?? '',
      ...discussions.map((d) => `${d.title} ${d.description ?? ''}`),
    ].join(' ');

    for (const pattern of HOSTED_DEMAND_PATTERNS) {
      if (pattern.test(allText)) score += 15;
    }

    // Boost if many discussions mention the repo
    if (discussions.length >= 3) score += 15;
    if (discussions.length >= 5) score += 10;

    // Boost if discussions have high engagement
    const avgEngagement = discussions.reduce(
      (sum, d) => sum + (d.metrics['score'] ?? 0), 0,
    ) / Math.max(discussions.length, 1);
    if (avgEngagement > 50) score += 10;
    if (avgEngagement > 100) score += 10;

    return Math.min(100, score);
  }

  private inferCategory(repo: NormalizedItem): string {
    const text = `${repo.title} ${repo.description ?? ''}`.toLowerCase();
    const categories = repo.categories.map((c) => c.toLowerCase());

    if (categories.some((c) => /database|db|sql|nosql|redis|postgres/.test(c)) || /database|db|store/.test(text)) {
      return 'databases';
    }
    if (/monitor|observ|metric|trace|log/.test(text)) return 'monitoring';
    if (/ci|cd|deploy|pipeline|build/.test(text)) return 'ci_cd';
    if (/api|gateway|proxy|mesh/.test(text)) return 'api_tools';
    if (/test|qa|selenium|playwright/.test(text)) return 'testing';
    if (/auth|identity|oauth|sso/.test(text)) return 'authentication';
    if (/queue|message|event|stream|kafka/.test(text)) return 'infrastructure';
    if (/analytic|dashboard|bi|report/.test(text)) return 'analytics';
    return 'devtools';
  }
}
