-- Scheduled cron jobs via pg_cron

-- Refresh materialized views (staggered to avoid concurrent load)
select cron.schedule('refresh-product-scores', '0 5 * * *',
  'refresh materialized view concurrently mv_product_scores');

select cron.schedule('refresh-category-landscape', '5 5 * * *',
  'refresh materialized view concurrently mv_category_landscape');

select cron.schedule('refresh-metric-trends', '10 5 * * *',
  'refresh materialized view concurrently mv_metric_trends');

select cron.schedule('refresh-trajectories', '30 5 * * *',
  'refresh materialized view concurrently mv_opportunity_trajectories');

-- Opportunity rankings refresh hourly
select cron.schedule('refresh-opportunity-rankings', '0 * * * *',
  'refresh materialized view concurrently mv_opportunity_rankings');

-- Archive expired ideas daily at 6 AM
select cron.schedule('archive-expired-ideas', '0 6 * * *',
  'select archive_expired_ideas()');

-- Weekly digest notification trigger (Monday 8 AM)
-- Uses pg_net to call the scraper service webhook
select cron.schedule('weekly-digest', '0 8 * * 1',
  $$select net.http_post(
    url := current_setting('app.scraper_webhook_url') || '/api/digest',
    body := '{"trigger": "weekly_digest"}'::jsonb
  )$$
);
