# Project Audit Report — SaaS Idea Engine

**Date:** 2026-02-22 (Updated)
**Branch Audited:** `main` (all branches merged — 192 files, ~27,600 lines)
**Auditor:** Automated deep audit v2 (architecture, security, database, packages, web app, scraper service, dependencies, code quality)

---

## Executive Summary

The **SaaS Idea Engine** is a signal-based intelligence platform that scrapes 40+ data sources, detects market signals, generates business opportunities, and runs LLM-powered analysis. It uses a Turborepo monorepo with Next.js frontend, Fastify scraper service, Supabase database, and Anthropic Claude for AI analysis.

This updated audit consolidates findings from 5 parallel deep-dive audits across every layer of the codebase.

### Overall Scores

| Area | Score | Verdict |
|------|-------|---------|
| Architecture | **7.5/10** | Solid monorepo design, good separation of concerns |
| Database | **6/10** | Sophisticated schema, but critical RLS bypass, missing constraints, FK gaps |
| Code Quality | **6.5/10** | Strong TypeScript, good patterns, high duplication, edge-case bugs |
| Security | **2.5/10** | Critical auth bypass, XSS, prompt injection, SSRF, webhook bypass |
| Dependencies | **6/10** | Functional but missing lockfile, missing `pino-pretty`, config inconsistencies |
| Testing | **0/10** | Zero tests in entire codebase |
| Deployment | **4/10** | Dockerfile exists, no CI/CD or orchestration |
| Documentation | **2/10** | README is empty, no API docs |
| Web App | **4/10** | 4 missing API routes, XSS vulnerability, no auth, no CSRF |
| LLM Pipeline | **4/10** | 1 of 18 sections implemented, cost tracking off by 1M×, prompt injection |

### Risk Assessment

- **8 CRITICAL** findings
- **12 HIGH** severity issues
- **24 MEDIUM** severity issues
- **8 LOW** severity issues
- **0 tests** in ~27,600 lines of code

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
Scrape (40 sources) → Transform → Detect Signals (12 detectors)
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
- Only 1 of 18 LLM analysis sections implemented (sections 02–18 missing entirely)
- No circular dependency detection in section DAG
- Tight coupling to Supabase SDK (no repository abstraction)
- Memory scaling risk: `enrichBatch()` loads all opportunities into memory

---

## 2. Security Findings

### CRITICAL

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S1 | **RLS policies allow all access** — `using (true)` on analyses, sections, opportunities | `supabase/migrations/005_analysis_tables.sql:101-103` | Any user can read/modify/delete all data |
| S2 | **No authentication on API routes** — all endpoints publicly accessible | `apps/web/app/api/*` | Unlimited analysis creation, cost exploitation, data access |
| S3 | **XSS via `dangerouslySetInnerHTML`** — LLM content rendered unsanitized | `apps/web/app/analyzer/[id]/page.tsx:367` | Malicious script execution in users' browsers |
| S4 | **Cost tracker pricing off by 1,000,000×** — raw dollar amounts instead of per-token | `packages/llm/src/client/cost-tracker.ts:6-7` | Budget checks completely non-functional; cost explosion undetected |
| S5 | **4 missing API routes** — analyzer pages call endpoints that don't exist | `apps/web/app/api/analyze/[id]`, `/api/analyze` GET, `/api/analyze/[id]/sections/*/regenerate`, `/api/health/scrapers` | Core features (history, detail view, regenerate, health) are broken |
| S6 | **Webhook secret bypass** — empty string passes auth check | `services/scraper/src/server.ts:46-49` | Unauthenticated scraping operations |
| S7 | **Configuration validation missing** — 15+ API keys optional with no startup check | `services/scraper/src/config.ts:5-25` | Scrapers crash at runtime instead of failing fast |
| S8 | **Only 1 of 18 LLM sections implemented** — sections 02–18 throw errors | `packages/llm/src/orchestrator/section-runner.ts:33-45` | Analysis pipeline cannot progress beyond section 1 |

### HIGH

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S9 | **Prompt injection** — user input embedded directly in LLM prompts | `packages/llm/src/prompts/sections/01-problem.ts:148-160` | Attacker manipulates LLM behavior, exfiltrates system prompts |
| S10 | **No input length validation** — min 10 chars but no max on any field | `apps/web/app/api/analyze/start/route.ts:16-20` | 10MB+ payloads causing DOS, token exhaustion |
| S11 | **No rate limiting** on any API endpoint | All `apps/web/app/api/*` routes | DOS, cost explosion ($0.50-1.00 per analysis) |
| S12 | **Column name injection in sortBy** — query param used directly in `.order()` | `apps/web/app/api/finder/route.ts:24` | Database errors, potential query manipulation |
| S13 | **SSRF risk** — unvalidated external service URLs from env vars | `apps/web/app/api/analyze/section/route.ts:83-105` | Requests redirected to attacker-controlled servers |
| S14 | **Race condition in browser pool** — TOCTOU gap in `acquire()` | `services/scraper/src/browser/pool.ts:81-111` | Context limit exceeded, resource exhaustion |
| S15 | **Memory leak in browser pool** — context not removed from Set on close error | `services/scraper/src/browser/pool.ts:117-133` | Pool capacity tracking becomes incorrect over time |
| S16 | **LLM JSON parsing fragility** — 3 fallback attempts then silent default | `services/scraper/src/engine/llm-enrichment.ts:207-237` | Unusable "Unknown" / "To be determined" opportunities |
| S17 | **Cross-reference timestamp bug** — `occurred_at` vs `detected_at` column name mismatch | `services/scraper/src/engine/cross-reference.ts:691` | Crossing rules never match; time filters fail silently |
| S18 | **Signal strength underflow** — signals silently dropped when all metrics below thresholds | `services/scraper/src/signals/community-demand.ts:86-92` | Legitimate signals missed |
| S19 | **Regulatory deadline false positives** — regex matches any year mention 2025–2035 | `services/scraper/src/signals/regulatory-deadline.ts:33` | "Made in 2025" triggers deadline signal |
| S20 | **No CSRF protection** on any POST endpoint | All `apps/web/app/api/*` POST routes | Cross-site request forgery attacks |

### MEDIUM

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S21 | DOS via large scraped data arrays (no item count limit) | `packages/llm/src/context/builder.ts` | Token budget explosion |
| S22 | Browser sandbox disabled (`--no-sandbox`) | `services/scraper/src/browser/pool.ts` | Malicious websites could exploit browser |
| S23 | No Content-Type/params validation on webhook | `services/scraper/src/server.ts` | Arbitrary payload injection |
| S24 | Verbose error messages leak internal details | Multiple API routes (e.g., `feedback/route.ts:39`) | Information disclosure |
| S25 | Missing JSON parse error handler on all POST routes | `apps/web/app/api/analyze/start/route.ts:13` | 500 errors instead of 400 for malformed requests |
| S26 | `sectionNumber` type not validated | `apps/web/app/api/analyze/section/route.ts:14-28` | Type coercion causes unexpected behavior |
| S27 | Sentiment distribution allows sum > 100 | `packages/llm/src/prompts/sections/01-problem.ts:67-69` | Invalid analysis output |
| S28 | Unsafe type assertion `prefs as ProblemPromptPreferences` | `packages/llm/src/orchestrator/section-runner.ts:43` | Undefined values in prompts |
| S29 | Validation retry errors lost — only first failure's errors logged | `packages/llm/src/orchestrator/section-runner.ts:184-225` | Cannot debug final retry state |
| S30 | Recency multiplier: `Math.exp()` overflow for future timestamps | `packages/scoring/src/opportunity.ts:204` | Scores become `Infinity` or `NaN` |
| S31 | Velocity bonus inflated when all timestamps identical | `packages/scoring/src/opportunity.ts:220-248` | Incorrect scoring |
| S32 | No URL validation in scrapers — malformed URLs pass through | Multiple scrapers | Invalid data persisted |
| S33 | Category inference fragility — defaults to `general_saas` | Multiple signal detectors | Over-representation of generic category |
| S34 | No input sanitization in transformers before DB storage | `services/scraper/src/transformers/*.ts` | Potential stored XSS / injection |
| S35 | Health checker only tests Reddit — 39 sources unmonitored | `services/scraper/src/health/checker.ts:41-59` | Service "healthy" while 90% of scrapers broken |
| S36 | Fire-and-forget webhook calls with swallowed errors | `apps/web/app/api/feedback/route.ts:63-72` | Silent failures, no retry |
| S37 | Feedback `reason` and `dismiss_category` never validated | `apps/web/app/api/feedback/route.ts:10-26` | Arbitrary content in database |
| S38 | Notification payloads stored as plain JSONB | `supabase/migrations/012_notifications.sql:23` | Sensitive data exposure |
| S39 | No concurrent scraper rate limiter — per-source only | Multiple scrapers | Global API quota exceeded |
| S40 | Signal detector errors silently logged and skipped | `services/scraper/src/signals/index.ts:46-68` | Missing signals with no recovery |
| S41 | Hardcoded Paris geolocation in browser pool | `services/scraper/src/browser/pool.ts:193` | Bot fingerprint detection |
| S42 | Dedup Layer 3 threshold (50%) undocumented and arbitrary | `services/scraper/src/engine/dedup.ts:184` | Inconsistent merge behavior |
| S43 | Schema mismatch: `IdeaInputSchema` vs `AnalysisPreferencesSchema` | `packages/shared/src/types.ts:21-39` | Data loss during mapping |
| S44 | Loose `Record<string, unknown>` types in 7+ interfaces | `packages/shared/src/types.ts:55,62,76,117,125,190,218` | No compile-time safety for nested objects |

### LOW

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| S45 | Missing security headers (CSP, HSTS, X-Frame-Options) | `apps/web/` | XSS, clickjacking risk |
| S46 | No CORS configuration on scraper service | `services/scraper/src/server.ts` | Cross-origin access |
| S47 | Query parameter `parseInt()` returns NaN without handling | `apps/web/app/api/finder/route.ts` | Unexpected query behavior |
| S48 | No secrets rotation policy | All `.env` usage | Stale credentials |
| S49 | Inconsistent tsconfig includes across packages | `packages/scoring`, `packages/shared` | Build inconsistency |
| S50 | Console logging in production — no structured logging | Multiple files | Hard to aggregate/filter |
| S51 | Unused transformer methods (e.g., `toRedditPosts()`) | `services/scraper/src/transformers/reddit.ts:44-49` | Dead code |
| S52 | Raw events partition naming removes underscores inconsistently | `supabase/migrations/003_raw_layer.sql:26` | Manual query confusion |

---

## 3. Database

### Schema Design (Good)
- Layered architecture: raw_events → products/companies/regulations → signals → opportunities → ideas
- UUID primary keys, timestamptz columns, JSONB for flexible data
- PostgreSQL features: partitioning, materialized views, vector search (pgvector), GIN indexes, trigram search
- 18 well-ordered migrations with proper FK dependencies
- Idempotent enum extensions (`IF NOT EXISTS`)

### Critical Issues

**RLS Policies Broken:**
```sql
-- All three policies effectively disable security:
create policy "owner_all" on analyses for all using (true);
create policy "owner_all" on analysis_sections for all using (true);
create policy "owner_all" on opportunities for all using (true);
```
No `user_id` column exists on these tables — proper RLS cannot be retrofitted without schema changes.

**Missing Constraints:**

| Table | Missing | Impact |
|-------|---------|--------|
| signals | `CHECK strength BETWEEN 0 AND 100` | Invalid strength values |
| opportunities | `CHECK composite_score BETWEEN 0 AND 100` | Invalid scores on 5 score columns |
| products | `NOT NULL canonical_name, slug` | Core identity missing guardrail |
| ideas | `CHECK expires_at > created_at` | Expired-on-creation records |
| feedback_events | Enum constraint on `type`, `dismiss_category` | Invalid feedback types |
| reviews | `rating`, `sentiment_score` unbounded | Arbitrary numeric values |
| regulations | `market_impact_score`, `urgency_score` unbounded | Arbitrary numeric values |
| product_pricing | `CHECK valid_to > valid_from OR valid_to IS NULL` | End dates before start dates |
| analyses | `status` uses text instead of enum | Invalid status values |
| analysis_sections | `section_key` free text instead of enum | Invalid section identifiers |

**Referential Integrity Gaps:**
- `opportunities.source_products` stored as UUID arrays instead of junction tables — no FK enforcement, no cascading deletes
- `opportunities.source_signals` and `source_regulations` — same UUID array anti-pattern
- `products.source_ids` as JSONB — no structure validation
- FK constraints lack explicit cascade behavior (`ON DELETE CASCADE` missing)

**Missing Indexes:**

| Table | Missing Index | Reason |
|-------|---------------|--------|
| analyses | `(opportunity_id)` | FK lookup |
| analysis_sections | `(analysis_id)` | FK lookup |
| companies | `(product_id)` | Reverse FK lookup |
| signals | `(product_id, signal_type)` | Compound filter |
| feedback_events | `(created_at DESC)` | Time-series queries |
| llm_usage | `(analysis_id)` | FK lookup |

**Performance Concerns:**
- Materialized views refreshed once daily (5 AM) — 24h stale data except rankings (hourly)
- No timezone specification on cron jobs — assumes UTC
- No error handling if materialized view refresh fails
- Raw events partitioned by source only — no time-based partitioning for high-volume data
- `match_opportunities()` function lacks LIMIT protection

**Functions & Cron Issues:**
- Cron webhook URL via `current_setting()` — no error if not configured
- No cron error logging table
- `archive_expired_ideas` has no error handling
- `pg_net` extension in migration 006 instead of 001 — wrong placement

---

## 4. Web App

### Missing API Routes (CRITICAL)

| Expected Route | Called From | Status |
|---------------|------------|--------|
| `GET /api/analyze/[id]` | `apps/web/app/analyzer/[id]/page.tsx:103` | Missing |
| `GET /api/analyze` | `apps/web/app/history/page.tsx:26` | Missing |
| `POST /api/analyze/[id]/sections/[n]/regenerate` | `apps/web/app/analyzer/[id]/page.tsx:178` | Missing (wrong path for existing regenerate route) |
| `GET /api/health/scrapers` | `apps/web/app/health/page.tsx:156` | Missing |

### XSS Vulnerability
```typescript
// apps/web/app/analyzer/[id]/page.tsx:367
dangerouslySetInnerHTML={{ __html: activeSection.content }}
```
LLM-generated content rendered without sanitization. Must use DOMPurify or equivalent.

### Input Validation Gaps
- No max length on `ideaDescription` (only min 10 chars)
- `title` field accepts any value without limits
- `preferences` object accepted without schema validation
- `sortBy` query param used directly in `.order()` — column name injection
- `parseInt()` on query params without NaN handling
- `reason` and `dismiss_category` in feedback never validated

### Missing Security Controls
- No authentication/authorization on any endpoint
- No rate limiting
- No CSRF protection
- No JSON parse error handling (500 instead of 400)
- Error messages leak internal details

---

## 5. Packages

### `packages/shared` — Types & Constants
- 7+ interfaces use loose `Record<string, unknown>` types — no compile-time safety
- `IdeaInputSchema` and `AnalysisPreferencesSchema` define overlapping but incompatible types
- All 18 section keys defined but only section 01 implemented

### `packages/db` — Database Layer
- No SQL injection risk (Supabase SDK handles parameterization)
- Minimal error handling (errors thrown, not logged)
- Connection management delegated to Supabase SDK

### `packages/llm` — LLM Pipeline
- **CRITICAL:** Cost tracker stores `3.0` and `15.0` as per-token prices instead of per-million-token — budget checks broken by 1,000,000×
- **HIGH:** Prompt injection via unsanitized user input (`targetMarket`, `region`, `additionalContext`, scraped content)
- **CRITICAL:** Only 1 of 18 sections registered in `SECTION_REGISTRY`
- Sentiment distribution schema allows sum > 100%
- Unsafe type assertion in section runner
- Validation retry errors lost after exhaustion

### `packages/scoring` — Scoring Algorithms
- Recency multiplier: `Math.exp()` overflow for future timestamps → `Infinity` scores
- Velocity bonus inflated when timestamps are identical
- `freshnessScores[i]` array bounds not validated against `items` array
- Confidence computation correctly bounded (0–100)
- Diversity bonus logic is sound

---

## 6. Scraper Service

### Server & Configuration
- Webhook secret bypass when env var is empty string
- 15+ API keys optional with no startup validation — runtime crashes
- No global rate limiter across concurrent jobs

### Scrapers (40 sources)
- Base class provides retry with exponential backoff + jitter
- Per-source rate limits hardcoded (Reddit 600ms, ProductHunt 1000ms, etc.)
- No URL validation on scraped items
- High code duplication across 40 scrapers

### Transformers (40 transformers)
- Identical filter-map-filter pattern repeated 40 times
- Description truncation to 500 chars in 6+ files
- No input sanitization before database storage

### Signal Detectors (12 detectors)
- `Promise.allSettled()` prevents cascade failures but errors only logged
- Regulatory deadline detector matches any year mention (false positives)
- Signal strength underflow silently drops legitimate signals
- Category inference defaults to `general_saas`

### Engine
- **Cross-reference:** `occurred_at` vs `detected_at` column name mismatch — time filters never match
- **Dedup:** 3-layer system (exact → fuzzy → evidence overlap), but Layer 3 threshold (50%) undocumented
- **LLM enrichment:** JSON parsing fallback returns unusable defaults silently
- **Opportunity generator:** 8 paths, well-structured but memory-intensive for large batches

### Browser Pool
- TOCTOU race condition in `acquire()` — context limit can be exceeded
- Memory leak: context not removed from Set on close error
- Hardcoded Paris geolocation — bot fingerprint
- `--no-sandbox` disables browser security

### Workers
- Multiple `await` calls without intermediate error boundaries
- Job status not updated if `persistRawItems()` fails
- No resource cleanup in finally blocks

---

## 7. Dependencies

### Package Structure (Correct)
- Turborepo workspaces: `apps/*`, `packages/*`, `services/*`
- Internal packages use `@repo/*` namespace
- Dev/prod dependencies properly separated
- Node.js >= 20 required, npm 10.8.0 specified

### Issues

| Severity | Issue | Details |
|----------|-------|---------|
| HIGH | **Missing `pino-pretty`** dependency | Used in scraper server dev transport but not in package.json |
| MEDIUM | **No lockfile committed** | Non-deterministic builds |
| LOW | Inconsistent tsconfig includes | `["src"]` vs `["src/**/*.ts"]` across packages |
| LOW | Inconsistent path style | `dist/src` vs `./dist/./src` |

### Key Dependencies
- Next.js 14.2, React 18.3, TailwindCSS 3.4
- Fastify 5.2, BullMQ 5.30, Playwright 1.49
- @anthropic-ai/sdk 0.39, Zod 3.23
- @supabase/supabase-js 2.47 (consistent across 3 packages)

---

## 8. Code Quality

### TypeScript (Excellent)
- Strict mode enabled across all packages
- No observable `any` types
- Good use of generics, discriminated unions, `as const` assertions
- Zod schemas for runtime validation at boundaries

### Error Handling (Good with Gaps)
- Retry with exponential backoff + jitter in base scraper
- `Promise.allSettled()` in signal detectors prevents cascade failures
- GitHub scraper explicitly handles 429/403 rate limits
- **Gaps:** No fetch timeouts, LLM enrichment errors silently masked, Supabase errors not sanitized, worker jobs not updated on persistence failure

### Code Duplication (Poor)
- 40 scrapers each reimplement rate limiting, error formatting, URL building
- 40 transformers repeat identical filter-map-filter pattern
- Description truncation to 500 chars repeated in 6+ files
- Adding a new source requires touching 3 files (scraper, transformer, worker registration)

### Rate Limiting (Good but Static)
- Per-source delays: Reddit 600ms, ProductHunt 1000ms, GitHub 720ms, HackerNews 500ms
- All hardcoded — no runtime adjustment, no distributed coordination
- No circuit breaker for consistently failing APIs
- No global concurrency limit across sources

### Logging (Fair)
- Basic `console.log/warn/error` throughout
- No structured JSON logging for aggregation
- No trace IDs for cross-service correlation
- No timing/duration tracking on operations

### Input Validation (Poor)
- Minimal: idea description >= 10 chars, feedback type whitelist
- Missing: max length limits, keyword format validation, URL sanitization, numeric bounds, sortBy whitelist

---

## 9. Testing

**Zero test files found across the entire ~27,600-line codebase.**

Critical untested paths:
- Signal detection algorithms (12 detectors)
- Opportunity scoring functions (recency, velocity, confidence, diversity)
- 3-layer deduplication logic
- LLM prompt building and output parsing
- API route input handling and missing route detection
- Retry/backoff behavior
- Data transformation accuracy
- Cost tracking calculations
- Cross-reference engine time matching
- Browser pool concurrency management

---

## 10. Deployment & Operations

### What Exists
- Multi-stage Dockerfile for scraper service (build + Playwright runtime)
- Health endpoint at `/health` with source-level status (but only tests Reddit)
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
- Cron job error logging
- Multi-source health monitoring

---

## 11. Priority Action Items

### P0 — Critical (Before Any Deployment)

1. **Fix RLS policies** — Add `user_id` columns to analyses/opportunities, replace `USING (true)` with `auth.uid()` checks
2. **Add authentication** to all API routes using Supabase Auth
3. **Fix cost tracker** — Use `MODEL_PRICING` from shared package (per-million-token prices)
4. **Implement missing API routes** — `/api/analyze/[id]` GET, `/api/analyze` GET, regenerate endpoint, `/api/health/scrapers`
5. **Fix XSS** — Replace `dangerouslySetInnerHTML` with DOMPurify sanitization
6. **Enforce webhook secret** — Make `WEBHOOK_SECRET` required, validate non-empty
7. **Add startup config validation** — Fail fast if required API keys missing
8. **Implement remaining 17 LLM sections** — Register prompt builders for sections 02–18

### P1 — High (Before Public Launch)

9. **Add rate limiting** on all endpoints (especially `/api/analyze/start`)
10. **Sanitize LLM inputs** — Escape/validate user content before prompt building
11. **Add input validation** — Max length on all text inputs, whitelist `sortBy` values, validate types with Zod
12. **Fix browser pool race condition** — Add mutex/lock in `acquire()`, fix memory leak in `release()`
13. **Fix cross-reference timestamp** — Standardize `occurred_at` / `detected_at` column names
14. **Fix regulatory deadline detector** — Require conjunction with deadline keywords
15. **Add test suite** — Unit tests for scoring, signals, dedup, cost tracking, API routes (target 80%+ on critical paths)
16. **Commit lockfile** — `npm install` and commit `package-lock.json`
17. **Add missing `pino-pretty`** dependency to scraper service
18. **Add database constraints** — CHECK on all score columns, NOT NULL on required fields, temporal constraints
19. **Add CSRF protection** on all POST routes
20. **Set up CI/CD** — GitHub Actions with lint, type-check, test, build stages

### P2 — Medium (Production Hardening)

21. Add security headers (CSP, HSTS, X-Frame-Options)
22. Implement structured logging with trace IDs (replace console.log)
23. Add fetch timeouts to all external API calls
24. Convert UUID array columns to junction tables
25. Add circuit breaker pattern for external APIs
26. Add global rate limiter across concurrent scrapers
27. Reduce scraper/transformer code duplication
28. Expand health checker to 5+ sources (not just Reddit)
29. Add cron job error logging table
30. Add JSON parse error handling on all POST routes
31. Fix scoring edge cases (recency overflow, velocity inflation)
32. Add URL validation in base scraper
33. Fix LLM enrichment to fail loudly on parse errors
34. Add LIMIT protection to `match_opportunities()` function
35. Move `pg_net` extension to migration 001

### P3 — Low (Nice to Have)

36. Add API documentation (OpenAPI/Swagger)
37. Set up monitoring (Prometheus + Grafana)
38. Add distributed tracing (OpenTelemetry)
39. Implement secret rotation policy
40. Add docker-compose for local development
41. Create architecture decision records (ADRs)
42. Tighten shared package types (replace `Record<string, unknown>`)
43. Add time-based partitioning to raw_events table
44. Document rollback procedures for migrations
45. Randomize browser pool geolocation

---

## Appendix: File Statistics

| Category | Files | Lines (approx.) |
|----------|-------|-----------------|
| Scrapers | 40 | ~7,800 |
| Transformers | 40 | ~3,200 |
| Signal Detectors | 12 | ~2,700 |
| Engine (pipeline, dedup, enrichment, etc.) | 6 | ~2,700 |
| Workers | 3 | ~1,600 |
| Web App (pages + API routes) | 15 | ~3,600 |
| Packages (db, llm, scoring, shared) | 16 | ~3,200 |
| Database Migrations | 18 | ~1,200 |
| Config & Build | 15 | ~500 |
| Audit | 1 | ~400 |
| **Total** | **192** | **~27,600** |

---

## Appendix: Issue Count by Component

| Component | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| Security / Auth | 2 | 3 | 2 | 2 | 9 |
| Web App | 2 | 2 | 5 | 1 | 10 |
| LLM Pipeline | 2 | 1 | 3 | 0 | 6 |
| Scraper Service | 1 | 4 | 7 | 2 | 14 |
| Database | 1 | 0 | 5 | 1 | 7 |
| Scoring | 0 | 0 | 2 | 0 | 2 |
| Dependencies | 0 | 1 | 1 | 2 | 4 |
| **Total** | **8** | **12** | **24** | **8** | **52** |
