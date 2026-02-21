// ---------------------------------------------------------------------------
// Upwork transformer — converts raw Upwork RSS job data into NormalizedItem
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class UpworkTransformer extends BaseTransformer {
  readonly source = 'upwork' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'upwork')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const budgetAmount = typeof p['budget_amount'] === 'number' ? p['budget_amount'] : 0;
    const isHighBudget = p['is_high_budget'] === true;
    const isRecurring = p['is_recurring'] === true;

    const categories = Array.isArray(p['categories'])
      ? (p['categories'] as string[])
      : ['freelance'];
    categories.push('upwork');

    const skills = Array.isArray(p['skills']) ? (p['skills'] as string[]) : [];

    return {
      source: 'upwork',
      externalId: item.entityId,
      title,
      description: p['description'] ? String(p['description']) : undefined,
      url: item.url,
      metrics: {
        budgetAmount,
        isHighBudget: isHighBudget ? 1 : 0,
        isRecurring: isRecurring ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        budgetType: p['budget_type'],
        skills,
        publishedAt: p['published_at'],
        searchQuery: p['searchQuery'],
      },
    };
  }
}
