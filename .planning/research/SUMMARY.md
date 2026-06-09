# Project Research Summary

**Project:** otg-iran-monitor — v2.0 Final Hardening
**Domain:** Production hardening of a shipped real-time OSINT conflict-monitoring dashboard (React 19 SPA + Express 5 on Vercel Pro/Fluid Compute + Upstash Redis)
**Researched:** 2026-06-09
**Confidence:** HIGH

## Executive Summary

v2.0 Final Hardening is a subsequent-milestone pass on an already-shipped, production-verified application. All six features — water admission-gate fix, ghost-link prune correction, dashboard subtab redesign, ~100-user load test, general hardening, and docs cleanup — decompose entirely onto existing modules with zero new runtime or dev dependencies. The strongest research signal is a negative one: do not add libraries, do not redesign the system architecture, do not re-engineer what already works. Every feature maps to debugging, wiring, styling, or verification of code the project already owns.

The recommended approach is dependency-honoring sequential execution: fix the water pipeline first (operator priority 1, fully independent), then correct ghost-link prune and wire the missing events-subtab LLM blocks, then restyle the three dense subtabs, then verify hardening primitives (cron, rate limiter, coverage), then run the load test against the fully hardened surface, and finally reconcile prose docs. This ordering is driven by hard data-dependency — the events subtab redesign must follow the LLM block wiring (same file), the load test must follow the edge-cache header layer (D-19, currently unimplemented and confirmed by grep), and docs must follow all code changes so drift-gate tests stay green per-PR.

The top risks are procedural rather than technical: (1) diagnosing the water drop at the wrong pipeline stage — fix must be telemetry-driven, citing a specific rejection bucket before any code change; (2) tightening the ghost-link prune and accidentally mass-deleting live (bot-blocked) events; (3) the 7-day cron watch becoming a milestone blocker by repeating the v1.5 Phase 31 early-close failure mode; (4) cache writebacks using wrong TTL constants, silently degrading enriched-cache lifetime; and (5) letting "docs cleanup" silently cover contract surfaces (Redis-key registry, OpenAPI spec, env-example) that are mechanically enforced by CI gates and must be kept green per-PR throughout.

## Key Findings

### Recommended Stack

Zero new dependencies. The full v2.0 feature set runs on: k6 v1.7.0 (load generation), @playwright/test ^1.58.2 (browser validation under load), Tailwind CSS v4 (subtab redesign via existing `@theme` tokens), transliteration 2.6.1 exact-pinned (water romanization — do not swap), vitest ^4.1.0 + @vitest/coverage-v8 (coverage backfill), and the existing pino/Zod/@upstash/redis primitives. The k6 OSS + Playwright split is the correct 2026 pattern for this serverless/Fluid-Compute target; Grafana Cloud k6 is only warranted above ~1k VUs. All debugging tooling (`scripts/audit-water-names.ts`, `scripts/load-test.js`, `scripts/load-test.spec.ts`) is already present.

**Core technologies (all pre-existing — no change):**

- k6 v1.7.0: backend load generation (1–300 VU ramp, `ramping-vus` stable since k6 v1.0 May 2025)
- @playwright/test ^1.58.2: browser-side functional + Core Web Vitals validation under load
- Tailwind CSS v4 + `@theme` CSS custom props: subtab typography/alignment/grouping redesign
- transliteration 2.6.1 (exact pin): water `nameLatin` romanization — byte-identity-gated, never swap mid-milestone
- vitest + @vitest/coverage-v8: Nyquist coverage backfill for Phases 39/40 surfaces
- Node 22.x global `fetch`: URL-liveness probe (no HTTP-client dep needed)

### Expected Features

**Must have (closes v2.0):**

- Water filter fix — admission gate / Latin-label / desal-synthesis drop diagnosed via telemetry, patched at the identified rejection bucket, verified by snapshot regeneration
- Soft-404 detection + prune correctness — body heuristic on 200 responses; `unknown` bucket excluded from cron-prune; `attemptCount >= 3` gate retained; 403 kept distinct from 404
- Events subtab pipeline detail — wire existing blocks (`WaterfallBlock`, `BudgetBarsBlock`, `DlqBlock`, `EvalScoreBlock`, `FlightRecorderBlock`) into `EventsFiltersSectionV3` (data already in Redis; presentational mount only)
- 3-subtab readability pass — tabular-nums, right-aligned numerics, visual grouping, progressive disclosure on water/events/sites subtabs; off-the-grid aesthetic preserved; ARIA contract frozen
- ~100-VU load test with CI-failing SLO thresholds — edge-cache headers (D-19, currently unimplemented) are a hard prerequisite; p95/error-rate assertions per endpoint must fail CI on regression
- Cron first-tick verification (999.3) + CRON-WATCH-01 7-day watch — non-blocking, auto-reported from existing `cron:lastTick:{name}` keys
- Rate-limiter operator block (999.1) — surface tier config + 429 state; Bearer bypass already wired at D-04
- Phases 39/40 coverage backfill — degrade-open fault paths especially
- Docs cleanup — prose only; contract surfaces (Redis-key registry, OpenAPI, .env.example) stay green throughout all prior phases

**Should have (elevates to operationally excellent):**

- Soft-404 evidence/confidence string in the subtab (shows WHY a link was flagged)
- Per-endpoint SLO table from k6 `handleSummary` — actionable markdown/JSON output
- Dead-link-count / cron-freshness sparkline — trend catches slow-burn regression better than point-in-time

**Defer (out of v2.0 scope):**

- Stress/capacity-ceiling test at 3x+ peak VU
- Status-page "all systems" rollup badge
- External cron-monitor SaaS (Healthchecks.io / Dead Man's Snitch) — anti-feature for single-operator tool
- Push/email/desktop alerting on cron miss

### Architecture Approach

The architecture is fixed and shipped through v1.6. v2.0 work is integration mapping onto the existing module graph — no redesign. The system is: React 19 SPA (Zustand stores -> fetch `/api/*`) -> Express 5 single Vercel function (rate limiter -> route handlers -> lib/) -> Upstash Redis (REST client, 32-key registry, mechanical drift gate). A new edge-cache layer (`Cache-Control: s-maxage` headers on all `/api/*` read routes) is the only net-new architectural addition, sitting ABOVE Redis as a read-absorption tier, never replacing it.

**Major components touched by v2.0:**

1. `server/adapters/overpass-water.ts` — 8-stage water admission pipeline; spatial dedup (O(n²), keyed on facilityType only, 50m threshold) and GENERIC_OSM_NAME_RE/romanization interaction are prime suspects for the drop bug
2. `server/lib/urlLiveness.ts` — URL probe sweep + prune; three identified gaps: source-less events never probed (Gap A), monotonic-reset semantics on `unknown` blocking 3-consecutive-tick accumulation (Gap B), SCAN-only prune scope misses no-key events (Gap C)
3. `src/components/ui/DevApiStatus.tsx` — 3538-line monolith; WAI-ARIA tablist with roving-tabindex; all rich v1.6 LLM blocks already implemented (L2529–2992) but not wired into `EventsFiltersSectionV3` (L3414); recommended extraction to child components without changing DOM contract
4. `scripts/load-test.js` — restructure from current 100-VU-capped shape to D-20 per-VU full-browser-loop, 50->300 VU discrete sweep; add `.github/workflows/load-test.yml` (manual dispatch, not cron)
5. Route handlers (all `/api/*`) — add `Cache-Control: s-maxage=N` headers per D-19 TTL table; confirmed zero such headers currently exist in `server/routes/`

### Critical Pitfalls

1. **Fixing the wrong stage of the water admission pipeline** — run `npm run refresh:water` and read the `byTypeRejections` telemetry bucket that ate the missing facilities BEFORE touching code. A fix that doesn't cite a specific bucket (`duplicate`, `no_resolved_name`, `not_notable`, etc.) is wrong-stage.

2. **Water cache key not bumped on shape change** — ANY change to `WaterFacility` or `WaterFilterStats` shape MUST bump `FACILITIES_KEY` (v3->v4). Degrade-open fallback makes this invisible for up to 24h in prod.

3. **Ghost-link prune tightening deletes live events** — `403` (bot-blocking) is the highest false-positive risk; do NOT add `403`/`unknown`/`410`/`429` to the cron-prune terminal-dead set. Fix probe precision (soft-404 heuristic, source-less event coverage), not prune aggressiveness.

4. **Dashboard redesign breaking the ARIA contract** — tab ids and `aria-labelledby` partners must remain byte-stable. Scope-lock to styling/typography within the existing DOM contract; extract sub-panels without restructuring roles or ids.

5. **7-day cron watch stalling the milestone (Phase 31 repeat)** — CRON-WATCH-01 must be structured as async non-blocking, auto-reporting from `cron:lastTick:{name}` freshness. Early-close criteria must be a logged decision, not a silent repetition of the v1.5 Phase 31 Day-1 close.

6. **Docs/code drift gates failing mid-milestone** — Redis-key registry (`redis-registry.test.ts`), OpenAPI (Redocly lint), and `.env.example` (`check:env`) are mechanically enforced CI gates. Any PR adding/bumping a Redis key MUST update both `CLAUDE.md §Serverless Cache` AND `docs/architecture/redis-keys.md` in the same PR.

7. **Cache writebacks using wrong TTL constants** — any new writer to `events:llm:v3` must use `LLM_TERMINAL_TTL_SEC`; any writer to `water:facilities:v3` must use `WATER_REDIS_TTL_SEC`. Literal TTL numbers silently re-TTL enriched caches down; map falls to raw-GDELT fallback ~24h post-deploy.

8. **Load-testing prod without Bearer/cost guardrails** — the 60/min global rate limiter means an unauthenticated k6 sweep measures the limiter, not capacity. Use a preview deployment + separate Upstash DB; snapshot command count pre/post; never include cron/force/operator endpoints in VU mix.

## Implications for Roadmap

Based on combined research, the dependency-honoring build order is clear and matches the operator-locked priority from PROJECT.md:

### Phase A: Water Filter Fix (Feature 1)

**Rationale:** Operator priority 1; fully independent of all other features; no UI or server coupling. Must complete before water-subtab redesign so the redesign shows correct facility counts.
**Delivers:** Telemetry-diagnosed rejection-bucket fix; `WaterFacility` shape change if needed with FACILITIES_KEY bump (v4); regenerated and committed `src/data/water-facilities.json` snapshot; regression fixture pinning the previously-dropped OSM element.
**Addresses:** Water filter table-stakes (P1).
**Avoids:** Pitfall 1 (wrong-stage diagnosis), Pitfall 2 (cache key not bumped), Pitfall 7 (drift gates — schema test + redis-keys.md update if shape changes).
**Research flag:** Standard pattern. No additional research phase needed.

### Phase B: Ghost Link Prune Gaps (Feature 2a)

**Rationale:** Server-only, independent of dashboard redesign. Probe precision fix (soft-404 heuristic, Gap A/B/C) must precede UI surfaces displaying dead-link state.
**Delivers:** Corrected `urlLiveness.ts` probe coverage for source-less events (Gap A); relaxed monotonic-reset rule for repeated dead-then-unknown patterns (Gap B); expanded SCAN scope for no-key events (Gap C); soft-404 body heuristic on 200 responses; `unknown` excluded from cron-prune; 403 kept distinct from 404; prunedIds sample audit gate built into phase success criteria.
**Avoids:** Pitfall 3 (false-positive prune), Pitfall 8 (TTL constants on any v3 writeback).
**Research flag:** No additional research needed — gaps identified with line-level precision.

### Phase C: Events Subtab LLM Detail (Feature 2b)

**Rationale:** All data exists in Redis and all blocks exist in `DevApiStatus.tsx` — pure wiring pass. Must precede Feature 3 (dashboard redesign) because F3 will extract and restyle the same subtab; wiring before restyling avoids touching the 3538-line file twice.
**Delivers:** `EventsFiltersSectionV3` wired with `WaterfallBlock`, `BudgetBarsBlock`, `DlqBlock`, `EvalScoreBlock`, `FlightRecorderBlock`; DLQ depth, breaker state, eval baseline/drift, run-history all visible; no server changes.
**Avoids:** Pitfall 4 (ARIA contract — data wiring, not DOM restructure).
**Research flag:** No additional research needed — specific line references confirmed.

### Phase D: Dashboard Subtab Readability Redesign (Feature 3)

**Rationale:** Must follow Phase C (same file, same subtab). Purely presentational: tabular-nums, right-aligned numerics, grouping, progressive disclosure, component extraction without DOM contract change.
**Delivers:** Readable water/events/sites subtabs with off-the-grid aesthetic preserved; extracted `WaterSubtab.tsx` / `SitesSubtab.tsx` / `EventsSubtab.tsx`; tab ids and aria-labelledby byte-stable; every block degrade-open; snapshot diffs reviewed deliberately.
**Addresses:** 3-subtab readability table-stakes (P1); dashboard clarity differentiator.
**Avoids:** Pitfall 4 (ARIA breakage); Anti-Pattern 3 (no inline hex — all colors from `@theme`/colorBridge).
**Research flag:** No additional research needed.

### Phase E: General Hardening (Feature 5)

**Rationale:** Must precede the load test. D-18 load-test metrics (429 count, cold-start frequency) directly exercise 999.1/999.3 hardening; verify those first so a load-test failure is unambiguous.
**Delivers:** 999.1 rate-limiter operator block verified + tested; 999.3 cron first-tick post-deploy verification; CRON-WATCH-01 7-day watch structured as non-blocking async with auto-reporting from `cron:lastTick:{name}`; Nyquist coverage backfill for Phases 39/40 degrade-open paths.
**Avoids:** Pitfall 6 (7-day watch stalls milestone — explicit logged early-close criteria citing Phase 31 precedent); Anti-Pattern 4 (no new env-tunable surfaces).
**Research flag:** Explicit CRON-WATCH-01 non-blocking structure decision required at phase-start.

### Phase F: ~100-User Load Test (Feature 4)

**Rationale:** Must run against the fully hardened surface (Phases A–E complete). Edge-cache `s-maxage` headers (D-19, currently unimplemented) must land at the START of this phase — hard prerequisite for the >90% cache-hit PASS bar at 300 VU.
**Delivers:** `Cache-Control: s-maxage=N` headers on all `/api/*` read routes per D-19 TTL table; restructured `scripts/load-test.js` (50->300 VU discrete sweep, per-VU full-browser-loop); `.github/workflows/load-test.yml` (manual dispatch, NOT a cron slot); CI-failing SLO thresholds; p95/p99/error-rate report per endpoint; separate `rate_limited` metric distinct from `http_req_failed`.
**Addresses:** ~100-VU SLO validation (P1); codified SLO thresholds; cold-start measurement.
**Avoids:** Pitfall 5 (wrong target/cost blowout/limiter confusion); Anti-Pattern 2 (edge cache above Redis, not replacing it).
**Research flag:** D-19 per-endpoint `s-maxage` values should be confirmed against `999.5-CONTEXT.md` at phase-start. Preview deployment + separate Upstash DB provisioning must be locked before starting.

### Phase G: Docs Cleanup (Feature 6)

**Rationale:** Last, per v1.6 precedent. Contract surfaces (Redis registry, OpenAPI, .env.example) have been kept green throughout Phases A–F; this phase handles prose only.
**Delivers:** Reconciled CLAUDE.md §Serverless Cache + `docs/architecture/redis-keys.md` prose; updated runbook + ADR narrative; OpenAPI spec prose alignment; README reflecting shipped v2.0 surface.
**Avoids:** Pitfall 7 (drift gates — already green from prior phases; verify once more before close).
**Research flag:** No research needed. Standard documentation pass.

### Phase Ordering Rationale

- F1 before F3: water subtab redesign on wrong facility counts guarantees rework
- F2b before F3: both touch the same 3538-line `DevApiStatus.tsx` file; wiring before restyling avoids a second pass
- F5 before F4: D-18 load-test metrics (429 count, cold-start frequency) validate the 999.1/999.3 hardening; verify first to disambiguate load-test failures
- D-19 edge-cache headers inside F4 at phase start: they are the enabling prerequisite for the cache-hit PASS bar, not a separate feature
- F6 last: drift-gated contract surfaces kept green in every code phase; F6 is prose only

### Research Flags

Needs deeper research during planning:

- **Phase F (load test):** Confirm D-19 per-endpoint `s-maxage` values against `999.5-CONTEXT.md` table before implementation. Lock preview deployment + separate Upstash DB strategy before phase-start.

Standard patterns (no research phase needed):

- **Phase A** (water fix): telemetry-driven diagnosis within existing module
- **Phase B** (ghost-link prune): gaps identified at line-level precision
- **Phase C** (events subtab wiring): block functions at known line ranges, pure mount
- **Phase D** (dashboard redesign): component structure mapped, CSS-only
- **Phase E** (hardening): primitives fully documented; only non-obvious decision is CRON-WATCH-01 non-blocking structure
- **Phase G** (docs): prose reconciliation

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                |
| ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Direct toolchain probe; package.json read; no new deps validated against actual repo                                                                 |
| Features     | MEDIUM     | Well-established SRE conventions + internal grounding; external sources are MEDIUM, project-internal grounding is HIGH                               |
| Architecture | HIGH       | Read against actual shipped codebase with file + line citations; D-19 unimplemented confirmed by grep; EventsFiltersSectionV3 gap confirmed at L3414 |
| Pitfalls     | HIGH       | Grounded in actual source files with specific line numbers, confirmed bugs, and historical failure modes (v1.5 Phase 31 precedent)                   |

**Overall confidence:** HIGH

### Gaps to Address

- **D-19 edge-cache TTL values:** Per-endpoint `s-maxage` values specified in `999.5-CONTEXT.md` D-19 table; confirm at Phase F phase-start against current route handler shapes.
- **Soft-404 heuristic markers and thresholds:** Research recommends body heuristic (title markers, redirect-to-home, near-empty content) but specific markers are not pre-determined. Scope at Phase B phase-start to avoid headless-browser scope creep.
- **Preview deployment infrastructure:** Phase F requires a preview deployment + separate Upstash DB. Whether this needs provisioning is an operational question to resolve before Phase F starts.
- **CRON-WATCH-01 early-close criteria format:** Define the logged-decision format and scheduled-follow-up mechanism at Phase E phase-start to prevent a silent Phase 31 repeat.

## Sources

### Primary (HIGH confidence)

- Direct source-code reads: `server/adapters/overpass-water.ts`, `server/lib/urlLiveness.ts`, `server/routes/operator-status.ts`, `src/components/ui/DevApiStatus.tsx`, `server/middleware/rateLimit.ts`, `server/routes/refresh-events-cron.ts`, `scripts/load-test.js`, `src/__tests__/lib/redis-registry.test.ts`, `package.json`
- `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md` (D-15..D-21 load-test + D-19 edge cache spec)
- `.planning/PROJECT.md` (operator-locked v2.0 priority order)
- `CLAUDE.md` (conventions, cache key registry, anti-patterns)
- grep confirming zero `s-maxage`/`Cache-Control` in `server/routes/` (D-19 unimplemented confirmed)
- v1.5 Phase 31 early-close + Phase 37 slow-burn-regression history (Pitfall 6 grounding)

### Secondary (MEDIUM confidence)

- Grafana k6 GitHub releases + k6.io (k6 v1.0 maturity, `ramping-vus` semver-stable)
- Firecrawl glossary / USPTO patent (soft-404 >25% of dead links)
- k6 thresholds/SLO + load-test type guides (OneUptime, Kodziak, ARDURA)
- Vercel Production Checklist + Rate Limiting docs
- Healthchecks.io / Sentry Crons docs (cron monitoring conventions — cited to inform the in-app alternative)
- Dashboard design / data-table UX references (tabular-nums, right-align numerics, progressive disclosure)

---

_Research completed: 2026-06-09_
_Ready for roadmap: yes_
