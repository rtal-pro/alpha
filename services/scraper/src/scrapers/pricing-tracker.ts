// ---------------------------------------------------------------------------
// SaaS Pricing Tracker — monitors pricing page changes via Wayback Machine
//
// Pricing changes reveal:
// - Price increases (opportunity to undercut)
// - Feature gating changes (opportunity for simpler product)
// - Free tier removal (opportunity for free alternative)
// - New pricing tiers (market segmentation signals)
// ---------------------------------------------------------------------------

import { BaseScraper, type RawScrapedItem, type ScrapeParams } from './base.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WAYBACK_API = 'https://web.archive.org/web';
const CDX_API = 'https://web.archive.org/cdx/search/cdx';
const RATE_LIMIT_DELAY_MS = 3_000;

// Well-known SaaS pricing page paths
const PRICING_PATHS = ['/pricing', '/plans', '/pricing.html', '/plan'];

// ---------------------------------------------------------------------------
// PricingTrackerScraper
// ---------------------------------------------------------------------------

export class PricingTrackerScraper extends BaseScraper {
  readonly source = 'pricing_tracker' as const;
  readonly method = 'api' as const;

  async scrape(params: ScrapeParams): Promise<RawScrapedItem[]> {
    const keywords = params.keywords ?? []; // These are domain names
    const daysBack = params.daysBack ?? 90;

    if (params.type !== 'keyword_search' || keywords.length === 0) {
      throw new Error('PricingTrackerScraper: requires keyword_search with domain names as keywords');
    }

    const allItems: RawScrapedItem[] = [];

    for (const domain of keywords) {
      try {
        const items = await this.retryWithBackoff(
          () => this.checkPricingChanges(domain, daysBack),
          2,
        );
        allItems.push(...items);
      } catch (err) {
        console.error(`[pricing-tracker] Failed for "${domain}": ${err}`);
      }
      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return allItems;
  }

  // -----------------------------------------------------------------------
  // Check for pricing page changes via Wayback Machine CDX API
  // -----------------------------------------------------------------------

  private async checkPricingChanges(
    domain: string,
    daysBack: number,
  ): Promise<RawScrapedItem[]> {
    const items: RawScrapedItem[] = [];
    const now = new Date();
    const fromDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fromStr = this.formatWaybackDate(fromDate);

    for (const path of PRICING_PATHS) {
      try {
        const snapshots = await this.getSnapshots(`${domain}${path}`, fromStr);
        if (snapshots.length < 2) continue;

        // Compare latest vs earliest snapshot
        const earliest = snapshots[0]!;
        const latest = snapshots[snapshots.length - 1]!;

        if (earliest.digest === latest.digest) continue; // No change

        // Fetch both versions to compare
        const [oldHtml, newHtml] = await Promise.all([
          this.fetchSnapshot(earliest.timestamp, `${domain}${path}`),
          this.fetchSnapshot(latest.timestamp, `${domain}${path}`),
        ]);

        if (!oldHtml || !newHtml) continue;

        const changes = this.detectPricingChanges(oldHtml, newHtml);

        if (changes.hasChanges) {
          items.push({
            source: 'pricing_tracker',
            entityId: `pricing:${domain}:${path}`,
            url: `https://${domain}${path}`,
            payload: {
              domain,
              pricing_path: path,
              snapshot_count: snapshots.length,
              first_snapshot: earliest.timestamp,
              last_snapshot: latest.timestamp,
              days_between: Math.round(
                (this.parseWaybackDate(latest.timestamp).getTime() -
                  this.parseWaybackDate(earliest.timestamp).getTime()) /
                (24 * 60 * 60 * 1000),
              ),
              ...changes,
            },
            format: 'pricing_change_v1',
            scrapedAt: now,
          });
        }
      } catch {
        // Pricing page may not exist for this path
      }

      await this.rateLimitDelay(RATE_LIMIT_DELAY_MS);
    }

    return items;
  }

  // -----------------------------------------------------------------------
  // Wayback Machine CDX API
  // -----------------------------------------------------------------------

  private async getSnapshots(
    urlPath: string,
    fromDate: string,
  ): Promise<Array<{ timestamp: string; digest: string; statuscode: string }>> {
    const url = new URL(CDX_API);
    url.searchParams.set('url', urlPath);
    url.searchParams.set('output', 'json');
    url.searchParams.set('from', fromDate);
    url.searchParams.set('fl', 'timestamp,digest,statuscode');
    url.searchParams.set('filter', 'statuscode:200');
    url.searchParams.set('collapse', 'digest');
    url.searchParams.set('limit', '10');

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as string[][];
    if (data.length <= 1) return []; // First row is headers

    return data.slice(1).map((row) => ({
      timestamp: row[0]!,
      digest: row[1]!,
      statuscode: row[2]!,
    }));
  }

  // -----------------------------------------------------------------------
  // Fetch a specific snapshot
  // -----------------------------------------------------------------------

  private async fetchSnapshot(
    timestamp: string,
    urlPath: string,
  ): Promise<string | null> {
    const url = `${WAYBACK_API}/${timestamp}id_/https://${urlPath}`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SaaSIdeaEngine/0.1)' },
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Pricing change detection
  // -----------------------------------------------------------------------

  private detectPricingChanges(
    oldHtml: string,
    newHtml: string,
  ): {
    hasChanges: boolean;
    price_increase: boolean;
    free_tier_removed: boolean;
    new_tiers_added: boolean;
    feature_gating_changed: boolean;
    old_prices: string[];
    new_prices: string[];
    change_type: string;
  } {
    const oldPrices = this.extractPrices(oldHtml);
    const newPrices = this.extractPrices(newHtml);
    const oldHadFree = this.hasFreeOption(oldHtml);
    const newHasFree = this.hasFreeOption(newHtml);

    const priceIncrease = this.hasPriceIncrease(oldPrices, newPrices);
    const freeTierRemoved = oldHadFree && !newHasFree;
    const newTiersAdded = newPrices.length > oldPrices.length;
    const featureGatingChanged = this.hasFeatureGatingChange(oldHtml, newHtml);

    const hasChanges = priceIncrease || freeTierRemoved || newTiersAdded || featureGatingChanged;

    let changeType = 'unknown';
    if (priceIncrease) changeType = 'price_increase';
    else if (freeTierRemoved) changeType = 'free_tier_removed';
    else if (newTiersAdded) changeType = 'new_tiers';
    else if (featureGatingChanged) changeType = 'feature_gating';

    return {
      hasChanges,
      price_increase: priceIncrease,
      free_tier_removed: freeTierRemoved,
      new_tiers_added: newTiersAdded,
      feature_gating_changed: featureGatingChanged,
      old_prices: oldPrices,
      new_prices: newPrices,
      change_type: changeType,
    };
  }

  private extractPrices(html: string): string[] {
    const pricePattern = /\$\s*(\d+(?:\.\d{2})?)\s*(?:\/\s*(?:mo(?:nth)?|yr|year|user))?/gi;
    const euroPattern = /(\d+(?:,\d{2})?)\s*€\s*(?:\/\s*(?:mois|an|utilisateur))?/gi;

    const prices = new Set<string>();
    let match;

    while ((match = pricePattern.exec(html)) !== null) {
      prices.add(`$${match[1]}`);
    }
    while ((match = euroPattern.exec(html)) !== null) {
      prices.add(`€${match[1]}`);
    }

    return Array.from(prices).sort();
  }

  private hasFreeOption(html: string): boolean {
    return /\b(free\s*(?:plan|tier|forever|trial)|0\s*€|€\s*0|\$\s*0)\b/i.test(html);
  }

  private hasPriceIncrease(oldPrices: string[], newPrices: string[]): boolean {
    if (oldPrices.length === 0 || newPrices.length === 0) return false;

    const parsePrice = (p: string) => parseFloat(p.replace(/[^0-9.]/g, ''));
    const oldMin = Math.min(...oldPrices.map(parsePrice));
    const newMin = Math.min(...newPrices.map(parsePrice));

    return newMin > oldMin * 1.1; // 10%+ increase
  }

  private hasFeatureGatingChange(oldHtml: string, newHtml: string): boolean {
    const gatingPatterns = [
      /\b(enterprise|premium|pro|business)\s*only\b/gi,
      /\b(upgrade|unlock|available\s+on)\b/gi,
    ];

    let oldGating = 0;
    let newGating = 0;

    for (const pattern of gatingPatterns) {
      oldGating += (oldHtml.match(pattern) ?? []).length;
      pattern.lastIndex = 0;
      newGating += (newHtml.match(pattern) ?? []).length;
      pattern.lastIndex = 0;
    }

    return newGating > oldGating + 2; // Significant increase in gating language
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private formatWaybackDate(date: Date): string {
    return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  private parseWaybackDate(timestamp: string): Date {
    const y = timestamp.slice(0, 4);
    const m = timestamp.slice(4, 6);
    const d = timestamp.slice(6, 8);
    return new Date(`${y}-${m}-${d}`);
  }
}
