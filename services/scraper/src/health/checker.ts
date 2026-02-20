// ---------------------------------------------------------------------------
// HealthChecker — runs canary queries against active scrapers to verify
// they are operational.
// ---------------------------------------------------------------------------

import { RedditScraper } from '../scrapers/reddit.js';
import type { RawScrapedItem } from '../scrapers/base.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceHealthStatus {
  status: 'healthy' | 'degraded' | 'error';
  latencyMs: number;
  itemCount: number;
  message?: string;
  lastChecked: string;
}

export interface HealthReport {
  sources: Record<string, SourceHealthStatus>;
}

interface CanaryConfig {
  source: string;
  run: () => Promise<RawScrapedItem[]>;
  minExpected: number;
}

// ---------------------------------------------------------------------------
// HealthChecker
// ---------------------------------------------------------------------------

export class HealthChecker {
  private readonly canaries: CanaryConfig[];

  constructor() {
    const reddit = new RedditScraper();

    this.canaries = [
      {
        source: 'reddit',
        run: () =>
          reddit.scrape({
            type: 'keyword_search',
            keywords: ['SaaS'],
            subreddits: ['SaaS'],
            limit: 10,
          }),
        minExpected: 5,
      },
      // Add more canaries here as new scrapers are implemented:
      // {
      //   source: 'producthunt',
      //   run: () => producthunt.scrape({ type: 'trending', limit: 5 }),
      //   minExpected: 3,
      // },
    ];
  }

  // -----------------------------------------------------------------------
  // Run all canaries
  // -----------------------------------------------------------------------

  async checkAll(): Promise<HealthReport> {
    const sources: Record<string, SourceHealthStatus> = {};

    const results = await Promise.allSettled(
      this.canaries.map((canary) => this.runCanary(canary)),
    );

    for (let i = 0; i < this.canaries.length; i++) {
      const canary = this.canaries[i]!;
      const result = results[i]!;

      if (result.status === 'fulfilled') {
        sources[canary.source] = result.value;
      } else {
        sources[canary.source] = {
          status: 'error',
          latencyMs: 0,
          itemCount: 0,
          message: result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
          lastChecked: new Date().toISOString(),
        };
      }
    }

    return { sources };
  }

  // -----------------------------------------------------------------------
  // Run a single canary
  // -----------------------------------------------------------------------

  private async runCanary(canary: CanaryConfig): Promise<SourceHealthStatus> {
    const start = Date.now();

    try {
      const items = await Promise.race([
        canary.run(),
        this.timeout(30_000), // 30 s timeout per canary
      ]);

      const latencyMs = Date.now() - start;
      const itemCount = items.length;

      let status: SourceHealthStatus['status'];
      let message: string | undefined;

      if (itemCount >= canary.minExpected) {
        status = 'healthy';
      } else if (itemCount > 0) {
        status = 'degraded';
        message = `Expected >= ${canary.minExpected} items, got ${itemCount}`;
      } else {
        status = 'error';
        message = 'Canary returned zero results';
      }

      return {
        status,
        latencyMs,
        itemCount,
        message,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);

      return {
        status: 'error',
        latencyMs,
        itemCount: 0,
        message,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Timeout helper
  // -----------------------------------------------------------------------

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms),
    );
  }
}
