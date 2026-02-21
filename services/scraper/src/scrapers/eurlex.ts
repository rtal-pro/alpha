// ---------------------------------------------------------------------------
// EUR-Lex scraper — HTML scraping of EUR-Lex search results with Cheerio
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';
import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EURLEX_SEARCH_URL = 'https://eur-lex.europa.eu/search.html';

/** Be respectful of public EU infrastructure — 3 000 ms between requests */
const RATE_LIMIT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// EurLexScraper
// ---------------------------------------------------------------------------

export class EurLexScraper extends BaseScraper {
  readonly source = 'eurlex' as const;
  readonly method = 'cheerio' as const;

  // -----------------------------------------------------------------------
  // Main scrape entry point
  // -----------------------------------------------------------------------

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    switch (params.type) {
      case 'subject_search':
        return this.scrapeSubjectSearch(params);
      default:
        throw new Error(
          `EurLexScraper: unsupported scrape type "${params.type}"`,
        );
    }
  }

  // -----------------------------------------------------------------------
  // Subject search — search by subject matter keywords
  // -----------------------------------------------------------------------

  private async scrapeSubjectSearch(
    params: ScrapeParams,
  ): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? [];
    if (keywords.length === 0) {
      throw new Error(
        'EurLexScraper: at least one keyword is required for subject_search',
      );
    }

    const limit = params.limit ?? 20;
    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.searchBySubject(keyword, limit),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[eurlex] Failed subject search for "${keyword}": ${message}`,
        );
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Perform the actual search and parse HTML
  // -----------------------------------------------------------------------

  private async searchBySubject(
    keyword: string,
    limit: number,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(EURLEX_SEARCH_URL);
    url.searchParams.set('scope', 'EURLEX');
    url.searchParams.set('text', keyword);
    url.searchParams.set('type', 'quick');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('page', '1');
    url.searchParams.set('pageSize', String(Math.min(limit, 50)));

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (response.status === 429) {
      throw new Error('EUR-Lex rate limit hit (429)');
    }

    if (!response.ok) {
      throw new Error(
        `EUR-Lex HTTP error (${response.status}) for query "${keyword}"`,
      );
    }

    const html = await response.text();
    return this.parseSearchResults(html, keyword);
  }

  // -----------------------------------------------------------------------
  // HTML parsing with Cheerio
  // -----------------------------------------------------------------------

  private parseSearchResults(
    html: string,
    searchKeyword: string,
  ): RawScrapedItem[] {
    const $ = cheerio.load(html);
    const items: RawScrapedItem[] = [];
    const now = new Date();

    // EUR-Lex search results are rendered as a list of .SearchResult items
    // Each result typically has a title link, CELEX number, date, and type info
    $('.SearchResult, .search-result, [class*="result"]').each((_index, element) => {
      try {
        const $el = $(element);

        // Extract title — typically in an anchor or heading within the result
        const $titleLink =
          $el.find('a.title, h2 a, .title a, a[href*="CELEX"]').first();
        const title = $titleLink.text().trim() || $el.find('h2, h3, .title').first().text().trim();
        if (!title) return;

        // Extract CELEX number from the link href or text
        const href = $titleLink.attr('href') ?? '';
        const celexMatch = href.match(/CELEX[:\s]*(\d{5}[A-Z]\d{4})/i)
          ?? title.match(/(\d{5}[A-Z]\d{4})/);
        const celexNumber = celexMatch ? celexMatch[1] : null;

        // Extract date — look for date-like patterns in the result
        const dateText =
          $el.find('.date, .document-date, [class*="date"]').first().text().trim();
        const dateMatch = dateText.match(/\d{2}\/\d{2}\/\d{4}/)
          ?? $el.text().match(/\d{2}\/\d{2}\/\d{4}/);
        const date = dateMatch ? dateMatch[0] : null;

        // Extract document type
        const docType =
          $el.find('.type, .document-type, [class*="type"]').first().text().trim()
          || 'Unknown';

        // Extract subject matter / description
        const subjectMatter =
          $el.find('.subtitle, .description, .summary, p').first().text().trim();

        // Build the full EUR-Lex URL
        const fullUrl = href.startsWith('http')
          ? href
          : href.startsWith('/')
            ? `https://eur-lex.europa.eu${href}`
            : '';

        const entityId = celexNumber
          ? `eurlex:${celexNumber}`
          : `eurlex:${Buffer.from(title.slice(0, 100)).toString('base64url').slice(0, 32)}`;

        items.push({
          source: 'eurlex',
          entityId,
          url: fullUrl || `https://eur-lex.europa.eu/search.html?text=${encodeURIComponent(searchKeyword)}`,
          payload: {
            title,
            celexNumber,
            date,
            documentType: docType,
            subjectMatter: subjectMatter || null,
            jurisdiction: 'EU',
            searchKeyword,
          },
          format: 'eurlex_doc_v1',
          scrapedAt: now,
        });
      } catch {
        // Skip individual results that fail to parse
      }
    });

    return items;
  }
}
