// ---------------------------------------------------------------------------
// ProductHunt scraper — uses the ProductHunt GraphQL API (v2)
// ---------------------------------------------------------------------------

import { PRODUCTHUNT_API_TOKEN } from '../config.js';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://api.producthunt.com/v2/api/graphql';

/** 900 req / 15 min => ~1 000 ms between requests */
const RATE_LIMIT_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

const TRENDING_QUERY = `
  query TrendingPosts($first: Int!, $postedAfter: DateTime) {
    posts(first: $first, postedAfter: $postedAfter, order: VOTES) {
      edges {
        node {
          id
          name
          tagline
          description
          votesCount
          commentsCount
          createdAt
          slug
          url
          website
          thumbnail {
            url
          }
          topics(first: 5) {
            edges {
              node {
                name
                slug
              }
            }
          }
        }
      }
    }
  }
`;

const CATEGORY_SEARCH_QUERY = `
  query CategorySearch($first: Int!, $topic: String!, $postedAfter: DateTime) {
    posts(first: $first, topic: $topic, postedAfter: $postedAfter, order: VOTES) {
      edges {
        node {
          id
          name
          tagline
          description
          votesCount
          commentsCount
          createdAt
          slug
          url
          website
          thumbnail {
            url
          }
          topics(first: 5) {
            edges {
              node {
                name
                slug
              }
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// ProductHuntScraper
// ---------------------------------------------------------------------------

export class ProductHuntScraper extends BaseScraper {
  readonly source = 'producthunt' as const;
  readonly method = 'api' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'trending':
        return this.scrapeTrending(params);
      case 'category_search':
        return this.scrapeCategorySearch(params);
      default:
        throw new Error(
          `ProductHuntScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Trending products (today's top products)
  // -----------------------------------------------------------------------

  private async scrapeTrending(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const limit = Math.min(params.limit ?? 20, 50);
    const daysBack = params.daysBack ?? 1;

    const postedAfter = new Date();
    postedAfter.setDate(postedAfter.getDate() - daysBack);

    const data = await this.retryWithBackoff(() =>
      this.executeGraphQL(TRENDING_QUERY, {
        first: limit,
        postedAfter: postedAfter.toISOString(),
      }),
    );

    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

    return this.parsePostsResponse(data);
  }

  // -----------------------------------------------------------------------
  // Category / topic search
  // -----------------------------------------------------------------------

  private async scrapeCategorySearch(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const category = params.category;
    if (!category) {
      throw new Error('ProductHuntScraper: category is required for category_search');
    }

    const limit = Math.min(params.limit ?? 20, 50);
    const daysBack = params.daysBack ?? 7;

    const postedAfter = new Date();
    postedAfter.setDate(postedAfter.getDate() - daysBack);

    const data = await this.retryWithBackoff(() =>
      this.executeGraphQL(CATEGORY_SEARCH_QUERY, {
        first: limit,
        topic: category,
        postedAfter: postedAfter.toISOString(),
      }),
    );

    await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

    return this.parsePostsResponse(data);
  }

  // -----------------------------------------------------------------------
  // GraphQL execution helper
  // -----------------------------------------------------------------------

  private async executeGraphQL(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    if (!PRODUCTHUNT_API_TOKEN) {
      throw new Error(
        'ProductHunt API token not configured (PRODUCTHUNT_API_TOKEN)',
      );
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PRODUCTHUNT_API_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      throw new Error('ProductHunt API rate limit hit (429)');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ProductHunt API error (${response.status}): ${text}`,
      );
    }

    const body = (await response.json()) as {
      data?: unknown;
      errors?: Array<{ message: string }>;
    };

    if (body.errors && body.errors.length > 0) {
      throw new Error(
        `ProductHunt GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`,
      );
    }

    return body.data;
  }

  // -----------------------------------------------------------------------
  // Parse posts response into RawScrapedItem[]
  // -----------------------------------------------------------------------

  private parsePostsResponse(data: unknown): RawScrapedItem[] {
    const posts = data as {
      posts?: {
        edges?: Array<{
          node: Record<string, unknown>;
        }>;
      };
    };

    const edges = posts?.posts?.edges ?? [];
    const now = new Date();

    return edges.map((edge) => {
      const node = edge.node;
      const id = String(node['id'] ?? '');
      const slug = String(node['slug'] ?? '');

      // Extract topic names from the nested topics connection
      const topicsConnection = node['topics'] as {
        edges?: Array<{ node: { name: string; slug: string } }>;
      } | undefined;
      const topicNames = topicsConnection?.edges?.map((t) => t.node.name) ?? [];

      // Extract thumbnail URL
      const thumbnail = node['thumbnail'] as { url?: string } | undefined;

      return {
        source: 'producthunt',
        entityId: `producthunt:${id}`,
        url: String(node['url'] ?? `https://www.producthunt.com/posts/${slug}`),
        payload: {
          id,
          name: node['name'],
          tagline: node['tagline'],
          description: node['description'],
          votesCount: node['votesCount'],
          commentsCount: node['commentsCount'],
          createdAt: node['createdAt'],
          slug,
          website: node['website'],
          thumbnailUrl: thumbnail?.url ?? null,
          topics: topicNames,
        },
        format: 'producthunt_post_v1',
        scrapedAt: now,
      };
    });
  }
}
