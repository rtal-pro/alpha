// ---------------------------------------------------------------------------
// Abstract base class for all scrapers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inline types (standalone service — no @repo/shared import)
// ---------------------------------------------------------------------------

export interface RawScrapedItem {
  source: string;
  entityId: string;
  url: string;
  payload: Record<string, unknown>;
  format: string;
  scrapedAt: Date;
}

export interface ScrapeParams {
  type: string;
  keywords?: string[];
  subreddits?: string[];
  category?: string;
  geo?: string;
  daysBack?: number;
  limit?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// BaseScraper
// ---------------------------------------------------------------------------

export abstract class BaseScraper {
  /** Identifier for this scrape source (e.g. 'reddit', 'producthunt') */
  abstract readonly source: string;

  /** How this scraper fetches data */
  abstract readonly method: 'api' | 'cheerio' | 'playwright';

  /** Execute the scrape with the given params */
  abstract scrape(params: ScrapeParams): Promise<RawScrapedItem[]>;

  // -----------------------------------------------------------------------
  // Protected helpers
  // -----------------------------------------------------------------------

  /**
   * Simple delay helper for rate limiting.
   */
  protected rateLimitDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff.
   *
   * @param fn        — the async function to retry
   * @param maxRetries — number of retry attempts (default 3)
   * @param baseDelay — initial delay in ms before first retry (default 1000)
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1_000,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(
          `[${this.source}] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}. ` +
          `Retrying in ${Math.round(delay)}ms...`,
        );
        await this.rateLimitDelay(delay);
      }
    }

    throw lastError ?? new Error(`[${this.source}] retryWithBackoff exhausted all attempts`);
  }
}
