-- Enhance opportunities table with dedup, scoring trajectory, and embedding support
alter table opportunities add column if not exists type text;
alter table opportunities add column if not exists score_history jsonb default '[]';
alter table opportunities add column if not exists last_detected_at timestamptz default now();
alter table opportunities add column if not exists detection_count int default 1;
alter table opportunities add column if not exists embedding vector(1536);
alter table opportunities add column if not exists target_geo text;
alter table opportunities add column if not exists reference_geo text;
alter table opportunities add column if not exists regulation_id uuid references regulations(id);
alter table opportunities add column if not exists freshness numeric;
alter table opportunities add column if not exists expires_at timestamptz;

create index if not exists idx_opportunities_embedding
  on opportunities using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create index if not exists idx_opportunities_type on opportunities (type);
create index if not exists idx_opportunities_score on opportunities (composite_score desc nulls last);
create index if not exists idx_opportunities_status on opportunities (status);
create index if not exists idx_opportunities_category on opportunities (category);

-- Similarity search function for dedup
create or replace function match_opportunities(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  exclude_statuses text[]
) returns table (
  id uuid,
  category text,
  title text,
  composite_score numeric,
  similarity float
)
language sql stable as $$
  select id, category, title, composite_score,
    1 - (embedding <=> query_embedding) as similarity
  from opportunities
  where status != all(exclude_statuses)
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
