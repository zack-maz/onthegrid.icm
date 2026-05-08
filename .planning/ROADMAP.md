# Roadmap: Iran Conflict Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- ✅ **v1.3 Data Quality & Layers** -- Phases 22-26.4 (shipped 2026-04-09) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 GDELT Redo & Performance** -- Phases 27-28.2.7 (shipped 2026-05-08); load-test phase deferred to backlog (999.5) — [archive](milestones/v1.4-ROADMAP.md), [audit](milestones/v1.4-MILESTONE-AUDIT.md)

## Phase Summary

| Phase | Name                            | Milestone | Plans | Completed  |
| ----- | ------------------------------- | --------- | ----- | ---------- |
| 1     | Project Scaffolding & Theme     | v0.9      | 1/1   | 2026-03-14 |
| 2     | Base Map                        | v0.9      | 3/3   | 2026-03-14 |
| 3     | API Proxy                       | v0.9      | 3/3   | 2026-03-15 |
| 4     | Flight Data Feed                | v0.9      | 2/2   | 2026-03-15 |
| 5     | Entity Rendering                | v0.9      | 2/2   | 2026-03-16 |
| 6     | ADS-B Exchange Data Source      | v0.9      | 2/3   | 2026-03-16 |
| 7     | adsb.lol Data Source            | v0.9      | 2/2   | 2026-03-16 |
| 8     | Ship & Conflict Data Feeds      | v0.9      | 1/2   | 2026-03-17 |
| 8.1   | GDELT Event Source              | v0.9      | 2/2   | 2026-03-17 |
| 9     | Layer Controls & News Toggle    | v0.9      | 1/2   | 2026-03-17 |
| 10    | Detail Panel                    | v0.9      | 2/2   | 2026-03-18 |
| 11    | Smart Filters                   | v0.9      | 3/3   | 2026-03-18 |
| 12    | Analytics Dashboard             | v0.9      | 1/1   | 2026-03-19 |
| 13    | Serverless Cache Migration      | v1.0      | 4/4   | 2026-03-20 |
| 14    | Vercel Deployment               | v1.0      | 2/2   | 2026-03-20 |
| 15    | Key Sites Overlay               | v1.1      | 2/2   | 2026-03-20 |
| 16    | News Feed                       | v1.1      | 3/3   | 2026-03-20 |
| 17    | Notification Center             | v1.1      | 4/4   | 2026-03-20 |
| 18    | Oil Markets Tracker             | v1.1      | 2/2   | 2026-03-21 |
| 19    | Search, Filter & UI Cleanup     | v1.1      | 4/4   | 2026-03-22 |
| 19.1  | Advanced Search                 | v1.1      | 5/5   | 2026-03-22 |
| 19.2  | Counter Entity Dropdowns        | v1.1      | 2/2   | 2026-03-22 |
| 20    | Layer Purpose Refactor          | v1.2      | 3/3   | 2026-03-23 |
| 20.1  | Geographical & Weather Layers   | v1.2      | 3/3   | 2026-03-23 |
| 20.2  | Threat Heatmap Layer            | v1.2      | 1/1   | 2026-03-23 |
| 20.3  | Political Boundaries Layer      | v1.2      | --    | Deferred   |
| 20.4  | Satellite Imagery Layer         | v1.2      | --    | Deferred   |
| 20.5  | Infrastructure Focus Layer      | v1.2      | --    | Deferred   |
| 21    | Production Review & Deploy Sync | v1.2      | 5/5   | 2026-03-25 |
| 21.1  | GDELT News Relevance Filtering  | v1.2      | 2/2   | 2026-03-26 |
| 21.2  | GDELT Event Quality Pipeline    | v1.2      | 2/2   | 2026-03-28 |
| 21.3  | Multi-User Load Testing         | v1.2      | 3/3   | 2026-03-29 |

**v0.9-v1.2 Totals:** 30 phases (27 shipped, 3 deferred) | 72/72 plans executed

<details>
<summary>✅ v1.3 Data Quality & Layers (Phases 22-26.4) — SHIPPED 2026-04-09</summary>

- [x] Phase 22: GDELT Event Quality & OSINT Integration (3/3 plans)
- [x] Phase 22.1: Fixing Dispersion & Camera Fly-To (2/2 plans)
- [x] Phase 23: Threat Density Improvements (2/2 plans)
- [x] Phase 23.1: Detail Panel Navigation Stack (2/2 plans)
- [x] Phase 23.2: Improving Threat Density Scatter Plots (2/2 plans)
- [x] Phase 24: Political Boundaries Layer (2/2 plans)
- [x] Phase 25: Ethnic Distribution Layer (2/2 plans)
- [x] Phase 26: Water Stress Layer (6/6 plans)
- [x] Phase 26.1: Water Layer Refinements (3/3 plans)
- [x] Phase 26.3: Production Code Cleanup (6/6 plans)
- [x] Phase 26.4: Documentation & External Presentation (6/6 plans)

**11 phases, 36 plans, 82/82 requirements satisfied, 12 scrapped → v1.4**
**Full archive:** [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

## Milestone v1.4: GDELT Redo & Performance — ✅ SHIPPED 2026-05-08

<details>
<summary>v1.4 (Phases 27 → 28.2.7) — 18 phases shipped, 1 deferred to backlog (999.5)</summary>

Full phase-by-phase detail archived to [milestones/v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md). Milestone audit at [milestones/v1.4-MILESTONE-AUDIT.md](milestones/v1.4-MILESTONE-AUDIT.md). Per-phase artifacts (PLAN.md / SUMMARY.md / VERIFICATION.md / REVIEW.md / HUMAN-UAT.md / CONTEXT.md) preserved at `.planning/milestones/v1.4-phases/`.

**Shipped (18):** 27 (umbrella) → 27.1 → 27.2 → 27.3 → 27.3.1 → 27.3.2 → 27.4 → 27.4.1 → 27.4.2 → 27.4.3 → 27.4.4 → 27.4.6 → 28 (umbrella) → 28.1 → 28.2 → 28.2.5 → 28.2.6 → 28.2.7.

**Deferred:** Phase 28.3 → Phase 999.5 backlog (Performance Optimization + 1–300 VU k6 sweep). Decision lock preserved at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`. Promotion gate: 3 consecutive `prod-connectivity-audit.yml` runs exit 0 with `allTiersGreen=true`.

**Headlines:** Structured LLM extraction (Cerebras → Groq → NIM v3 with parallel concurrency limiter) replacing scrapped NLP attempt. Daily cron triad (`/api/cron/{health,warm,refresh-events}`) with `waitUntil` durability + cold-cache self-heal. 6-path geocode resolver. Eval harness (50 ground-truth events / 11 countries). Adversarial prompt-injection robustness fixtures. Cleanup sweep (knip + ts-prune triage, 12 operator-tunable env vars, CSS `@theme` color tokens, 0 TS errors / 0 lint errors baseline). Domain rename to `otg-iran-monitor.vercel.app`. Bearer-bypass rate limiter. Unified `API Health` dashboard tab. Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion. Phase 28.2.7 closes the audit-tier completeness loop (cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`).

**Quantitative delta (v1.3 close → v1.4 close):**

- Tests: ~1700 → 2193 (+493)
- TypeScript errors: 8 → 0
- Cron jobs: 2 → 3 (within Hobby cap)
- Critical-tier endpoints: 3 → 4 (+ `llmEvents`)
- Eval ground-truth set: 0 → 50 events
- Bundle: 1.2 MB → 1.72 MB

</details>

## Deferred Work

Carried from v1.2:

- **Satellite Imagery** -- ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:

- **GDELT BigQuery adapter** -- SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** -- GramJS/TGSTAT for OSINT early-warning signals

## Backlog

### Phase 999.1: Remove or relax `rateLimiters.public` global tier — FOLDED INTO PHASE 28.2

**Goal:** Resolve operator-blocking rate limit. The 6 req/min global tier in `server/middleware/rateLimit.ts` (applied at `server/index.ts:99` to all `/api/*`) blocks the operator's own browser — flights polling alone is 12 req/min. Three options scoped earlier: (a) remove global tier (per-endpoint limits already tuned for browser), (b) bump to 300/min to keep loose anti-scraper net, (c) bypass when `DASHBOARD_PASSWORD` Bearer present.
**Resolution:** Folded into Phase 28.2 on 2026-04-30 per 28-CONTEXT.md D-04 — option (c) Bearer-bypass selected. This entry remains for historical traceability.
**Requirements:** Subsumed by 28-CONTEXT.md D-04
**Plans:** 0 plans (delivered via Phase 28.2 plan train)

### Phase 999.2: `api/vercel-entry.js` build-artifact discipline (BACKLOG)

**Goal:** Eliminate manual rebuild-before-commit friction introduced in commit `155989f`. Today the 1.7MB tsup-bundled function is tracked in git so Vercel detects it as a serverless function. Two long-term options: (a) add a CI check that fails if `api/vercel-entry.js` is stale relative to `server/**/*`; (b) migrate to Vercel's Build Output API (`.vercel/output/functions/api/vercel-entry.func/`) so the function is generated into Vercel's expected location during build, eliminating the tracked artifact.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Phase 27.4.6 cron first-tick verification (BACKLOG)

**Goal:** Confirm the `/api/cron/refresh-events` cron actually fires at 4am UTC, populates `events:llm:v3`, and `/api/events/llm-status` reports `lastTriggerSource: "cron"`. Passive verification — happens automatically, but no current alarm if it doesn't. Watch `dlqCount` after the first tick: non-zero means NIM was throttled (D-08 path) and operator must `?force=true` after NIM recovers. If 24h pass with `lastTriggerSource` never flipping to "cron", run the 8-step PLAN.md Task 6 curl checklist for diagnosis.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Cron route hydrates pipeline override (BACKLOG)

**Goal:** Wire `await refreshPipelineOverride()` into `server/routes/refresh-events-cron.ts` at handler start so runtime POST `/api/events/llm-pipeline {version: 'v3'}` overrides actually propagate to cron-triggered runs. Surfaced 2026-05-07 during Phase 28.2.6 deploy: prod LLM_PIPELINE_V3 env var failed to take effect on first cron call (returned `schemaVersion: "v2"`); the runtime override worked for `/api/events` but NOT for `/api/cron/refresh-events` because the latter never hydrates `pipelineOverride` from the Redis sidecar key `events:llm-pipeline-override` — each fresh function instance starts with the env-default. Workaround used: re-set `LLM_PIPELINE_V3=true` env var + `vercel redeploy`. Code fix: 1-line `await refreshPipelineOverride()` at top of refresh-events-cron handler. Risk: low (read-only cache hydration with TTL). Test: contract test that POST override → cron run honors override without env var change.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: Performance Optimization + 1–300 VU Load Test (BACKLOG, deferred from v1.4)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (originally v1.4's closing phase as 28.3, deferred 2026-05-08): validate production handles 1–300 concurrent users with measurable PASS/FAIL signal against a clean codebase. Performance optimization layer per D-19: add `s-maxage` CDN headers to `/api/*` (flights 5s, ships 30s, markets 60s, events/news 900s, sites/water 86400s) so Vercel CDN absorbs bulk reads at 300 VU and Redis only fires on cache miss + warm-up cron. k6 sweep per D-15 (GitHub Actions runner, results land as PR artifacts) / D-16 (six discrete tiers 50/100/150/200/250/300 VU, 60s ramp + 5min steady, ~45min wall-time per sweep) / D-20 (full browser-loop per VU: t=0 fires site/water/sources/markets/flights/ships/events/news, then polls flights@5s, ships@30s, markets@60s, events@15min, news@15min — ~0.27 req/s/VU → ~81 RPS at 300 VU). PASS/FAIL bar per D-17 (measured at 300 VU steady-state): p95<500ms hot endpoints, p99<1500ms, error<1%, no 5xx spikes, cache-hit>90% (non-negotiable). Beyond PASS/FAIL per D-18: per-endpoint latency breakdown (p50/p95/p99 tagged), 429 count (validates D-04 Bearer-bypass), Vercel cold-start frequency (validates warm-up cron sufficiency), Upstash Redis cache hit ratio. Polling parity per D-21 (D-20 shape + D-19 edge cache eliminates user-A-vs-user-B divergence). Hobby cron cap = 3, load test does NOT consume a slot.
**Why deferred:** v1.4 close audit (2026-05-08) found `prod-connectivity-audit.yml` tier-green gate still red on `critical[llmEvents]: unknown` — root cause is the v3 NIM LLM extraction not consistently populating `events:llm:v3` within Vercel function budget (intermittent throttle + cold-cache races). This is a pipeline ops/scheduling concern, not a load-test design defect; running k6 against a half-populated cache surface would produce noisy numbers that don't reflect steady-state behavior. Promote when the daily 04:00 UTC `refresh-events` cron consistently lands `events:llm:v3` healthy AND the audit workflow is exit-0 green for ≥3 consecutive runs.
**Promotion gate:** Three consecutive `prod-connectivity-audit.yml` runs exit 0 with `audit:connectivity:last-result.allTiersGreen === true`.
**Depends on:** Phase 28.2 (D-03 domain rename + W6 audit workflow); Phase 28.2.5 (tier-green assertion); Phase 28.2.6 (cron architecture); Phase 28.2.7 (R1+R2+R3 — cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`); Phase 999.4 (cron route hydrates pipeline override) — all prerequisites already merged into main.
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-15 / D-16 / D-17 / D-18 / D-19 / D-20 / D-21 + Claude's-discretion items (k6 reporter artifact format, `/api/sources` edge-cache classification). Decision lock preserved verbatim at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`.
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
