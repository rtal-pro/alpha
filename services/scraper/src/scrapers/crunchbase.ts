// ---------------------------------------------------------------------------
// Crunchbase scraper — tracks funding rounds, acquisitions, and company data
//
// Follow the money: funding signals market validation
// - Recent funding rounds = investor-validated categories
// - Acquisitions = market consolidation (opportunity to disrupt or niche)
// - Company growth = category expansion
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.crunchbase.com/api/v4';
const RATE_LIMIT_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// CrunchbaseScraper
// ---------------------------------------------------------------------------

export class CrunchbaseScraper extends BaseScraper {
  readonly source = 'crunchbase' as const;
  readonly method = 'api' as const;

  private get apiKey(): string {
    const key = process.env['CRUNCHBASE_API_KEY'] ?? '';
    if (!key) throw new Error('CRUNCHBASE_API_KEY not configured');
    return key;
  }

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    const limit = params.limit ?? 25;
    const geo = params.geo ?? 'France';

    if (params.type === 'recent_funding') {
      return this.getRecentFunding(keywords, geo, limit);
    }
    if (params.type === 'keyword_search') {
      return this.searchOrganizations(keywords, limit);
    }

    throw new Error(`CrunchbaseScraper: unsupported scrape type "${params.type}"`);
  }

  // -----------------------------------------------------------------------
  // Recent funding rounds
  // -----------------------------------------------------------------------

  private async getRecentFunding(
    keywords: string[],
    location: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    // Search for recent funding rounds with category filters
    const categoryQueries = keywords.length > 0
      ? keywords
      : ['saas', 'fintech', 'ai', 'devtools', 'compliance', 'healthcare'];

    for (const category of categoryQueries) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchFunding(category, location, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[crunchbase] Funding search failed for "${category}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async searchFunding(
    category: string,
    location: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/searches/funding_rounds`);
    url.searchParams.set('user_key', this.apiKey);

    const body = {
      field_ids: [
        'identifier', 'announced_on', 'money_raised', 'investment_type',
        'funded_organization_identifier', 'funded_organization_categories',
        'funded_organization_location', 'num_investors',
      ],
      query: [
        { type: 'predicate', field_id: 'announced_on', operator_id: 'gte', values: [this.daysAgoISO(90)] },
        { type: 'predicate', field_id: 'funded_organization_categories', operator_id: 'includes', values: [category] },
      ],
      order: [{ field_id: 'announced_on', sort: 'desc' }],
      limit: Math.min(limit, 25),
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Crunchbase API error (${response.status})`);
    }

    const data = (await response.json()) as {
      entities?: Array<{
        uuid: string;
        properties: Record<string, unknown>;
      }>;
    };

    const now = new Date();

    return (data.entities ?? []).map((entity) => {
      const props = entity.properties;
      const orgName = (props['funded_organization_identifier'] as { value?: string })?.value ?? 'Unknown';
      const moneyRaised = props['money_raised'] as { value?: number; currency?: string } | undefined;

      return {
        source: 'crunchbase',
        entityId: `crunchbase:funding:${entity.uuid}`,
        url: `https://www.crunchbase.com/funding_round/${entity.uuid}`,
        payload: {
          uuid: entity.uuid,
          organization: orgName,
          announced_on: props['announced_on'],
          investment_type: props['investment_type'],
          money_raised_usd: moneyRaised?.value,
          money_raised_currency: moneyRaised?.currency ?? 'USD',
          num_investors: props['num_investors'],
          categories: props['funded_organization_categories'],
          location: props['funded_organization_location'],
          searchCategory: category,
        },
        format: 'crunchbase_funding_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Search organizations
  // -----------------------------------------------------------------------

  private async searchOrganizations(
    keywords: string[],
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchOrg(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[crunchbase] Org search failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  private async searchOrg(keyword: string, limit: number): Promise<RawScrapedItem[]> {
    const url = new URL(`${API_BASE}/searches/organizations`);
    url.searchParams.set('user_key', this.apiKey);

    const body = {
      field_ids: [
        'identifier', 'short_description', 'categories', 'location_identifiers',
        'founded_on', 'num_employees_enum', 'funding_total', 'last_funding_type',
        'last_funding_at', 'rank_org',
      ],
      query: [
        { type: 'predicate', field_id: 'facet_ids', operator_id: 'includes', values: ['company'] },
        { type: 'predicate', field_id: 'identifier', operator_id: 'contains', values: [keyword] },
      ],
      order: [{ field_id: 'rank_org', sort: 'asc' }],
      limit: Math.min(limit, 25),
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Crunchbase org search error (${response.status})`);
    }

    const data = (await response.json()) as {
      entities?: Array<{
        uuid: string;
        properties: Record<string, unknown>;
      }>;
    };

    const now = new Date();

    return (data.entities ?? []).map((entity) => {
      const props = entity.properties;
      const orgName = (props['identifier'] as { value?: string })?.value ?? 'Unknown';

      return {
        source: 'crunchbase',
        entityId: `crunchbase:org:${entity.uuid}`,
        url: `https://www.crunchbase.com/organization/${orgName.toLowerCase().replace(/\s+/g, '-')}`,
        payload: {
          uuid: entity.uuid,
          name: orgName,
          description: props['short_description'],
          categories: props['categories'],
          location: props['location_identifiers'],
          founded_on: props['founded_on'],
          num_employees: props['num_employees_enum'],
          funding_total: props['funding_total'],
          last_funding_type: props['last_funding_type'],
          last_funding_at: props['last_funding_at'],
          rank: props['rank_org'],
          searchKeyword: keyword,
        },
        format: 'crunchbase_org_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private daysAgoISO(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  }
}
