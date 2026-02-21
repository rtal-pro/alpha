// ---------------------------------------------------------------------------
// Abstract base class for data transformers
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';

// ---------------------------------------------------------------------------
// Inline NormalizedItem type (standalone service)
// ---------------------------------------------------------------------------

export interface NormalizedItem {
  source: string;
  externalId: string;
  title: string;
  description?: string;
  url?: string;
  metrics: Record<string, number>;
  categories: string[];
  scrapedAt: Date;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// BaseTransformer
// ---------------------------------------------------------------------------

export abstract class BaseTransformer {
  /** The source this transformer handles */
  abstract readonly source: string;

  /**
   * Transform raw scraped items into normalised items ready for analysis.
   */
  abstract transform(rawItems: RawScrapedItem[]): NormalizedItem[];
}
