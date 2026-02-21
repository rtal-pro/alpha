// ---------------------------------------------------------------------------
// FundingSurgeDetector — detects clusters of funding rounds in a specific
// SaaS category, indicating VC confidence and market growth
//
// When multiple companies in the same space raise funding within a short
// window, it signals a validated market with room for new entrants.
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

const MIN_FUNDING_ROUNDS = 3;
const WINDOW_DAYS = 60;

// Stage weights — later stages = stronger market validation
const STAGE_WEIGHTS: Record<string, number> = {
  pre_seed: 0.5,
  seed: 1.0,
  series_a: 2.0,
  series_b: 2.5,
  series_c: 3.0,
  series_d: 3.0,
  growth: 2.5,
  ipo: 3.0,
};

// Category inference from company descriptions
const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  fintech: /\b(fintech|payment|banking|lending|neobank|insurtech|defi|crypto)\b/i,
  cybersecurity: /\b(cyber|security|soc|threat|vulnerability|zero.?trust|siem)\b/i,
  ai_ml: /\b(ai|artificial intelligence|machine learning|llm|generative|gpt|deep learning)\b/i,
  devtools: /\b(developer|devtools|api|sdk|infrastructure|cloud|platform)\b/i,
  healthcare: /\b(health|medical|clinical|pharma|biotech|telemedicine|digital health)\b/i,
  ecommerce: /\b(ecommerce|e-commerce|marketplace|retail|d2c|shopify)\b/i,
  compliance_legal: /\b(compliance|legal|regtech|gdpr|privacy|audit|risk)\b/i,
  hr_tech: /\b(hr|human resource|talent|recruit|payroll|workforce)\b/i,
  edtech: /\b(education|edtech|learning|training|lms|e-learning)\b/i,
  marketing: /\b(marketing|martech|advertising|seo|content|growth)\b/i,
  analytics: /\b(analytics|data|bi|business intelligence|dashboard|reporting)\b/i,
  automation: /\b(automation|workflow|rpa|no-code|low-code|integration)\b/i,
};

// ---------------------------------------------------------------------------
// FundingSurgeDetector
// ---------------------------------------------------------------------------

export class FundingSurgeDetector extends BaseSignalDetector {
  readonly name = 'FundingSurgeDetector';
  readonly signalTypes: SignalType[] = ['funding_surge'];
  readonly supportedSources: ScrapeSource[] = ['crunchbase', 'producthunt', 'hacker_news'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) =>
      this.supportedSources.includes(i.source as ScrapeSource),
    );
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    // Filter to funding-related items
    const fundingItems = recent.filter((item) => this.isFundingRelated(item));

    if (fundingItems.length < MIN_FUNDING_ROUNDS) return [];

    // Group by inferred category
    const byCategory = new Map<string, NormalizedItem[]>();
    for (const item of fundingItems) {
      const category = this.inferCategory(item);
      const group = byCategory.get(category) ?? [];
      group.push(item);
      byCategory.set(category, group);
    }

    const signals: DetectedSignal[] = [];

    for (const [category, items] of byCategory) {
      if (items.length < MIN_FUNDING_ROUNDS) continue;

      const totalRaised = items.reduce(
        (sum, item) => sum + (item.metrics['amount_usd'] ?? item.metrics['funding_amount'] ?? 0), 0,
      );
      const avgAmount = totalRaised / items.length;
      const uniqueCompanies = new Set(
        items.map((i) => (i.metadata?.['company'] as string) ?? i.title),
      ).size;

      // Compute stage signal
      const stageScore = this.computeStageScore(items);

      // Compute strength
      const countStrength = this.computeStrength(items.length, 2, 15);
      const diversityStrength = this.computeStrength(uniqueCompanies, 2, 10);
      const stageStrength = this.computeStrength(stageScore, 1, 6);
      const amountStrength = this.computeStrength(avgAmount, 500_000, 50_000_000);

      const strength = Math.round(
        countStrength * 0.30 +
        diversityStrength * 0.25 +
        stageStrength * 0.20 +
        amountStrength * 0.25,
      );

      if (strength < 20) continue;

      // Geo analysis
      const geos = this.extractGeos(items);

      signals.push({
        signal_type: 'funding_surge',
        title: `Funding surge: ${category} (${items.length} rounds, ${uniqueCompanies} companies)`,
        description:
          `${items.length} funding rounds from ${uniqueCompanies} companies ` +
          `in "${category}" within ${WINDOW_DAYS} days. ` +
          `Total raised: $${this.formatAmount(totalRaised)}. Stage score: ${stageScore.toFixed(1)}/3.`,
        strength,
        category,
        geo_relevance: geos,
        source: 'crunchbase',
        occurred_at: new Date(),
        evidence: {
          round_count: items.length,
          unique_companies: uniqueCompanies,
          total_raised_usd: totalRaised,
          avg_amount_usd: avgAmount,
          stage_score: stageScore,
          geos,
          top_rounds: items.slice(0, 8).map((i) => ({
            company: (i.metadata?.['company'] as string) ?? i.title,
            amount: i.metrics['amount_usd'] ?? i.metrics['funding_amount'],
            stage: i.metadata?.['stage'],
            url: i.url,
          })),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private isFundingRelated(item: NormalizedItem): boolean {
    const text = `${item.title} ${item.description ?? ''}`.toLowerCase();
    return (
      /\b(rais|fund|series\s+[a-e]|seed|round|investment|backed|million|venture)\b/.test(text) ||
      item.categories.some((c) => /funding|investment|venture/.test(c)) ||
      (item.metrics['amount_usd'] ?? item.metrics['funding_amount'] ?? 0) > 0
    );
  }

  private inferCategory(item: NormalizedItem): string {
    const text = `${item.title} ${item.description ?? ''}`;

    for (const [category, pattern] of Object.entries(CATEGORY_KEYWORDS)) {
      if (pattern.test(text)) return category;
    }

    // Check item categories
    for (const cat of item.categories) {
      const lower = cat.toLowerCase();
      for (const [category, pattern] of Object.entries(CATEGORY_KEYWORDS)) {
        if (pattern.test(lower)) return category;
      }
    }

    return 'general_saas';
  }

  private computeStageScore(items: NormalizedItem[]): number {
    let totalWeight = 0;
    let count = 0;

    for (const item of items) {
      const stage = ((item.metadata?.['stage'] as string) ?? '').toLowerCase().replace(/[\s-]/g, '_');
      const weight = STAGE_WEIGHTS[stage] ?? 1.0;
      totalWeight += weight;
      count++;
    }

    return count > 0 ? Math.min(3, totalWeight / count) : 0;
  }

  private extractGeos(items: NormalizedItem[]): string[] {
    const geos = new Set<string>();

    for (const item of items) {
      const location = ((item.metadata?.['location'] as string) ?? '').toLowerCase();
      if (/\bfrance|paris|lyon\b/.test(location)) geos.add('FR');
      if (/\bgermany|berlin|munich\b/.test(location)) geos.add('DE');
      if (/\buk|london|united kingdom\b/.test(location)) geos.add('UK');
      if (/\bus|usa|united states|san francisco|new york\b/.test(location)) geos.add('US');
      if (/\beurope|eu\b/.test(location)) geos.add('EU');
    }

    if (geos.size === 0) geos.add('GLOBAL');
    return Array.from(geos);
  }

  private formatAmount(amount: number): string {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return String(amount);
  }
}
