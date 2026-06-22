# Requirements: Iran Monitor — Milestone v2.0 Final Hardening

**Defined:** 2026-06-09
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

Previous milestone requirements archived at `.planning/milestones/v1.6-REQUIREMENTS.md`.

## v2.0 Requirements

Operator-locked priority order: water filter → ghost links + events subtab → dashboard readability → load test → general hardening → docs. Research grounding at `.planning/research/SUMMARY.md`.

### Water Data Quality (WATER-FILTER)

- [x] **WATER-FILTER-01**: Operator has a written diagnosis identifying which rejection stage(s) drop the missing facilities, derived from the existing `byTypeRejections` 8-bucket telemetry (prime suspect: O(n²) spatial dedup keyed on `facilityType` only)
- [x] **WATER-FILTER-02**: Water facilities layer no longer intermittently drops entries — spatial dedup never collapses distinct named facilities, and the Latin-label admission gate is not loosened (Phase 27.3.1 G1 "Dam near X" regression stays fixed)
- [x] **WATER-FILTER-03**: Fix is observable in production data — `water:facilities:v3` cache key bumped if persisted shape/behavior changes, and the `src/data/water-facilities.json` cold-start snapshot regenerated
- [x] **WATER-FILTER-04**: `waterFilterStats` test suite updated in lockstep — rejection-bucket deltas pin the fix against regression

### Ghost Links (GHOST — continues v1.5 numbering from GHOST-05)

- [x] **GHOST-06**: URL-liveness probe detects soft-404s — body heuristic on 200 responses (not-found markers, redirect-to-home, near-empty content); no headless browser
- [x] **GHOST-07**: Every event is probe-reachable or explicitly classified — source-less events no longer silently skipped by `buildProbeCandidates`, so prune can evaluate them
- [x] **GHOST-08**: Transient failures never count toward terminal-dead prune — `unknown` bucket excluded from prune eligibility, `attemptCount >= 3` gate retained, flaky-host attempt-reset semantics fixed so repeat offenders eventually accumulate
- [x] **GHOST-09**: 403 auto-prune decision made with evidence — evaluate demoting `403` to manual-only prune (bot-blocking CDNs 403 unknown UAs on live articles) using a `prunedIds` sample; implement the decision
- [x] **GHOST-10**: Operator can see WHY a link was flagged dead — evidence string (matched marker / redirect target / body length) persisted in `events:url-liveness:{eventId}` and surfaced in the events subtab; pinned schema test + Redis registry updated in lockstep

### Events Subtab Detail (EVENTS-TAB)

- [x] **EVENTS-TAB-01**: Operator can see full LLM pipeline detail in the events subtab — the 7 already-built blocks (Waterfall, Histograms, CallLog, BudgetBars, EvalScore, Dlq, Suspect) mounted into `EventsFiltersSectionV3`, fed from existing `LLMStatus` fields
- [x] **EVENTS-TAB-02**: Operator can read dead-link state per bucket in the events subtab — counts per liveness status plus first-seen-dead / transition timestamps

### Dashboard Readability (DASH-READ)

- [x] **DASH-READ-01**: Numeric data in water/events/sites subtabs is scannable — `tabular-nums`, right-aligned numeric columns, labeled headers, whitespace grouping
- [x] **DASH-READ-02**: Raw data dumps replaced with formatted summaries + progressive disclosure — detail behind drill-down following the `FlightRecorderBlock` run→call→detail pattern
- [x] **DASH-READ-03**: Visual hierarchy within the off-the-grid military aesthetic — primary metric prominent per block, labels small, contrast meets readability; all colors from the `@theme` token block (no inline hex)
- [x] **DASH-READ-04**: Redesign breaks nothing behavioral — WAI-ARIA tablist contract (roving tabindex, tab ids) frozen; the 5 pinning test suites (snapshot, tabMerge, diagnosticBlocks, operatorActions) and degrade-open semantics stay green
- [x] **DASH-READ-05**: Operator can see trends, not just point-in-time numbers — sparklines for dead-link count and cron freshness backed by small history rings (catches slow-burn regressions)

### Load Test (LOAD)

- [ ] **LOAD-01**: Cache-only GET endpoints serve from the CDN edge — `Cache-Control: s-maxage` headers implemented (the deferred D-19), making the >90% cache-hit PASS bar reachable
- [ ] **LOAD-02**: ~100 concurrent users proven — k6 1→300 VU sweep with a sustained ~100-VU window; CI-failing `thresholds` (p95 + error-rate per endpoint mix); cold-start tail distinguished from warm p95
- [ ] **LOAD-03**: Load run emits a per-endpoint SLO table — `handleSummary` markdown/JSON (endpoint → p95/p99/error-rate → pass/fail), doubling as portfolio evidence
- [ ] **LOAD-04**: Load test cannot burn money or skew results — read-only endpoint allowlist, no LLM cron/force-trigger paths, dual Bearer/no-Bearer passes so the public limiter is measured but doesn't throttle the capacity measurement; Vercel Active-CPU + Upstash command budgets checked before sizing

### Load Remediation (LOAD-FIX)

- [ ] **LOAD-FIX-01**: Every SLO failure surfaced by the load test is diagnosed with a root cause (cold-start tail, Redis latency, rate-limiter interference, missing edge cache, function sizing) and remediated
- [ ] **LOAD-FIX-02**: Full k6 sweep re-run after remediation passes all CI-failing thresholds green — ~100-user capacity is proven, not just measured

### General Hardening (HARD + CRON-WATCH)

- [x] **HARD-01**: Rate-limiter state is operator-visible and operator-safe — verify Bearer bypass covers all operator dashboard polls (999.1); surface tier config + recent 429 counts in the dashboard
- [x] **HARD-02**: Cron first-tick and missed-run detection — in-app freshness check computed from `cron:lastTick:{name}` age vs schedule + grace, surfaced via `/api/health` (999.3); no external SaaS
- [x] **CRON-WATCH-01**: 7-day cron stability watch completes as a NON-BLOCKING, auto-reported observation — daily auto-captured results, does not gate milestone close (carried from v1.6; structured to avoid the v1.5 Phase 31 early-close repeat)
- [x] **HARD-03**: Nyquist test-coverage backfill for Phase 39/40 surfaces — flight recorder, budget block, and subtab consolidation paths covered, including degrade-open fault-injection tests

### Docs Cleanup (DOCS-CLEAN)

- [ ] **DOCS-CLEAN-01**: All contract surfaces reconciled after code settles — CLAUDE.md Redis key registry, `docs/architecture/redis-keys.md`, OpenAPI spec, `.env.example`; all mechanical drift gates green (redis-registry, Redocly, check:env)
- [ ] **DOCS-CLEAN-02**: Prose docs reflect v2.0 shipped reality — README, CHANGELOG, runbook, and architecture docs updated for water fix, soft-404 probing, subtab redesign, load-test results, and hardening additions

## Future Requirements

Deferred — tracked but not in the v2.0 roadmap.

### Performance

- **PERF-01**: Stress/capacity-ceiling test (3×+ peak) to find subsystem limits — separate concern from the ~100-user SLO
- **PERF-02**: Soak run (0.8× peak, extended window) to catch leaks / breaker-stuck states

### Dashboard

- **DASH-FUT-01**: Status-page-style "all systems" rollup badge computed from the existing tier truth-table

### Operability

- **OPS-FUT-01**: `news:feed` cron warmer (carried from v1.6 — operability nicety, not required)
- **OPS-FUT-02**: `vercel.ts` + Build Output API migrations (deferred per v1.6 D-09; revisit when not mid-hardening)

## Out of Scope

| Feature                                           | Reason                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Real-time/continuous URL re-probing               | Burns polite-citizen budget, risks prober IP-blocks; tiered-TTL cron sweep retained — tighten the heuristic, not the cadence |
| Aggressive auto-prune on first dead probe         | Deletes live-but-flaky links on transient errors; `attemptCount >= 3` gate exists for exactly this reason                    |
| External cron-monitor SaaS (Healthchecks.io etc.) | Third-party dep + secret + egress for a single-operator tool that already has `cron:lastTick`                                |
| Push/email/desktop alerting on cron miss          | Out of scope per PROJECT.md — operator monitors actively, single user                                                        |
| Re-chasing the 501-VU peak as headline            | v1.2 already proved peak; the milestone asks for ~100-user SLOs, and bigger sweeps stress free-tier upstream APIs            |
| Full design-system rewrite of the dashboard       | Scope creep; risks regressing the ARIA tablist + v1.6 drill-down wiring; targeted 3-subtab pass only                         |
| Soft-404 via headless-browser rendering           | Heavy/slow/impossible within serverless probe budgets; HTML body heuristic is good-enough at OSINT scale                     |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement     | Phase    | Status   |
| --------------- | -------- | -------- |
| WATER-FILTER-01 | Phase 42 | Complete |
| WATER-FILTER-02 | Phase 42 | Complete |
| WATER-FILTER-03 | Phase 42 | Complete |
| WATER-FILTER-04 | Phase 42 | Complete |
| GHOST-06        | Phase 43 | Complete |
| GHOST-07        | Phase 43 | Complete |
| GHOST-08        | Phase 43 | Complete |
| GHOST-09        | Phase 43 | Complete |
| GHOST-10        | Phase 43 | Complete |
| EVENTS-TAB-01   | Phase 44 | Complete |
| EVENTS-TAB-02   | Phase 44 | Complete |
| DASH-READ-01    | Phase 45 | Complete |
| DASH-READ-02    | Phase 45 | Complete |
| DASH-READ-03    | Phase 45 | Complete |
| DASH-READ-04    | Phase 45 | Complete |
| DASH-READ-05    | Phase 45 | Complete |
| LOAD-01         | Phase 47 | Pending  |
| LOAD-02         | Phase 47 | Pending  |
| LOAD-03         | Phase 47 | Pending  |
| LOAD-04         | Phase 47 | Pending  |
| LOAD-FIX-01     | Phase 48 | Pending  |
| LOAD-FIX-02     | Phase 48 | Pending  |
| HARD-01         | Phase 46 | Complete |
| HARD-02         | Phase 46 | Complete |
| CRON-WATCH-01   | Phase 46 | Complete |
| HARD-03         | Phase 46 | Complete |
| DOCS-CLEAN-01   | Phase 49 | Pending  |
| DOCS-CLEAN-02   | Phase 49 | Pending  |

**Coverage:**

- v2.0 requirements: 28 total
- Mapped to phases: 28 (Phases 42-49)
- Unmapped: 0 ✓

---

_Requirements defined: 2026-06-09_
_Last updated: 2026-06-09 after roadmap creation — all 28 requirements mapped to Phases 42-49_
