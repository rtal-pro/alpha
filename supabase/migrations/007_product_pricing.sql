-- Product pricing snapshots with temporal validity
create table product_pricing (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  plan_name text not null,
  price_monthly numeric,
  price_yearly numeric,
  currency text default 'USD',
  features text[] default '{}',
  limits jsonb,
  source scrape_source not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  raw_event_id uuid
);

create index idx_pricing_product on product_pricing (product_id, valid_from desc);
create index idx_pricing_active on product_pricing (product_id) where valid_to is null;
