// ---------------------------------------------------------------------------
// Google Autocomplete scraper — free, no API key required
//
// Uses Google's public suggest API to discover what people are searching for.
// Great for detecting demand signals, pain points, and emerging categories.
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';

/** Rate limit: be polite — 1s between requests */
const RATE_LIMIT_DELAY_MS = 1_000;

// Seed modifiers to discover more intent-rich suggestions
const INTENT_MODIFIERS = [
  // Pain / need signals
  '{keyword} alternative',
  '{keyword} vs',
  '{keyword} pricing',
  '{keyword} free',
  '{keyword} open source',
  '{keyword} for small business',
  '{keyword} France',
  'best {keyword}',
  '{keyword} integration',
  '{keyword} API',
  // Problem signals
  '{keyword} not working',
  '{keyword} issues',
  '{keyword} too expensive',
  'switch from {keyword}',
  'replace {keyword}',
];

// ---------------------------------------------------------------------------
// GoogleAutocompleteScraper
// ---------------------------------------------------------------------------

export class GoogleAutocompleteScraper extends BaseScraper {
  readonly source = 'google_autocomplete' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    if (params.type !== 'keyword_search') {
      throw new Error(`GoogleAutocompleteScraper: unsupported scrape type "${params.type}"`);
    }

    const keywords = params.keywords ?? [];
    const geo = params.geo ?? 'fr';

    if (keywords.length === 0) {
      throw new Error('GoogleAutocompleteScraper: at least one keyword is required');
    }

    const allItems: RawScrapedItem[] = [];

    for (const keyword of keywords) {
      // First, get base suggestions
      try {
        const base = await this.retryWithBackoff(
          () => this.fetchSuggestions(keyword, geo),
          2,
        );
        allItems.push(...base);
      } catch (err) {
        console.error(`[google-autocomplete] Base query failed for "${keyword}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);

      // Then expand with intent modifiers
      for (const modifier of INTENT_MODIFIERS) {
        const query = modifier.replace('{keyword}', keyword);
        try {
          const items = await this.retryWithBackoff(
            () => this.fetchSuggestions(query, geo),
            1,
          );
          allItems.push(...items);
        } catch {
          // Non-critical — continue with other modifiers
        }
        await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
      }
    }

    return this.deduplicateByEntityId(allItems);
  }

  // -----------------------------------------------------------------------
  // Fetch suggestions
  // -----------------------------------------------------------------------

  private async fetchSuggestions(
    query: string,
    geo: string,
  ): Promise<RawScrapedItem[]> {
    const url = new URL(SUGGEST_URL);
    url.searchParams.set('client', 'firefox'); // Returns JSON
    url.searchParams.set('q', query);
    url.searchParams.set('hl', geo === 'fr' ? 'fr' : 'en');
    url.searchParams.set('gl', geo.toUpperCase());

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)',
      },
    });

    if (response.status === 429) {
      throw new Error('Google Autocomplete rate limit (429)');
    }

    if (!response.ok) {
      throw new Error(`Google Autocomplete error (${response.status})`);
    }

    // Response format: ["query", ["suggestion1", "suggestion2", ...]]
    const body = (await response.json()) as [string, string[]];
    const suggestions = body[1] ?? [];
    const now = new Date();

    return suggestions.map((suggestion, index) => {
      const intent = this.classifyIntent(suggestion, query);

      return {
        source: 'google_autocomplete',
        entityId: `gac:${this.hashString(suggestion)}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`,
        payload: {
          query: suggestion,
          seed_query: query,
          position: index,
          geo,
          intent,
          has_comparison: /\bvs\b|versus|compar/i.test(suggestion),
          has_pricing_intent: /\bpric|cost|free|cheap|afford/i.test(suggestion),
          has_alternative_intent: /\balternative|switch|replace|instead/i.test(suggestion),
          has_pain_intent: /\bnot working|issue|problem|broken|bad|hate/i.test(suggestion),
        },
        format: 'google_autocomplete_v1',
        scrapedAt: now,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private classifyIntent(suggestion: string, seedQuery: string): string {
    const s = suggestion.toLowerCase();
    if (/alternative|vs|versus|compar|instead of|replace|switch from/.test(s)) return 'comparison';
    if (/pric|cost|free|cheap|afford|plan|tier/.test(s)) return 'pricing';
    if (/not working|issue|problem|broken|bug|error/.test(s)) return 'problem';
    if (/how to|tutorial|guide|learn|example/.test(s)) return 'educational';
    if (/api|integration|plugin|connect|automat/.test(s)) return 'integration';
    if (/review|opinion|worth|recommend/.test(s)) return 'evaluation';
    return 'general';
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private deduplicateByEntityId(items: RawScrapedItem[]): RawScrapedItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.entityId)) return false;
      seen.add(item.entityId);
      return true;
    });
  }
}
