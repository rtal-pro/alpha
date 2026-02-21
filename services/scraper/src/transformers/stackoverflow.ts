// ---------------------------------------------------------------------------
// StackOverflow transformer — converts raw StackExchange API responses
// into NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

export class StackOverflowTransformer extends BaseTransformer {
  readonly source = 'stackoverflow' as const;

  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'stackoverflow')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    // Handle both question and tag formats
    if (item.format === 'stackoverflow_tag_v1') {
      return this.transformTag(item);
    }

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const score = typeof p['score'] === 'number' ? p['score'] : 0;
    const viewCount = typeof p['view_count'] === 'number' ? p['view_count'] : 0;
    const answerCount = typeof p['answer_count'] === 'number' ? p['answer_count'] : 0;
    const isAnswered = p['is_answered'] === true;

    const tags = Array.isArray(p['tags']) ? (p['tags'] as string[]) : [];
    const categories = tags.map((t) => `tag:${t}`);

    return {
      source: 'stackoverflow',
      externalId: item.entityId,
      title,
      description: p['body_snippet'] ? String(p['body_snippet']) : undefined,
      url: item.url,
      metrics: {
        score,
        viewCount,
        answerCount,
        isAnswered: isAnswered ? 1 : 0,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        questionId: p['question_id'],
        tags,
        authorName: p['author_name'],
        authorReputation: p['author_reputation'],
        creationDate: p['creation_date'],
        searchKeyword: p['searchKeyword'],
      },
    };
  }

  private transformTag(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;
    const tagName = String(p['tag_name'] ?? '');
    if (!tagName) return null;

    const totalCount = typeof p['total_count'] === 'number' ? p['total_count'] : 0;

    return {
      source: 'stackoverflow',
      externalId: item.entityId,
      title: `Tag: ${tagName}`,
      description: `StackOverflow tag "${tagName}" with ${totalCount.toLocaleString()} questions`,
      url: item.url,
      metrics: { totalCount },
      categories: [`tag:${tagName}`],
      scrapedAt: item.scrapedAt,
      metadata: {
        tagName,
        hasSynonyms: p['has_synonyms'],
      },
    };
  }
}
