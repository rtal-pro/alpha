-- Notification configuration and audit log
create table notification_config (
  id uuid primary key default gen_random_uuid(),
  immediate_threshold numeric default 85,
  regulatory_always boolean default true,
  digest_frequency text default 'weekly',
  digest_day int default 1,           -- 0=Sunday, 1=Monday
  digest_time text default '08:00',
  email text,
  webhook_url text,
  updated_at timestamptz default now()
);

-- Insert default config row
insert into notification_config (id) values (gen_random_uuid());

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,                 -- 'immediate', 'digest'
  trigger text,                       -- 'high_score', 'regulatory_alert', 'weekly_digest'
  opportunity_id uuid references opportunities(id),
  channel text not null,              -- 'email', 'webhook'
  payload jsonb,
  sent_at timestamptz default now(),
  delivered boolean default true
);

create index idx_notification_log_type on notification_log (type, sent_at desc);
create index idx_notification_log_opp on notification_log (opportunity_id)
  where opportunity_id is not null;
