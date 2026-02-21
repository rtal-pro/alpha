-- Feedback system tables for learning from user actions
create table feedback_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,  -- 'dismiss', 'save', 'explore', 'pursue', 'archive'
  opportunity_id uuid not null references opportunities(id),
  idea_id uuid references ideas(id),
  reason text,
  dismiss_category text,  -- 'market_too_small', 'too_competitive', 'not_my_expertise', etc.
  created_at timestamptz default now()
);

create index idx_feedback_opp on feedback_events (opportunity_id);
create index idx_feedback_type on feedback_events (type, created_at desc);
create index idx_feedback_dismiss on feedback_events (dismiss_category)
  where dismiss_category is not null;

-- Weight adjustments from feedback loop
create table weight_adjustments (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null,
  signal_type text not null,
  direction text not null,  -- 'up' or 'down'
  magnitude numeric not null,
  reason text,
  opportunity_id uuid references opportunities(id),
  created_at timestamptz default now()
);

create index idx_adjustments_domain on weight_adjustments (domain_id, signal_type);

-- Category-level temporary penalties (decay over time)
create table category_penalties (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  penalty_type text not null,
  magnitude numeric not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index idx_penalties_active on category_penalties (category)
  where expires_at > now();
create index idx_penalties_expires on category_penalties (expires_at);
