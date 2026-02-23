// ---------------------------------------------------------------------------
// Factory functions generating valid RawScrapedItem per source
// ---------------------------------------------------------------------------

import type { RawScrapedItem } from '../../src/scrapers/base.js';

const now = new Date();

function makeItem(
  source: string,
  entityId: string,
  payload: Record<string, unknown>,
  format: string,
  url = `https://example.com/${source}/${entityId}`,
): RawScrapedItem {
  return { source, entityId, url, payload, format, scrapedAt: now };
}

// ---------------------------------------------------------------------------
// Per-source factories
// ---------------------------------------------------------------------------

export function makeRedditItem(): RawScrapedItem {
  return makeItem('reddit', 'reddit_post_123', {
    title: 'Looking for a SaaS CRM tool',
    selftext: 'I need a CRM that integrates with Slack',
    score: 250,
    num_comments: 45,
    upvote_ratio: 0.92,
    subreddit: 'SaaS',
    author: 'test_user',
    permalink: '/r/SaaS/comments/abc123/looking_for_crm',
    created_utc: Math.floor(Date.now() / 1000) - 3600,
    link_flair_text: 'Question',
    url: 'https://reddit.com/r/SaaS/comments/abc123',
  }, 'reddit_post_v1', 'https://reddit.com/r/SaaS/comments/abc123');
}

export function makeProductHuntItem(): RawScrapedItem {
  return makeItem('producthunt', 'ph_post_456', {
    name: 'SuperCRM',
    tagline: 'The best CRM for startups',
    votesCount: 350,
    commentsCount: 28,
    website: 'https://supercrm.io',
    topics: [{ name: 'SaaS' }, { name: 'CRM' }],
    createdAt: now.toISOString(),
  }, 'producthunt_post_v1', 'https://producthunt.com/posts/supercrm');
}

export function makeGitHubItem(): RawScrapedItem {
  return makeItem('github', 'gh_repo_789', {
    full_name: 'user/awesome-saas',
    description: 'An awesome SaaS boilerplate',
    stargazers_count: 1200,
    forks_count: 150,
    open_issues_count: 30,
    language: 'TypeScript',
    topics: ['saas', 'boilerplate'],
    html_url: 'https://github.com/user/awesome-saas',
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  }, 'github_repo_v1', 'https://github.com/user/awesome-saas');
}

export function makeHackerNewsItem(): RawScrapedItem {
  return makeItem('hacker_news', 'hn_1001', {
    id: 1001,
    type: 'story',
    by: 'pg',
    time: Math.floor(Date.now() / 1000) - 3600,
    title: 'Show HN: New SaaS Analytics Tool',
    url: 'https://example.com/analytics',
    score: 180,
    descendants: 65,
    kids: [2001, 2002],
  }, 'hn_story_v1', 'https://news.ycombinator.com/item?id=1001');
}

export function makeGoogleTrendsItem(): RawScrapedItem {
  return makeItem('google_trends', 'trend_saas_crm', {
    keyword: 'saas crm',
    interest: 85,
    relatedTopics: ['CRM software', 'Sales automation'],
    relatedQueries: ['best saas crm', 'free crm'],
    geo: 'FR',
    timeRange: 'past_12_months',
  }, 'google_trends_v1');
}

export function makeEurLexItem(): RawScrapedItem {
  return makeItem('eurlex', 'CELEX:32024R0001', {
    celex: 'CELEX:32024R0001',
    title: 'Regulation (EU) 2024/001 on digital services',
    summary: 'New regulation affecting digital platforms',
    date: '2024-01-15',
    type: 'Regulation',
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R0001',
  }, 'eurlex_doc_v1');
}

export function makeLegifranceItem(): RawScrapedItem {
  return makeItem('legifrance', 'JORF_2024_001', {
    id: 'JORF_2024_001',
    title: 'Loi relative aux services numériques',
    nature: 'LOI',
    datePubli: '2024-01-20',
    url: 'https://www.legifrance.gouv.fr/jorf/id/JORF_2024_001',
  }, 'legifrance_doc_v1');
}

export function makeINSEEItem(): RawScrapedItem {
  return makeItem('insee', 'SIREN_123456789', {
    siren: '123456789',
    denominationUniteLegale: 'SAAS STARTUP SAS',
    categorieJuridiqueUniteLegale: '5710',
    activitePrincipaleUniteLegale: '62.01Z',
    dateCreationUniteLegale: '2024-01-01',
    trancheEffectifsUniteLegale: '03',
  }, 'insee_sirene_v1');
}

export function makeTwitterItem(): RawScrapedItem {
  return makeItem('twitter', 'tweet_111', {
    id: '111',
    text: 'Just launched our new SaaS product! #startup #saas',
    author: { username: 'founder', followers_count: 5000 },
    public_metrics: { retweet_count: 20, like_count: 150, reply_count: 10 },
    created_at: now.toISOString(),
  }, 'twitter_tweet_v1');
}

export function makeStackOverflowItem(): RawScrapedItem {
  return makeItem('stackoverflow', 'so_q_222', {
    question_id: 222,
    title: 'How to build a SaaS billing system?',
    body: 'I need help with recurring billing...',
    score: 45,
    view_count: 12000,
    answer_count: 8,
    tags: ['saas', 'billing', 'stripe'],
    link: 'https://stackoverflow.com/questions/222',
    creation_date: Math.floor(Date.now() / 1000),
  }, 'stackoverflow_question_v1');
}

export function makeIndieHackersItem(): RawScrapedItem {
  return makeItem('indiehackers', 'ih_post_333', {
    title: 'How I grew my SaaS to $10k MRR',
    body: 'Here is my story...',
    url: 'https://indiehackers.com/post/333',
    author: 'indie_dev',
    votes: 80,
    comments: 25,
  }, 'indiehackers_post_v1');
}

export function makeGoogleAutocompleteItem(): RawScrapedItem {
  return makeItem('google_autocomplete', 'autocomplete_saas_crm', {
    query: 'saas crm',
    suggestions: ['saas crm software', 'saas crm free', 'saas crm for small business'],
    intentScore: 75,
    category: 'software',
  }, 'google_autocomplete_v1');
}

export function makeG2Item(): RawScrapedItem {
  return makeItem('serpapi_g2', 'g2_product_444', {
    name: 'SuperCRM',
    rating: 4.5,
    reviewCount: 250,
    category: 'CRM Software',
    description: 'Top-rated CRM for small businesses',
    url: 'https://www.g2.com/products/supercrm',
  }, 'g2_product_v1');
}

export function makeCapterraItem(): RawScrapedItem {
  return makeItem('serpapi_capterra', 'capterra_product_555', {
    name: 'SuperCRM',
    rating: 4.3,
    reviewCount: 180,
    category: 'CRM',
    description: 'CRM solution for SMBs',
    url: 'https://www.capterra.com/p/supercrm',
  }, 'capterra_product_v1');
}

export function makeTrustpilotItem(): RawScrapedItem {
  return makeItem('trustpilot', 'tp_company_666', {
    name: 'SuperCRM',
    rating: 4.2,
    reviewCount: 320,
    url: 'https://www.trustpilot.com/review/supercrm.io',
    category: 'Software Company',
  }, 'trustpilot_company_v1');
}

export function makeShopifyAppsItem(): RawScrapedItem {
  return makeItem('shopify_apps', 'shopify_app_777', {
    name: 'Super CRM App',
    rating: 4.8,
    reviewCount: 150,
    developer: 'SuperCRM Inc',
    url: 'https://apps.shopify.com/super-crm',
    category: 'Sales',
    pricing: 'Free plan available',
  }, 'shopify_app_v1');
}

export function makeChromeWebStoreItem(): RawScrapedItem {
  return makeItem('chrome_webstore', 'cws_ext_888', {
    name: 'SuperCRM Extension',
    rating: 4.6,
    users: 50000,
    reviewCount: 200,
    url: 'https://chrome.google.com/webstore/detail/supercrm/abc123',
    category: 'Productivity',
  }, 'chrome_extension_v1');
}

export function makeZapierItem(): RawScrapedItem {
  return makeItem('zapier', 'zapier_app_999', {
    name: 'SuperCRM',
    category: 'CRM',
    description: 'Connect SuperCRM to 5000+ apps',
    url: 'https://zapier.com/apps/supercrm',
    popularIntegrations: ['Slack', 'Gmail', 'Sheets'],
  }, 'zapier_app_v1');
}

export function makeCrunchbaseItem(): RawScrapedItem {
  return makeItem('crunchbase', 'cb_org_aaa', {
    name: 'SuperCRM Inc',
    short_description: 'Next-gen CRM platform',
    funding_total: { value_usd: 15000000 },
    founded_on: '2020-06-01',
    num_employees_enum: '51-100',
    categories: ['CRM', 'SaaS'],
    location: { city: 'Paris', country: 'France' },
    url: 'https://www.crunchbase.com/organization/supercrm',
  }, 'crunchbase_org_v1');
}

export function makeSimilarWebItem(): RawScrapedItem {
  return makeItem('similarweb', 'sw_domain_bbb', {
    domain: 'supercrm.io',
    monthlyVisits: 2500000,
    globalRank: 15000,
    categoryRank: 150,
    bounceRate: 0.35,
    pagesPerVisit: 4.5,
    avgVisitDuration: 180,
    trafficSources: { search: 0.4, direct: 0.3, social: 0.2, referral: 0.1 },
  }, 'similarweb_domain_v1');
}

export function makeBuiltWithItem(): RawScrapedItem {
  return makeItem('builtwith', 'bw_site_ccc', {
    domain: 'supercrm.io',
    technologies: ['React', 'Node.js', 'PostgreSQL', 'Stripe'],
    techCount: 45,
    firstDetected: '2021-03-15',
    lastDetected: now.toISOString(),
  }, 'builtwith_site_v1');
}

export function makeDataGouvItem(): RawScrapedItem {
  return makeItem('data_gouv', 'dg_dataset_ddd', {
    id: 'dataset-ddd',
    title: 'Registre national des entreprises SaaS',
    description: 'Open data about SaaS companies in France',
    organization: { name: 'DGE' },
    created_at: now.toISOString(),
    last_update: now.toISOString(),
    metrics: { views: 500, followers: 20, reuses: 8 },
  }, 'data_gouv_dataset_v1');
}

export function makeEUTedItem(): RawScrapedItem {
  return makeItem('eu_ted', 'TED-2024-001', {
    ND: 'TED-2024-001',
    TI: 'Software development services',
    CY: 'FR',
    DD: '2024-01-15',
    TVL: '100000',
    NC: 'Services',
    PR: 'Open',
  }, 'eu_ted_notice_v1');
}

export function makeBOAMPItem(): RawScrapedItem {
  return makeItem('boamp', 'BOAMP-001', {
    id: 'BOAMP-001',
    title: 'Marché public de logiciels',
    datePublication: now.toISOString(),
    organisme: 'Mairie de Paris',
    cpv: '72000000',
    montant: 50000,
    url: 'https://www.boamp.fr/avis/detail/BOAMP-001',
  }, 'boamp_notice_v1');
}

export function makeJobBoardItem(): RawScrapedItem {
  return makeItem('job_boards', 'job_eee', {
    title: 'Senior SaaS Engineer',
    company: 'SuperCRM',
    location: 'Paris, France',
    salary: '70k-90k EUR',
    skills: ['TypeScript', 'React', 'Node.js'],
    url: 'https://jobs.example.com/senior-saas-engineer',
    postedAt: now.toISOString(),
  }, 'job_posting_v1');
}

export function makeUpworkItem(): RawScrapedItem {
  return makeItem('upwork', 'uw_job_fff', {
    title: 'Build a SaaS application',
    description: 'Looking for a developer to build a SaaS CRM',
    budget: 5000,
    category: 'Web Development',
    skills: ['React', 'Node.js', 'PostgreSQL'],
    url: 'https://www.upwork.com/jobs/1234',
    publishedAt: now.toISOString(),
  }, 'upwork_job_v1');
}

export function makeMaltItem(): RawScrapedItem {
  return makeItem('malt', 'malt_profile_ggg', {
    name: 'SaaS Developer',
    title: 'Full Stack SaaS Developer',
    dailyRate: 600,
    skills: ['React', 'Node.js', 'SaaS'],
    location: 'Paris',
    url: 'https://www.malt.fr/profile/saas-dev',
  }, 'malt_profile_v1');
}

export function makePricingTrackerItem(): RawScrapedItem {
  return makeItem('pricing_tracker', 'pt_product_hhh', {
    product: 'SuperCRM',
    domain: 'supercrm.io',
    pricingPageUrl: 'https://supercrm.io/pricing',
    priceIncrease: 1,
    freeTierRemoved: 0,
    newTiersAdded: 1,
    featureGatingChanged: 0,
    previousSnapshot: '2024-01-01',
    currentSnapshot: now.toISOString(),
  }, 'pricing_tracker_v1');
}

export function makeBetaListItem(): RawScrapedItem {
  return makeItem('betalist', 'bl_startup_iii', {
    name: 'SuperCRM',
    tagline: 'CRM for the modern era',
    url: 'https://betalist.com/startups/supercrm',
    upvotes: 45,
    tags: ['SaaS', 'CRM'],
    launchedAt: now.toISOString(),
  }, 'betalist_startup_v1');
}

export function makeAlternativeToItem(): RawScrapedItem {
  return makeItem('alternativeto', 'alt_app_jjj', {
    name: 'SuperCRM',
    description: 'Alternative to Salesforce',
    likes: 120,
    url: 'https://alternativeto.net/software/supercrm',
    tags: ['CRM', 'SaaS', 'Cloud'],
    platforms: ['Web', 'Mac', 'Windows'],
  }, 'alternativeto_app_v1');
}

export function makeAcquireItem(): RawScrapedItem {
  return makeItem('acquire', 'acq_listing_kkk', {
    name: 'Mini CRM Tool',
    description: 'SaaS CRM with 500 users',
    askingPrice: 250000,
    mrr: 5000,
    arr: 60000,
    ttmRevenue: 55000,
    url: 'https://acquire.com/listings/mini-crm',
    category: 'SaaS',
  }, 'acquire_listing_v1');
}

export function makeWellfoundItem(): RawScrapedItem {
  return makeItem('wellfound', 'wf_startup_lll', {
    name: 'SuperCRM',
    description: 'Next-gen CRM for startups',
    jobCount: 5,
    fundingStage: 'Series A',
    companySize: '11-50',
    location: 'Paris',
    url: 'https://wellfound.com/company/supercrm',
  }, 'wellfound_startup_v1');
}

export function makeDealroomItem(): RawScrapedItem {
  return makeItem('dealroom', 'dr_company_mmm', {
    name: 'SuperCRM',
    description: 'CRM platform',
    totalFunding: 15000000,
    lastRound: 'Series A',
    employees: 45,
    hqLocation: 'Paris',
    url: 'https://dealroom.co/companies/supercrm',
  }, 'dealroom_company_v1');
}

export function makeOpenStartupsItem(): RawScrapedItem {
  return makeItem('open_startups', 'os_startup_nnn', {
    name: 'MicroSaaS',
    mrr: 12000,
    arr: 144000,
    customers: 200,
    churn: 3.5,
    url: 'https://openstartups.example.com/microsaas',
  }, 'open_startups_v1');
}

export function makeSaaSHubItem(): RawScrapedItem {
  return makeItem('saashub', 'sh_product_ooo', {
    name: 'SuperCRM',
    description: 'CRM for small teams',
    score: 85,
    alternatives: 12,
    url: 'https://www.saashub.com/supercrm',
    categories: ['CRM', 'Sales'],
  }, 'saashub_product_v1');
}

export function makeStarterStoryItem(): RawScrapedItem {
  return makeItem('starter_story', 'ss_story_ppp', {
    title: 'How I Built a $1M SaaS',
    founder: 'Jane Doe',
    revenue: 1000000,
    business: 'SaaS CRM',
    url: 'https://www.starterstory.com/stories/how-i-built-saas',
    publishedAt: now.toISOString(),
  }, 'starter_story_v1');
}

export function makeAppSumoItem(): RawScrapedItem {
  return makeItem('appsumo', 'as_deal_qqq', {
    name: 'SuperCRM Lifetime Deal',
    price: 49,
    originalPrice: 300,
    rating: 4.7,
    review_count: 85,
    discount_pct: 84,
    url: 'https://appsumo.com/products/supercrm',
    category: 'CRM',
  }, 'appsumo_deal_v1');
}

export function makeYCombinatorItem(): RawScrapedItem {
  return makeItem('ycombinator', 'yc_company_rrr', {
    name: 'SuperCRM',
    description: 'Modern CRM for SMBs',
    batch: 'W24',
    team_size: 8,
    status: 'Active',
    url: 'https://www.ycombinator.com/companies/supercrm',
  }, 'ycombinator_company_v1');
}

export function makePappersItem(): RawScrapedItem {
  return makeItem('pappers', 'pappers_siren_123', {
    siren: '123456789',
    denomination: 'SUPERCRM SAS',
    formeJuridique: 'SAS',
    dateCreation: '2020-06-01',
    codeNaf: '62.01Z',
    effectif: '20-49',
    siege: { ville: 'Paris', codePostal: '75001' },
    url: 'https://www.pappers.fr/entreprise/supercrm-sas-123456789',
  }, 'pappers_company_v1');
}

export function makeSerpAPISerpItem(): RawScrapedItem {
  return makeItem('serpapi_serp', 'serp_result_sss', {
    position: 1,
    title: 'Best SaaS CRM Software 2024',
    link: 'https://example.com/best-crm',
    snippet: 'Compare the top SaaS CRM solutions...',
    source: 'Example.com',
    query: 'best saas crm',
  }, 'serpapi_serp_v1');
}

// ---------------------------------------------------------------------------
// Factory map: source → factory function
// ---------------------------------------------------------------------------

export const rawItemFactories: Record<string, () => RawScrapedItem> = {
  reddit: makeRedditItem,
  producthunt: makeProductHuntItem,
  github: makeGitHubItem,
  hacker_news: makeHackerNewsItem,
  google_trends: makeGoogleTrendsItem,
  eurlex: makeEurLexItem,
  legifrance: makeLegifranceItem,
  insee: makeINSEEItem,
  twitter: makeTwitterItem,
  stackoverflow: makeStackOverflowItem,
  indiehackers: makeIndieHackersItem,
  google_autocomplete: makeGoogleAutocompleteItem,
  serpapi_g2: makeG2Item,
  serpapi_capterra: makeCapterraItem,
  trustpilot: makeTrustpilotItem,
  shopify_apps: makeShopifyAppsItem,
  chrome_webstore: makeChromeWebStoreItem,
  zapier: makeZapierItem,
  crunchbase: makeCrunchbaseItem,
  similarweb: makeSimilarWebItem,
  builtwith: makeBuiltWithItem,
  data_gouv: makeDataGouvItem,
  eu_ted: makeEUTedItem,
  boamp: makeBOAMPItem,
  job_boards: makeJobBoardItem,
  upwork: makeUpworkItem,
  malt: makeMaltItem,
  pricing_tracker: makePricingTrackerItem,
  betalist: makeBetaListItem,
  alternativeto: makeAlternativeToItem,
  acquire: makeAcquireItem,
  wellfound: makeWellfoundItem,
  dealroom: makeDealroomItem,
  open_startups: makeOpenStartupsItem,
  saashub: makeSaaSHubItem,
  starter_story: makeStarterStoryItem,
  appsumo: makeAppSumoItem,
  ycombinator: makeYCombinatorItem,
  pappers: makePappersItem,
  serpapi_serp: makeSerpAPISerpItem,
};
