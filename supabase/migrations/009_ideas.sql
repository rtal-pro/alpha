-- Ideas table — generated product concepts with TTL lifecycle
create type idea_status as enum (
  'draft', 'active', 'stale', 'refreshing', 'archived', 'pursued'
);

create table ideas (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  title text not null,
  one_liner text,
  target_persona text,
  core_features text[] default '{}',
  differentiation text,
  entry_strategy text,
  estimated_complexity text,
  revenue_model text,
  why_now text,
  status idea_status default 'active',
  freshness numeric generated always as (
    case
      when expires_at is null then 1.0
      when expires_at <= now() then 0.0
      else greatest(0, extract(epoch from expires_at - now()) / extract(epoch from expires_at - created_at))
    end
  ) stored,
  expires_at timestamptz not null,
  refresh_history jsonb default '[]',
  model_used text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric,
  created_at timestamptz default now(),
  refreshed_at timestamptz
);

create index idx_ideas_opportunity on ideas (opportunity_id);
create index idx_ideas_status on ideas (status);
create index idx_ideas_freshness on ideas (freshness) where status = 'active';
create index idx_ideas_expires on ideas (expires_at) where status = 'active';
