-- Extensions required for the SaaS Idea Engine
create extension if not exists "uuid-ossp";
create extension if not exists "vector";       -- pgvector for semantic search
create extension if not exists "pg_trgm";      -- Fuzzy text search
create extension if not exists "pg_cron";      -- Scheduled jobs
