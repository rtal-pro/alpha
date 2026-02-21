// ---------------------------------------------------------------------------
// TalentDemandDetector — detects surges in job postings for specific
// SaaS categories, indicating market growth
//
// When companies are hiring heavily in a specific domain, it signals:
// - Market is growing (demand for talent = demand for product)
// - Existing players are scaling (validate market size)
// - New entrants have funding (validate investor interest)
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

const MIN_JOB_POSTINGS = 5;
const WINDOW_DAYS = 30;

// Category keywords for grouping job postings
const CATEGORY_KEYWORDS: Record<string, RegExp[]> = {
  fintech: [/\bfintech|payment|banking|lending|neobank|insurtech\b/i],
  compliance_legal: [/\bcompliance|gdpr|rgpd|privacy|legal.?tech|regtech|audit\b/i],
  devtools: [/\bdevtools|developer.?tool|api|sdk|infrastructure|platform.?engineer\b/i],
  cybersecurity: [/\bcyber|security|soc|pentest|threat|vulnerability\b/i],
  ai_ml: [/\bai|machine learning|ml engineer|llm|nlp|data scientist\b/i],
  data_analytics: [/\bdata.?engineer|analytics|bi|business intelligence|data.?platform\b/i],
  ecommerce: [/\becommerce|e-commerce|marketplace|shopify|magento\b/i],
  healthcare: [/\bhealth.?tech|medical|telemedicine|clinical|pharma\b/i],
  marketing: [/\bmarketing.?tech|martech|growth|seo|content.?market\b/i],
  general_saas: [/\bsaas|b2b|product.?manag|customer.?success\b/i],
};

// Seniority signals that indicate growth stage
const GROWTH_INDICATORS: Array<{ pattern: RegExp; weight: number }> = [
  // Hiring senior = scaling up
  { pattern: /\b(senior|staff|principal|lead|head of|director|vp)\b/i, weight: 1.5 },
  // Hiring founding/first = new market entry
  { pattern: /\b(founding|first|early|#1|employee.?[1-5])\b/i, weight: 2.0 },
  // Remote/global = competitive market
  { pattern: /\b(remote|worldwide|global|anywhere)\b/i, weight: 1.2 },
];

// ---------------------------------------------------------------------------
// TalentDemandDetector
// ---------------------------------------------------------------------------

export class TalentDemandDetector extends BaseSignalDetector {
  readonly name = 'TalentDemandDetector';
  readonly signalTypes: SignalType[] = ['market_entry'];
  readonly supportedSources: ScrapeSource[] = ['job_boards'];

  async detect(items: NormalizedItem[]): Promise<DetectedSignal[]> {
    const relevant = items.filter((i) => i.source === 'job_boards');
    if (relevant.length === 0) return [];

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recent = relevant.filter((i) => i.scrapedAt >= windowStart);

    if (recent.length < MIN_JOB_POSTINGS) return [];

    // Group by inferred category
    const byCategory = new Map<string, NormalizedItem[]>();
    for (const item of recent) {
      const category = this.inferCategory(item);
      const group = byCategory.get(category) ?? [];
      group.push(item);
      byCategory.set(category, group);
    }

    const signals: DetectedSignal[] = [];

    for (const [category, jobs] of byCategory) {
      if (jobs.length < MIN_JOB_POSTINGS) continue;

      // Compute growth signal from job quality
      const growthScore = this.computeGrowthScore(jobs);
      const uniqueCompanies = new Set(
        jobs.map((j) => (j.metadata?.['company'] as string) ?? j.title),
      ).size;

      // Strength based on volume, company diversity, and growth indicators
      const volumeStrength = this.computeStrength(jobs.length, 3, 30);
      const diversityStrength = this.computeStrength(uniqueCompanies, 2, 15);
      const growthStrength = this.computeStrength(growthScore, 1, 5);

      const strength = Math.round(
        volumeStrength * 0.40 +
        diversityStrength * 0.30 +
        growthStrength * 0.30,
      );

      if (strength < 15) continue;

      // Geo analysis
      const geos = this.extractGeos(jobs);

      signals.push({
        signal_type: 'market_entry',
        title: `Talent demand surge: ${category} (${jobs.length} postings, ${uniqueCompanies} companies)`,
        description:
          `${jobs.length} job postings from ${uniqueCompanies} companies ` +
          `in "${category}" within ${WINDOW_DAYS} days. ` +
          `Growth indicator score: ${growthScore.toFixed(1)}/5.`,
        strength,
        category,
        geo_relevance: geos,
        source: 'job_boards' as ScrapeSource,
        occurred_at: new Date(),
        evidence: {
          posting_count: jobs.length,
          unique_companies: uniqueCompanies,
          growth_score: growthScore,
          geos,
          sample_jobs: jobs.slice(0, 8).map((j) => ({
            title: j.title,
            company: j.metadata?.['company'],
            location: j.metadata?.['location'],
            url: j.url,
          })),
          top_companies: this.getTopCompanies(jobs, 5),
        },
      });
    }

    return signals;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategory(item: NormalizedItem): string {
    const text = `${item.title} ${item.description ?? ''}`;

    for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) return category;
      }
    }

    // Check metadata categories
    const metaCategories = (item.metadata?.['categories'] as string[]) ?? [];
    if (metaCategories.length > 0) return metaCategories[0]!;

    return 'general_saas';
  }

  private computeGrowthScore(jobs: NormalizedItem[]): number {
    let totalWeight = 0;
    let count = 0;

    for (const job of jobs) {
      const text = `${job.title} ${job.description ?? ''}`;
      let maxWeight = 1.0;

      for (const { pattern, weight } of GROWTH_INDICATORS) {
        if (pattern.test(text)) {
          maxWeight = Math.max(maxWeight, weight);
        }
      }

      totalWeight += maxWeight;
      count++;
    }

    return count > 0 ? Math.min(5, totalWeight / count) : 0;
  }

  private extractGeos(jobs: NormalizedItem[]): string[] {
    const geos = new Set<string>();

    for (const job of jobs) {
      const location = ((job.metadata?.['location'] as string) ?? '').toLowerCase();

      if (/\bfrance|paris|lyon|marseille|toulouse|nantes|bordeaux\b/.test(location)) geos.add('FR');
      if (/\bgermany|berlin|munich|münchen|hamburg\b/.test(location)) geos.add('DE');
      if (/\buk|london|manchester|united kingdom\b/.test(location)) geos.add('UK');
      if (/\bus|usa|united states|new york|san francisco|remote\b/.test(location)) geos.add('US');
      if (/\beurope|eu\b/.test(location)) geos.add('EU');
    }

    if (geos.size === 0) geos.add('GLOBAL');
    return Array.from(geos);
  }

  private getTopCompanies(
    jobs: NormalizedItem[],
    topN: number,
  ): Array<{ company: string; count: number }> {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      const company = (job.metadata?.['company'] as string) ?? 'Unknown';
      counts.set(company, (counts.get(company) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
}
