// ---------------------------------------------------------------------------
// BrowserPool — manages a pool of Playwright browser instances and contexts
// for stealth scraping with fingerprint randomisation.
// ---------------------------------------------------------------------------

import {
  chromium,
  type Browser,
  type BrowserContext,
  type LaunchOptions,
} from 'playwright';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BROWSERS = 3;
const MAX_CONTEXTS_PER_BROWSER = 5;
const ACQUIRE_POLL_INTERVAL_MS = 250;
const ACQUIRE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// User-agent pool (modern Chrome variants on common OSes)
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

// ---------------------------------------------------------------------------
// Internal tracking
// ---------------------------------------------------------------------------

interface ManagedBrowser {
  browser: Browser;
  contexts: Set<BrowserContext>;
}

// ---------------------------------------------------------------------------
// BrowserPool
// ---------------------------------------------------------------------------

export class BrowserPool {
  private browsers: ManagedBrowser[] = [];
  private shuttingDown = false;

  // -----------------------------------------------------------------------
  // Stealth launch options
  // -----------------------------------------------------------------------

  private stealthConfig(): LaunchOptions {
    return {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-size=1920,1080',
        '--disable-extensions',
      ],
    };
  }

  // -----------------------------------------------------------------------
  // acquire() — get a browser context from the pool
  // -----------------------------------------------------------------------

  async acquire(): Promise<BrowserContext> {
    if (this.shuttingDown) {
      throw new Error('BrowserPool is shutting down — cannot acquire new context');
    }

    const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      // Try to find a browser with capacity
      for (const managed of this.browsers) {
        if (managed.contexts.size < MAX_CONTEXTS_PER_BROWSER) {
          const context = await this.createContext(managed);
          return context;
        }
      }

      // If we have room for another browser, launch one
      if (this.browsers.length < MAX_BROWSERS) {
        const managed = await this.launchBrowser();
        const context = await this.createContext(managed);
        return context;
      }

      // All browsers are full — wait and retry
      await new Promise((resolve) => setTimeout(resolve, ACQUIRE_POLL_INTERVAL_MS));
    }

    throw new Error(
      `BrowserPool: timed out waiting for available context after ${ACQUIRE_TIMEOUT_MS}ms`,
    );
  }

  // -----------------------------------------------------------------------
  // release(context) — clear cookies and return context to pool
  // -----------------------------------------------------------------------

  async release(context: BrowserContext): Promise<void> {
    try {
      // Clear cookies and storage to ensure clean state for next use
      await context.clearCookies();

      // Close the context — it's cheaper to create a new one than to
      // fully sanitise local-/session-storage across all pages.
      await context.close();
    } catch {
      // Context may already be closed — ignore errors
    } finally {
      // Remove from tracking
      for (const managed of this.browsers) {
        managed.contexts.delete(context);
      }
    }
  }

  // -----------------------------------------------------------------------
  // shutdown() — close everything
  // -----------------------------------------------------------------------

  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    const closePromises: Promise<void>[] = [];

    for (const managed of this.browsers) {
      for (const ctx of managed.contexts) {
        closePromises.push(ctx.close().catch(() => {}));
      }
      closePromises.push(managed.browser.close().catch(() => {}));
    }

    await Promise.allSettled(closePromises);
    this.browsers = [];
  }

  // -----------------------------------------------------------------------
  // Stats (useful for health checks)
  // -----------------------------------------------------------------------

  get stats(): { browsers: number; totalContexts: number; capacity: number } {
    let totalContexts = 0;
    for (const managed of this.browsers) {
      totalContexts += managed.contexts.size;
    }
    return {
      browsers: this.browsers.length,
      totalContexts,
      capacity: MAX_BROWSERS * MAX_CONTEXTS_PER_BROWSER - totalContexts,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async launchBrowser(): Promise<ManagedBrowser> {
    const browser = await chromium.launch(this.stealthConfig());

    browser.on('disconnected', () => {
      this.browsers = this.browsers.filter((m) => m.browser !== browser);
    });

    const managed: ManagedBrowser = { browser, contexts: new Set() };
    this.browsers.push(managed);
    return managed;
  }

  private async createContext(managed: ManagedBrowser): Promise<BrowserContext> {
    const context = await managed.browser.newContext({
      userAgent: randomUserAgent(),
      locale: 'fr-FR',
      viewport: { width: 1920, height: 1080 },
      timezoneId: 'Europe/Paris',
      geolocation: { latitude: 48.8566, longitude: 2.3522 },
      permissions: ['geolocation'],
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    // Mask webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    managed.contexts.add(context);
    return context;
  }
}

// ---------------------------------------------------------------------------
// Singleton export — most callers should use this shared instance
// ---------------------------------------------------------------------------

export const browserPool = new BrowserPool();
