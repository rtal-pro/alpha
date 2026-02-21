// ---------------------------------------------------------------------------
// LLM Enrichment — uses Claude to improve opportunity quality
//
// Two stages:
// 1. Quality filter: score opportunity plausibility & reject noise
// 2. Insight enrichment: generate actionable next steps
// ---------------------------------------------------------------------------

import { ANTHROPIC_API_KEY } from '../config.js';
import type { GeneratedOpportunity } from './opportunity-generator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichedOpportunity extends GeneratedOpportunity {
  llm_quality_score: number;       // 0-100: how plausible is this opportunity
  llm_verdict: 'strong' | 'moderate' | 'weak' | 'noise';
  llm_reasoning: string;
  llm_next_steps: string[];
  llm_target_persona: string;
  llm_estimated_tam: string;
  llm_moat_analysis: string;
}

interface LLMResponse {
  quality_score: number;
  verdict: 'strong' | 'moderate' | 'weak' | 'noise';
  reasoning: string;
  next_steps: string[];
  target_persona: string;
  estimated_tam: string;
  moat_analysis: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

/** Only enrich opportunities scoring above this threshold. */
const MIN_SCORE_TO_ENRICH = 35;

/** Maximum concurrent LLM calls. */
const MAX_CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// LLMEnrichment
// ---------------------------------------------------------------------------

export class LLMEnrichment {
  private enabled: boolean;

  constructor() {
    this.enabled = !!ANTHROPIC_API_KEY;
    if (!this.enabled) {
      console.warn('[llm-enrichment] ANTHROPIC_API_KEY not set — enrichment disabled');
    }
  }

  /**
   * Enrich a batch of opportunities with LLM analysis.
   * Filters out low-quality opportunities and adds actionable insights.
   */
  async enrichBatch(
    opportunities: GeneratedOpportunity[],
  ): Promise<EnrichedOpportunity[]> {
    if (!this.enabled) {
      return opportunities.map((o) => this.passthrough(o));
    }

    // Only enrich opportunities above the threshold
    const toEnrich = opportunities.filter((o) => o.composite_score >= MIN_SCORE_TO_ENRICH);
    const skipped = opportunities.filter((o) => o.composite_score < MIN_SCORE_TO_ENRICH);

    console.log(
      `[llm-enrichment] Enriching ${toEnrich.length} of ${opportunities.length} opportunities ` +
      `(${skipped.length} below threshold)`,
    );

    // Process in batches to respect concurrency
    const enriched: EnrichedOpportunity[] = [];

    for (let i = 0; i < toEnrich.length; i += MAX_CONCURRENCY) {
      const batch = toEnrich.slice(i, i + MAX_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((opp) => this.enrichSingle(opp)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        if (result.status === 'fulfilled') {
          enriched.push(result.value);
        } else {
          console.error(`[llm-enrichment] Failed to enrich:`, result.reason);
          enriched.push(this.passthrough(batch[j]!));
        }
      }
    }

    // Add skipped ones as passthrough
    for (const opp of skipped) {
      enriched.push(this.passthrough(opp));
    }

    return enriched;
  }

  /**
   * Filter out noise: returns only opportunities the LLM considers viable.
   */
  filterViable(enriched: EnrichedOpportunity[]): EnrichedOpportunity[] {
    return enriched.filter((o) => o.llm_verdict !== 'noise');
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async enrichSingle(
    opp: GeneratedOpportunity,
  ): Promise<EnrichedOpportunity> {
    const prompt = this.buildPrompt(opp);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }

    const body = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = body.content[0]?.text ?? '{}';
    const parsed = this.parseResponse(text);

    return {
      ...opp,
      // Blend LLM quality with existing composite score
      composite_score: Math.round(
        opp.composite_score * 0.6 + parsed.quality_score * 0.4,
      ),
      llm_quality_score: parsed.quality_score,
      llm_verdict: parsed.verdict,
      llm_reasoning: parsed.reasoning,
      llm_next_steps: parsed.next_steps,
      llm_target_persona: parsed.target_persona,
      llm_estimated_tam: parsed.estimated_tam,
      llm_moat_analysis: parsed.moat_analysis,
    };
  }

  private buildPrompt(opp: GeneratedOpportunity): string {
    return `You are a SaaS market analyst. Evaluate this opportunity and respond with ONLY valid JSON (no markdown).

OPPORTUNITY:
- Title: ${opp.title}
- Category: ${opp.category}
- Type: ${opp.type}
- Description: ${opp.description}
- Current score: ${opp.composite_score}/100
- Target geo: ${opp.target_geo}
- Evidence: ${JSON.stringify(opp.evidence_summary)}

Respond with this exact JSON structure:
{
  "quality_score": <0-100 how plausible is this as a real business opportunity>,
  "verdict": <"strong"|"moderate"|"weak"|"noise">,
  "reasoning": "<1-2 sentences why>",
  "next_steps": ["<actionable step 1>", "<step 2>", "<step 3>"],
  "target_persona": "<who would buy this — role, company size, industry>",
  "estimated_tam": "<rough TAM estimate and reasoning in 1 sentence>",
  "moat_analysis": "<what defensibility could a new entrant build>"
}

Rules for quality_score:
- 80-100: Clear market gap with strong evidence, low competition
- 60-79: Plausible opportunity with some validation needed
- 40-59: Interesting signal but needs more research
- 20-39: Weak signal, likely noise
- 0-19: Not a viable opportunity

Rules for verdict:
- "strong": quality_score >= 70
- "moderate": quality_score >= 50
- "weak": quality_score >= 30
- "noise": quality_score < 30`;
  }

  private parseResponse(text: string): LLMResponse {
    try {
      // Try direct JSON parse first
      const parsed = JSON.parse(text);
      return this.validateResponse(parsed);
    } catch {
      // Try extracting JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch?.[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          return this.validateResponse(parsed);
        } catch {
          // Fall through to default
        }
      }

      // Last resort: try to find JSON object in text
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]);
          return this.validateResponse(parsed);
        } catch {
          // Fall through to default
        }
      }

      console.warn('[llm-enrichment] Failed to parse LLM response, using defaults');
      return this.defaultResponse();
    }
  }

  private validateResponse(parsed: Record<string, unknown>): LLMResponse {
    const score = typeof parsed['quality_score'] === 'number'
      ? Math.max(0, Math.min(100, parsed['quality_score'] as number))
      : 50;

    const validVerdicts = ['strong', 'moderate', 'weak', 'noise'] as const;
    const verdict = validVerdicts.includes(parsed['verdict'] as typeof validVerdicts[number])
      ? (parsed['verdict'] as LLMResponse['verdict'])
      : score >= 70 ? 'strong'
      : score >= 50 ? 'moderate'
      : score >= 30 ? 'weak'
      : 'noise';

    return {
      quality_score: score,
      verdict,
      reasoning: String(parsed['reasoning'] ?? 'No reasoning provided'),
      next_steps: Array.isArray(parsed['next_steps'])
        ? (parsed['next_steps'] as string[]).slice(0, 5)
        : ['Validate market size', 'Research competitors', 'Interview potential users'],
      target_persona: String(parsed['target_persona'] ?? 'Unknown'),
      estimated_tam: String(parsed['estimated_tam'] ?? 'Unknown'),
      moat_analysis: String(parsed['moat_analysis'] ?? 'To be determined'),
    };
  }

  private defaultResponse(): LLMResponse {
    return {
      quality_score: 50,
      verdict: 'moderate',
      reasoning: 'LLM analysis unavailable — using default scoring',
      next_steps: ['Validate market size', 'Research competitors', 'Interview potential users'],
      target_persona: 'To be determined',
      estimated_tam: 'To be determined',
      moat_analysis: 'To be determined',
    };
  }

  private passthrough(opp: GeneratedOpportunity): EnrichedOpportunity {
    return {
      ...opp,
      llm_quality_score: opp.composite_score,
      llm_verdict: opp.composite_score >= 70 ? 'strong'
        : opp.composite_score >= 50 ? 'moderate'
        : opp.composite_score >= 30 ? 'weak'
        : 'noise',
      llm_reasoning: 'Not enriched (below threshold or LLM disabled)',
      llm_next_steps: [],
      llm_target_persona: '',
      llm_estimated_tam: '',
      llm_moat_analysis: '',
    };
  }
}
