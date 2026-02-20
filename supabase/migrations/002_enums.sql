create type scrape_source as enum (
  'reddit', 'producthunt', 'github', 'google_trends', 'hacker_news',
  'crunchbase', 'appsumo', 'indiehackers', 'ycombinator',
  'eurlex', 'legifrance', 'insee', 'data_gouv',
  'pappers', 'serpapi_g2', 'serpapi_capterra', 'serpapi_serp',
  'google_autocomplete'
);

create type product_maturity as enum (
  'idea', 'mvp', 'early', 'growth', 'mature', 'declining', 'dead'
);

create type business_model_type as enum (
  'saas_subscription', 'saas_usage', 'marketplace', 'api',
  'freemium', 'open_core', 'one_time', 'hybrid'
);

create type form_factor_type as enum (
  'web', 'mobile', 'desktop', 'api', 'browser_extension', 'cli', 'embedded', 'multi'
);

create type signal_type as enum (
  'product_launch', 'funding_round', 'traffic_spike', 'review_surge',
  'community_buzz', 'regulatory_event', 'oss_traction', 'company_registration',
  'pricing_change', 'pain_point_cluster', 'search_trend', 'market_entry', 'market_exit'
);

create type analysis_status as enum (
  'draft', 'running', 'paused', 'completed', 'failed'
);

create type section_status as enum (
  'pending', 'scraping', 'generating', 'generated', 'edited', 'locked', 'skipped', 'failed'
);

create type gap_type as enum (
  'no_local_player', 'weak_local_player', 'no_localization', 'regulatory_gap', 'pricing_gap'
);
