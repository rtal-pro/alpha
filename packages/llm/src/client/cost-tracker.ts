import type { ModelId } from "./anthropic.js";
import { MODELS } from "./anthropic.js";

/** Cost per 1 million tokens, in USD */
const PRICING: Record<ModelId, { input: number; output: number }> = {
  [MODELS.SONNET]: { input: 3.0, output: 15.0 },
  [MODELS.HAIKU]: { input: 0.8, output: 4.0 },
};

export interface CostRecord {
  analysisId: string;
  sectionNumber: number;
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  timestamp: Date;
}

export class CostTracker {
  private records: CostRecord[] = [];

  /**
   * Record token usage and compute cost. Returns the cost record.
   */
  record(
    analysisId: string,
    sectionNumber: number,
    model: ModelId,
    inputTokens: number,
    outputTokens: number,
  ): CostRecord {
    const pricing = PRICING[model];

    if (!pricing) {
      throw new Error(`Unknown model for pricing: ${model}`);
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;

    const costRecord: CostRecord = {
      analysisId,
      sectionNumber,
      model,
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      totalCost,
      timestamp: new Date(),
    };

    this.records.push(costRecord);

    return costRecord;
  }

  /**
   * Get total cost for a given analysis.
   */
  getAnalysisCost(analysisId: string): number {
    return this.records
      .filter((r) => r.analysisId === analysisId)
      .reduce((sum, r) => sum + r.totalCost, 0);
  }

  /**
   * Check whether the analysis is still within the given budget.
   * Returns true if the total cost so far is below the limit.
   */
  checkBudget(analysisId: string, limitUsd: number): boolean {
    return this.getAnalysisCost(analysisId) < limitUsd;
  }

  /**
   * Get all cost records for an analysis.
   */
  getRecords(analysisId: string): CostRecord[] {
    return this.records.filter((r) => r.analysisId === analysisId);
  }
}
