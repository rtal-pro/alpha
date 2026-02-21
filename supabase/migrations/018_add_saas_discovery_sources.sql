-- ---------------------------------------------------------------------------
-- 018: Add SaaS-specialized discovery sources
-- ---------------------------------------------------------------------------

-- Extend scrape_source enum with new SaaS-specialized data sources
DO $$
BEGIN
  -- BetaList — early-stage startup discovery
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'betalist' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'betalist';
  END IF;

  -- AlternativeTo — software alternatives and demand signals
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'alternativeto' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'alternativeto';
  END IF;

  -- Acquire.com — SaaS businesses for sale (market exit signals)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'acquire' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'acquire';
  END IF;

  -- Wellfound — startup jobs and discovery
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'wellfound' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'wellfound';
  END IF;

  -- Dealroom — European startup funding database
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'dealroom' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'dealroom';
  END IF;

  -- Open Startups (Baremetrics) — public SaaS metrics
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'open_startups' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'open_startups';
  END IF;

  -- SaaSHub — SaaS comparison and trending tools
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'saashub' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'saashub';
  END IF;

  -- Starter Story — SaaS case studies with revenue data
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'starter_story' AND enumtypid = 'scrape_source'::regtype) THEN
    ALTER TYPE scrape_source ADD VALUE 'starter_story';
  END IF;
END $$;

-- Add partial index for market_exit signals from Acquire.com data
CREATE INDEX IF NOT EXISTS idx_signals_market_exit_acquire
  ON signals (category, strength DESC)
  WHERE signal_type = 'market_exit' AND source = 'acquire';

-- Add index for efficient querying of SaaS discovery sources
CREATE INDEX IF NOT EXISTS idx_raw_events_saas_discovery
  ON raw_events (source, scraped_at DESC)
  WHERE source IN ('betalist', 'alternativeto', 'acquire', 'wellfound', 'dealroom', 'open_startups', 'saashub', 'starter_story');
