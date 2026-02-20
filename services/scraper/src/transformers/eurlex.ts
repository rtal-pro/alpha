// ---------------------------------------------------------------------------
// EUR-Lex transformer — converts raw EUR-Lex scraped items into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed EurLexDocument (kept inline for independence)
// ---------------------------------------------------------------------------

export interface EurLexDocument {
  title: string;
  celexNumber: string | null;
  date: string | null;
  documentType: string;
  jurisdiction: string;
  domain: string | null;
  effectiveDate: string | null;
}

// ---------------------------------------------------------------------------
// EurLexTransformer
// ---------------------------------------------------------------------------

export class EurLexTransformer extends BaseTransformer {
  readonly source = 'eurlex' as const;

  /**
   * Transform raw EUR-Lex scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'eurlex')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed EurLexDocument objects from raw items.
   */
  toEurLexDocuments(rawItems: RawScrapedItem[]): EurLexDocument[] {
    return rawItems
      .filter((item) => item.source === 'eurlex')
      .map((item) => this.toDocument(item))
      .filter((doc): doc is EurLexDocument => doc !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const celexNumber = p['celexNumber'] ? String(p['celexNumber']) : null;
    const date = p['date'] ? String(p['date']) : null;
    const documentType = String(p['documentType'] ?? 'Unknown');
    const jurisdiction = String(p['jurisdiction'] ?? 'EU');
    const subjectMatter = p['subjectMatter'] ? String(p['subjectMatter']) : null;

    // Derive domain from subject matter keywords
    const domain = this.deriveDomain(subjectMatter, title);

    // Parse the date string (DD/MM/YYYY) into an ISO date for effective_date
    const effectiveDate = this.parseEurDate(date);

    // Build categories
    const categories: string[] = [
      `jurisdiction:${jurisdiction}`,
      `type:${documentType}`,
    ];
    if (domain) categories.push(`domain:${domain}`);

    // Truncate subject matter for description
    const description = subjectMatter
      ? subjectMatter.length > 500
        ? subjectMatter.slice(0, 497) + '...'
        : subjectMatter
      : `${documentType} — ${title}`;

    return {
      source: 'eurlex',
      externalId: item.entityId,
      title,
      description,
      url: item.url || undefined,
      metrics: {},
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        celexNumber,
        date,
        effectiveDate,
        documentType,
        jurisdiction,
        domain,
        subjectMatter,
        searchKeyword: p['searchKeyword'],
      },
    };
  }

  private toDocument(item: RawScrapedItem): EurLexDocument | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const date = p['date'] ? String(p['date']) : null;
    const subjectMatter = p['subjectMatter'] ? String(p['subjectMatter']) : null;

    return {
      title,
      celexNumber: p['celexNumber'] ? String(p['celexNumber']) : null,
      date,
      documentType: String(p['documentType'] ?? 'Unknown'),
      jurisdiction: String(p['jurisdiction'] ?? 'EU'),
      domain: this.deriveDomain(subjectMatter, title),
      effectiveDate: this.parseEurDate(date),
    };
  }

  /**
   * Derive a broad domain from the subject matter or title text.
   */
  private deriveDomain(subjectMatter: string | null, title: string): string | null {
    const text = `${subjectMatter ?? ''} ${title}`.toLowerCase();

    const domainMap: Record<string, string[]> = {
      'digital_services': ['digital', 'electronic', 'internet', 'online', 'data protection', 'cyber', 'ai', 'artificial intelligence'],
      'financial_regulation': ['financial', 'banking', 'securities', 'payment', 'insurance', 'monetary'],
      'environment': ['environment', 'climate', 'emission', 'sustainability', 'green', 'energy'],
      'trade': ['trade', 'customs', 'tariff', 'import', 'export', 'commerce'],
      'competition': ['competition', 'antitrust', 'merger', 'state aid', 'monopoly'],
      'consumer_protection': ['consumer', 'product safety', 'food safety'],
      'employment': ['employment', 'labour', 'labor', 'worker', 'social security'],
      'transport': ['transport', 'aviation', 'maritime', 'railway', 'road'],
      'health': ['health', 'pharmaceutical', 'medical', 'medicine'],
      'agriculture': ['agriculture', 'farming', 'fisheries'],
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
      if (keywords.some((kw) => text.includes(kw))) {
        return domain;
      }
    }

    return null;
  }

  /**
   * Parse a DD/MM/YYYY date string into ISO format (YYYY-MM-DD).
   */
  private parseEurDate(dateStr: string | null): string | null {
    if (!dateStr) return null;

    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;

    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
}
