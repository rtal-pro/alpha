-- Products (deduplicated across sources)
create table products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  slug text unique not null,
  description text,
  tagline text,
  website_url text,
  primary_category text not null,
  secondary_categories text[] default '{}',
  tags text[] default '{}',
  business_model business_model_type,
  form_factor form_factor_type,
  maturity product_maturity,
  hq_country text,
  available_geos text[] default '{}',
  source_ids jsonb not null default '{}',
  embedding vector(1536),
  first_seen_at timestamptz default now(),
  last_updated_at timestamptz default now(),
  is_active boolean default true
);

create index idx_products_category on products (primary_category);
create index idx_products_tags on products using gin (tags);
create index idx_products_geo on products using gin (available_geos);
create index idx_products_embedding on products using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index idx_products_name_trgm on products using gin (canonical_name gin_trgm_ops);

-- Product metrics (time-series)
create table product_metrics (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  source scrape_source not null,
  metric_key text not null,
  metric_value numeric not null,
  observed_at timestamptz not null,
  raw_event_id uuid
);

create index idx_metrics_product_key_time on product_metrics (product_id, metric_key, observed_at desc);
create index idx_metrics_key_time on product_metrics (metric_key, observed_at desc);

-- Reviews & sentiment
create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  source scrape_source not null,
  source_review_id text,
  title text,
  body text,
  rating numeric,
  sentiment_score numeric,
  pain_points text[] default '{}',
  praise_points text[] default '{}',
  author_role text,
  published_at timestamptz,
  raw_event_id uuid
);

create index idx_reviews_product on reviews (product_id, source);
create index idx_reviews_pain on reviews using gin (pain_points);

-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siren text,
  nace_code text,
  legal_form text,
  country text,
  city text,
  funding_total numeric,
  employee_estimate int,
  website_url text,
  product_id uuid references products(id),
  source_ids jsonb default '{}',
  first_seen_at timestamptz default now()
);

create index idx_companies_siren on companies (siren) where siren is not null;
create index idx_companies_nace on companies (nace_code);

-- Regulations
create table regulations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_name text unique,
  jurisdiction text not null,
  domain text not null,
  affected_sectors text[] default '{}',
  effective_date date,
  transition_deadline date,
  mandatory boolean not null default false,
  forced_adoption boolean not null default false,
  summary text,
  requirements text[] default '{}',
  source_urls text[] default '{}',
  market_impact_score numeric,
  urgency_score numeric,
  created_at timestamptz default now()
);

create index idx_regulations_domain on regulations (domain);
create index idx_regulations_deadline on regulations (transition_deadline);

create table regulation_categories (
  regulation_id uuid not null references regulations(id) on delete cascade,
  category text not null,
  impact_type text not null,
  primary key (regulation_id, category)
);

-- Market signals
create table signals (
  id uuid primary key default gen_random_uuid(),
  signal_type signal_type not null,
  product_id uuid references products(id),
  company_id uuid references companies(id),
  regulation_id uuid references regulations(id),
  category text,
  title text not null,
  description text,
  strength numeric not null,
  geo_relevance text[] default '{}',
  source scrape_source not null,
  source_url text,
  occurred_at timestamptz not null,
  detected_at timestamptz default now(),
  raw_event_id uuid
);

create index idx_signals_type_time on signals (signal_type, occurred_at desc);
create index idx_signals_product on signals (product_id, occurred_at desc);
create index idx_signals_category on signals (category, occurred_at desc);
create index idx_signals_strength on signals (strength desc);

-- Keywords & search data
create table keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  geo text not null,
  monthly_volume int,
  competition text,
  trend_direction text,
  trend_slope numeric,
  related_keywords text[] default '{}',
  product_category text,
  observed_at timestamptz not null,
  raw_event_id uuid,
  unique(keyword, geo, observed_at)
);

create index idx_keywords_category on keywords (product_category, geo);
create index idx_keywords_volume on keywords (monthly_volume desc nulls last);

-- Geo gaps (precomputed)
create table geo_gaps (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  reference_geo text not null,
  target_geo text not null,
  reference_product_count int,
  target_product_count int,
  gap_score numeric not null,
  gap_type gap_type,
  gap_evidence jsonb,
  regulatory_boost numeric default 0,
  opportunity_score numeric,
  computed_at timestamptz default now()
);

create index idx_gaps_score on geo_gaps (target_geo, opportunity_score desc);
