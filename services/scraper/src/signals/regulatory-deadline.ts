// ---------------------------------------------------------------------------
// RegulatoryDeadlineDetector — detects upcoming regulatory deadlines that
// create urgent compliance needs
//
// Unlike the existing regulatory_event signal (which detects new regulations),
// this detector focuses on the TIME dimension: deadlines approaching within
// 3-18 months where compliance tools don't yet exist.
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

const WINDOW_DAYS = 30;
const MIN_MENTIONS = 2;

// Deadline urgency patterns
const DEADLINE_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  // Specific deadline mentions
  { pattern: /\b(deadline|effective\s+date|enforcement\s+date|compliance\s+date)\b/i, weight: 3, label: 'deadline_mention' },
  { pattern: /\b(must\s+comply|mandatory|required\s+by|obligatory)\b/i, weight: 3, label: 'mandatory_compliance' },
  { pattern: /\b(penalty|fine|sanction|non-compliance|infringement)\b/i, weight: 2, label: 'penalty_risk' },

  // Timeline signals
  { pattern: /\b(202[5-9]|203[0-5])\b/i, weight: 1, label: 'future_date' },
  { pattern: /\b(next\s+year|this\s+year|coming\s+months?|within\s+\d+\s+months?)\b/i, weight: 2, label: 'timeline_urgency' },
  { pattern: /\b(transition\s+period|grace\s+period|phase.?in)\b/i, weight: 2, label: 'transition_period' },

  // Compliance readiness signals
  { pattern: /\b(not\s+ready|unprepared|how\s+to\s+comply|compliance\s+guide)\b/i, weight: 2, label: 'readiness_gap' },
  { pattern: /\b(need\s+(?:help|tool|solution|software)\s+(?:for|to)\s+compl)/i, weight: 3, label: 'tool_demand' },
  { pattern: /\b(no\s+(?:tool|solution|software)\s+(?:for|exists?|available))\b/i, weight: 3, label: 'solution_gap' },
];

// Regulation name extraction
const REGULATION_PATTERNS: Array<{ pattern: RegExp; name: string; category: string }> = [
  { pattern: /\b(DORA|Digital\s+Operational\s+Resilience)\b/i, name: 'DORA', category: 'fintech' },
  { pattern: /\b(NIS\s*2|Network\s+and\s+Information\s+Security)\b/i, name: 'NIS2', category: 'cybersecurity' },
  { pattern: /\b(AI\s+Act|EU\s+AI\s+Regulation)\b/i, name: 'EU AI Act', category: 'ai_ml' },
  { pattern: /\b(CSRD|Corporate\s+Sustainability\s+Reporting)\b/i, name: 'CSRD', category: 'compliance_legal' },
  { pattern: /\b(MiCA|Markets\s+in\s+Crypto)\b/i, name: 'MiCA', category: 'fintech' },
  { pattern: /\b(DMA|Digital\s+Markets\s+Act)\b/i, name: 'DMA', category: 'general_saas' },
  { pattern: /\b(DSA|Digital\s+Services\s+Act)\b/i, name: 'DSA', category: 'general_saas' },
  { pattern: /\b(eIDAS\s*2|European\s+Digital\s+Identity)\b/i, name: 'eIDAS2', category: 'compliance_legal' },
  { pattern: /\b(GDPR|RGPD|General\s+Data\s+Protection)\b/i, name: 'GDPR', category: 'compliance_legal' },
  { pattern: /\b(PSD\s*3|Payment\s+Services\s+Directive)\b/i, name: 'PSD3', category: 'fintech' },
  { pattern: /\b(EHDS|European\s+Health\s+Data\s+Space)\b/i, name: 'EHDS', category: 'healthcare' },
  { pattern: /\b(CRA|Cyber\s+Resilience\s+Act)\b/i, name: 'CRA', category: 'cybersecurity' },
  { pattern: /\b(Facture\s+[eé]lectronique|e-invoicing|facturation)/i, name: 'e-Invoicing FR', category: 'invoicing' },
];

// ---------------------------------------------------------------------------
// RegulatoryDeadlineDetector
// ---------------------------------------------------------------------------

export class RegulatoryDeadlineDetector extends BaseSignalDetector {
  readonly name = 'RegulatoryDeadlineDetector';
  readonly signalTypes: SignalType[] = ['regulatory_deadline'];
  readonly supportedSources: ScrapeSource[] = [
    'eurlex', 'legifrance', 'reddit', 'hacker_news', 'data_gouv',
  ];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Score each item for deadline signals
    const scored = recent
      .map((item) => {
        const analysis = this.analyzeDeadline(item);
        return { item, ...analysis };
      })
      .filter((s) => s.score > 0);

    if (scored.length < MIN_MENTIONS) return [];

    // Group by detected regulation
    const byRegulation = new Map<string, typeof scored>();
    const noRegulation: typeof scored = [];

    for (const entry of scored) {
      if (entry.regulation) {
        const group = byRegulation.get(entry.regulation) ?? [];
        group.push(entry);
        byRegulation.set(entry.regulation, group);
      } else {
        noRegulation.push(entry);
      }
    }

    const signals: DetectedSignal[] = [];

    // Regulation-specific deadline signals
    for (const [regulation, entries] of byRegulation) {
      if (entries.length < MIN_MENTIONS) continue;

      const avgScore = entries.reduce((s, e) => s + e.score, 0) / entries.length;
      const avgEngagement = entries.reduce(
        (s, e) => s + (e.item.metrics['score'] ?? 0), 0,
      ) / entries.length;

      const countStrength = this.computeStrength(entries.length, 1, 12);
      const scoreStrength = this.computeStrength(avgScore, 2, 10);
      const engageStrength = this.computeStrength(avgEngagement, 5, 100);

      const strength = Math.round(
        countStrength * 0.30 +
        scoreStrength * 0.40 +
        engageStrength * 0.30,
      );

      if (strength < 20) continue;

      const labels = new Set(entries.flatMap((e) => e.labels));
      const category = entries[0]!.category ?? 'compliance_legal';
      const hasToolDemand = labels.has('tool_demand') || labels.has('solution_gap');

      signals.push({
        signal_type: 'regulatory_deadline',
        title: `Regulatory deadline: ${regulation} (${entries.length} mentions)`,
        description:
          `${entries.length} posts about ${regulation} compliance deadline. ` +
          `${hasToolDemand ? 'Tool/solution demand detected. ' : ''}` +
          `Labels: ${Array.from(labels).join(', ')}.`,
        strength: hasToolDemand ? Math.min(100, strength + 15) : strength,
        category,
        geo_relevance: this.inferGeo(entries),
        source: entries[0]!.item.source as ScrapeSource,
        source_url: entries[0]!.item.url,
        occurred_at: new Date(Math.max(...entries.map((e) => e.item.scrapedAt.getTime()))),
        evidence: {
          regulation,
          mention_count: entries.length,
          avg_severity: avgScore,
          has_tool_demand: hasToolDemand,
          labels: Array.from(labels),
          top_posts: entries.slice(0, 5).map((e) => ({
            title: e.item.title,
            url: e.item.url,
            score: e.score,
            source: e.item.source,
          })),
        },
      });
    }

    // Generic regulatory deadline cluster
    if (noRegulation.length >= MIN_MENTIONS) {
      const avgScore = noRegulation.reduce((s, e) => s + e.score, 0) / noRegulation.length;
      const strength = Math.round(
        this.computeStrength(noRegulation.length, 2, 10) * 0.5 +
        this.computeStrength(avgScore, 2, 8) * 0.5,
      );

      if (strength >= 15) {
        signals.push({
          signal_type: 'regulatory_deadline',
          title: `Regulatory deadline cluster (${noRegulation.length} posts)`,
          description:
            `${noRegulation.length} posts about regulatory deadlines across multiple regulations.`,
          strength,
          category: 'compliance_legal',
          geo_relevance: ['EU', 'FR'],
          source: noRegulation[0]!.item.source as ScrapeSource,
          occurred_at: new Date(),
          evidence: {
            mention_count: noRegulation.length,
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

  private analyzeDeadline(item: NormalizedItem): {
    score: number;
    labels: string[];
    regulation: string | null;
    category: string | null;
  } {
    const text = `${item.title} ${item.description ?? ''}`;
    let score = 0;
    const labels: string[] = [];

    for (const { pattern, weight, label } of DEADLINE_PATTERNS) {
      if (pattern.test(text)) {
        score += weight;
        labels.push(label);
      }
    }

    // Extract regulation name
    let regulation: string | null = null;
    let category: string | null = null;

    for (const { pattern, name, category: cat } of REGULATION_PATTERNS) {
      if (pattern.test(text)) {
        regulation = name;
        category = cat;
        break;
      }
    }

    return { score: Math.min(score, 12), labels, regulation, category };
  }

  private inferGeo(entries: Array<{ item: NormalizedItem }>): string[] {
    const geos = new Set<string>();

    for (const entry of entries) {
      const text = `${entry.item.title} ${entry.item.description ?? ''}`.toLowerCase();
      if (/\bfrance|french|fr\b/.test(text)) geos.add('FR');
      if (/\beu|europe|european\b/.test(text)) geos.add('EU');
      if (/\bgermany|german\b/.test(text)) geos.add('DE');
      if (/\buk|united kingdom|british\b/.test(text)) geos.add('UK');

      if (entry.item.source === 'legifrance') geos.add('FR');
      if (entry.item.source === 'eurlex') geos.add('EU');
    }

    if (geos.size === 0) geos.add('EU');
    return Array.from(geos);
  }
}
