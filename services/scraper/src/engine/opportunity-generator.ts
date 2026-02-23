// ---------------------------------------------------------------------------
// Opportunity Generator — 4 paths to discover SaaS opportunities
//
// 1. Geo Gap       — category strong abroad, weak in FR
// 2. Regulatory Gap — forced_adoption regulation + no FR solution
// 3. Convergence   — 4+ unique signal types in same category within 30 days
// 4. Competitor Weakness — FR product declining + pain points growing
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../config.js';
import type { CrossingMatch, EmergentPattern } from './cross-reference.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedOpportunity {
  title: string;
  category: string;
  description: string;
  type:
    | 'geo_gap' | 'regulatory_gap' | 'convergence' | 'competitor_weakness'
    | 'api_sunset_gap' | 'funding_follows_pain' | 'talent_migration'
    | 'platform_risk' | 'oss_commercial_gap';
  composite_score: number;
  growth_score: number;
  gap_score: number;
  regulatory_score: number;
  feasibility_score: number;
  source_products: string[];
  source_signals: string[];
  source_regulations: string[];
  evidence_summary: Record<string, unknown>;
  target_geo: string;
  reference_geo?: string;
  status: string;
}

// ---------------------------------------------------------------------------
// OpportunityGenerator
// ---------------------------------------------------------------------------

export class OpportunityGenerator {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Run all 8 opportunity generation paths and return candidates.
   */
  async generateAll(): Promise<GeneratedOpportunity[]> {
    const [
      geoGaps, regulatoryGaps, convergences, weaknesses,
      apiSunsetGaps, fundingFollowsPain, talentMigrations, platformRisks,
      ossGaps,
    ] = await Promise.all([
      this.detectGeoGaps(),
      this.detectRegulatoryGaps(),
      this.detectConvergences(),
      this.detectCompetitorWeaknesses(),
      this.detectAPISunsetGaps(),
      this.detectFundingFollowsPain(),
      this.detectTalentMigration(),
      this.detectPlatformRisk(),
      this.detectOSSCommercialGaps(),
    ]);

    const all = [
      ...geoGaps, ...regulatoryGaps, ...convergences, ...weaknesses,
      ...apiSunsetGaps, ...fundingFollowsPain, ...talentMigrations, ...platformRisks,
      ...ossGaps,
    ];

    console.log(
      `[opportunity-gen] Generated ${all.length} opportunities: ` +
      `${geoGaps.length} geo_gap, ${regulatoryGaps.length} regulatory_gap, ` +
      `${convergences.length} convergence, ${weaknesses.length} competitor_weakness, ` +
      `${apiSunsetGaps.length} api_sunset_gap, ${fundingFollowsPain.length} funding_follows_pain, ` +
      `${talentMigrations.length} talent_migration, ${platformRisks.length} platform_risk, ` +
      `${ossGaps.length} oss_commercial_gap`,
    );

    return all;
  }

  /**
   * Generate from crossing matches and emergent patterns.
   */
  fromCrossReferences(
    crossingMatches: CrossingMatch[],
    emergentPatterns: EmergentPattern[],
  ): GeneratedOpportunity[] {
    const opportunities: GeneratedOpportunity[] = [];

    // From crossing matches
    for (const match of crossingMatches) {
      if (match.confidence < 30) continue;

      const signalIds = match.matchedSignals
        .filter((s) => s.raw_event_id)
        .map((s) => s.raw_event_id!);

      opportunities.push({
        title: `${match.domain.name}: ${match.rule.name} in ${match.category}`,
        category: match.category,
        description: match.rule.description,
        type: this.inferTypeFromRule(match.rule.name),
        composite_score: match.confidence,
        growth_score: this.avgSignalStrength(match.matchedSignals, 'search_trend'),
        gap_score: this.avgSignalStrength(match.matchedSignals, 'product_launch'),
        regulatory_score: this.avgSignalStrength(match.matchedSignals, 'regulatory_event'),
        feasibility_score: Math.max(30, 100 - match.matchedSignals.length * 5),
        source_products: [],
        source_signals: signalIds,
        source_regulations: [],
        evidence_summary: {
          rule: match.rule.name,
          domain: match.domain.id,
          signal_count: match.matchedSignals.length,
          signal_types: [...new Set(match.matchedSignals.map((s) => s.signal_type))],
          avg_strength: Math.round(
            match.matchedSignals.reduce((s, sig) => s + sig.strength, 0) / match.matchedSignals.length,
          ),
        },
        target_geo: 'FR',
        reference_geo: 'US',
        status: 'new',
      });
    }

    // From emergent patterns (convergence type)
    for (const pattern of emergentPatterns) {
      if (pattern.strength < 40) continue;

      opportunities.push({
        title: `Convergence detected in ${pattern.category}`,
        category: pattern.category,
        description: pattern.description,
        type: 'convergence',
        composite_score: pattern.strength,
        growth_score: pattern.strength,
        gap_score: 0,
        regulatory_score: 0,
        feasibility_score: 50,
        source_products: [],
        source_signals: [],
        source_regulations: [],
        evidence_summary: {
          pattern_type: pattern.type,
          signal_count: pattern.signals.length,
          signal_types: [...new Set(pattern.signals.map((s) => s.signal_type))],
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  /**
   * Persist generated opportunities to the database.
   */
  async persist(opportunities: GeneratedOpportunity[]): Promise<string[]> {
    if (opportunities.length === 0) return [];

    const rows = opportunities.map((opp) => ({
      title: opp.title,
      slug: this.slugify(opp.title),
      category: opp.category,
      description: opp.description,
      type: opp.type,
      composite_score: opp.composite_score,
      growth_score: opp.growth_score,
      gap_score: opp.gap_score,
      regulatory_score: opp.regulatory_score,
      feasibility_score: opp.feasibility_score,
      source_products: opp.source_products,
      source_signals: opp.source_signals,
      source_regulations: opp.source_regulations,
      evidence_summary: opp.evidence_summary,
      target_geo: opp.target_geo,
      reference_geo: opp.reference_geo ?? null,
      status: opp.status,
      score_history: [{
        score: opp.composite_score,
        timestamp: new Date().toISOString(),
        signal_count: opp.source_signals.length,
      }],
    }));

    const ids: string[] = [];
    const BATCH_SIZE = 25;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await this.supabase
        .from('opportunities')
        .insert(batch)
        .select('id');

      if (error) {
        console.error(`[opportunity-gen] Insert error:`, error.message);
        continue;
      }
      if (data) {
        ids.push(...data.map((r: { id: string }) => r.id));
      }
    }

    console.log(`[opportunity-gen] Persisted ${ids.length} of ${opportunities.length} opportunities`);
    return ids;
  }

  // -----------------------------------------------------------------------
  // Path 1: Geo Gap
  // -----------------------------------------------------------------------

  private async detectGeoGaps(): Promise<GeneratedOpportunity[]> {
    const { data: gaps } = await this.supabase
      .from('geo_gaps')
      .select('*')
      .eq('target_geo', 'FR')
      .gte('gap_score', 50)
      .order('opportunity_score', { ascending: false })
      .limit(20);

    if (!gaps || gaps.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    for (const gap of gaps) {
      const category = gap['category'] as string;

      // Fetch related signals to populate source_signals (prevents empty array breaking feedback)
      const { data: relatedSignals } = await this.supabase
        .from('signals')
        .select('id')
        .eq('category', category)
        .gte('detected_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10);

      opportunities.push({
        title: `Geo gap: ${category} (${gap['reference_geo']} → FR)`,
        category,
        description:
          `${gap['reference_product_count']} products in ${gap['reference_geo']} vs ` +
          `${gap['target_product_count']} in FR. Gap score: ${gap['gap_score']}.`,
        type: 'geo_gap' as const,
        composite_score: Number(gap['opportunity_score'] ?? gap['gap_score'] ?? 50),
        growth_score: 0,
        gap_score: Number(gap['gap_score'] ?? 0),
        regulatory_score: Number(gap['regulatory_boost'] ?? 0),
        feasibility_score: Math.max(30, 100 - Number(gap['reference_product_count'] ?? 0) * 3),
        source_products: [],
        source_signals: (relatedSignals ?? []).map((s: { id: string }) => s.id),
        source_regulations: [],
        evidence_summary: {
          reference_products: gap['reference_product_count'],
          target_products: gap['target_product_count'],
          gap_type: gap['gap_type'],
          gap_evidence: gap['gap_evidence'],
        },
        target_geo: 'FR',
        reference_geo: gap['reference_geo'] as string,
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 2: Regulatory Gap
  // -----------------------------------------------------------------------

  private async detectRegulatoryGaps(): Promise<GeneratedOpportunity[]> {
    const { data: regulations } = await this.supabase
      .from('regulations')
      .select('*, regulation_categories(*)')
      .eq('forced_adoption', true)
      .gte('transition_deadline', new Date().toISOString())
      .lte('transition_deadline', new Date(Date.now() + 36 * 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('market_impact_score', { ascending: false })
      .limit(15);

    if (!regulations || regulations.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    for (const reg of regulations) {
      const categories = (reg.regulation_categories ?? []) as Array<{ category: string }>;

      for (const rc of categories) {
        // Check if there are adequate FR solutions in this category
        const { count: frSolutions } = await this.supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('primary_category', rc.category)
          .eq('hq_country', 'FR')
          .eq('is_active', true);

        if ((frSolutions ?? 0) > 3) continue; // Adequate solutions exist

        const monthsToDeadline = reg.transition_deadline
          ? Math.max(0, (new Date(reg.transition_deadline).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000))
          : 36;

        // Urgency peaks at 6-12 months
        let urgency: number;
        if (monthsToDeadline <= 3) urgency = 60;
        else if (monthsToDeadline <= 6) urgency = 90;
        else if (monthsToDeadline <= 12) urgency = 100;
        else if (monthsToDeadline <= 24) urgency = 70;
        else urgency = 40;

        opportunities.push({
          title: `Regulatory gap: ${reg.short_name ?? reg.title} → ${rc.category}`,
          category: rc.category,
          description:
            `${reg.mandatory ? 'Mandatory' : 'Recommended'} regulation "${reg.title}" ` +
            `requires compliance by ${reg.transition_deadline}. Only ${frSolutions ?? 0} FR solutions exist.`,
          type: 'regulatory_gap',
          composite_score: Math.round((urgency + Number(reg.market_impact_score ?? 50)) / 2),
          growth_score: 0,
          gap_score: 100 - Math.min(100, (frSolutions ?? 0) * 25),
          regulatory_score: urgency,
          feasibility_score: monthsToDeadline > 12 ? 70 : monthsToDeadline > 6 ? 50 : 30,
          source_products: [],
          source_signals: [],
          source_regulations: [reg.id],
          evidence_summary: {
            regulation_title: reg.title,
            short_name: reg.short_name,
            jurisdiction: reg.jurisdiction,
            deadline: reg.transition_deadline,
            months_to_deadline: Math.round(monthsToDeadline),
            fr_solution_count: frSolutions ?? 0,
            mandatory: reg.mandatory,
            forced_adoption: reg.forced_adoption,
          },
          target_geo: 'FR',
          status: 'new',
        });
      }
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 3: Convergence
  // -----------------------------------------------------------------------

  private async detectConvergences(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: signals } = await this.supabase
      .from('signals')
      .select('*')
      .gte('detected_at', cutoff.toISOString())
      .not('category', 'is', null)
      .order('detected_at', { ascending: false });

    if (!signals || signals.length === 0) return [];

    // Group by category
    const byCategory = new Map<string, typeof signals>();
    for (const s of signals) {
      const group = byCategory.get(s.category) ?? [];
      group.push(s);
      byCategory.set(s.category, group);
    }

    const opportunities: GeneratedOpportunity[] = [];

    for (const [category, catSignals] of byCategory) {
      const uniqueTypes = new Set(catSignals.map((s: { signal_type: string }) => s.signal_type));

      if (uniqueTypes.size < 2) continue;

      const avgStrength = catSignals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / catSignals.length;

      const allSignalIds = catSignals.map((s: { id: string }) => s.id);
      if (allSignalIds.length > 50) {
        console.warn(
          `[opportunity-gen] Convergence in "${category}": truncating ${allSignalIds.length} signal IDs to 50`,
        );
      }
      const signalIds = allSignalIds.slice(0, 50);

      opportunities.push({
        title: `Signal convergence in ${category} (${uniqueTypes.size} types)`,
        category,
        description:
          `${uniqueTypes.size} different signal types detected in "${category}" within 30 days: ` +
          `${Array.from(uniqueTypes).join(', ')}. Total signals: ${catSignals.length}.`,
        type: 'convergence',
        composite_score: Math.min(100, Math.round(avgStrength * (uniqueTypes.size / 2))),
        growth_score: avgStrength,
        gap_score: 0,
        regulatory_score: 0,
        feasibility_score: 60,
        source_products: [],
        source_signals: signalIds,
        source_regulations: [],
        evidence_summary: {
          signal_types: Array.from(uniqueTypes),
          signal_count: catSignals.length,
          avg_strength: Math.round(avgStrength),
          unique_sources: [...new Set(catSignals.map((s: { source: string }) => s.source))],
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 4: Competitor Weakness
  // -----------------------------------------------------------------------

  private async detectCompetitorWeaknesses(): Promise<GeneratedOpportunity[]> {
    // Find FR products with declining signals + pain point clusters
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const { data: painSignals } = await this.supabase
      .from('signals')
      .select('*, products!inner(id, canonical_name, primary_category, hq_country)')
      .eq('signal_type', 'pain_point_cluster')
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 40)
      .order('strength', { ascending: false })
      .limit(50);

    if (!painSignals || painSignals.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    // Group by product
    const byProduct = new Map<string, typeof painSignals>();
    for (const s of painSignals) {
      const productId = (s.products as { id: string })?.id;
      if (!productId) continue;
      const group = byProduct.get(productId) ?? [];
      group.push(s);
      byProduct.set(productId, group);
    }

    for (const [productId, signals] of byProduct) {
      if (signals.length < 1) continue;

      const product = signals[0]!.products as {
        id: string;
        canonical_name: string;
        primary_category: string;
        hq_country: string;
      };

      const avgPainStrength = signals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / signals.length;

      opportunities.push({
        title: `Competitor weakness: ${product.canonical_name} (${product.primary_category})`,
        category: product.primary_category,
        description:
          `${product.canonical_name} has ${signals.length} pain point signals ` +
          `with average strength ${Math.round(avgPainStrength)}/100. ` +
          `This may indicate an opportunity to build a better alternative.`,
        type: 'competitor_weakness',
        composite_score: Math.min(100, Math.round(avgPainStrength * (signals.length / 3))),
        growth_score: 0,
        gap_score: 0,
        regulatory_score: 0,
        feasibility_score: 70,
        source_products: [productId],
        source_signals: signals.map((s: { id: string }) => s.id),
        source_regulations: [],
        evidence_summary: {
          competitor_name: product.canonical_name,
          competitor_country: product.hq_country,
          pain_signal_count: signals.length,
          avg_pain_strength: Math.round(avgPainStrength),
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 5: API Sunset Gap — when an API/platform is deprecated,
  // replacement tools become high-value opportunities
  // -----------------------------------------------------------------------

  private async detectAPISunsetGaps(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    const { data: apiSignals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('signal_type', 'api_deprecation')
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 30)
      .order('strength', { ascending: false })
      .limit(30);

    if (!apiSignals || apiSignals.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    // Group by category — multiple API deprecations in same space = strong signal
    const byCategory = new Map<string, typeof apiSignals>();
    for (const s of apiSignals) {
      const cat = s.category ?? 'general_saas';
      const group = byCategory.get(cat) ?? [];
      group.push(s);
      byCategory.set(cat, group);
    }

    for (const [category, signals] of byCategory) {
      const avgStrength = signals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / signals.length;

      const platforms = signals
        .map((s: { evidence: Record<string, unknown> }) =>
          (s.evidence?.['platform'] as string) ?? 'unknown')
        .filter((p: string) => p !== 'unknown');
      const uniquePlatforms = [...new Set(platforms)];

      // Also check for related pain point signals in this category
      const { count: relatedPainCount } = await this.supabase
        .from('signals')
        .select('id', { count: 'exact', head: true })
        .eq('category', category)
        .eq('signal_type', 'pain_point_cluster')
        .gte('detected_at', cutoff.toISOString());

      const painBoost = Math.min(20, (relatedPainCount ?? 0) * 5);

      opportunities.push({
        title: `API sunset gap: ${category}${uniquePlatforms.length > 0 ? ` (${uniquePlatforms.slice(0, 3).join(', ')})` : ''}`,
        category,
        description:
          `${signals.length} API deprecation signals in "${category}". ` +
          `${uniquePlatforms.length > 0 ? `Affected platforms: ${uniquePlatforms.join(', ')}. ` : ''}` +
          `${(relatedPainCount ?? 0) > 0 ? `${relatedPainCount} related pain points detected. ` : ''}` +
          `Users displaced by API changes need replacement tools.`,
        type: 'api_sunset_gap',
        composite_score: Math.min(100, Math.round(avgStrength + painBoost)),
        growth_score: Math.round(avgStrength),
        gap_score: Math.min(100, signals.length * 20),
        regulatory_score: 0,
        feasibility_score: 65,
        source_products: [],
        source_signals: signals.map((s: { id: string }) => s.id),
        source_regulations: [],
        evidence_summary: {
          signal_count: signals.length,
          avg_strength: Math.round(avgStrength),
          affected_platforms: uniquePlatforms,
          related_pain_count: relatedPainCount ?? 0,
        },
        target_geo: 'GLOBAL',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 6: Funding Follows Pain — when VCs fund a category where
  // pain points are also spiking, it validates the market
  // -----------------------------------------------------------------------

  private async detectFundingFollowsPain(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get categories with both funding surges AND pain points
    const { data: fundingSignals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('signal_type', 'funding_surge')
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 30);

    if (!fundingSignals || fundingSignals.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    for (const funding of fundingSignals) {
      const category = funding.category;

      // Check for pain point cluster signals in the same category
      const { data: painSignals } = await this.supabase
        .from('signals')
        .select('*')
        .eq('category', category)
        .in('signal_type', ['pain_point_cluster', 'pricing_change', 'community_buzz'])
        .gte('detected_at', cutoff.toISOString())
        .gte('strength', 25)
        .limit(20);

      if (!painSignals || painSignals.length < 2) continue;

      const avgPainStrength = painSignals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / painSignals.length;

      const fundingEvidence = funding.evidence as Record<string, unknown> | null;
      const totalRaised = (fundingEvidence?.['total_raised_usd'] as number) ?? 0;
      const uniqueCompanies = (fundingEvidence?.['unique_companies'] as number) ?? 0;

      const compositeScore = Math.min(100, Math.round(
        (funding.strength * 0.4) +
        (avgPainStrength * 0.4) +
        (Math.min(100, painSignals.length * 10) * 0.2),
      ));

      opportunities.push({
        title: `Funding + pain: ${category} ($${this.formatAmount(totalRaised)} raised, ${painSignals.length} pain signals)`,
        category,
        description:
          `${uniqueCompanies} companies raised $${this.formatAmount(totalRaised)} in "${category}" ` +
          `while ${painSignals.length} pain/frustration signals detected. ` +
          `VC-validated market with clear user problems to solve.`,
        type: 'funding_follows_pain',
        composite_score: compositeScore,
        growth_score: funding.strength,
        gap_score: Math.round(avgPainStrength),
        regulatory_score: 0,
        feasibility_score: 55,
        source_products: [],
        source_signals: [
          funding.id,
          ...painSignals.map((s: { id: string }) => s.id).slice(0, 15),
        ],
        source_regulations: [],
        evidence_summary: {
          funding_strength: funding.strength,
          total_raised: totalRaised,
          unique_companies: uniqueCompanies,
          pain_signal_count: painSignals.length,
          avg_pain_strength: Math.round(avgPainStrength),
          pain_types: [...new Set(painSignals.map((s: { signal_type: string }) => s.signal_type))],
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 7: Talent Migration — when job postings cluster in an
  // emerging category AND community buzz is growing, the market is forming
  // -----------------------------------------------------------------------

  private async detectTalentMigration(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    // Find categories with talent demand (market_entry from job boards)
    const { data: talentSignals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('signal_type', 'market_entry')
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 30)
      .limit(20);

    if (!talentSignals || talentSignals.length === 0) return [];

    const opportunities: GeneratedOpportunity[] = [];

    for (const talent of talentSignals) {
      const category = talent.category;

      // Cross-reference with emerging tech adoption signals
      const { data: techSignals } = await this.supabase
        .from('signals')
        .select('*')
        .eq('category', category)
        .in('signal_type', ['emerging_tech_adoption', 'community_buzz', 'search_trend'])
        .gte('detected_at', cutoff.toISOString())
        .gte('strength', 20)
        .limit(15);

      if (!techSignals || techSignals.length < 1) continue;

      const avgTechStrength = techSignals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / techSignals.length;

      const talentEvidence = talent.evidence as Record<string, unknown> | null;
      const postingCount = (talentEvidence?.['posting_count'] as number) ?? 0;
      const uniqueCompanies = (talentEvidence?.['unique_companies'] as number) ?? 0;

      const compositeScore = Math.min(100, Math.round(
        (talent.strength * 0.45) +
        (avgTechStrength * 0.35) +
        (Math.min(100, techSignals.length * 15) * 0.20),
      ));

      opportunities.push({
        title: `Talent migration: ${category} (${postingCount} jobs, ${techSignals.length} tech signals)`,
        category,
        description:
          `${postingCount} job postings from ${uniqueCompanies} companies hiring in "${category}" ` +
          `combined with ${techSignals.length} emerging tech/community signals. ` +
          `Market is forming — early movers can capture the ecosystem.`,
        type: 'talent_migration',
        composite_score: compositeScore,
        growth_score: Math.round(avgTechStrength),
        gap_score: 0,
        regulatory_score: 0,
        feasibility_score: 60,
        source_products: [],
        source_signals: [
          talent.id,
          ...techSignals.map((s: { id: string }) => s.id).slice(0, 10),
        ],
        source_regulations: [],
        evidence_summary: {
          posting_count: postingCount,
          unique_companies: uniqueCompanies,
          talent_strength: talent.strength,
          tech_signal_count: techSignals.length,
          avg_tech_strength: Math.round(avgTechStrength),
          signal_types: [...new Set(techSignals.map((s: { signal_type: string }) => s.signal_type))],
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 8: Platform Risk — when a dominant platform consolidates or
  // changes policies, dependent businesses need alternatives
  // -----------------------------------------------------------------------

  private async detectPlatformRisk(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

    // Find market consolidation signals
    const { data: consolidationSignals } = await this.supabase
      .from('signals')
      .select('*')
      .in('signal_type', ['market_consolidation', 'api_deprecation'])
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 30)
      .order('strength', { ascending: false })
      .limit(30);

    if (!consolidationSignals || consolidationSignals.length === 0) return [];

    // Group by category
    const byCategory = new Map<string, typeof consolidationSignals>();
    for (const s of consolidationSignals) {
      const cat = s.category ?? 'general_saas';
      const group = byCategory.get(cat) ?? [];
      group.push(s);
      byCategory.set(cat, group);
    }

    const opportunities: GeneratedOpportunity[] = [];

    for (const [category, signals] of byCategory) {
      // Check for customer concern signals (pain points + community buzz in same category)
      const { data: concernSignals } = await this.supabase
        .from('signals')
        .select('*')
        .eq('category', category)
        .in('signal_type', ['pain_point_cluster', 'community_buzz', 'search_trend', 'pricing_change'])
        .gte('detected_at', cutoff.toISOString())
        .gte('strength', 20)
        .limit(20);

      if (!concernSignals || concernSignals.length < 1) continue;

      const avgConsolidationStrength = signals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / signals.length;
      const avgConcernStrength = concernSignals.reduce(
        (sum: number, s: { strength: number }) => sum + s.strength, 0,
      ) / concernSignals.length;

      const compositeScore = Math.min(100, Math.round(
        (avgConsolidationStrength * 0.45) +
        (avgConcernStrength * 0.35) +
        (Math.min(100, (signals.length + concernSignals.length) * 8) * 0.20),
      ));

      const consolidationTypes = [...new Set(signals.map((s: { signal_type: string }) => s.signal_type))];

      opportunities.push({
        title: `Platform risk: ${category} (${signals.length} consolidation + ${concernSignals.length} concern signals)`,
        category,
        description:
          `${signals.length} market consolidation/API deprecation signals in "${category}" ` +
          `combined with ${concernSignals.length} user concern signals. ` +
          `Platform disruption creates window for independent alternatives.`,
        type: 'platform_risk',
        composite_score: compositeScore,
        growth_score: Math.round(avgConcernStrength),
        gap_score: Math.round(avgConsolidationStrength),
        regulatory_score: 0,
        feasibility_score: 55,
        source_products: [],
        source_signals: [
          ...signals.map((s: { id: string }) => s.id),
          ...concernSignals.map((s: { id: string }) => s.id).slice(0, 10),
        ],
        source_regulations: [],
        evidence_summary: {
          consolidation_signal_count: signals.length,
          concern_signal_count: concernSignals.length,
          consolidation_types: consolidationTypes,
          avg_consolidation_strength: Math.round(avgConsolidationStrength),
          avg_concern_strength: Math.round(avgConcernStrength),
          concern_types: [...new Set(concernSignals.map((s: { signal_type: string }) => s.signal_type))],
        },
        target_geo: 'GLOBAL',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Path 9: OSS Commercial Gap — popular open-source projects that lack
  // a managed/hosted SaaS offering, especially in the FR market
  // -----------------------------------------------------------------------

  private async detectOSSCommercialGaps(): Promise<GeneratedOpportunity[]> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: ossSignals } = await this.supabase
      .from('signals')
      .select('*')
      .eq('signal_type', 'oss_traction')
      .gte('detected_at', cutoff.toISOString())
      .gte('strength', 25)
      .order('strength', { ascending: false })
      .limit(200);

    if (!ossSignals || ossSignals.length === 0) return [];

    // Group by category to find clusters of OSS traction
    const byCategory = new Map<string, typeof ossSignals>();
    for (const s of ossSignals) {
      const cat = s.category ?? 'devtools';
      const group = byCategory.get(cat) ?? [];
      group.push(s);
      byCategory.set(cat, group);
    }

    const opportunities: GeneratedOpportunity[] = [];

    for (const [category, signals] of byCategory) {
      if (signals.length < 1) continue;

      // Deduplicate by title (same repo can appear multiple times)
      const uniqueProjects = new Map<string, (typeof signals)[0]>();
      for (const s of signals) {
        const key = s.title?.replace(/^OSS commercial gap: /, '') ?? s.id;
        if (!uniqueProjects.has(key) || s.strength > (uniqueProjects.get(key)!.strength ?? 0)) {
          uniqueProjects.set(key, s);
        }
      }

      if (uniqueProjects.size < 1) continue;

      const dedupedSignals = Array.from(uniqueProjects.values());
      const avgStrength = dedupedSignals.reduce(
        (sum, s) => sum + (s.strength ?? 0), 0,
      ) / dedupedSignals.length;

      const topProjects = dedupedSignals
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
        .slice(0, 5);

      const compositeScore = Math.min(100, Math.round(
        avgStrength * 0.5 +
        Math.min(100, dedupedSignals.length * 15) * 0.3 +
        50 * 0.2, // base feasibility
      ));

      opportunities.push({
        title: `OSS commercial gap: ${category} (${dedupedSignals.length} projects)`,
        category,
        description:
          `${dedupedSignals.length} popular open-source projects in "${category}" lack a managed SaaS offering. ` +
          `Top projects: ${topProjects.map((s) => s.title?.replace(/^OSS commercial gap: /, '').split(' ')[0]).join(', ')}. ` +
          `Opportunity to build hosted/managed versions targeting the FR/EU market.`,
        type: 'oss_commercial_gap',
        composite_score: compositeScore,
        growth_score: Math.round(avgStrength),
        gap_score: Math.min(100, dedupedSignals.length * 20),
        regulatory_score: 0,
        feasibility_score: 60,
        source_products: [],
        source_signals: dedupedSignals.map((s) => s.id).slice(0, 20),
        source_regulations: [],
        evidence_summary: {
          project_count: dedupedSignals.length,
          avg_strength: Math.round(avgStrength),
          top_projects: topProjects.map((s) => ({
            name: s.title?.replace(/^OSS commercial gap: /, ''),
            strength: s.strength,
            source_url: s.source_url,
          })),
        },
        target_geo: 'FR',
        status: 'new',
      });
    }

    return opportunities;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private formatAmount(amount: number): string {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
    return String(amount);
  }

  private inferTypeFromRule(ruleName: string): GeneratedOpportunity['type'] {
    if (ruleName.includes('regulatory') || ruleName.includes('compliance') || ruleName.includes('forced')) {
      return 'regulatory_gap';
    }
    if (ruleName.includes('geo') || ruleName.includes('gap')) {
      return 'geo_gap';
    }
    if (ruleName.includes('convergence')) {
      return 'convergence';
    }
    if (ruleName.includes('api_sunset') || ruleName.includes('deprecation')) {
      return 'api_sunset_gap';
    }
    if (ruleName.includes('funding_pain') || ruleName.includes('funding_follows')) {
      return 'funding_follows_pain';
    }
    if (ruleName.includes('talent') || ruleName.includes('migration')) {
      return 'talent_migration';
    }
    if (ruleName.includes('platform') || ruleName.includes('consolidation')) {
      return 'platform_risk';
    }
    return 'competitor_weakness';
  }

  private avgSignalStrength(
    signals: Array<{ signal_type: string; strength: number }>,
    type: string,
  ): number {
    const matching = signals.filter((s) => s.signal_type === type);
    if (matching.length === 0) return 0;
    return Math.round(matching.reduce((s, sig) => s + sig.strength, 0) / matching.length);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100);
  }
}
