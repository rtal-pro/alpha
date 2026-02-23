// ---------------------------------------------------------------------------
// MSW HTTP mock handlers for scraper tests
// ---------------------------------------------------------------------------

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// ---------------------------------------------------------------------------
// Hacker News API mocks
// ---------------------------------------------------------------------------

const hnTopStories = [1001, 1002, 1003];

const hnItem = (id: number) => ({
  id,
  type: 'story',
  by: `user_${id}`,
  time: Math.floor(Date.now() / 1000) - 3600,
  title: `Test HN Story ${id}`,
  url: `https://example.com/story-${id}`,
  score: 100 + id,
  descendants: 50 + id,
  kids: [2001, 2002],
});

// ---------------------------------------------------------------------------
// Google Autocomplete API mock
// ---------------------------------------------------------------------------

const autocompleteResponse = [
  'saas crm',
  ['saas crm software', 'saas crm for small business', 'saas crm pricing'],
];

// ---------------------------------------------------------------------------
// BOAMP API mock
// ---------------------------------------------------------------------------

const boampResponse = {
  results: [
    {
      id: 'BOAMP-001',
      title: 'Marché public de logiciels',
      url: 'https://www.boamp.fr/avis/detail/BOAMP-001',
      datePublication: new Date().toISOString(),
      organisme: 'Mairie de Paris',
      cpv: '72000000',
      montant: 50000,
    },
  ],
};

// ---------------------------------------------------------------------------
// EU TED API mock
// ---------------------------------------------------------------------------

const tedResponse = {
  results: [
    {
      'ND': 'TED-2024-001',
      'TI': 'Software development services',
      'CY': 'FR',
      'DD': new Date().toISOString().split('T')[0],
      'OJ': 'S 001',
      'TVL': '100000',
      'NC': 'Services',
      'PR': 'Open',
    },
  ],
};

// ---------------------------------------------------------------------------
// Data.gouv.fr API mock
// ---------------------------------------------------------------------------

const dataGouvResponse = {
  data: [
    {
      id: 'dataset-001',
      title: 'Données test',
      description: 'Un jeu de données de test',
      url: 'https://www.data.gouv.fr/datasets/dataset-001',
      created_at: new Date().toISOString(),
      last_update: new Date().toISOString(),
      organization: { name: 'Test Org' },
      resources: [{ format: 'csv', url: 'https://example.com/data.csv' }],
      metrics: { views: 100, followers: 10, reuses: 5 },
    },
  ],
};

// ---------------------------------------------------------------------------
// Upwork RSS/API mock
// ---------------------------------------------------------------------------

const upworkRssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Upwork Jobs</title>
    <item>
      <title>Build a SaaS application</title>
      <link>https://www.upwork.com/jobs/1234</link>
      <description>Looking for a developer to build a SaaS CRM</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <budget>5000</budget>
    </item>
  </channel>
</rss>`;

// ---------------------------------------------------------------------------
// Cheerio-based scraper HTML stubs
// ---------------------------------------------------------------------------

const genericProductHtml = `
<!DOCTYPE html>
<html>
<head><title>Test Products</title></head>
<body>
  <div class="product-card">
    <h2 class="product-name"><a href="/product/test-1">Test Product 1</a></h2>
    <p class="product-description">A great SaaS tool</p>
    <span class="rating">4.5</span>
    <span class="reviews">120</span>
  </div>
  <div class="product-card">
    <h2 class="product-name"><a href="/product/test-2">Test Product 2</a></h2>
    <p class="product-description">Another SaaS tool</p>
    <span class="rating">4.0</span>
    <span class="reviews">80</span>
  </div>
</body>
</html>`;

const eurLexHtml = `
<!DOCTYPE html>
<html>
<head><title>EUR-Lex Results</title></head>
<body>
  <div class="SearchResult">
    <div class="SearchResult__title">
      <a href="/legal-content/EN/TXT/?uri=CELEX:32024R0001">Regulation (EU) 2024/001</a>
    </div>
    <div class="SearchResult__summary">Test regulation about digital services</div>
    <div class="SearchResult__date">15/01/2024</div>
  </div>
</body>
</html>`;

// ---------------------------------------------------------------------------
// 401 stubs for auth-gated APIs
// ---------------------------------------------------------------------------

const authErrorJson = { error: 'Unauthorized', message: 'Invalid or missing API key' };

// ---------------------------------------------------------------------------
// Handler definitions
// ---------------------------------------------------------------------------

export const handlers = [
  // -- Hacker News --
  http.get('https://hacker-news.firebaseio.com/v0/topstories.json', () => {
    return HttpResponse.json(hnTopStories);
  }),
  http.get('https://hacker-news.firebaseio.com/v0/newstories.json', () => {
    return HttpResponse.json(hnTopStories);
  }),
  http.get('https://hacker-news.firebaseio.com/v0/beststories.json', () => {
    return HttpResponse.json(hnTopStories);
  }),
  http.get('https://hacker-news.firebaseio.com/v0/item/:id.json', ({ params }) => {
    return HttpResponse.json(hnItem(Number(params.id)));
  }),

  // -- Google Autocomplete --
  http.get('https://suggestqueries.google.com/complete/search', () => {
    return HttpResponse.json(autocompleteResponse);
  }),
  http.get('https://www.google.com/complete/search', () => {
    return HttpResponse.json(autocompleteResponse);
  }),

  // -- BOAMP --
  http.get('https://www.boamp.fr/avis/liste', () => {
    return HttpResponse.json(boampResponse);
  }),
  http.get(/boamp\.fr/, () => {
    return HttpResponse.json(boampResponse);
  }),

  // -- EU TED --
  http.get(/ted\.europa\.eu/, () => {
    return HttpResponse.json(tedResponse);
  }),
  http.post(/ted\.europa\.eu/, () => {
    return HttpResponse.json(tedResponse);
  }),

  // -- Data.gouv.fr --
  http.get('https://www.data.gouv.fr/api/1/datasets/', () => {
    return HttpResponse.json(dataGouvResponse);
  }),
  http.get(/data\.gouv\.fr\/api/, () => {
    return HttpResponse.json(dataGouvResponse);
  }),

  // -- Upwork RSS --
  http.get(/upwork\.com/, () => {
    return HttpResponse.text(upworkRssXml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }),

  // -- Cheerio-based scrapers: generic HTML responses --
  http.get(/eurlex\.europa\.eu/, () => {
    return HttpResponse.html(eurLexHtml);
  }),
  http.get(/legifrance\.gouv\.fr/, () => {
    return HttpResponse.json({ results: [] });
  }),
  http.get(/shopify/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/chrome\.google\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/chromewebstore\.google\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/zapier\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/trustpilot\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/indiehackers\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/betalist\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/alternativeto\.net/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/acquire\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/wellfound\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/dealroom\.co/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/saashub\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/starterstory\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/appsumo\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/ycombinator\.com/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/pappers\.fr/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/malt\.(com|fr)/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/openstartups/, () => {
    return HttpResponse.html(genericProductHtml);
  }),
  http.get(/web\.archive\.org/, () => {
    return HttpResponse.json({ archived_snapshots: {} });
  }),

  // -- Auth-gated API stubs (return 401) --
  http.get(/api\.reddit\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.post('https://www.reddit.com/api/v1/access_token', () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.github\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.producthunt\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.post(/api\.producthunt\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/serpapi\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.twitter\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.x\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.stackexchange\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.crunchbase\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.builtwith\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.similarweb\.com/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
  http.get(/api\.insee\.fr/, () => {
    return HttpResponse.json(authErrorJson, { status: 401 });
  }),
];

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

export const server = setupServer(...handlers);
