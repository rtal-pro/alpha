-- Raw scrape events — partitioned by source
create table raw_events (
  id uuid primary key default gen_random_uuid(),
  source scrape_source not null,
  source_entity_id text,
  source_url text,
  raw_payload jsonb not null,
  payload_format text not null default 'json',
  scrape_job_id uuid,
  scrape_method text not null,
  http_status int,
  search_params jsonb,
  scraped_at timestamptz not null default now(),
  source_published_at timestamptz
) partition by list (source);

-- Create one partition per source
do $$
declare
  src text;
begin
  for src in select unnest(enum_range(null::scrape_source)::text[])
  loop
    execute format(
      'create table if not exists raw_events_%s partition of raw_events for values in (%L)',
      replace(src, '_', ''),
      src
    );
  end loop;
end $$;

create index idx_raw_source_entity on raw_events (source, source_entity_id);
create index idx_raw_scraped_at on raw_events (scraped_at desc);

-- Job tracking
create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  source scrape_source not null,
  job_type text not null,
  search_params jsonb,
  status text not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  records_scraped int default 0,
  records_failed int default 0,
  error_log jsonb,
  created_at timestamptz default now()
);
