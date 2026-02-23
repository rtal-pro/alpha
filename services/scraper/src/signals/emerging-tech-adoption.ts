// ---------------------------------------------------------------------------
// EmergingTechAdoptionDetector — detects emerging technologies gaining rapid
// adoption, creating opportunities for tooling and services around them
//
// When a new tech stack (framework, language, protocol) crosses the adoption
// tipping point, there's a window to build the ecosystem tools around it.
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

const MIN_MENTIONS = 2;
const WINDOW_DAYS = 30;

// Tech stacks and emerging technologies to track
const TECH_SIGNATURES: Array<{
  name: string;
  patterns: RegExp[];
  category: string;
  maturity: 'emerging' | 'growing' | 'mainstream';
}> = [
  // AI/ML emerging
  { name: 'RAG', patterns: [/\bRAG\b/, /retrieval.augmented.generation/i], category: 'ai_ml', maturity: 'growing' },
  { name: 'AI Agents', patterns: [/\bAI\s+agent/i, /\bautonomous\s+agent/i, /\bagentic/i], category: 'ai_ml', maturity: 'emerging' },
  { name: 'Fine-tuning', patterns: [/\bfine.?tun/i, /\bLoRA\b/, /\bQLORA\b/], category: 'ai_ml', maturity: 'growing' },
  { name: 'Vector DB', patterns: [/\bvector\s*(db|database|store)/i, /\bpinecone\b/i, /\bweaviate\b/i, /\bchroma\b/i, /\bmilvus\b/i], category: 'ai_ml', maturity: 'growing' },
  { name: 'LLM Ops', patterns: [/\bLLMOps\b/i, /\bMLOps\b/i, /\bprompt\s+engineer/i, /\bprompt\s+management/i], category: 'ai_ml', maturity: 'growing' },

  // Infrastructure emerging
  { name: 'Edge Computing', patterns: [/\bedge\s+(comput|function|worker|runtime)/i, /\bcloudflare\s+workers?\b/i, /\bdeno\s+deploy\b/i], category: 'infrastructure', maturity: 'growing' },
  { name: 'WASM', patterns: [/\bwasm\b/i, /\bwebassembly\b/i, /\bwasi\b/i], category: 'infrastructure', maturity: 'growing' },
  { name: 'Serverless v2', patterns: [/\bserverless\s+(v2|2\.0|next)/i, /\bfunction.?as.?a.?service\b/i], category: 'infrastructure', maturity: 'growing' },

  // Dev ecosystem emerging
  { name: 'Rust ecosystem', patterns: [/\brust\s+(crate|tool|ecosystem|adopt)/i, /\brustlang\b/i], category: 'devtools', maturity: 'growing' },
  { name: 'Bun runtime', patterns: [/\bbun\s+(runtime|js|javascript)\b/i, /\bbunjs\b/i], category: 'devtools', maturity: 'emerging' },
  { name: 'htmx / Hypermedia', patterns: [/\bhtmx\b/i, /\bhypermedia\b/i, /\bhtml.?over.?the.?wire\b/i], category: 'devtools', maturity: 'emerging' },

  // Protocol / standard emerging
  { name: 'Passkeys / WebAuthn', patterns: [/\bpasskey/i, /\bwebauthn\b/i, /\bfido2?\b/i, /\bpasswordless\b/i], category: 'authentication', maturity: 'growing' },
  { name: 'ActivityPub / Fediverse', patterns: [/\bactivitypub\b/i, /\bfediverse\b/i, /\bmastodon\b/i, /\bdecentraliz/i], category: 'social_api', maturity: 'emerging' },
  { name: 'Open Banking', patterns: [/\bopen\s+banking\b/i, /\bPSD2?\b/, /\baccount.?aggregat/i], category: 'fintech', maturity: 'growing' },

  // Data / analytics emerging
  { name: 'Data Mesh', patterns: [/\bdata\s+mesh\b/i, /\bdata\s+product/i, /\bdata\s+contract/i], category: 'analytics', maturity: 'emerging' },
  { name: 'Real-time analytics', patterns: [/\breal.?time\s+(analytics|stream|processing)\b/i, /\bclickhouse\b/i], category: 'analytics', maturity: 'growing' },

  // Compliance emerging
  { name: 'Privacy Engineering', patterns: [/\bprivacy\s+engineer/i, /\bprivacy\s+by\s+design/i, /\bdifferential\s+privacy\b/i, /\bPETs?\b/], category: 'compliance_legal', maturity: 'emerging' },
  { name: 'SBOM / Supply Chain', patterns: [/\bSBOM\b/, /\bsoftware\s+bill\s+of\s+materials\b/i, /\bsupply.?chain\s+security\b/i], category: 'cybersecurity', maturity: 'growing' },
];

// Adoption velocity signals
const ADOPTION_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(migrat|switch|adopt|mov)\w*\s+(to|from)\b/i, weight: 2 },
  { pattern: /\b(getting started|tutorial|how to|beginner)\b/i, weight: 1 },
  { pattern: /\b(production|deployed|running in prod|at scale)\b/i, weight: 3 },
  { pattern: /\b(hiring|job|looking for).{0,20}(engineer|developer)\b/i, weight: 2 },
  { pattern: /\b(raised|funding|backed by|series)\b/i, weight: 2 },
  { pattern: /\b(open.?source|community|contributor)\b/i, weight: 1 },
];

// ---------------------------------------------------------------------------
// EmergingTechAdoptionDetector
// ---------------------------------------------------------------------------

export class EmergingTechAdoptionDetector extends BaseSignalDetector {
  readonly name = 'EmergingTechAdoptionDetector';
  readonly signalTypes: SignalType[] = ['emerging_tech_adoption'];
  readonly supportedSources: ScrapeSource[] = [
    'github', 'stackoverflow', 'hacker_news', 'reddit', 'twitter',
    'job_boards', 'producthunt',
  ];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    if (recent.length < MIN_MENTIONS) return [];

    const signals: DetectedSignal[] = [];

    // Check each tech signature against recent items
    for (const tech of TECH_SIGNATURES) {
      const matchingItems = recent.filter((item) => {
        const text = `${item.title} ${item.description ?? ''}`;
        return tech.patterns.some((p) => p.test(text));
      });

      if (matchingItems.length < MIN_MENTIONS) continue;

      // Score adoption velocity
      const adoptionScore = this.computeAdoptionScore(matchingItems);
      const uniqueSources = new Set(matchingItems.map((i) => i.source)).size;
      const avgEngagement = matchingItems.reduce(
        (sum, item) => sum + (item.metrics['score'] ?? item.metrics['stars'] ?? 0), 0,
      ) / matchingItems.length;

      // Compute strength
      const volumeStrength = this.computeStrength(matchingItems.length, 3, 25);
      const adoptionStrength = this.computeStrength(adoptionScore, 2, 10);
      const diversityStrength = this.computeStrength(uniqueSources, 1, 5);
      const engagementStrength = this.computeStrength(avgEngagement, 10, 200);

      // Maturity bonus: emerging tech with high adoption = stronger signal
      const maturityMultiplier =
        tech.maturity === 'emerging' ? 1.2 :
        tech.maturity === 'growing' ? 1.0 : 0.8;

      const strength = Math.min(100, Math.round(
        (volumeStrength * 0.30 +
        adoptionStrength * 0.30 +
        diversityStrength * 0.15 +
        engagementStrength * 0.25) * maturityMultiplier,
      ));

      if (strength < 20) continue;

      // Identify what types of tooling are needed
      const toolingGaps = this.identifyToolingGaps(matchingItems, tech.name);

      signals.push({
        signal_type: 'emerging_tech_adoption',
        title: `Emerging tech: ${tech.name} adoption surge (${matchingItems.length} mentions)`,
        description:
          `${tech.name} mentioned ${matchingItems.length} times across ${uniqueSources} sources. ` +
          `Maturity: ${tech.maturity}. Adoption score: ${adoptionScore.toFixed(1)}/10. ` +
          `${toolingGaps.length > 0 ? `Tooling gaps: ${toolingGaps.join(', ')}.` : ''}`,
        strength,
        category: tech.category,
        geo_relevance: ['GLOBAL'],
        source: matchingItems[0]!.source as ScrapeSource,
        occurred_at: new Date(),
        evidence: {
          tech_name: tech.name,
          maturity: tech.maturity,
          mention_count: matchingItems.length,
          unique_sources: uniqueSources,
          adoption_score: adoptionScore,
          avg_engagement: avgEngagement,
          tooling_gaps: toolingGaps,
          source_breakdown: this.getSourceBreakdown(matchingItems),
          sample_items: matchingItems.slice(0, 8).map((i) => ({
            title: i.title,
            source: i.source,
            url: i.url,
            engagement: i.metrics['score'] ?? i.metrics['stars'] ?? 0,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private computeAdoptionScore(items: NormalizedItem[]): number {
    let totalWeight = 0;
    let count = 0;

    for (const item of items) {
      const text = `${item.title} ${item.description ?? ''}`;
      let maxWeight = 1;

      for (const { pattern, weight } of ADOPTION_PATTERNS) {
        if (pattern.test(text)) {
          maxWeight = Math.max(maxWeight, weight);
        }
      }

      totalWeight += maxWeight;
      count++;
    }

    return count > 0 ? Math.min(10, totalWeight / count * 2) : 0;
  }

  private identifyToolingGaps(items: NormalizedItem[], techName: string): string[] {
    const gaps: string[] = [];
    const allText = items.map((i) => `${i.title} ${i.description ?? ''}`).join(' ').toLowerCase();

    const gapPatterns: Array<{ pattern: RegExp; gap: string }> = [
      { pattern: /\b(monitor|observ|debug|trace)\b/, gap: 'monitoring & observability' },
      { pattern: /\b(deploy|ci|cd|devops)\b/, gap: 'deployment & CI/CD' },
      { pattern: /\b(test|qa|quality)\b/, gap: 'testing & QA' },
      { pattern: /\b(secur|vulnerab|audit|compliance)\b/, gap: 'security & compliance' },
      { pattern: /\b(manage|admin|dashboard|console)\b/, gap: 'management dashboard' },
      { pattern: /\b(analytics|metrics|insight|report)\b/, gap: 'analytics & reporting' },
      { pattern: /\b(migrat|convert|transform|adapt)\b/, gap: 'migration tooling' },
      { pattern: /\b(train|learn|tutorial|doc|guide)\b/, gap: 'learning & documentation' },
    ];

    for (const { pattern, gap } of gapPatterns) {
      if (pattern.test(allText)) {
        gaps.push(gap);
      }
    }

    return gaps.slice(0, 5);
  }

  private getSourceBreakdown(items: NormalizedItem[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.source] = (counts[item.source] ?? 0) + 1;
    }
    return counts;
  }
}
