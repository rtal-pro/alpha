-- Opportunities (Finder output)
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  category text,
  description text,
  composite_score numeric,
  growth_score numeric,
  gap_score numeric,
  regulatory_score numeric,
  feasibility_score numeric,
  source_products uuid[] default '{}',
  source_signals uuid[] default '{}',
  source_regulations uuid[] default '{}',
  evidence_summary jsonb,
  status text default 'new',
  created_at timestamptz default now()
);

-- Analyses (Analyzer)
create table analyses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id),
  title text not null,
  idea_description text not null,
  preferences jsonb not null,
  status analysis_status default 'draft',
  total_cost_usd numeric default 0,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Analysis sections
create table analysis_sections (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  section_number int not null,
  section_key text not null,
  title text not null,
  output_json jsonb,
  output_markdown text,
  summary text,
  scraped_data_ids uuid[] default '{}',
  data_sources_used jsonb,
  data_quality_score numeric,
  confidence_score numeric,
  model_used text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  generation_count int default 0,
  status section_status default 'pending',
  user_edits jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  unique(analysis_id, section_number)
);

-- LLM usage tracking
create table llm_usage (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references analyses(id),
  section_number int,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric not null,
  attempt int default 1,
  created_at timestamptz default now()
);

-- Scraper health
create table scraper_health (
  source scrape_source primary key,
  last_success timestamptz,
  last_failure timestamptz,
  success_rate_7d numeric,
  avg_response_ms int,
  status text default 'unknown',
  breakage_type text,
  updated_at timestamptz default now()
);

-- Analysis progress (for realtime updates)
create table analysis_progress (
  analysis_id uuid not null references analyses(id) on delete cascade,
  section_number int not null,
  status text not null,
  progress int default 0,
  updated_at timestamptz default now(),
  primary key (analysis_id, section_number)
);

-- Row Level Security
alter table analyses enable row level security;
alter table analysis_sections enable row level security;
alter table opportunities enable row level security;

create policy "owner_all" on analyses for all using (true);
create policy "owner_all" on analysis_sections for all using (true);
create policy "owner_all" on opportunities for all using (true);
