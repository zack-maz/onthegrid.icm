# Phase 28: Performance & Load Testing — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning (split into 28.1 / 28.2 / 28.3)

<domain>
## Phase Boundary

Phase 28 is the **umbrella** that closes milestone v1.4 by:

1. Sweeping the codebase for ghost code, duplicate code, normalization gaps, UI bugs, and unresolved debugging items.
2. Synchronizing dev-only and prod surfaces under a coherent policy, renaming the deployment domain to `otg-iran-monitor.vercel.app`, and improving the client/server relationship.
3. Validating that production handles 1–300 concurrent users with measurable PASS/FAIL latency, error, and cache-hit thresholds.

The umbrella is delivered as **three sequenced child phases** (decision D-01 below):

- **Phase 28.1** — Cleanup (ghost/dup code, normalization, UI fixes, debugging, hardcode generalization).
- **Phase 28.2** — Dev/prod sync + domain rename + client/server improvements + rate-limiter readiness.
- **Phase 28.3** — Performance optimization + load test 1–300 VU.

The cleanup, sync, and load-test work share a single CONTEXT.md (this file) so cross-cutting decisions are locked once. Each child phase will have its own PLAN.md scoped to its own commit train, but they consume the decisions below verbatim.

**Out of scope for the entire 28.x umbrella:**

- New layers, new data sources, new visualizations.
- Romanization of non-Latin water names (already deferred to Phase 27.3.3).
- BigQuery GDELT adapter, Telegram channel monitoring (deferred from v1.3).

</domain>

<decisions>
## Implementation Decisions

### Phase Shape & Sequencing

- **D-01:** Split Phase 28 into three child phases: **28.1 cleanup → 28.2 dev/prod sync → 28.3 load test**. Each child merges to `main` before the next starts. No parallel branches. Rationale: cleanup is regression-prone surgical work, sync is policy work, load test is greenfield observability work — bisecting a single mega-phase commit train is too painful.
- **D-02:** Sequencing is **cleanup → sync → load**. Cleanup first kills the most regression risk; sync polishes the prod surface; load test runs against the cleaner code so the numbers are trustworthy. Slowest if cleanup uncovers deep bugs, but yields the most defensible PASS/FAIL signal.
- **D-03:** Domain rename to `otg-iran-monitor.vercel.app` lands in **Phase 28.2** alongside dev/prod sync — keeps all prod-surface changes in one phase. NOT a pre-phase, NOT 28.3. Old domain redirect strategy (hard cutover vs. keep-old-as-redirect) is Claude's discretion at planning time.
- **D-04:** Rate limiter Phase 999.1 (currently backlog — global 6 req/min tier blocks operator's own polling browser) **folds into Phase 28.2**. Resolution: **Bearer-bypass** — when the operator has a valid `DASHBOARD_PASSWORD` Bearer token, the global tier is skipped; per-endpoint limits still apply. Aligns with the dev/prod gate already chosen.

### Dev → Prod Feature Promotion (Phase 28.2)

The `shouldRenderDashboard()` helper in `src/lib/dashboardAuth.ts` and `server/middleware/dashboardAuth.ts` is the canonical Bearer gate. "Bearer-gated graduate" below means: `import.meta.env.DEV` short-circuit OR a stored `DASHBOARD_PASSWORD` Bearer token in localStorage / `Authorization` header.

- **D-05:** **Per-field opt-in** for currently-dev-only debug fields. No blanket "graduate everything" rule. Each field decided individually below.
- **D-06:** **Graduate to Bearer-gated prod**:
  - Event ID + OSM ID values (currently dev-only in `EventDetail.tsx`, `WaterFacilityDetail.tsx`).
  - LLM confidence + provenance fields (currently dev-only in `EventDetail.tsx`).
  - EntityTooltip dev info block (raw entity data dump in `src/components/map/EntityTooltip.tsx:124`).
- **D-07:** **Stay dev-only forever** (do not graduate):
  - `WaterFacilityDetail` `notabilityScore` debug field.
  - `NotificationCard` severity score numeric — explicitly preserved per `memory/project_dev_score_display.md`.
  - `MapDevExposer` programmatic `window.__map` handle in `src/components/map/BaseMap.tsx:458` — testing primitive, footgun risk in prod.
- **D-08:** **Bearer-gated graduate** for operator-control endpoints:
  - `POST /api/events/llm-pipeline` (runtime v1/v2/v3 swap) — operator can swap pipeline version from the deployed dashboard during incidents without a CLI session.
  - `POST /api/events/llm-replay/:groupKey` — operator can re-extract a single group with the current prompt without a `vercel dev` round-trip. **Pitfall 6 dual-gate is preserved**: the endpoint never writes to `events:llm:v3` cache, only returns the diff.
- **D-09:** No new debug-field surfaces are added in Phase 28.2 — the audit is "promote what exists" only, not "build new operator UI."

### Hardcode Tolerance & Generalization (Phase 28.1)

- **D-10:** **Aggressive operator-tunable rule** for _operational levers_: anything an operator might want to nudge during incident response or tuning iteration becomes env-var override. Pattern matches Phase 27.4.x precedent (`LLM_BATCH_TIMEOUT_MS`, `LLM_V3_CONCURRENCY`, `V3_WATCHDOG_ROLLBACK_THRESHOLD`).
- **D-11:** **Domain-definitional constants stay hardcoded, centralized**: `IRAN_BBOX`, `IRAN_CENTER`, `WAR_START`, ADS-B 500NM radius. Move all into one canonical `src/lib/domain.ts` (mirror at `server/lib/domain.ts` if needed). NOT env-tunable — these define what "this dashboard monitors." Single source of truth, no derivation.
- **D-12:** **Polling intervals + thresholds are env-tunable**: 5s flight poll, 30s ship poll, 15min event poll, 6h water-precip poll, 60s stale threshold, 5km attack radius, 50km proximity alert, etc. Each gets a documented env var with current value as default. Pattern: `POLL_FLIGHTS_MS`, `STALE_FLIGHT_MS`, `ATTACK_RADIUS_KM`, `PROXIMITY_ALERT_KM`. Tunable for A/B iteration without redeploy.
- **D-13:** **Visual constants migrate to CSS custom properties + Tailwind v4 `@theme` block** in `src/app.css`. Entity colors (`#eab308` flights, `#ef4444` unidentified, `#a78bfa` ships, etc.) become `--color-flight`, `--color-flight-unidentified`, `--color-ship` etc. Already-established pattern for z-index scale. Icon sizes (4000m flights, 3000m events) stay TS constants — they're deck.gl props, not styling. Single visual-identity source.
- **D-14:** **Ghost code detection methodology**: `npx knip` + `npx ts-prune` for mechanical dead-export enumeration, then a manual codebase walk for logically-dead-but-type-reachable code. Both passes are required — knip catches the easy stuff, manual catches Zustand selectors-of-removed-fields and similar. Output: a triage doc committed before deletions, then atomic per-module deletion commits.

### Load Test Methodology & Success Bar (Phase 28.3)

- **D-15:** **k6 runs from GitHub Actions runner**. Reproducible, free, results land as PR artifacts, easy to gate phase close on a green run. Single-region North America egress accepted. The `scripts/load-test.js` from Phase 21.3 is the starting point.
- **D-16:** **Discrete tier sweep**: six separate runs at 50 / 100 / 150 / 200 / 250 / 300 VU. Each tier holds 5 minutes steady-state after a 60s ramp. Output: latency-vs-VU curve, breakpoint identification. Total wall-time ~45 minutes per full sweep.
- **D-17:** **PASS/FAIL bar** (measured at 300 VU steady-state): p95 < 500ms on hot endpoints (`/api/events`, `/api/flights`), p99 < 1500ms, error rate < 1%, no 5xx spikes, **cache hit ratio > 90%**. The cache-hit threshold is non-negotiable — it validates that Upstash + s-maxage actually absorb the load instead of cascading to upstream.
- **D-18:** **Metrics measured beyond PASS/FAIL** (all four):
  - Per-endpoint latency breakdown (p50/p95/p99 per endpoint, tagged in k6).
  - Rate-limit hit count (429 responses) — validates D-04 Bearer-bypass landed.
  - Vercel function cold-start frequency (first-request-per-VU latency tracked separately) — validates the warm-up cron sufficiency.
  - Upstash Redis cache hit ratio — read from Upstash dashboard during the run, attached to test artifact.
- **D-19:** **Edge cache + Redis fallback architecture**. Add `s-maxage` CDN headers to `/api/*` responses with per-endpoint TTLs:
  - `/api/flights`: 5s
  - `/api/ships`: 30s
  - `/api/markets`: 60s
  - `/api/events`, `/api/news`: 900s (15min)
  - `/api/sites`, `/api/water`: 86400s (24h)
    Vercel CDN absorbs the bulk of reads at 300 VU; Redis only on cache miss + warm-up cron. Trade-off accepted: every VU sees the same edge-cached payload within the s-maxage window — polling parity is automatic. This is part of "client/server relationship improvements" listed in the user's guidelines.
- **D-20:** **Full browser-loop polling per VU**. Each k6 VU runs a "browser session": at t=0 fires site/water/sources/markets/flights/ships/events/news fetches, then polls flights every 5s, ships every 30s, markets every 60s, events every 15min, news every 15min. Mirrors a real multi-tab browser. Roughly 0.27 req/s/VU → ~81 RPS at 300 VU. Replaces Phase 21.3's scenario-split shape (each scenario hammered one endpoint with its own VU pool — useful for per-endpoint stress but not realistic-cohort load).
- **D-21:** **Polling parity**: D-20's per-VU full-loop shape automatically ensures all simulated users poll all endpoints. Combined with D-19 edge cache, all VUs within a given s-maxage window see byte-identical responses — eliminates the "user A sees stale flights, user B sees fresh" divergence concern.

### Claude's Discretion

- Specific old-domain redirect strategy (hard cutover vs. permanent redirect) — D-03 sets the domain target; the redirect mechanic is implementation.
- Specific UI bugs and remaining debugging items get enumerated during 28.1 PLAN drafting (not pre-locked here — the user will surface them when the plan author asks).
- Specific normalization scope (TS strict mode tightening, Zustand selector pattern audit, Redis cache key naming consistency, etc.) — Claude proposes a categorized list during 28.1 RESEARCH, user approves.
- Knip + ts-prune triage doc format and atomic-commit cadence.
- Exact env-var naming for D-12 (will follow `SCREAMING_SNAKE_CASE` and existing `LLM_*` / `NIM_*` precedent).
- Exact CSS custom property naming for D-13 (will follow Tailwind v4 conventions).
- Whether `/api/sources` is a hot endpoint deserving D-19 edge cache (currently cold, may flip if dashboard-auth check pattern changes).
- k6 reporter artifact format (HTML report vs. JSON-only vs. both).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase shape & this phase

- `.planning/ROADMAP.md` §"Phase 28: Performance & Load Testing — was Phase 27" — original goal, deliverables list (staggered API calls, lazy-load layers, code-split, k6 250 VU, request coalescing, CDN cache tuning, warm-up cron evaluation).
- `.planning/STATE.md` — current milestone (v1.4), prior phase 27.4.6 closeout context.
- `CLAUDE.md` §"Cron-Driven Pipeline Trigger (Phase 27.4.6)" — current cron schedule (Hobby cap = 3); load-test-induced pipeline traffic must NOT spawn a fourth cron entry.

### Dev/prod gate (existing infrastructure)

- `src/lib/dashboardAuth.ts` — `shouldRenderDashboard()` + `dashboardAuthHeaders()` + `probeDashboardKey()` client-side Bearer machinery.
- `src/components/ui/DashboardAuthModal.tsx` — operator-facing password entry UI.
- `src/components/ui/DevApiStatus.tsx` — DevApiStatus modal already gated via Bearer + dev short-circuit.
- `src/components/layout/Topbar.tsx` — `DevApiStatusTrigger` placement + dev gate pattern.
- `server/middleware/dashboardAuth.ts` + `server/middleware/dashboardAuth.test.ts` — server Bearer middleware (constant-time compare).
- `server/routes/dashboardAuth.ts` — `/api/dashboard/auth-check` probe endpoint.

### Rate limiter (Phase 999.1 backlog folding into 28.2)

- `server/middleware/rateLimit.ts` — global 6 req/min tier definition.
- `server/index.ts:99` — global tier mount point.
- ROADMAP §"Phase 999.1: Remove or relax `rateLimiters.public` global tier" — the three options already scoped (remove / bump to 300 / Bearer-bypass). D-04 picks Bearer-bypass.

### Hardcode candidates (Phase 28.1)

- `src/components/map/constants.ts` — IRAN_BBOX, IRAN_CENTER, terrain config (D-11 target — centralize into `domain.ts`).
- `src/lib/eventColors.ts` — `EVENT_TYPE_COLORS` palette (D-13 candidate for CSS @theme migration).
- `src/lib/factions.ts` — political faction color palette.
- `src/lib/ethnicGroups.ts` — ethnic zone color palette.
- `src/lib/severity.ts` — type weights, recency decay constants (D-12 env-tunable candidates: `SEVERITY_HALF_LIFE_HOURS`).
- `src/hooks/useFlightPolling.ts`, `useShipPolling.ts`, `useEventPolling.ts`, `useNewsPolling.ts`, `useMarketPolling.ts`, `useWaterPrecipPolling.ts`, `useLLMStatusPolling.ts` — polling-interval constants (D-12 targets).
- `src/lib/attackStatus.ts` — 5km attack radius (D-12 target: `ATTACK_RADIUS_KM`).
- `src/hooks/useProximityAlerts.ts` — 50km proximity alert radius (D-12 target: `PROXIMITY_ALERT_KM`).
- `src/app.css` §`@theme` — existing z-index scale; D-13 extension target.

### Load test (Phase 28.3)

- `scripts/load-test.js` — Phase 21.3 baseline k6 script (current shape: scenario-split, 100 VU max, BASE_URL default `irt-monitoring.vercel.app` — needs domain update per D-03 and shape update per D-20).
- `.planning/phases/21.3-multi-user-load-testing/` — prior load test plan + results (review before drafting 28.3 PLAN).
- `vercel.json` — current cron schedule; D-15 GitHub Actions runner does NOT need a new cron entry, but the test should NOT trigger production cron paths.
- Vercel docs §"Edge cache" / `s-maxage` — D-19 implementation reference (use `vercel:next-cache-components` skill at planning time).

### Domain rename (Phase 28.2)

- `vercel.json` — domain config (review for hard-coded references).
- `package.json` — any URLs in scripts.
- `scripts/load-test.js:18` — BASE_URL default (will need update).
- README.md, PROJECT_SPEC.md, PROJECT_STATUS.md — operator-facing URL references.
- `.planning/PROJECT.md` — milestone "v1.4 Deployment" reference notes.
- Memory: `reference_deployment.md` — current deployment URL note (will need refresh after rename).

### Don't compromise (constraint refs)

- `CLAUDE.md` — comprehensive feature inventory; serves as "must-still-work" checklist for Phase 28.1 cleanup.
- `tests/` and `__tests__/` directories — test suites must stay green at every wave boundary (D-02 strict CI gate pattern from Phase 27.4.2).

### Memories that constrain this phase

- `feedback_phase_boundaries.md` — must merge each child phase to main before starting next (D-01 enforces this).
- `feedback_branch_per_phase.md` — each child phase gets its own feature branch including decimal phases.
- `project_dev_score_display.md` — NotificationCard severity score must stay dev-only (locked into D-07).
- `feedback_handoff_on_usage_limit.md` — save HANDOFF.md proactively if usage limits threaten mid-cleanup-sweep.
- `feedback_project_docs.md` — README, PROJECT_SPEC, PROJECT_STATUS, CHANGELOG, CLAUDE.md must be updated to reflect domain rename + dev/prod policy at 28.2 close.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets (already shipped, this phase consumes them)

- **`shouldRenderDashboard()`** (`src/lib/dashboardAuth.ts:60`) — single source of truth for "is this surface visible to current user?" Used by DevApiStatus and Topbar trigger. D-06/D-08 graduations call this helper instead of `import.meta.env.DEV`.
- **`dashboardAuthHeaders()`** (`src/lib/dashboardAuth.ts:70`) — emits `Authorization: Bearer ${key}` headers for auth-required fetches. D-08 endpoint promotions reuse this verbatim.
- **Server `dashboardAuth` middleware** (`server/middleware/dashboardAuth.ts`) — constant-time Bearer compare, dev short-circuit. Apply to `/api/events/llm-pipeline` and `/api/events/llm-replay` routes for D-08.
- **k6 baseline scenarios** (`scripts/load-test.js`) — scenario-split structure to be restructured into per-VU full-loop per D-20.
- **Tailwind v4 `@theme` block** (`src/app.css`) — z-index scale precedent for D-13 color migration.
- **Knip + ts-prune** — not yet installed, but standard npx tooling, no project-level setup needed.
- **Vercel s-maxage support** — Fluid Compute default; add to existing route handlers via `res.setHeader('Cache-Control', ...)` per D-19.

### Established Patterns (this phase must respect)

- **Atomic per-concern commits** — Phase 27.4.x canon. Each cleanup category, each env var introduction, each promoted field gets its own commit. NOT bundled.
- **Wave gate-keeper checkpoints** — Phase 27.4.2 Plan 04 / Plan 05 pattern. Each child phase has its own wave-1 quality gate (vitest green, lint 0 errors, prettier clean, type-check clean) before downstream waves start.
- **D-XX numbering for decisions** — used in this CONTEXT, propagates into PLAN headers.
- **Pitfall N: anti-pattern enumeration** — when a child phase introduces a new pitfall, document inline (CLAUDE.md after merge).
- **Memory updates after merge** — `reference_deployment.md` must be refreshed after 28.2 domain rename merges.

### Integration Points

- **Phase 27.4.6 cron config** (`vercel.json` `crons` array) — Hobby cap = 3 entries. D-15 load-test-from-CI does NOT consume a slot. Confirm during 28.3 PLAN draft.
- **Phase 27.4.x Redis keys** (`events:llm:v3`, `events:llm-summary:v3`, etc.) — D-19 edge cache lives ABOVE Redis, never replaces it. The cache-bridge fallback chain (Pitfall 1 in 27.4.x) must continue to function with the new edge layer.
- **Existing rate-limit tiers** (`server/middleware/rateLimit.ts`) — D-04 Bearer-bypass adds a new code path; existing per-endpoint limits stay untouched.
- **GitHub Actions workflows** (`.github/workflows/`) — D-15 adds a new manual-trigger workflow `load-test.yml` (or extends an existing CI workflow). Don't run on every PR — manual dispatch only or weekly schedule.

</code_context>

<specifics>
## Specific Ideas

- "Don't compromise current features or functionality" — explicit user directive. The CLAUDE.md feature inventory is the regression test surface. Any 28.1 deletion that touches a CLAUDE.md feature gets a manual UAT trace before the commit.
- "Balancing Redis" — operator concern about cache load distribution at 300 VU. Resolved by D-19 edge-cache architecture (Vercel CDN absorbs the bulk; Redis only on miss).
- "Making sure all users are polling everything" — operator concern about data parity across simulated users. Resolved by D-20 full-browser-loop-per-VU (every VU runs every poller) + D-19 edge cache (every VU within s-maxage window sees identical bytes).
- Phase 27.4.6 noted that DevApiStatus tabs are "always visible whenever shouldRenderDashboard() — dev OR prod-with-Bearer" — this phase's D-06 graduations follow that established gate.
- Aggressive hardcode policy is for OPERATIONAL levers only. Domain-definitional constants (bbox, war start) stay centralized hardcode (D-11) — they define what the dashboard _is_, not how it operates.

</specifics>

<deferred>
## Deferred Ideas

- **Stress test beyond 300 VU** — "find the hard breakpoint" run at 500 VU. Not in 28.3 PASS/FAIL bar; can be added post-phase as an exploratory artifact.
- **Continuous baseline tracking** — wire k6 sweep into a weekly schedule with trend reports. Phase 28.3 ships the test; ongoing baseline tracking is a v1.5+ concern.
- **VPS or Vercel Sandbox runner alternatives** to D-15's GitHub Actions choice — both viable but rejected at this scope; revisit if GH egress geography becomes a measurement artifact.
- **Per-field opt-in (D-05) extension to NEW debug fields** — no new debug fields in 28.2; if any are added in future phases, they re-enter the per-field decision tree.
- **Component-organization phase** for `react-refresh/only-export-components` warnings (17 instances) — captured during Phase 27.4.2 Plan 04 close, owned by a future phase.
- **`react-hooks/exhaustive-deps` cleanup** (6 warnings, some may indicate latent bugs especially `dismissTimers` ref in `ProximityAlertOverlay`) — captured during Phase 27.4.2 Plan 04 close, owned by a future phase.
- **Build Output API migration for `api/vercel-entry.js`** (Phase 999.2 backlog) — eliminates the 1.7MB tracked artifact + manual rebuild discipline. Not folded into 28.x — separate concern, doesn't gate v1.4 close.
- **Cron first-tick verification** (Phase 999.3 backlog) — passive observability, not an active phase concern.
- **Romanization of non-Latin water names** (Phase 27.3.3) — already deferred; not revisited here.

</deferred>

---

_Phase: 28-performance-load-testing-was-phase-27_
_Context gathered: 2026-04-30_
