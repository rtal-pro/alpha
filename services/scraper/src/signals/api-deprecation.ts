// ---------------------------------------------------------------------------
// APIDeprecationDetector — detects API sunsets, breaking changes, and
// platform policy shifts that create replacement opportunities
//
// When a major API is deprecated or a platform changes its terms, every
// integration built on it becomes a potential product opportunity.
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

const MIN_MENTIONS = 3;
const WINDOW_DAYS = 30;

// Patterns that indicate API deprecation / sunset
const DEPRECATION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Direct deprecation signals
  { pattern: /\b(api|endpoint|sdk|library)\s+(deprecat|sunset|end.?of.?life|eol|retire)/i, weight: 3, label: 'api_deprecation' },
  { pattern: /\b(breaking\s+change|backward.?incompatible|migration\s+required)\b/i, weight: 3, label: 'breaking_change' },
  { pattern: /\b(v[1-3]|version\s+[1-3])\s+(shutdown|removed|unsupported)\b/i, weight: 3, label: 'version_sunset' },

  // Platform policy changes
  { pattern: /\b(policy\s+change|terms\s+of\s+service|tos\s+update|new\s+restrict)/i, weight: 2, label: 'policy_change' },
  { pattern: /\b(rate\s+limit|throttl|quota\s+reduc|access\s+restrict)/i, weight: 2, label: 'access_restriction' },
  { pattern: /\b(free\s+tier|free\s+api)\s+(remov|cancel|discontinu|no\s+longer)/i, weight: 3, label: 'free_tier_removal' },

  // Migration / switching signals
  { pattern: /\b(migrat|switch|mov)\s+(away|from|off)\s+(of\s+)?[A-Z]/i, weight: 2, label: 'migration' },
  { pattern: /\b(alternative|replacement|substitute)\s+(for|to)\b/i, weight: 2, label: 'seeking_alternative' },
  { pattern: /\b(what\s+(?:to|should)\s+(?:use|switch))\b/i, weight: 1, label: 'seeking_replacement' },
];

// Platform names to track for deprecation signals
const PLATFORM_PATTERNS = /\b(Twitter|X API|Heroku|Firebase|Parse|Stripe|Twilio|SendGrid|AWS|Google Cloud|Azure|Shopify|Slack|Discord|Zapier|Airtable|Notion)\b/i;

// ---------------------------------------------------------------------------
// APIDeprecationDetector
// ---------------------------------------------------------------------------

export class APIDeprecationDetector extends BaseSignalDetector {
  readonly name = 'APIDeprecationDetector';
  readonly signalTypes: SignalType[] = ['api_deprecation'];
  readonly supportedSources: ScrapeSource[] = [
    'reddit', 'hacker_news', 'github', 'stackoverflow', 'twitter',
  ];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Score each item for deprecation signals
    const scored = recent
      .map((item) => {
        const analysis = this.analyzeDeprecation(item);
        return { item, ...analysis };
      })
      .filter((s) => s.score > 0);

    if (scored.length < MIN_MENTIONS) return [];

    // Group by mentioned platform
    const byPlatform = new Map<string, typeof scored>();
    const noPlatform: typeof scored = [];

    for (const entry of scored) {
      if (entry.platform) {
        const group = byPlatform.get(entry.platform) ?? [];
        group.push(entry);
        byPlatform.set(entry.platform, group);
      } else {
        noPlatform.push(entry);
      }
    }

    const signals: DetectedSignal[] = [];

    // Platform-specific deprecation signals
    for (const [platform, entries] of byPlatform) {
      if (entries.length < 2) continue;

      const avgScore = entries.reduce((s, e) => s + e.score, 0) / entries.length;
      const avgEngagement = entries.reduce(
        (s, e) => s + (e.item.metrics['score'] ?? 0), 0,
      ) / entries.length;

      const countStrength = this.computeStrength(entries.length, 1, 15);
      const scoreStrength = this.computeStrength(avgScore, 1, 8);
      const engageStrength = this.computeStrength(avgEngagement, 10, 200);

      const strength = Math.round(
        countStrength * 0.35 +
        scoreStrength * 0.35 +
        engageStrength * 0.30,
      );

      if (strength < 20) continue;

      const labels = new Set(entries.flatMap((e) => e.labels));
      const category = this.inferCategory(platform, entries);

      signals.push({
        signal_type: 'api_deprecation',
        title: `API deprecation: ${platform} (${entries.length} mentions)`,
        description:
          `${entries.length} posts about ${platform} deprecation/changes. ` +
          `Labels: ${Array.from(labels).join(', ')}. ` +
          `Avg severity: ${avgScore.toFixed(1)}, avg engagement: ${Math.round(avgEngagement)}.`,
        strength,
        category,
        geo_relevance: ['GLOBAL'],
        source: entries[0]!.item.source as ScrapeSource,
        source_url: entries[0]!.item.url,
        occurred_at: new Date(Math.max(...entries.map((e) => e.item.scrapedAt.getTime()))),
        evidence: {
          platform,
          mention_count: entries.length,
          avg_severity: avgScore,
          avg_engagement: avgEngagement,
          labels: Array.from(labels),
          top_posts: entries.slice(0, 5).map((e) => ({
            title: e.item.title,
            url: e.item.url,
            score: e.score,
            labels: e.labels,
          })),
        },
      });
    }

    // General API deprecation cluster (no specific platform)
    if (noPlatform.length >= MIN_MENTIONS) {
      const byCategory = new Map<string, typeof noPlatform>();
      for (const entry of noPlatform) {
        const cat = entry.item.categories[0] ?? 'general_saas';
        const group = byCategory.get(cat) ?? [];
        group.push(entry);
        byCategory.set(cat, group);
      }

      for (const [category, entries] of byCategory) {
        if (entries.length < MIN_MENTIONS) continue;

        const avgScore = entries.reduce((s, e) => s + e.score, 0) / entries.length;
        const strength = Math.round(
          this.computeStrength(entries.length, 2, 12) * 0.5 +
          this.computeStrength(avgScore, 1, 6) * 0.5,
        );

        if (strength < 15) continue;

        signals.push({
          signal_type: 'api_deprecation',
          title: `API disruption cluster: ${category} (${entries.length} posts)`,
          description:
            `${entries.length} posts about API deprecation/changes in ${category}.`,
          strength,
          category,
          geo_relevance: ['GLOBAL'],
          source: entries[0]!.item.source as ScrapeSource,
          occurred_at: new Date(),
          evidence: {
            mention_count: entries.length,
            avg_severity: avgScore,
          },
        });
      }
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private analyzeDeprecation(item: NormalizedItem): {
    score: number;
    labels: string[];
    platform: string | null;
  } {
    const text = `${item.title} ${item.description ?? ''}`;
    let score = 0;
    const labels: string[] = [];

    for (const { pattern, weight, label } of DEPRECATION_PATTERNS) {
      if (pattern.test(text)) {
        score += weight;
        labels.push(label);
      }
    }

    // Extract platform name
    let platform: string | null = null;
    const platformMatch = PLATFORM_PATTERNS.exec(text);
    if (platformMatch?.[1]) {
      platform = platformMatch[1].trim();
    }

    return { score: Math.min(score, 10), labels, platform };
  }

  private inferCategory(platform: string, entries: Array<{ item: NormalizedItem }>): string {
    const p = platform.toLowerCase();
    if (/stripe|payment|fintech/.test(p)) return 'fintech';
    if (/heroku|aws|azure|google cloud|firebase/.test(p)) return 'infrastructure';
    if (/twitter|x api|discord|slack/.test(p)) return 'social_api';
    if (/shopify/.test(p)) return 'ecommerce';
    if (/twilio|sendgrid/.test(p)) return 'communication';
    if (/zapier|airtable|notion/.test(p)) return 'automation';

    // Fall back to item categories
    const cats = entries.flatMap((e) => e.item.categories);
    return cats[0] ?? 'general_saas';
  }
}
