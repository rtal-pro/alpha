// ---------------------------------------------------------------------------
// GitHub transformer — converts raw GitHub API responses into NormalizedItem
// shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed GitHubRepo (kept inline for independence)
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  openIssues: number;
  createdAt: string;
  pushedAt: string;
}

// ---------------------------------------------------------------------------
// GitHubTransformer
// ---------------------------------------------------------------------------

export class GitHubTransformer extends BaseTransformer {
  readonly source = 'github' as const;

  /**
   * Transform raw GitHub scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'github')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed GitHubRepo objects from raw items.
   */
  toGitHubRepos(rawItems: RawScrapedItem[]): GitHubRepo[] {
    return rawItems
      .filter((item) => item.source === 'github')
      .map((item) => this.toGitHubRepo(item))
      .filter((repo): repo is GitHubRepo => repo !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const fullName = String(p['full_name'] ?? '');
    if (!fullName) return null;

    const description = p['description'] ? String(p['description']) : undefined;
    const stars =
      typeof p['stargazers_count'] === 'number' ? p['stargazers_count'] : 0;
    const forks =
      typeof p['forks_count'] === 'number' ? p['forks_count'] : 0;
    const watchers =
      typeof p['watchers_count'] === 'number' ? p['watchers_count'] : 0;
    const openIssues =
      typeof p['open_issues_count'] === 'number' ? p['open_issues_count'] : 0;
    const language = p['language'] ? String(p['language']) : null;
    const topics = Array.isArray(p['topics'])
      ? (p['topics'] as string[])
      : [];
    const createdAt = p['created_at'] ? String(p['created_at']) : '';
    const pushedAt = p['pushed_at'] ? String(p['pushed_at']) : '';

    // Build categories from language + topics
    const categories: string[] = [];
    if (language) categories.push(`lang:${language}`);
    for (const topic of topics) {
      categories.push(`topic:${topic}`);
    }

    // Truncate description
    const desc = description
      ? description.length > 500
        ? description.slice(0, 497) + '...'
        : description
      : undefined;

    return {
      source: 'github',
      externalId: item.entityId,
      title: fullName,
      description: desc,
      url: item.url,
      metrics: {
        stars,
        forks,
        openIssues,
        watchers,
      },
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        language,
        topics,
        createdAt,
        pushedAt,
        homepage: p['homepage'],
        license: p['license'],
        owner: p['owner'],
        searchQuery: p['searchQuery'],
      },
    };
  }

  private toGitHubRepo(item: RawScrapedItem): GitHubRepo | null {
    const p = item.payload;

    const fullName = String(p['full_name'] ?? '');
    if (!fullName) return null;

    return {
      fullName,
      description: p['description'] ? String(p['description']) : null,
      stars:
        typeof p['stargazers_count'] === 'number' ? p['stargazers_count'] : 0,
      forks:
        typeof p['forks_count'] === 'number' ? p['forks_count'] : 0,
      language: p['language'] ? String(p['language']) : null,
      topics: Array.isArray(p['topics']) ? (p['topics'] as string[]) : [],
      openIssues:
        typeof p['open_issues_count'] === 'number' ? p['open_issues_count'] : 0,
      createdAt: p['created_at'] ? String(p['created_at']) : '',
      pushedAt: p['pushed_at'] ? String(p['pushed_at']) : '',
    };
  }
}
