// ---------------------------------------------------------------------------
// Shared Domain Category Mapper — single source of truth for normalizing
// source-specific categories into canonical domain categories.
//
// Two-step resolution:
//   1. Direct synonym lookup from source-specific names
//   2. Keyword regex fallback scanning title + description text
//   3. Default: 'general_saas'
// ---------------------------------------------------------------------------

export const CANONICAL_CATEGORIES = [
  'general_saas',
  'fintech',
  'ecommerce',
  'hr_tech',
  'marketing',
  'devtools',
  'cybersecurity',
  'healthcare',
  'ai_ml',
  'compliance_legal',
  'analytics',
  'education',
  'infrastructure',
  'automation',
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Step 1: Direct synonym lookup
// ---------------------------------------------------------------------------

const SYNONYM_MAP: Record<string, CanonicalCategory> = {
  // Source-specific tags from scrapers
  hacker_news: 'general_saas',
  reddit: 'general_saas',
  indiehackers: 'general_saas',
  twitter: 'general_saas',
  stackoverflow: 'devtools',
  reviews: 'general_saas',
  producthunt: 'general_saas',
  betalist: 'general_saas',
  'starter_story': 'general_saas',
  acquire: 'general_saas',
  alternativeto: 'general_saas',
  saashub: 'general_saas',
  github: 'devtools',
  trustpilot: 'general_saas',

  // Intent-based categories from google autocomplete
  'intent:general': 'general_saas',
  'intent:comparison': 'general_saas',
  'intent:pricing': 'general_saas',
  'intent:problem': 'general_saas',
  'intent:integration': 'devtools',
  'intent:alternative': 'general_saas',

  // Subreddit-derived categories
  saas: 'general_saas',
  startups: 'general_saas',
  entrepreneur: 'general_saas',
  microsaas: 'general_saas',
  smallbusiness: 'general_saas',
  webdev: 'devtools',
  javascript: 'devtools',
  reactjs: 'devtools',
  node: 'devtools',
  programming: 'devtools',
  devops: 'devtools',
  selfhosted: 'devtools',
  fintech: 'fintech',
  personalfinance: 'fintech',
  ecommerce: 'ecommerce',
  digital_marketing: 'marketing',
  legaladvice: 'compliance_legal',
  healthcare: 'healthcare',
  realestateinvesting: 'general_saas',
  edtech: 'education',

  // Technical categories from OSS detector
  databases: 'devtools',
  monitoring: 'devtools',
  ci_cd: 'devtools',
  api_tools: 'devtools',
  testing: 'devtools',
  authentication: 'cybersecurity',
  'ci/cd': 'devtools',

  // Non-canonical categories that need mapping
  crm: 'general_saas',
  invoicing: 'fintech',
  project_management: 'general_saas',
  collaboration: 'general_saas',
  social_api: 'devtools',
  communication: 'general_saas',
  data_analytics: 'analytics',
  real_estate: 'general_saas',

  // Common raw categories
  uncategorized: 'general_saas',
  unknown: 'general_saas',
  general: 'general_saas',
};

// ---------------------------------------------------------------------------
// Step 2: Keyword regex fallback
// ---------------------------------------------------------------------------

const KEYWORD_PATTERNS: Array<{ pattern: RegExp; category: CanonicalCategory }> = [
  { pattern: /\b(fintech|payment|banking|lending|neobank|insurtech|invoice|accounting|billing|defi|crypto)\b/i, category: 'fintech' },
  { pattern: /\b(ecommerce|e-commerce|shopify|marketplace|retail|d2c|magento|woocommerce)\b/i, category: 'ecommerce' },
  { pattern: /\b(hr|human.?resource|recruit|payroll|talent|workforce|hiring)\b/i, category: 'hr_tech' },
  { pattern: /\b(marketing|martech|seo|email.?campaign|advertising|growth.?hack|content.?market)\b/i, category: 'marketing' },
  { pattern: /\b(devops|ci.?cd|deploy|monitoring|kubernetes|docker|developer.?tool|api|sdk|infrastructure|platform.?engineer|github|gitlab)\b/i, category: 'devtools' },
  { pattern: /\b(cyber|security|zero.?trust|siem|identity|pentest|vulnerability|soc|auth|oauth|sso)\b/i, category: 'cybersecurity' },
  { pattern: /\b(health|medical|telemedicine|clinical|pharma|biotech|digital.?health)\b/i, category: 'healthcare' },
  { pattern: /\b(ai|artificial.?intelligence|machine.?learning|llm|gpt|generative|deep.?learning|nlp|vector|chatbot)\b/i, category: 'ai_ml' },
  { pattern: /\b(compliance|gdpr|rgpd|privacy|legal.?tech|regtech|audit|risk)\b/i, category: 'compliance_legal' },
  { pattern: /\b(analytics|bi|business.?intelligence|dashboard|reporting|data.?engineer|data.?platform)\b/i, category: 'analytics' },
  { pattern: /\b(education|edtech|learning|training|lms|e-learning)\b/i, category: 'education' },
  { pattern: /\b(cloud|aws|azure|gcp|server|hosting|cdn|queue|message|kafka|stream)\b/i, category: 'infrastructure' },
  { pattern: /\b(automation|workflow|rpa|no-code|low-code|integration|zapier)\b/i, category: 'automation' },
];

// ---------------------------------------------------------------------------
// resolveCategory()
// ---------------------------------------------------------------------------

/**
 * Resolve source-specific categories into a canonical domain category.
 *
 * @param sourceCategories - Raw category strings from scraper item
 * @param text - Optional title + description text for keyword fallback
 * @returns A canonical category string
 */
export function resolveCategory(
  sourceCategories: string[],
  text?: string,
): CanonicalCategory {
  let bestSynonym: CanonicalCategory | null = null;

  // Step 1: Try direct synonym lookup on each source category
  for (const raw of sourceCategories) {
    const cleaned = raw.replace(/^r\//, '').toLowerCase().trim();

    // Check if it's already a specific canonical category
    if (CANONICAL_CATEGORIES.includes(cleaned as CanonicalCategory)) {
      if (cleaned !== 'general_saas') return cleaned as CanonicalCategory;
      bestSynonym ??= cleaned as CanonicalCategory;
      continue;
    }

    // Check synonym map — only short-circuit for specific categories
    const mapped = SYNONYM_MAP[cleaned];
    if (mapped && mapped !== 'general_saas') return mapped;
    if (mapped) bestSynonym ??= mapped;
  }

  // Step 2: Keyword regex fallback on text
  if (text) {
    for (const { pattern, category } of KEYWORD_PATTERNS) {
      if (pattern.test(text)) return category;
    }
  }

  // Step 3: Try keyword fallback on the category strings themselves
  for (const raw of sourceCategories) {
    for (const { pattern, category } of KEYWORD_PATTERNS) {
      if (pattern.test(raw)) return category;
    }
  }

  // Return the best synonym if we found one, or default
  return bestSynonym ?? 'general_saas';
}
