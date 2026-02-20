-- Utility functions for the intelligence engine

-- Archive expired ideas
create or replace function archive_expired_ideas()
returns void
language sql as $$
  update ideas
  set status = 'stale'
  where status = 'active'
    and expires_at <= now();
$$;

-- Compute opportunity freshness based on last detection and signal recency
create or replace function compute_opportunity_freshness(opp_id uuid)
returns numeric
language sql stable as $$
  select
    case
      when o.expires_at is null then 1.0
      when o.expires_at <= now() then 0.0
      else greatest(0,
        extract(epoch from o.expires_at - now()) /
        nullif(extract(epoch from o.expires_at - o.created_at), 0)
      )
    end
  from opportunities o
  where o.id = opp_id;
$$;

-- Get active category penalties with remaining magnitude (linear decay)
create or replace function get_effective_penalties(target_category text)
returns table (penalty_type text, effective_magnitude numeric)
language sql stable as $$
  select
    cp.penalty_type,
    cp.magnitude * greatest(0,
      extract(epoch from cp.expires_at - now()) /
      nullif(extract(epoch from cp.expires_at - cp.created_at), 0)
    ) as effective_magnitude
  from category_penalties cp
  where cp.category = target_category
    and cp.expires_at > now();
$$;

-- Canonicalize a category name using the synonym table
create or replace function canonicalize_category(input_category text)
returns text
language sql stable as $$
  select coalesce(
    (select canonical from category_synonyms where synonym = lower(trim(input_category))),
    lower(trim(input_category))
  );
$$;

-- Upsert scraper health after a scrape job completes
create or replace function update_scraper_health(
  p_source scrape_source,
  p_success boolean,
  p_response_ms int default null,
  p_breakage_type text default null
)
returns void
language plpgsql as $$
begin
  insert into scraper_health (source, last_success, last_failure, success_rate_7d, avg_response_ms, status, breakage_type, updated_at)
  values (
    p_source,
    case when p_success then now() else null end,
    case when not p_success then now() else null end,
    case when p_success then 1.0 else 0.0 end,
    p_response_ms,
    case when p_success then 'healthy' else 'broken' end,
    p_breakage_type,
    now()
  )
  on conflict (source) do update set
    last_success = case when p_success then now() else scraper_health.last_success end,
    last_failure = case when not p_success then now() else scraper_health.last_failure end,
    avg_response_ms = coalesce(p_response_ms, scraper_health.avg_response_ms),
    status = case
      when p_success then 'healthy'
      when not p_success and scraper_health.status = 'healthy' then 'degraded'
      else 'broken'
    end,
    breakage_type = coalesce(p_breakage_type, scraper_health.breakage_type),
    updated_at = now();
end;
$$;
