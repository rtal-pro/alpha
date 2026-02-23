// ---------------------------------------------------------------------------
// Legifrance transformer — converts raw Legifrance API responses into
// NormalizedItem shapes.
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../scrapers/base.js';
import { BaseTransformer, type NormalizedItem } from './base.js';

// ---------------------------------------------------------------------------
// Typed LegifranceText (kept inline for independence)
// ---------------------------------------------------------------------------

export interface LegifranceText {
  title: string;
  textReference: string | null;
  date: string | null;
  nature: string;
  domain: string | null;
}

// ---------------------------------------------------------------------------
// LegifranceTransformer
// ---------------------------------------------------------------------------

export class LegifranceTransformer extends BaseTransformer {
  readonly source = 'legifrance' as const;

  /**
   * Transform raw Legifrance scraped items into NormalizedItem format.
   */
  transform(rawItems: RawScrapedItem[]): NormalizedItem[] {
    return rawItems
      .filter((item) => item.source === 'legifrance')
      .map((item) => this.transformOne(item))
      .filter((item): item is NormalizedItem => item !== null);
  }

  /**
   * Extract typed LegifranceText objects from raw items.
   */
  toLegifranceTexts(rawItems: RawScrapedItem[]): LegifranceText[] {
    return rawItems
      .filter((item) => item.source === 'legifrance')
      .map((item) => this.toText(item))
      .filter((text): text is LegifranceText => text !== null);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private transformOne(item: RawScrapedItem): NormalizedItem | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const nature = String(p['nature'] ?? '');
    const dateTexte = p['dateTexte'] ? String(p['dateTexte']) : null;
    const nor = p['nor'] ? String(p['nor']) : null;
    const num = p['num'] ? String(p['num']) : null;
    const etat = p['etat'] ? String(p['etat']) : null;

    // Build a human-readable text reference from NOR or num
    const textReference = nor ?? num ?? null;

    // Derive domain from the title / nature
    const domain = this.deriveDomain(title, nature);

    // Map French nature values to categories
    const categories: string[] = ['jurisdiction:FR'];
    if (nature) categories.push(`nature:${nature}`);
    if (domain) categories.push(`domain:${domain}`);
    if (etat) categories.push(`etat:${etat}`);

    // Build description
    const natureFr = this.translateNature(nature);
    const description = dateTexte
      ? `${natureFr} du ${dateTexte} — ${title}`
      : `${natureFr} — ${title}`;

    return {
      source: 'legifrance',
      externalId: item.entityId,
      title,
      description:
        description.length > 500
          ? description.slice(0, 497) + '...'
          : description,
      url: item.url || undefined,
      metrics: {},
      categories,
      scrapedAt: item.scrapedAt,
      metadata: {
        nature,
        natureFr,
        dateTexte,
        textReference,
        nor,
        num,
        etat,
        domain,
        searchKeyword: p['searchKeyword'],
      },
    };
  }

  private toText(item: RawScrapedItem): LegifranceText | null {
    const p = item.payload;

    const title = String(p['title'] ?? '');
    if (!title) return null;

    const nature = String(p['nature'] ?? '');
    const nor = p['nor'] ? String(p['nor']) : null;
    const num = p['num'] ? String(p['num']) : null;

    return {
      title,
      textReference: nor ?? num ?? null,
      date: p['dateTexte'] ? String(p['dateTexte']) : null,
      nature,
      domain: this.deriveDomain(title, nature),
    };
  }

  /**
   * Translate nature codes to readable French labels.
   */
  private translateNature(nature: string): string {
    const natureMap: Record<string, string> = {
      LOI: 'Loi',
      DECRET: 'Decret',
      ORDONNANCE: 'Ordonnance',
      ARRETE: 'Arrete',
      DECISION: 'Decision',
      CIRCULAIRE: 'Circulaire',
      CODE: 'Code',
      CONSTITUTION: 'Constitution',
    };

    return natureMap[nature.toUpperCase()] ?? (nature || 'Texte');
  }

  /**
   * Derive domain from French legal text title and nature.
   */
  private deriveDomain(title: string, nature: string): string | null {
    const text = `${title} ${nature}`.toLowerCase();

    const domainMap: Record<string, string[]> = {
      'numerique': ['numerique', 'digital', 'informatique', 'donnees', 'cyber', 'electronique', 'internet'],
      'finance': ['financier', 'bancaire', 'monetaire', 'fiscal', 'impot', 'taxe', 'budget'],
      'environnement': ['environnement', 'climat', 'ecologie', 'energie', 'developpement durable'],
      'commerce': ['commerce', 'commercial', 'concurrence', 'consommation', 'marche'],
      'travail': ['travail', 'emploi', 'social', 'retraite', 'securite sociale'],
      'sante': ['sante', 'medical', 'medicament', 'hopital', 'epidemie'],
      'education': ['education', 'enseignement', 'universite', 'formation'],
      'transport': ['transport', 'mobilite', 'aviation', 'ferroviaire', 'routier', 'maritime'],
      'defense': ['defense', 'militaire', 'armee', 'securite nationale'],
      'justice': ['justice', 'penal', 'civil', 'judiciaire', 'tribunal'],
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
      if (keywords.some((kw) => text.includes(kw))) {
        return domain;
      }
    }

    return null;
  }
}
