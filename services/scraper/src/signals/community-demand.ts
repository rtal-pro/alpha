// ---------------------------------------------------------------------------
// CommunityDemandDetector — detects community buzz from Reddit/IH/HN posts
//
// Signal: 3+ posts about the same topic within 14 days with avg score > 20
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

const MIN_CLUSTER_SIZE = 3;
const CLUSTER_WINDOW_DAYS = 14;
const MIN_AVG_SCORE = 20;

// Subreddits → category mapping
const SUBREDDIT_CATEGORIES: Record<string, string> = {
  SaaS: 'general_saas',
  startups: 'general_saas',
  Entrepreneur: 'general_saas',
  microsaas: 'general_saas',
  webdev: 'devtools',
  javascript: 'devtools',
  reactjs: 'devtools',
  node: 'devtools',
  programming: 'devtools',
  devops: 'devtools',
  selfhosted: 'devtools',
  fintech: 'fintech',
  PersonalFinance: 'fintech',
  smallbusiness: 'general_saas',
  ecommerce: 'ecommerce',
  digital_marketing: 'marketing',
  legaladvice: 'compliance_legal',
  healthcare: 'healthcare',
  realestateinvesting: 'real_estate',
  edtech: 'education',
};

// ---------------------------------------------------------------------------
// CommunityDemandDetector
// ---------------------------------------------------------------------------

export class CommunityDemandDetector extends BaseSignalDetector {
  readonly name = 'CommunityDemandDetector';
  readonly signalTypes: SignalType[] = ['community_buzz'];
  readonly supportedSources: ScrapeSource[] = ['reddit', 'hacker_news', 'indiehackers', 'twitter', 'stackoverflow'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) => this.supportedSources.includes(i.source as ScrapeSource));
    if (relevant.length === 0) return [];

    // Group by keyword clusters (simplified: group by category)
    const byCategory = this.groupByCategory(relevant);
    const signals: DetectedSignal[] = [];

    for (const [category, posts] of Object.entries(byCategory)) {
      // Check time window
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      const recentPosts = posts.filter((p) => p.scrapedAt >= windowStart);

      if (recentPosts.length < MIN_CLUSTER_SIZE) continue;

      // Compute average score
      const avgScore = recentPosts.reduce((sum, p) => sum + (p.metrics['score'] ?? 0), 0) / recentPosts.length;
      if (avgScore < MIN_AVG_SCORE) continue;

      // Compute total engagement
      const totalComments = recentPosts.reduce((sum, p) => sum + (p.metrics['numComments'] ?? 0), 0);
      const totalScore = recentPosts.reduce((sum, p) => sum + (p.metrics['score'] ?? 0), 0);

      // Compute signal strength based on cluster size and engagement
      const clusterSizeStrength = this.computeStrength(recentPosts.length, 2, 15);
      const engagementStrength = this.computeStrength(avgScore, 20, 200);
      const commentStrength = this.computeStrength(totalComments, 10, 200);

      const strength = Math.round(
        clusterSizeStrength * 0.3 +
        engagementStrength * 0.4 +
        commentStrength * 0.3
      );

      if (strength < 10) continue;

      // Build evidence
      const topPosts = recentPosts
        .sort((a, b) => (b.metrics['score'] ?? 0) - (a.metrics['score'] ?? 0))
        .slice(0, 5);

      const sources = [...new Set(recentPosts.map((p) => p.source))];

      signals.push({
        signal_type: 'community_buzz',
        title: `Community buzz in ${category} (${recentPosts.length} posts)`,
        description:
          `Detected ${recentPosts.length} related posts in ${category} within ${CLUSTER_WINDOW_DAYS} days. ` +
          `Average score: ${Math.round(avgScore)}, total comments: ${totalComments}. ` +
          `Sources: ${sources.join(', ')}.`,
        strength,
        category,
        geo_relevance: this.inferGeos(recentPosts),
        source: recentPosts[0]!.source as ScrapeSource,
        source_url: topPosts[0]?.url,
        occurred_at: new Date(Math.max(...recentPosts.map((p) => p.scrapedAt.getTime()))),
        evidence: {
          post_count: recentPosts.length,
          avg_score: Math.round(avgScore),
          total_comments: totalComments,
          total_score: totalScore,
          sources,
          top_posts: topPosts.map((p) => ({
            title: p.title,
            url: p.url,
            score: p.metrics['score'],
            comments: p.metrics['numComments'],
            source: p.source,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private groupByCategory(items: NormalizedItem[]): Record<string, NormalizedItem[]> {
    const grouped: Record<string, NormalizedItem[]> = {};

    for (const item of items) {
      let category = 'general_saas';

      // Try to resolve from subreddit metadata
      const subreddit = item.metadata?.['subreddit'] as string | undefined;
      if (subreddit && SUBREDDIT_CATEGORIES[subreddit]) {
        category = SUBREDDIT_CATEGORIES[subreddit]!;
      } else if (item.categories.length > 0) {
        // Fall back to first category tag
        const sub = item.categories[0]!.replace('r/', '');
        category = SUBREDDIT_CATEGORIES[sub] ?? 'general_saas';
      }

      if (!grouped[category]) grouped[category] = [];
      grouped[category]!.push(item);
    }

    return grouped;
  }

  private inferGeos(items: NormalizedItem[]): string[] {
    const geos = new Set<string>();

    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`.toLowerCase();

      if (text.includes('france') || text.includes('french') || text.includes(' fr ') || text.includes('paris')) {
        geos.add('FR');
      }
      if (text.includes('europe') || text.includes('european') || text.includes(' eu ')) {
        geos.add('EU');
      }
      if (text.includes('united states') || text.includes(' us ') || text.includes('american')) {
        geos.add('US');
      }
    }

    // Default to global if no geo detected
    if (geos.size === 0) geos.add('GLOBAL');

    return Array.from(geos);
  }
}
