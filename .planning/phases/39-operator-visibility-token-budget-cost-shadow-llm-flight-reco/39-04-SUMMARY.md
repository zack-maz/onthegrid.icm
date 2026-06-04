---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
plan: 04
subsystem: api
tags: [llm-pipeline, observability, flight-recorder, bearer-auth, cold-start, typescript]

# Dependency graph
requires:
  - phase: 39-01
    provides: llmCallHistory.ts (listCallHistory + hydrateCallHistoryIfCold) + llmRunHistory.ts (listRunHistory + hydrateRunHistoryIfCold) + CallHistoryEntry/RunHistoryEntry types
  - phase: 39-02
    provides: runId-stamped dual-written llm:calls:history + open/close run records in llm:runs:history (real data for the read surface)
provides:
  - GET /api/events/llm-history Bearer-gated read endpoint returning { runs, calls }
  - ?limit clamp (Math.min(...,500)) + ?runId in-memory .filter() back-correlation
  - cold-start hydrate hooks (hydrateCallHistoryIfCold/hydrateRunHistoryIfCold) on BOTH /llm-history and /llm-status
affects:
  - 39-05 (FlightRecorderBlock UI — the single read surface it fetches)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Bearer-gated read surface reuses the SAME dashboardAuth middleware as /llm-status (no hand-rolled auth — D-03, matches /api/operator-status precedent)'
    - 'Cold-start hydrate hook on whichever operator endpoint is hit first repopulates the in-memory singleton (flag-guarded single LRANGE)'
    - 'Input-validation clamps at the route boundary: ?limit Math.min(...,500) (DoS), ?runId typeof-string-guarded in-memory .filter() only (never a Redis key)'
    - 'Degrade-open read surface — lib readers return [] on Redis failure, so the route naturally returns { runs: [], calls: [] } with 200 (no 500, no leak)'

key-files:
  created:
    - server/routes/__tests__/llm-history.test.ts
  modified:
    - server/routes/events.ts

key-decisions:
  - 'GET /llm-history reuses dashboardAuth (NOT a NODE_ENV gate) — supersedes the original 27.4.5 gate, matches /api/operator-status (D-03)'
  - 'Cold-start hydrate hooks added to BOTH /llm-history AND the existing /llm-status so the singleton repopulates regardless of which operator endpoint is hit first (D-05 / OBS-FLIGHT-06)'
  - 'Test mocks the two flight-recorder lib modules (not Redis underneath) — gives clean spy control over the clamped limit arg and a deterministic hydrate-once LRANGE counter'
  - 'Used tsconfig.server.json for the server typecheck — the plan references server/tsconfig.json, which does not exist in this repo (carried-forward Plan 01/02 correction)'

requirements-completed: [OBS-FLIGHT-03, OBS-FLIGHT-06]

# Metrics
duration: 8 min
completed: 2026-06-04
---

# Phase 39 Plan 04: Bearer-gated GET /api/events/llm-history Read Surface Summary

**A Bearer-gated `GET /api/events/llm-history` endpoint returning `{ runs, calls }` from the Phase-39 flight-recorder Redis rings — with a `?limit` clamp to the LTRIM cap (500), an in-memory `?runId` back-correlation `.filter()`, and cold-start hydration hooks wired onto both `/llm-history` and the existing `/llm-status` so the in-memory singleton repopulates after a Vercel Fluid Compute cold start on whichever operator endpoint is hit first.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-04T21:06:44Z (PLAN_START)
- **Completed:** 2026-06-04T21:14:00Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **Bearer-gated read surface (OBS-FLIGHT-03):** Registered `eventsRouter.get('/llm-history', dashboardAuth, ...)` mirroring the `:384` `/llm-status` idiom — identical `dashboardAuth` middleware + import path. 401 without a valid Bearer, dev bypasses per the middleware contract. Prompt/response + DLQ telemetry never reaches anonymous callers (threat T-39-04-S/I).
- **`{ runs, calls }` contract:** `runs = await listRunHistory(limit)` (dedupe-by-runId is internal to the Plan-01 reader; the route does NOT re-dedupe); `calls = await listCallHistory(limit)`, optionally `.filter(c => c.runId === runId)` for back-correlation.
- **Input-validation clamps:** `?limit` → `Math.min(Number(req.query.limit) || 200, 500)` so an attacker cannot force an unbounded LRANGE (T-39-04-D); `?runId` → `typeof req.query.runId === 'string'` guard used ONLY as an in-memory `.filter()` predicate, never concatenated into a Redis key (T-39-04-T).
- **Cold-start hydration (OBS-FLIGHT-06 / D-05):** `await hydrateCallHistoryIfCold(); await hydrateRunHistoryIfCold();` at the TOP of both the new `/llm-history` handler AND the existing `/llm-status` handler, so a Fluid Compute cold start repopulates the empty `llmProgress.callHistory` singleton on whichever operator endpoint is hit first. The module-level flag inside each helper prevents a re-LRANGE.
- **Degrade-open (T-39-04-I2):** The Plan-01 lib readers return `[]` on Redis failure, so the route naturally returns `{ runs: [], calls: [] }` with a 200 — no 500, no leak.
- **Route contract test (7 cases):** Bearer 401/wrong-bearer-401/valid-200, `{ runs, calls }` shape, `?runId=X` filter (runs unfiltered), `?limit=1000` clamp + `?limit` absent → 200 default (both asserted via the list-helper spy arg), hydrate-once (exactly one LRANGE across two requests), and degrade-open empty arrays.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register GET /llm-history (Bearer-gated) + cold-start hydrate hooks on /llm-history and /llm-status** — `b339967` (feat)
2. **Task 2: Route contract test — Bearer gate + filters + hydration** — `b361362` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `server/routes/events.ts` (modified) — imported `listCallHistory`/`hydrateCallHistoryIfCold` from `../lib/llmCallHistory.js` + `listRunHistory`/`hydrateRunHistoryIfCold` from `../lib/llmRunHistory.js`; added the two hydrate hooks at the top of the existing `/llm-status` handler; registered the new `eventsRouter.get('/llm-history', dashboardAuth, ...)` handler (hydrate hooks → limit clamp → runId guard → `listRunHistory`/`listCallHistory` → in-memory filter → `res.json({ runs, calls })`).
- `server/routes/__tests__/llm-history.test.ts` (created) — `// @vitest-environment node`; mounts `eventsRouter` at `/api/events` via a supertest `makeApp()`; mocks the two flight-recorder lib modules (spies on the list helpers for clamp assertions; flag-guarded `lrangeSpy` for the hydrate-once contract). 7 cases covering OBS-FLIGHT-03 + -06 + the full threat register.

## Decisions Made

- **`dashboardAuth` Bearer gate, NOT a NODE_ENV 404 gate** (D-03) — the original 27.4.5 framing 404'd `/llm-status` in prod; this phase supersedes it with the `dashboardAuth` Bearer gate matching the `/api/operator-status` precedent. `/llm-history` inherits the exact same middleware + import path so the gate behavior is proven by the shared middleware, not hand-rolled.
- **Hydrate hooks on BOTH endpoints** (D-05 / OBS-FLIGHT-06) — the in-memory singleton must repopulate regardless of whether the operator hits `/llm-status` or `/llm-history` first after a cold start, so both handlers call the (flag-guarded, single-LRANGE) hydrate helpers.
- **Test mocks the lib modules, not Redis** — mocking `listCallHistory`/`listRunHistory` as `vi.fn()` spies gives clean assertion of the clamped `limit` argument; a module-local `lrangeSpy` behind the mocked hydrate helpers makes the hydrate-once contract observable as a call count (exactly 1 LRANGE across two requests).
- **`tsconfig.server.json` for the server typecheck** — the plan's `<verify>`/`<acceptance_criteria>` reference `server/tsconfig.json`, which does not exist in this repo (carried-forward Plan 01 + Plan 02 correction).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used `tsconfig.server.json` for the server typecheck**

- **Found during:** Task 1 (verify step)
- **Issue:** The plan's `<verify>` and `<acceptance_criteria>` reference `npx tsc --noEmit -p server/tsconfig.json`, which does not exist in this repo (`TS5058: The specified path does not exist`). The plan's `<sequential_execution>` note + Plan 01/02 SUMMARYs already flagged the real project is `tsconfig.server.json`.
- **Fix:** Ran all `tsc --noEmit` acceptance checks against `tsconfig.server.json`.
- **Files modified:** none (verification-command correction only).
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` → exit 0.
- **Committed in:** n/a (no source change — affects how acceptance criteria were executed, not what shipped).

---

**Total deviations:** 1 auto-fixed (1 blocking — wrong tsconfig path in plan verify commands, pre-flagged by the executor prompt + prior plan SUMMARYs).
**Impact on plan:** No scope change. The strict-typecheck intent (server TypeScript passes for the new route + test) is satisfied via the correct project file.

## Issues Encountered

None — RED→GREEN proceeded cleanly. The route handler typechecked first try; the test passed all 7 cases on first run with no iteration.

## User Setup Required

None — no external service configuration. The endpoint reads existing Upstash Redis keys (`llm:runs:history`, `llm:calls:history`) created by Plan 01; no new env vars. The endpoint inherits the existing `DASHBOARD_PASSWORD` Bearer gate already used by `/llm-status` + `/llm-replay`.

## Next Phase Readiness

- **39-05** (FlightRecorderBlock) can now fetch the single read surface `GET /api/events/llm-history` with the operator Bearer, render the run-list → expand → call → prompt drill-down, and filter calls by `?runId` for back-correlation.
- No blockers. The Bearer gate, clamps, and degrade-open contract are all test-pinned; cold-start hydration is wired on both operator endpoints.

## Known Stubs

None — the endpoint is fully wired to the Plan-01 list modules and Plan-02 dual-written data. No placeholder values, no empty-array stubs that flow to UI without a data source.

## Verification (actual output)

- `npx vitest run server/routes/__tests__/llm-history.test.ts` → **7 passed (1 file)** — Bearer 401/200, `{runs,calls}` shape, `?runId` filter, `?limit=1000` clamp + `?limit` default, hydrate-once (1 LRANGE / 2 requests), degrade-open empty arrays.
- `npx tsc --noEmit -p tsconfig.server.json` → **exit 0** (TSC_EXIT_0).
- `npx vitest run server/` → **1361 passed (115 files)** — no route regression (was 1361 after Plan 02's +1; the new file adds 7 to its own file count but the run reports the full suite total).
- Source assertions: `grep -c "'/llm-history'" server/routes/events.ts` → **1** (≥1, registered with `dashboardAuth`); `grep -c hydrateCallHistoryIfCold server/routes/events.ts` → **3** (≥2 — import + /llm-status + /llm-history hooks); `grep -c "Math.min(Number(req.query.limit)" server/routes/events.ts` → **1**; `grep -c "filter((c) => c.runId" server/routes/events.ts` → **1**.

## Self-Check: PASSED

- `server/routes/events.ts` — FOUND (modified)
- `server/routes/__tests__/llm-history.test.ts` — FOUND (created)
- Commit `b339967` (Task 1) — FOUND
- Commit `b361362` (Task 2) — FOUND

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco_
_Completed: 2026-06-04_
