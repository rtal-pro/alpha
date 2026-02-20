// ---------------------------------------------------------------------------
// PainPointClusterDetector — detects recurring pain points from community posts
//
// Signal: 5+ mentions of the same pain pattern across Reddit/IH/HN posts
// in a 14-day window
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

const MIN_PAIN_MENTIONS = 5;
const PAIN_WINDOW_DAYS = 14;

// Common pain patterns to look for in post text
const PAIN_INDICATORS = [
  // Frustration patterns
  /\b(frustrated|frustrating|annoying|painful|hate|terrible|awful|horrible)\b/i,
  // Need patterns
  /\b(need|looking for|wish there was|anyone know|recommend|alternative to)\b/i,
  // Problem patterns
  /\b(problem|issue|bug|broken|doesn'?t work|can'?t|impossible|difficult)\b/i,
  // Switching patterns
  /\b(switched from|migrated from|left|moved away|replaced|ditched|abandoned)\b/i,
  // Pricing pain
  /\b(too expensive|overpriced|price increase|pricing|cost too much|free alternative)\b/i,
  // Feature gaps
  /\b(missing feature|doesn'?t support|no integration|limited|lacking|without)\b/i,
];

const PRICING_PATTERNS = [
  /\b(too expensive|overpriced|price increase|pricing|cost too much|rip ?off)\b/i,
  /\b(free alternative|cheaper|budget|affordable)\b/i,
];

const FEATURE_GAP_PATTERNS = [
  /\b(missing feature|doesn'?t support|no integration|feature request)\b/i,
  /\b(limited|lacking|without|can'?t do|unable to)\b/i,
];

// ---------------------------------------------------------------------------
// PainPointClusterDetector
// ---------------------------------------------------------------------------

export class PainPointClusterDetector extends BaseSignalDetector {
  readonly name = 'PainPointClusterDetector';
  readonly signalTypes: SignalType[] = ['pain_point_cluster'];
  readonly supportedSources: ScrapeSource[] = ['reddit', 'hacker_news', 'indiehackers'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) => this.supportedSources.includes(i.source as ScrapeSource));
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - PAIN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    if (recent.length === 0) return [];

    // Detect pain points in each post
    const painPosts = recent
      .map((item) => ({
        item,
        painScore: this.scorePainContent(item),
        painTypes: this.classifyPainTypes(item),
      }))
      .filter((p) => p.painScore > 0);

    if (painPosts.length < MIN_PAIN_MENTIONS) return [];

    // Group by pain type
    const signals: DetectedSignal[] = [];
    const byPainType = new Map<string, typeof painPosts>();

    for (const post of painPosts) {
      for (const painType of post.painTypes) {
        const group = byPainType.get(painType) ?? [];
        group.push(post);
        byPainType.set(painType, group);
      }
    }

    for (const [painType, posts] of byPainType) {
      if (posts.length < MIN_PAIN_MENTIONS) continue;

      const avgPainScore = posts.reduce((s, p) => s + p.painScore, 0) / posts.length;
      const avgEngagement = posts.reduce((s, p) => s + (p.item.metrics['score'] ?? 0), 0) / posts.length;

      // Strength based on count, pain intensity, and engagement
      const countStrength = this.computeStrength(posts.length, 4, 20);
      const painStrength = this.computeStrength(avgPainScore, 1, 5);
      const engageStrength = this.computeStrength(avgEngagement, 10, 100);

      const strength = Math.round(
        countStrength * 0.35 +
        painStrength * 0.35 +
        engageStrength * 0.30
      );

      if (strength < 15) continue;

      // Infer category from first post
      const category = posts[0]!.item.categories[0]?.replace('r/', '') ?? 'general_saas';

      const topPosts = posts
        .sort((a, b) => b.painScore - a.painScore)
        .slice(0, 5);

      signals.push({
        signal_type: 'pain_point_cluster',
        title: `Pain point cluster: ${painType} (${posts.length} mentions)`,
        description:
          `Detected ${posts.length} posts expressing "${painType}" pain in the last ${PAIN_WINDOW_DAYS} days. ` +
          `Average pain score: ${avgPainScore.toFixed(1)}/5, average engagement: ${Math.round(avgEngagement)}.`,
        strength,
        category,
        geo_relevance: ['GLOBAL'],
        source: posts[0]!.item.source as ScrapeSource,
        source_url: topPosts[0]?.item.url,
        occurred_at: new Date(Math.max(...posts.map((p) => p.item.scrapedAt.getTime()))),
        evidence: {
          pain_type: painType,
          mention_count: posts.length,
          avg_pain_score: avgPainScore,
          avg_engagement: avgEngagement,
          top_posts: topPosts.map((p) => ({
            title: p.item.title,
            url: p.item.url,
            pain_score: p.painScore,
            engagement: p.item.metrics['score'],
            source: p.item.source,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private scorePainContent(item: NormalizedItem): number {
    const text = `${item.title} ${item.description ?? ''}`;
    let score = 0;

    for (const pattern of PAIN_INDICATORS) {
      if (pattern.test(text)) score++;
    }

    // Boost score for high engagement (people agreeing)
    const upvotes = item.metrics['score'] ?? 0;
    if (upvotes > 50) score += 1;
    if (upvotes > 100) score += 1;

    return Math.min(score, 5);
  }

  private classifyPainTypes(item: NormalizedItem): string[] {
    const text = `${item.title} ${item.description ?? ''}`;
    const types: string[] = [];

    if (PRICING_PATTERNS.some((p) => p.test(text))) types.push('pricing');
    if (FEATURE_GAP_PATTERNS.some((p) => p.test(text))) types.push('feature_gap');

    // If text mentions a specific product/tool as the pain source, add 'competitor_weakness'
    if (/\b(switched from|migrated from|left|moved away|replaced|ditched)\b/i.test(text)) {
      types.push('competitor_weakness');
    }

    // General frustration if no specific type
    if (types.length === 0 && PAIN_INDICATORS.some((p) => p.test(text))) {
      types.push('general_frustration');
    }

    return types;
  }
}
