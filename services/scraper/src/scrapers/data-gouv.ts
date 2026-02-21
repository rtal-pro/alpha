// ---------------------------------------------------------------------------
// data.gouv.fr scraper — French open data platform API
//
// Reveals:
// - Government datasets = regulatory/compliance opportunities
// - Public sector digitization needs
// - Statistics on French industries and sectors
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://www.data.gouv.fr/api/1';
const RATE_LIMIT_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// DataGouvScraper
// ---------------------------------------------------------------------------

export class DataGouvScraper extends BaseScraper {
  readonly source = 'data_gouv' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 20;

    if (params.type === 'keyword_search') {
      return this.searchDatasets(keywords, limit);
    }
    if (params.type === 'recent_datasets') {
      return this.getRecentDatasets(limit);
    }

    throw new Error(`DataGouvScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Search datasets
  // -----------------------------------------------------------------------

  private async searchDatasets(keywords: string[], limit: number): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.fetchDatasets(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[data-gouv] Search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async fetchDatasets(query: string, limit: number): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/datasets/`);
    url.searchParams.set('q', query);
    url.searchParams.set('page_size', String(Math.min(limit, 50)));
    url.searchParams.set('sort', '-created');

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`data.gouv.fr API error (${response.status})`);
    }

    const body = (await response.json()) as {
      data: Array<{
        id: string;
        title: string;
        description: string;
        slug: string;
        created_at: string;
        last_modified: string;
        frequency: string;
        tags: string[];
        organization?: { name: string; slug: string };
        metrics?: { views: number; followers: number; reuses: number };
        resources?: Array<{ format: string; title: string }>;
      }>;
      total: number;
    };

    const now = new Date();

    return body.data.map((ds) => {
      const categories = this.inferCategories(ds.title, ds.description, ds.tags);

      return {
        source: 'data_gouv',
        entityId: `datagouv:${ds.id}`,
        url: `https://www.data.gouv.fr/fr/datasets/${ds.slug}/`,
        payload: {
          id: ds.id,
          title: ds.title,
          description: ds.description?.slice(0, 500),
          organization: ds.organization?.name,
          created_at: ds.created_at,
          last_modified: ds.last_modified,
          frequency: ds.frequency,
          tags: ds.tags,
          views: ds.metrics?.views ?? 0,
          followers: ds.metrics?.followers ?? 0,
          reuses: ds.metrics?.reuses ?? 0,
          resource_count: ds.resources?.length ?? 0,
          resource_formats: [...new Set((ds.resources ?? []).map((r) => r.format))],
          categories,
          is_high_interest: (ds.metrics?.views ?? 0) > 1000 || (ds.metrics?.reuses ?? 0) > 5,
          searchQuery: query,
        },
        format: 'data_gouv_dataset_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Recent datasets (discover new government data releases)
  // -----------------------------------------------------------------------

  private async getRecentDatasets(limit: number): Promise<RawScrapedItem[]> {
    return this.fetchDatasets('', limit);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferCategories(title: string, description: string, tags: string[]): string[] {
    const text = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
    const categories: string[] = [];

    if (/\b(santé|health|médical|hôpital)\b/.test(text)) categories.push('healthcare');
    if (/\b(finance|banque|impôt|fiscal)\b/.test(text)) categories.push('fintech');
    if (/\b(éducation|enseignement|école|université)\b/.test(text)) categories.push('education');
    if (/\b(transport|mobilité|véhicule|route)\b/.test(text)) categories.push('transport');
    if (/\b(environnement|climat|énergie|pollution)\b/.test(text)) categories.push('environment');
    if (/\b(immobilier|logement|foncier|urbanisme)\b/.test(text)) categories.push('real_estate');
    if (/\b(emploi|travail|chômage|salaire)\b/.test(text)) categories.push('employment');
    if (/\b(entreprise|commerce|société|siret)\b/.test(text)) categories.push('business');
    if (/\b(juridique|légal|loi|réglementation|droit)\b/.test(text)) categories.push('compliance_legal');

    return categories.length > 0 ? categories : ['government'];
  }
}
