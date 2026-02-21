/**
 * ContextBuilder constructs prompts for each analysis section by assembling
 * the idea description, parent section outputs, and scraped data within a
 * token-budget framework.
 */

/** Configuration describing a single section of the analysis pipeline. */
export interface SectionConfig {
  key: string;
  title: string;
  /** Direct parent section keys whose full output is included. */
  dependencies: string[];
  /** Transitive parent section keys whose summaries are included. */
  transitiveDependencies?: string[];
  /** Maximum token budget for the section prompt (rough estimate). */
  maxTokens?: number;
}

/** Scraped data item with a priority score. */
export interface ScrapedDataItem {
  source: string;
  content: string;
  /** Higher = more relevant. Used for greedy packing. */
  relevanceScore: number;
}

/** A completed parent section output. */
export interface ParentOutput {
  sectionKey: string;
  /** Full JSON output of the parent section. */
  data: unknown;
  /** Short summary suitable for transitive inclusion. */
  summary?: string;
}

export interface ContextBuildResult {
  prompt: string;
  estimatedTokens: number;
  truncated: boolean;
}

/** Rough token estimate: ~4 characters per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * ContextBuilder assembles the user prompt for a given section, respecting
 * a token budget. Parent section outputs get up to 40% of the budget, and
 * scraped data is greedily packed into the remainder.
 */
export class ContextBuilder {
  private readonly defaultMaxTokens: number;

  constructor(defaultMaxTokens: number = 8000) {
    this.defaultMaxTokens = defaultMaxTokens;
  }

  /**
   * Build the user prompt for a specific analysis section.
   *
   * Budget allocation:
   * - Up to 40% for parent section outputs (direct deps get full output,
   *   transitive deps get summaries only).
   * - Remaining budget for scraped data, packed greedily by relevance.
   */
  buildForSection(
    sectionConfig: SectionConfig,
    idea: string,
    scrapedData: ScrapedDataItem[],
    parentOutputs: ParentOutput[],
  ): ContextBuildResult {
    const maxTokens = sectionConfig.maxTokens ?? this.defaultMaxTokens;
    let truncated = false;

    // ------------------------------------------------------------------
    // 1. Always include the idea (this is free / not counted against budget)
    // ------------------------------------------------------------------
    const ideaBlock = `## Business Idea\n\n${idea}`;

    // ------------------------------------------------------------------
    // 2. Build parent output section (up to 40% of budget)
    // ------------------------------------------------------------------
    const parentBudgetTokens = Math.floor(maxTokens * 0.4);
    const parentBlock = this.buildParentBlock(
      sectionConfig,
      parentOutputs,
      parentBudgetTokens,
    );

    // ------------------------------------------------------------------
    // 3. Build scraped data section (remaining budget)
    // ------------------------------------------------------------------
    const ideaTokens = estimateTokens(ideaBlock);
    const parentTokens = estimateTokens(parentBlock);
    const overhead = 200; // section headers, formatting
    const scrapedBudget = maxTokens - ideaTokens - parentTokens - overhead;

    const { block: scrapedBlock, wasTruncated } = this.buildScrapedBlock(
      scrapedData,
      Math.max(scrapedBudget, 0),
    );
    if (wasTruncated) {
      truncated = true;
    }

    // ------------------------------------------------------------------
    // 4. Assemble the final prompt
    // ------------------------------------------------------------------
    const parts: string[] = [ideaBlock];

    if (parentBlock.length > 0) {
      parts.push(parentBlock);
    }

    if (scrapedBlock.length > 0) {
      parts.push(scrapedBlock);
    }

    const prompt = parts.join("\n\n---\n\n");
    const estimatedTokensTotal = estimateTokens(prompt);

    return {
      prompt,
      estimatedTokens: estimatedTokensTotal,
      truncated,
    };
  }

  /**
   * Build the parent output block. Direct dependencies get their full
   * JSON output; transitive dependencies get summaries only.
   */
  private buildParentBlock(
    sectionConfig: SectionConfig,
    parentOutputs: ParentOutput[],
    budgetTokens: number,
  ): string {
    if (parentOutputs.length === 0) {
      return "";
    }

    const directKeys = new Set(sectionConfig.dependencies);
    const transitiveKeys = new Set(sectionConfig.transitiveDependencies ?? []);

    const sections: string[] = [];
    let usedTokens = 0;

    // Direct dependencies: include full output
    for (const parent of parentOutputs) {
      if (!directKeys.has(parent.sectionKey)) continue;

      const serialized = JSON.stringify(parent.data, null, 2);
      const entry = `### Previous Analysis: ${parent.sectionKey}\n\n\`\`\`json\n${serialized}\n\`\`\``;
      const entryTokens = estimateTokens(entry);

      if (usedTokens + entryTokens > budgetTokens) {
        // If we can't fit full output, try the summary instead
        if (parent.summary) {
          const summaryEntry = `### Previous Analysis: ${parent.sectionKey} (summary)\n\n${parent.summary}`;
          const summaryTokens = estimateTokens(summaryEntry);
          if (usedTokens + summaryTokens <= budgetTokens) {
            sections.push(summaryEntry);
            usedTokens += summaryTokens;
          }
        }
        continue;
      }

      sections.push(entry);
      usedTokens += entryTokens;
    }

    // Transitive dependencies: include summaries only
    for (const parent of parentOutputs) {
      if (!transitiveKeys.has(parent.sectionKey)) continue;
      if (directKeys.has(parent.sectionKey)) continue; // already handled

      const summary = parent.summary ?? JSON.stringify(parent.data).slice(0, 500);
      const entry = `### Previous Analysis: ${parent.sectionKey} (summary)\n\n${summary}`;
      const entryTokens = estimateTokens(entry);

      if (usedTokens + entryTokens > budgetTokens) continue;

      sections.push(entry);
      usedTokens += entryTokens;
    }

    if (sections.length === 0) {
      return "";
    }

    return `## Previous Analysis Results\n\n${sections.join("\n\n")}`;
  }

  /**
   * Build the scraped data block. Data items are sorted by relevance
   * (descending) and packed greedily until the budget is exhausted.
   */
  private buildScrapedBlock(
    scrapedData: ScrapedDataItem[],
    budgetTokens: number,
  ): { block: string; wasTruncated: boolean } {
    if (scrapedData.length === 0 || budgetTokens <= 0) {
      return { block: "", wasTruncated: false };
    }

    // Sort by relevance score descending (highest first)
    const sorted = [...scrapedData].sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );

    const included: string[] = [];
    let usedTokens = 0;
    let wasTruncated = false;
    const headerTokens = estimateTokens("## Research Data\n\n");

    for (const item of sorted) {
      const entry = `### Source: ${item.source}\n\n${item.content}`;
      const entryTokens = estimateTokens(entry);

      if (usedTokens + headerTokens + entryTokens > budgetTokens) {
        wasTruncated = true;
        continue;
      }

      included.push(entry);
      usedTokens += entryTokens;
    }

    if (included.length === 0) {
      return { block: "", wasTruncated: scrapedData.length > 0 };
    }

    const block = `## Research Data\n\n${included.join("\n\n")}`;
    return { block, wasTruncated };
  }
}
