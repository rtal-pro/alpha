-- ---------------------------------------------------------------------------
-- Extend signal_type enum with new detection capabilities
-- ---------------------------------------------------------------------------

-- New signal types for expanded detection
alter type signal_type add value if not exists 'api_deprecation';
alter type signal_type add value if not exists 'funding_surge';
alter type signal_type add value if not exists 'regulatory_deadline';
alter type signal_type add value if not exists 'market_consolidation';
alter type signal_type add value if not exists 'emerging_tech_adoption';

-- Extend scrape_source enum with sources added after initial migration
alter type scrape_source add value if not exists 'twitter';
alter type scrape_source add value if not exists 'stackoverflow';
alter type scrape_source add value if not exists 'job_boards';
alter type scrape_source add value if not exists 'trustpilot';
alter type scrape_source add value if not exists 'shopify_apps';
alter type scrape_source add value if not exists 'chrome_webstore';
alter type scrape_source add value if not exists 'zapier';
alter type scrape_source add value if not exists 'similarweb';
alter type scrape_source add value if not exists 'builtwith';
alter type scrape_source add value if not exists 'eu_ted';
alter type scrape_source add value if not exists 'boamp';
alter type scrape_source add value if not exists 'upwork';
alter type scrape_source add value if not exists 'malt';
alter type scrape_source add value if not exists 'pricing_tracker';

-- ---------------------------------------------------------------------------
-- Add opportunity type column for new generation paths if not exists
-- ---------------------------------------------------------------------------

-- Ensure opportunities.type supports the new path names
-- (type is text, not enum, so no alter needed — just document the valid values)
comment on column opportunities.type is
  'Opportunity detection path: geo_gap, regulatory_gap, convergence, competitor_weakness, '
  'api_sunset_gap, funding_follows_pain, talent_migration, platform_risk';

-- ---------------------------------------------------------------------------
-- Add index for the new signal types for efficient querying
-- ---------------------------------------------------------------------------

create index if not exists idx_signals_api_deprecation
  on signals (category, strength)
  where signal_type = 'api_deprecation';

create index if not exists idx_signals_funding_surge
  on signals (category, strength)
  where signal_type = 'funding_surge';

create index if not exists idx_signals_regulatory_deadline
  on signals (category, strength)
  where signal_type = 'regulatory_deadline';

create index if not exists idx_signals_market_consolidation
  on signals (category, strength)
  where signal_type = 'market_consolidation';

create index if not exists idx_signals_emerging_tech
  on signals (category, strength)
  where signal_type = 'emerging_tech_adoption';
