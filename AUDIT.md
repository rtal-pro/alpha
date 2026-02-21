# Project Audit Report — SaaS Idea Engine

**Date:** 2026-02-21
**Branch Audited:** `claude/saas-idea-engine-D2G99` (11 commits, 191 files, 27,310 lines)
**Auditor:** Automated deep audit (architecture, security, database, dependencies, code quality)

---

## Executive Summary

The **SaaS Idea Engine** is a sophisticated signal-based intelligence platform that scrapes 40+ data sources, detects market signals, generates business opportunities, and runs LLM-powered analysis. It uses a Turborepo monorepo with Next.js frontend, Fastify scraper service, Supabase database, and Anthropic Claude for AI analysis.

### Overall Scores

| Area | Score | Verdict |
|------|-------|---------|
| Architecture | **7.5/10** | Solid design patterns, good separation of concerns |
| Database | **7.5/10** | Sophisticated schema, missing constraints and RLS |
| Code Quality | **7/10** | Strong TypeScript, good patterns, high duplication |
| Security | **3/10** | Critical auth and RLS gaps, prompt injection risk |
| Dependencies | **6/10** | Functional but missing lockfile and a dependency |
| Testing | **0/10** | Zero tests in entire codebase |
| Deployment | **4/10** | Dockerfile exists, no CI/CD or orchestration |
| Documentation | **2/10** | README is empty, no API docs |

### Risk Assessment

- **2 CRITICAL** security findings
- **4 HIGH** severity issues
- **4 MEDIUM** severity issues
- **5 LOW** severity issues
- **0 tests** in 27,310 lines of code

---

## 1. Architecture

### Structure
```
alpha/
├── apps/web/              # Next.js 14 frontend (React 18, TailwindCSS)
├── packages/
│   ├── shared/            # Types, constants, section configs
│   ├── db/                # Supabase client & query helpers
│   ├── llm/               # Anthropic Claude client & analysis pipeline
│   └── scoring/           # Opportunity & data quality scoring
├── services/scraper/      # Fastify service (40 scrapers, signal detection, pipeline)
└── supabase/              # 18 database migrations
```

### Intelligence Pipeline
```
Scrape (40 sources) → Transform → Detect Signals (13 detectors)
→ Cross-Reference (domain rules) → Generate Opportunities (8 paths)
→ Deduplicate (3-layer) → LLM Enrich → Persist
```

### 8 Opportunity Paths
1. Geo Gap — product strong abroad, weak in target market
2. Regulatory Gap — forced-adoption regulation, no local solution
3. Convergence — 4+ signal types in same category
4. Competitor Weakness — local product declining + pain growing
5. API Sunset Gap — deprecated APIs with no migration
6. Funding Follows Pain — funding round + pain point convergence
7. Talent Migration — developer migration to new stack
8. Platform Risk — platform changes threatening services

### Strengths
- Well-structured Turborepo monorepo with clear package boundaries
- Domain-driven design with 10 predefined domain profiles (Fintech, DevTools, etc.)
- Layered data model: Raw → Normalized → Signals → Opportunities → Ideas
- Zod-based validation at service boundaries
- Base class patterns for scrapers, transformers, signal detectors

### Concerns
- Single database dependency (no offline/fallback mode)
- Only 1 of 18 LLM analysis sections implemented
- No circular dependency detection in section DAG
- Tight coupling to Supabase SDK (no repository abstraction)

---

## 2. Security Findings

### CRITICAL

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S1 | **RLS policies allow all access** — `using (true)` on analyses, sections, opportunities | `supabase/migrations/005_analysis_tables.sql` | Any user can read/modify/delete all data |
| S2 | **No authentication on API routes** — all endpoints publicly accessible | `apps/web/app/api/*` | Unlimited analysis creation, cost exploitation, data access |

### HIGH

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S3 | **Prompt injection vulnerability** — user input embedded directly in LLM prompts without sanitization | `packages/llm/src/context/builder.ts` | Attacker could manipulate LLM behavior, exfiltrate system prompts |
| S4 | **No input length validation** — min 10 chars but no max | `apps/web/app/api/analyze/start/route.ts` | 10MB+ payloads causing DOS, token exhaustion, cost explosion |
| S5 | **Webhook secret not enforced** — validation skipped if env var unset | `services/scraper/src/server.ts` | Anyone can trigger expensive scraping operations |
| S6 | **No rate limiting** on any API endpoint | All `apps/web/app/api/*` routes | DOS, cost explosion ($0.50-1.00 per analysis in LLM tokens) |

### MEDIUM

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S7 | DOS via large scraped data arrays (no item count limit) | `packages/llm/src/context/builder.ts` | Token budget explosion |
| S8 | Browser sandbox disabled (`--no-sandbox`) | `services/scraper/src/browser/pool.ts` | Malicious websites could exploit browser |
| S9 | No Content-Type/params validation on webhook | `services/scraper/src/server.ts` | Arbitrary payload injection |
| S10 | Verbose error logging may leak internal details | Multiple API routes | Information disclosure |

### LOW

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S11 | Missing security headers (CSP, HSTS, X-Frame-Options) | `apps/web/` | XSS, clickjacking risk |
| S12 | No CORS configuration on scraper service | `services/scraper/src/server.ts` | Cross-origin access |
| S13 | Query parameter type coercion not validated (NaN risk) | `apps/web/app/api/finder/route.ts` | Unexpected query behavior |
| S14 | Incomplete async error handling (fire-and-forget) | `apps/web/app/api/feedback/route.ts` | Silent failures |
| S15 | No secrets rotation policy | All `.env` usage | Stale credentials |

---

## 3. Database

### Schema Design (Good)
- Layered architecture: raw_events → products/companies/regulations → signals → opportunities → ideas
- UUID primary keys, timestamptz columns, JSONB for flexible data
- PostgreSQL features: partitioning, materialized views, vector search (pgvector), GIN indexes, trigram search
- 18 well-ordered migrations with proper FK dependencies

### Critical Issues

**RLS Policies Broken:**
```sql
-- All three policies effectively disable security:
create policy "owner_all" on analyses for all using (true);
create policy "owner_all" on analysis_sections for all using (true);
create policy "owner_all" on opportunities for all using (true);
```

**Missing Constraints:**

| Table | Missing | Impact |
|-------|---------|--------|
| signals | `CHECK strength BETWEEN 0 AND 100` | Invalid strength values |
| opportunities | `CHECK composite_score BETWEEN 0 AND 100` | Invalid scores |
| products | `NOT NULL canonical_name, slug` | Core identity missing guardrail |
| ideas | `CHECK expires_at > created_at` | Expired-on-creation records |
| feedback_events | Enum constraint on type | Invalid feedback types |

**Referential Integrity Gaps:**
- `opportunities.source_products` stored as UUID arrays instead of junction tables — no FK enforcement
- `products.source_ids` as JSONB — no structure validation
- Free-text fields where enums should exist (category, type, dismiss_category)

**Missing Indexes:**

| Table | Missing Index | Reason |
|-------|---------------|--------|
| analyses | (opportunity_id) | FK lookup |
| companies | (product_id) | Reverse FK |
| signals | (product_id, signal_type) | Compound filter |
| feedback_events | (created_at DESC) | Time-series |

---

## 4. Dependencies

### Package Structure (Correct)
- Turborepo workspaces: `apps/*`, `packages/*`, `services/*`
- Internal packages use `@repo/*` namespace
- Dev/prod dependencies properly separated
- Node.js >= 20 required, npm 10.8.0 specified

### Issues

| Severity | Issue | Details |
|----------|-------|---------|
| HIGH | **Missing `pino-pretty`** dependency | Used in scraper server dev transport but not in package.json — runtime error in non-prod |
| MEDIUM | **No lockfile committed** | No package-lock.json, yarn.lock, or pnpm-lock.yaml — non-deterministic builds |
| LOW | Inconsistent tsconfig includes | `packages/scoring` and `packages/shared` use `["src"]` vs `["src/**/*.ts"]` |
| LOW | Inconsistent path style | Scraper uses relative `dist/src` vs `./dist/./src` elsewhere |

### Key Dependencies
- Next.js 14.2, React 18.3, TailwindCSS 3.4
- Fastify 5.2, BullMQ 5.30, Playwright 1.49
- @anthropic-ai/sdk 0.39, Zod 3.23
- @supabase/supabase-js 2.47 (consistent across 3 packages)

---

## 5. Code Quality

### TypeScript (Excellent)
- Strict mode enabled across all packages
- No observable `any` types
- Good use of generics, discriminated unions, `as const` assertions
- Zod schemas for runtime validation at boundaries

### Error Handling (Good with Gaps)
- Retry with exponential backoff + jitter in base scraper
- `Promise.allSettled()` in signal detectors prevents cascade failures
- GitHub scraper explicitly handles 429/403 rate limits
- **Gaps:** No fetch timeouts, LLM enrichment errors silently masked, Supabase errors not sanitized

### Code Duplication (Poor)
- 40 scrapers each reimplement rate limiting, error formatting, URL building
- 40 transformers repeat identical filter-map-filter pattern
- Description truncation to 500 chars repeated in 6+ files
- Adding a new source requires touching 3 files (scraper, transformer, worker registration)

### Rate Limiting (Good but Static)
- Per-source delays: Reddit 600ms, ProductHunt 1000ms, GitHub 720ms, HackerNews 500ms
- All hardcoded — no runtime adjustment, no distributed coordination
- No circuit breaker for consistently failing APIs

### Logging (Fair)
- Basic `console.log/warn/error` throughout
- No structured JSON logging for aggregation
- No trace IDs for cross-service correlation
- No timing/duration tracking on operations

### Input Validation (Poor)
- Minimal: idea description >= 10 chars, feedback type whitelist
- Missing: max length limits, keyword format validation, URL sanitization, numeric bounds

---

## 6. Testing

**Zero test files found across the entire 27,310-line codebase.**

Critical untested paths:
- Signal detection algorithms (13 detectors)
- Opportunity scoring functions
- 3-layer deduplication logic
- LLM prompt building and output parsing
- API route input handling
- Retry/backoff behavior
- Data transformation accuracy

---

## 7. Deployment & Operations

### What Exists
- Multi-stage Dockerfile for scraper service (build + Playwright runtime)
- Health endpoint at `/health` with source-level status
- BullMQ job queue with configurable retention (24-72h)
- Environment configuration via `.env`

### What's Missing
- CI/CD pipeline (no GitHub Actions, no automated testing)
- docker-compose for local development
- Kubernetes manifests or orchestration
- Monitoring/alerting (no Prometheus, no Sentry)
- Distributed tracing (no OpenTelemetry)
- Database backup/restore procedures
- Secret management (env vars only)
- Blue-green deployment strategy

---

## 8. Priority Action Items

### P0 — Critical (Before Any Deployment)

1. **Fix RLS policies** — Replace `USING (true)` with proper user ownership checks
2. **Add authentication** to all API routes using Supabase Auth
3. **Add rate limiting** on all endpoints (especially `/api/analyze/start`)
4. **Enforce webhook secret** — fail if `WEBHOOK_SECRET` is not set
5. **Add input validation** — max length on all text inputs, validate types

### P1 — High (Before Public Launch)

6. **Add test suite** — unit tests for scoring, signals, dedup, and API routes (target 80%+ on critical paths)
7. **Sanitize LLM inputs** — escape/validate user content before prompt injection
8. **Commit lockfile** — `npm install` and commit `package-lock.json`
9. **Add missing `pino-pretty`** dependency to scraper service
10. **Add database constraints** — CHECK, NOT NULL on critical columns
11. **Set up CI/CD** — GitHub Actions with lint, type-check, test, build stages

### P2 — Medium (Production Hardening)

12. Add security headers (CSP, HSTS, X-Frame-Options)
13. Implement structured logging with trace IDs
14. Add fetch timeouts to all external API calls
15. Convert UUID array columns to junction tables
16. Add circuit breaker pattern for external APIs
17. Complete remaining 17 LLM analysis sections
18. Reduce scraper/transformer code duplication

### P3 — Low (Nice to Have)

19. Add API documentation (OpenAPI/Swagger)
20. Set up monitoring (Prometheus + Grafana)
21. Add distributed tracing (OpenTelemetry)
22. Implement secret rotation policy
23. Add docker-compose for local development
24. Create architecture decision records (ADRs)

---

## Appendix: File Statistics

| Category | Files | Lines |
|----------|-------|-------|
| Scrapers | 40 | ~7,800 |
| Transformers | 40 | ~3,200 |
| Signal Detectors | 13 | ~2,700 |
| Engine (pipeline, dedup, enrichment, etc.) | 6 | ~2,700 |
| Workers | 3 | ~1,600 |
| Web App (pages + API routes) | 15 | ~3,600 |
| Packages (db, llm, scoring, shared) | 16 | ~3,200 |
| Database Migrations | 18 | ~1,200 |
| Config & Build | 15 | ~500 |
| **Total** | **191** | **~27,310** |
