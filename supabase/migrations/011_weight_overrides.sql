-- User manual overrides for signal weights per domain
create table weight_overrides (
  domain_id text not null,
  signal_type text not null,
  user_weight numeric not null,
  updated_at timestamptz default now(),
  primary key (domain_id, signal_type)
);
