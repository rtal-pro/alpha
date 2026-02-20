-- Category taxonomy management
create table category_synonyms (
  synonym text primary key,
  canonical text not null,
  confidence numeric default 1.0,
  source text default 'manual',  -- 'manual', 'detected', 'merged'
  created_at timestamptz default now()
);

create index idx_synonyms_canonical on category_synonyms (canonical);

-- Track category merges for audit
create table category_merges (
  id uuid primary key default gen_random_uuid(),
  old_category text not null,
  new_category text not null,
  reason text,
  tables_affected jsonb,  -- { "products": 12, "signals": 45, ... }
  merged_at timestamptz default now()
);
