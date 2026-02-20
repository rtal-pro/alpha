import { AnthropicClient } from "../client/anthropic.js";
import { CostTracker } from "../client/cost-tracker.js";
import { ContextBuilder, type ScrapedDataItem, type ParentOutput } from "../context/builder.js";
import {
  SectionRunner,
  type SectionPreferences,
  type SectionOutput,
} from "./section-runner.js";

// ---------------------------------------------------------------------------
// AnalysisPipeline
// ---------------------------------------------------------------------------

/**
 * High-level orchestrator for running analysis sections.
 *
 * For MVP, this exposes `runSection()` as the main entry point. Full DAG-based
 * parallel execution of the complete analysis pipeline will be added later.
 */
export class AnalysisPipeline {
  private client: AnthropicClient;
  private costTracker: CostTracker;
  private contextBuilder: ContextBuilder;
  private sectionRunner: SectionRunner;

  /** Cache of completed section outputs, keyed by `${analysisId}:${sectionNumber}`. */
  private completedSections: Map<string, SectionOutput> = new Map();

  constructor(
    client?: AnthropicClient,
    costTracker?: CostTracker,
    contextBuilder?: ContextBuilder,
  ) {
    this.client = client ?? new AnthropicClient();
    this.costTracker = costTracker ?? new CostTracker();
    this.contextBuilder = contextBuilder ?? new ContextBuilder();
    this.sectionRunner = new SectionRunner(
      this.client,
      this.costTracker,
      this.contextBuilder,
    );
  }

  /**
   * Run a single analysis section. This is the main MVP entry point.
   *
   * @param analysisId    - Unique identifier for this analysis run.
   * @param sectionNumber - 1-based section number (e.g. 1 for Problem Validation).
   * @param idea          - The business idea description.
   * @param prefs         - User preferences (target market, region, etc.).
   * @param scrapedData   - Research data from the scraper (optional).
   * @param parentOutputs - Outputs from prerequisite sections (optional).
   * @returns               The section output with parsed data and metadata.
   */
  async runSection(
    analysisId: string,
    sectionNumber: number,
    idea: string,
    prefs: SectionPreferences,
    scrapedData: ScrapedDataItem[] = [],
    parentOutputs: ParentOutput[] = [],
  ): Promise<SectionOutput> {
    // Check budget before running (default limit: $1.00 per analysis)
    const budgetOk = this.costTracker.checkBudget(analysisId, 1.0);
    if (!budgetOk) {
      const spent = this.costTracker.getAnalysisCost(analysisId);
      throw new Error(
        `Budget exceeded for analysis ${analysisId}. ` +
          `Spent $${spent.toFixed(4)}, limit is $1.00.`,
      );
    }

    const output = await this.sectionRunner.run(
      analysisId,
      sectionNumber,
      idea,
      prefs,
      scrapedData,
      parentOutputs,
    );

    // Cache the result
    const cacheKey = `${analysisId}:${sectionNumber}`;
    this.completedSections.set(cacheKey, output);

    return output;
  }

  /**
   * Retrieve a previously completed section output.
   */
  getCompletedSection(
    analysisId: string,
    sectionNumber: number,
  ): SectionOutput | undefined {
    return this.completedSections.get(`${analysisId}:${sectionNumber}`);
  }

  /**
   * Get the total cost for an analysis so far.
   */
  getAnalysisCost(analysisId: string): number {
    return this.costTracker.getAnalysisCost(analysisId);
  }

  /**
   * Get the underlying cost tracker for detailed inspection.
   */
  getCostTracker(): CostTracker {
    return this.costTracker;
  }
}
