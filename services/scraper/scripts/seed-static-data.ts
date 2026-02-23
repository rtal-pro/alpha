#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// Seed static data: EU regulations for the regulatory gap opportunity path
// Usage: npx tsx scripts/seed-static-data.ts
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// EU Regulations
// ---------------------------------------------------------------------------

const REGULATIONS = [
  {
    title: 'Digital Operational Resilience Act',
    short_name: 'DORA',
    jurisdiction: 'EU',
    domain: 'financial_services',
    affected_sectors: ['fintech', 'banking', 'insurance', 'investment'],
    effective_date: '2023-01-16',
    transition_deadline: '2025-01-17',
    mandatory: true,
    forced_adoption: true,
    summary: 'Requires financial entities to implement comprehensive ICT risk management, incident reporting, resilience testing, and third-party risk management.',
    requirements: [
      'ICT risk management framework',
      'Incident reporting within 4 hours',
      'Digital resilience testing (TLPT)',
      'Third-party provider oversight',
      'Information sharing arrangements',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554'],
    market_impact_score: 85,
    urgency_score: 95,
    categories: [
      { category: 'fintech', impact_type: 'compliance_tooling' },
      { category: 'cybersecurity', impact_type: 'monitoring_required' },
      { category: 'compliance_legal', impact_type: 'audit_automation' },
    ],
  },
  {
    title: 'Network and Information Security Directive 2',
    short_name: 'NIS2',
    jurisdiction: 'EU',
    domain: 'cybersecurity',
    affected_sectors: ['critical_infrastructure', 'digital_services', 'healthcare', 'energy', 'transport'],
    effective_date: '2023-01-16',
    transition_deadline: '2024-10-18',
    mandatory: true,
    forced_adoption: true,
    summary: 'Expands cybersecurity requirements to more sectors, introduces stricter incident reporting, and imposes personal liability on management.',
    requirements: [
      'Cybersecurity risk management measures',
      '24-hour incident reporting',
      'Supply chain security',
      'Business continuity management',
      'Management body accountability',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555'],
    market_impact_score: 90,
    urgency_score: 100,
    categories: [
      { category: 'cybersecurity', impact_type: 'compliance_tooling' },
      { category: 'compliance_legal', impact_type: 'risk_assessment' },
      { category: 'devtools', impact_type: 'security_monitoring' },
    ],
  },
  {
    title: 'EU Artificial Intelligence Act',
    short_name: 'EU AI Act',
    jurisdiction: 'EU',
    domain: 'artificial_intelligence',
    affected_sectors: ['ai_ml', 'healthcare', 'fintech', 'hr_tech', 'education'],
    effective_date: '2024-08-01',
    transition_deadline: '2026-08-01',
    mandatory: true,
    forced_adoption: true,
    summary: 'Risk-based framework for AI systems. High-risk AI needs conformity assessments, transparency, human oversight. Bans certain AI practices.',
    requirements: [
      'AI risk classification',
      'Conformity assessment for high-risk AI',
      'Transparency requirements for generative AI',
      'Human oversight mechanisms',
      'AI literacy training for operators',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689'],
    market_impact_score: 95,
    urgency_score: 80,
    categories: [
      { category: 'ai_ml', impact_type: 'compliance_tooling' },
      { category: 'compliance_legal', impact_type: 'risk_assessment' },
      { category: 'hr_tech', impact_type: 'bias_detection' },
      { category: 'healthcare', impact_type: 'safety_certification' },
    ],
  },
  {
    title: 'Corporate Sustainability Reporting Directive',
    short_name: 'CSRD',
    jurisdiction: 'EU',
    domain: 'sustainability',
    affected_sectors: ['general_saas', 'fintech', 'compliance_legal'],
    effective_date: '2024-01-01',
    transition_deadline: '2026-01-01',
    mandatory: true,
    forced_adoption: true,
    summary: 'Requires companies to report on ESG impacts using European Sustainability Reporting Standards (ESRS). Affects ~50,000 companies.',
    requirements: [
      'Double materiality assessment',
      'ESG data collection and reporting',
      'Third-party assurance',
      'Digital tagging (XBRL)',
      'Supply chain due diligence data',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2464'],
    market_impact_score: 75,
    urgency_score: 70,
    categories: [
      { category: 'compliance_legal', impact_type: 'reporting_automation' },
      { category: 'analytics', impact_type: 'data_collection' },
    ],
  },
  {
    title: 'French E-Invoicing Mandate',
    short_name: 'e-Invoicing FR',
    jurisdiction: 'FR',
    domain: 'invoicing',
    affected_sectors: ['fintech', 'accounting', 'ecommerce'],
    effective_date: '2024-09-01',
    transition_deadline: '2026-09-01',
    mandatory: true,
    forced_adoption: true,
    summary: 'All French B2B transactions must use electronic invoicing via certified platforms (PDP). Phased rollout from large to small companies.',
    requirements: [
      'E-invoicing via PDP or PPF',
      'Structured formats (Factur-X, UBL, CII)',
      'E-reporting of cross-border transactions',
      'Real-time reporting to tax authority',
      'Digital archiving for 10 years',
    ],
    source_urls: ['https://www.impots.gouv.fr/facturation-electronique'],
    market_impact_score: 80,
    urgency_score: 85,
    categories: [
      { category: 'fintech', impact_type: 'invoicing_platform' },
      { category: 'compliance_legal', impact_type: 'tax_reporting' },
      { category: 'ecommerce', impact_type: 'invoicing_integration' },
    ],
  },
  {
    title: 'European Health Data Space',
    short_name: 'EHDS',
    jurisdiction: 'EU',
    domain: 'healthcare',
    affected_sectors: ['healthcare', 'healthtech', 'data_analytics'],
    effective_date: '2025-01-01',
    transition_deadline: '2028-01-01',
    mandatory: true,
    forced_adoption: true,
    summary: 'Creates a unified framework for health data access and sharing across the EU. Enables primary use (patient care) and secondary use (research).',
    requirements: [
      'EHR interoperability standards',
      'Patient data portability',
      'Secondary use data access framework',
      'Health data governance',
      'Cross-border data exchange infrastructure',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=COM:2022:197:FIN'],
    market_impact_score: 70,
    urgency_score: 40,
    categories: [
      { category: 'healthcare', impact_type: 'data_platform' },
      { category: 'compliance_legal', impact_type: 'data_governance' },
    ],
  },
  {
    title: 'Digital Markets Act',
    short_name: 'DMA',
    jurisdiction: 'EU',
    domain: 'digital_services',
    affected_sectors: ['general_saas', 'ecommerce', 'marketing', 'devtools'],
    effective_date: '2022-11-01',
    transition_deadline: '2024-03-06',
    mandatory: true,
    forced_adoption: true,
    summary: 'Imposes obligations on "gatekeeper" platforms (Apple, Google, Meta, Amazon, Microsoft, ByteDance) to ensure fair competition and interoperability.',
    requirements: [
      'Interoperability of messaging services',
      'Data portability for end users',
      'Fair access to app stores',
      'No self-preferencing in search results',
      'Allow third-party payment systems',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R1925'],
    market_impact_score: 85,
    urgency_score: 90,
    categories: [
      { category: 'general_saas', impact_type: 'interoperability' },
      { category: 'ecommerce', impact_type: 'marketplace_access' },
      { category: 'devtools', impact_type: 'api_access' },
    ],
  },
  {
    title: 'Cyber Resilience Act',
    short_name: 'CRA',
    jurisdiction: 'EU',
    domain: 'cybersecurity',
    affected_sectors: ['devtools', 'cybersecurity', 'general_saas'],
    effective_date: '2024-12-10',
    transition_deadline: '2027-12-11',
    mandatory: true,
    forced_adoption: true,
    summary: 'Requires cybersecurity requirements for products with digital elements. Covers IoT devices, software, and connected hardware throughout their lifecycle.',
    requirements: [
      'Security by design and default',
      'Vulnerability handling and disclosure',
      'Software bill of materials (SBOM)',
      'Security updates for product lifetime',
      'Conformity assessment',
    ],
    source_urls: ['https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2847'],
    market_impact_score: 75,
    urgency_score: 50,
    categories: [
      { category: 'cybersecurity', impact_type: 'product_security' },
      { category: 'devtools', impact_type: 'sbom_tooling' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding regulations...\n');

  let inserted = 0;
  let skipped = 0;

  for (const reg of REGULATIONS) {
    const { categories, ...regData } = reg;

    // Check if already exists
    const { data: existing } = await supabase
      .from('regulations')
      .select('id')
      .eq('short_name', regData.short_name)
      .maybeSingle();

    if (existing) {
      console.log(`  [skip] ${regData.short_name} already exists`);
      skipped++;
      continue;
    }

    // Insert regulation
    const { data: regRow, error: regErr } = await supabase
      .from('regulations')
      .insert(regData)
      .select('id')
      .single();

    if (regErr) {
      console.error(`  [error] ${regData.short_name}: ${regErr.message}`);
      continue;
    }

    // Insert regulation_categories
    if (regRow && categories.length > 0) {
      const catRows = categories.map((c) => ({
        regulation_id: regRow.id,
        category: c.category,
        impact_type: c.impact_type,
      }));

      const { error: catErr } = await supabase
        .from('regulation_categories')
        .insert(catRows);

      if (catErr) {
        console.error(`  [warn] ${regData.short_name} categories: ${catErr.message}`);
      }
    }

    console.log(`  [ok] ${regData.short_name} (${categories.length} categories)`);
    inserted++;
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
