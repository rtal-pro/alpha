-- Materialized views for precomputed aggregates

-- 1. Product scorecards with pivoted metrics
create materialized view mv_product_scores as
select
  p.id,
  p.canonical_name,
  p.primary_category,
  p.maturity,
  p.hq_country,
  p.is_active,
  coalesce(
    (select metric_value from product_metrics pm
     where pm.product_id = p.id and pm.metric_key = 'monthly_traffic'
     order by pm.observed_at desc limit 1),
    0
  ) as latest_traffic,
  coalesce(
    (select avg(r.sentiment_score) from reviews r where r.product_id = p.id),
    0
  ) as avg_sentiment,
  coalesce(
    (select count(*) from reviews r where r.product_id = p.id),
    0
  ) as review_count,
  coalesce(
    (select count(*) from signals s where s.product_id = p.id),
    0
  ) as signal_count,
  p.first_seen_at,
  p.last_updated_at
from products p
where p.is_active = true;

create unique index on mv_product_scores (id);

-- 2. Category landscape aggregates
create materialized view mv_category_landscape as
select
  p.primary_category as category,
  count(distinct p.id) as product_count,
  count(distinct p.id) filter (where p.hq_country = 'FR') as fr_product_count,
  count(distinct p.id) filter (where p.hq_country = 'US') as us_product_count,
  avg(ps.latest_traffic) as avg_traffic,
  avg(ps.avg_sentiment) as avg_sentiment,
  coalesce(
    (select count(*) from signals s where s.category = p.primary_category),
    0
  ) as total_signals,
  coalesce(
    (select max(gg.gap_score) from geo_gaps gg where gg.category = p.primary_category and gg.target_geo = 'FR'),
    0
  ) as max_fr_gap_score,
  coalesce(
    (select count(*) from regulations reg
     join regulation_categories rc on rc.regulation_id = reg.id
     where rc.category = p.primary_category
       and reg.transition_deadline > now()),
    0
  ) as active_regulation_count
from products p
left join mv_product_scores ps on ps.id = p.id
group by p.primary_category
having count(distinct p.id) > 0;

create unique index on mv_category_landscape (category);

-- 3. Weekly metric trends with WoW and MoM change
create materialized view mv_metric_trends as
with weekly as (
  select
    product_id,
    metric_key,
    date_trunc('week', observed_at) as week,
    avg(metric_value) as avg_value,
    count(*) as data_points
  from product_metrics
  where observed_at > now() - interval '90 days'
  group by product_id, metric_key, date_trunc('week', observed_at)
)
select
  w.product_id,
  w.metric_key,
  w.week,
  w.avg_value,
  w.data_points,
  w.avg_value - lag(w.avg_value) over (partition by w.product_id, w.metric_key order by w.week) as wow_change,
  w.avg_value - lag(w.avg_value, 4) over (partition by w.product_id, w.metric_key order by w.week) as mom_change
from weekly w;

create unique index on mv_metric_trends (product_id, metric_key, week);

-- 4. Opportunity rankings (global and per-category)
create materialized view mv_opportunity_rankings as
select
  o.id,
  o.title,
  o.category,
  o.type,
  o.composite_score,
  o.status,
  o.detection_count,
  o.last_detected_at,
  rank() over (order by o.composite_score desc nulls last) as global_rank,
  rank() over (partition by o.category order by o.composite_score desc nulls last) as category_rank
from opportunities o
where o.status not in ('archived', 'dismissed');

create unique index on mv_opportunity_rankings (id);

-- 5. Opportunity score trajectories
create materialized view mv_opportunity_trajectories as
with history_expanded as (
  select
    o.id,
    o.title,
    o.category,
    o.composite_score as current_score,
    (h.elem->>'score')::numeric as historical_score,
    (h.elem->>'timestamp')::timestamptz as score_timestamp,
    h.ordinality
  from opportunities o,
    lateral jsonb_array_elements(o.score_history) with ordinality as h(elem, ordinality)
  where o.status not in ('archived', 'dismissed')
    and jsonb_array_length(o.score_history) > 0
),
trajectory as (
  select
    he.id,
    max(he.current_score) as current_score,
    (select he2.historical_score
     from history_expanded he2
     where he2.id = he.id
       and he2.score_timestamp < now() - interval '7 days'
     order by he2.score_timestamp desc limit 1
    ) as score_7d_ago,
    (select he2.historical_score
     from history_expanded he2
     where he2.id = he.id
       and he2.score_timestamp < now() - interval '30 days'
     order by he2.score_timestamp desc limit 1
    ) as score_30d_ago,
    count(*) as data_points
  from history_expanded he
  group by he.id
)
select
  t.id,
  t.current_score,
  t.score_7d_ago,
  t.score_30d_ago,
  t.current_score - coalesce(t.score_7d_ago, t.current_score) as delta_7d,
  t.current_score - coalesce(t.score_30d_ago, t.current_score) as delta_30d,
  case
    when t.current_score - coalesce(t.score_30d_ago, t.current_score) > 10 then 'rising'
    when t.current_score - coalesce(t.score_30d_ago, t.current_score) < -10 then 'falling'
    else 'stable'
  end as trajectory,
  t.data_points
from trajectory t;

create unique index on mv_opportunity_trajectories (id);
