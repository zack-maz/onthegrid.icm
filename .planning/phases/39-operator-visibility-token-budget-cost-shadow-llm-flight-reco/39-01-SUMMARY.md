---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
plan: 01
subsystem: api
tags: [redis, upstash, observability, llm-pipeline, flight-recorder, typescript]

# Dependency graph
requires:
  - phase: 28.2.7
    provides: llm:lastProgress write-through (cold-start hydration model, D-05)
  - phase: 27.4
    provides: llmDLQ.ts bounded-list + parseEntry idiom (analog for both new modules)
provides:
  - CallHistoryEntry + RunHistoryEntry interfaces + runId? field on LLMPipelineProgress
  - llmCallHistory.ts (llm:calls:history LPUSH+LTRIM 500/30d + cold-start hydration)
  - llmRunHistory.ts (llm:runs:history open/close lifecycle + dedupe-by-runId, 200/30d)
  - Three-surface registration of both new Redis keys (drift gate green)
affects:
  - 39-02 (runId threading through runRefreshExtraction; open/close run record at run boundary)
  - 39-03 (GET /api/events/llm-history Bearer-gated read endpoint consuming both list modules)
  - 39-04 (FlightRecorderBlock UI rendering runs/calls drill-down)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Bounded Redis ring (LPUSH + LTRIM + EXPIRE) reused from llmDLQ.ts for ordered history lists'
    - 'Re-LPUSH + dedupe-by-runId (first/head wins) for run-record open/close lifecycle (GA-2, avoids fragile LSET-by-index)'
    - 'Module-level flag-guarded cold-start hydration (set-first, never retry-loop) mirroring llm:lastProgress write-through'
    - 'Degrade-open observability writes — every Redis op try/caught, never throws out of the fire-and-forget pipeline'

key-files:
  created:
    - server/lib/llmCallHistory.ts
    - server/lib/llmRunHistory.ts
    - server/lib/__tests__/llmCallHistory.test.ts
    - server/lib/__tests__/llmRunHistory.test.ts
  modified:
    - server/lib/llmProgress.ts
    - CLAUDE.md
    - docs/architecture/redis-keys.md

key-decisions:
  - 'RunHistoryEntry is a NEW interface, NOT an overload of LLMRunSummary (RESEARCH correction — different artifact)'
  - 'closeRunRecord re-LPUSHes the terminal record rather than LSET-by-index (LTRIM shifts indices; re-LPUSH is append-only and ordering-safe)'
  - 'Reader dedupes by runId head-first so a never-closed running record survives as the maxDuration-kill signal (Pitfall 5, by design)'
  - 'CallHistoryEntry adds runId + batchIndex to the in-memory callHistory row shape (D-02)'

patterns-established:
  - 'LLM flight-recorder list modules are structurally parallel (parseEntry, pushRecord, hydrate flag) for maintenance symmetry'
  - 'Test-only __reset*HydrationForTest exports let unit tests clear module-level hydration flags between cases'

requirements-completed: [OBS-FLIGHT-01, OBS-FLIGHT-02, OBS-FLIGHT-06]

# Metrics
duration: 5 min
completed: 2026-06-04
---

# Phase 39 Plan 01: LLM Flight-Recorder Data Layer Summary

**Two Redis-backed bounded-list modules (`llm:calls:history` 500/30d, `llm:runs:history` 200/30d) with degrade-open write/read/hydration helpers, new CallHistoryEntry/RunHistoryEntry types + a runId field on llmProgress, and three-surface drift-gate registration of both keys.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-04T20:44:49Z
- **Completed:** 2026-06-04T20:49:33Z
- **Tasks:** 4
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Defined the Wave-0 contracts every downstream plan consumes: `CallHistoryEntry` (callHistory fields + `runId` + `batchIndex`), `RunHistoryEntry` (v3/NIM-adapted per-run shape), and an optional `runId?` field on `LLMPipelineProgress` + `INITIAL_PROGRESS` — without touching the distinct `LLMRunSummary` interface.
- Built `llmCallHistory.ts` — append (LPUSH+LTRIM 0..499+EXPIRE 30d), list (parseEntry string-or-object guard), and flag-guarded cold-start hydration that repopulates the cap-20 in-memory singleton without overwriting a non-empty one.
- Built `llmRunHistory.ts` — `openRunRecord` (running record), `closeRunRecord` (re-LPUSH terminal, NOT LSET), `listRunHistory` (dedupe-by-runId head-first), and a symmetry hydration helper.
- Registered both keys across all three drift-gate surfaces (CLAUDE.md bullets + redis-keys.md table rows + code literals) — the HARD phase gate `redis-registry.test.ts` passes (41 cases green).

## Task Commits

Each task was committed atomically:

1. **Task 1: Define flight-recorder types + runId field** - `cb68abc` (feat)
2. **Task 2: Build llmCallHistory.ts + test** - `d67ea9a` (feat, TDD test+impl folded)
3. **Task 3: Build llmRunHistory.ts + test** - `2c0dcff` (feat, TDD test+impl folded)
4. **Task 4: Register both keys across three drift surfaces** - `b03b3ee` (docs)

_Note: Tasks 2 and 3 are TDD — the failing test (RED) and the implementation (GREEN) were authored in sequence and committed together per task; the RED→GREEN transition was verified live (module-not-found failure → 5/6 passing)._

## Files Created/Modified

- `server/lib/llmCallHistory.ts` (created) — `appendCallHistory` / `listCallHistory` / `hydrateCallHistoryIfCold` for `llm:calls:history`; degrade-open; parseEntry guard.
- `server/lib/llmRunHistory.ts` (created) — `openRunRecord` / `closeRunRecord` / `listRunHistory` (dedupe-by-runId) / `hydrateRunHistoryIfCold` for `llm:runs:history`; re-LPUSH terminal lifecycle.
- `server/lib/__tests__/llmCallHistory.test.ts` (created) — 5 cases: lpush/ltrim(0,499)/expire(30d), mixed string+object parse, hydrate-once + flag short-circuit, no-overwrite, degrade-open.
- `server/lib/__tests__/llmRunHistory.test.ts` (created) — 6 cases: open running, close re-LPUSH (not lset), dedupe terminal head-first, never-closed-running survivor (Pitfall 5), degrade-open, hydrate-once.
- `server/lib/llmProgress.ts` (modified) — added `runId?: string` (+ `INITIAL_PROGRESS` clear), exported `CallHistoryEntry` + `RunHistoryEntry`; `LLMRunSummary` untouched.
- `CLAUDE.md` (modified) — two bullets under "Active Redis keys (current-state registry)".
- `docs/architecture/redis-keys.md` (modified) — two rows in the `llm:*` table.

## Decisions Made

- **RunHistoryEntry is new, not an LLMRunSummary overload** — RESEARCH corrected CONTEXT here; `LLMRunSummary` is the `/llm-status` last-run artifact persisted to `events:llm-summary:v3`, a different shape and lifecycle.
- **closeRunRecord re-LPUSHes, never LSET-by-index** — LTRIM shifts list indices, making index-based mutation fragile; re-LPUSH is append-only and ordering-safe, and the reader's dedupe-by-runId (head/terminal-first) returns the terminal state (GA-2).
- **Never-closed `running` record is intentional** — a `maxDuration`-killed run leaves only its `running` record; the reader returns it as the "run that died" signal (Pitfall 5), not an error.
- **Added `__reset*HydrationForTest` test-only exports** — needed to clear the module-level hydration flag between unit cases (small surface, test-only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected the server typecheck tsconfig path**

- **Found during:** Task 1 (verify step)
- **Issue:** The plan's `<verify>` and `<acceptance_criteria>` reference `server/tsconfig.json`, which does not exist in this repo. `npx tsc --noEmit -p server/tsconfig.json` errors `TS5058: The specified path does not exist`.
- **Fix:** Used the actual server typecheck project `tsconfig.server.json` (the path `package.json` build/lint config already points at) for all `tsc --noEmit` acceptance checks. Also ran the full project `tsc -b` to confirm the shared `llmProgress.ts` changes typecheck on both server and client sides.
- **Files modified:** none (verification-command correction only).
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` exits 0; `npx tsc -b` exits 0.
- **Committed in:** n/a (no source change — affects how acceptance criteria were executed, not what shipped).

---

**Total deviations:** 1 auto-fixed (1 blocking — wrong tsconfig path in plan verify commands).
**Impact on plan:** No scope change. The intent (server TypeScript strict passes for the new types) was satisfied via the correct project file; the full-project typecheck additionally confirms no client-side regression from the shared module edit.

## Issues Encountered

None — RED→GREEN proceeded cleanly for both TDD modules; the only friction was the tsconfig path (handled as a deviation above).

## User Setup Required

None - no external service configuration required. Both Redis keys are written/read by existing Upstash infrastructure; no new env vars introduced.

## Next Phase Readiness

- Data-layer contracts and helpers are ready for **39-02** (thread `runId` through `runRefreshExtraction`, call `openRunRecord`/`closeRunRecord` at the run boundary, dual-write call entries from `freeClaudeRouter.ts`).
- **39-03** can register `GET /api/events/llm-history` consuming `listRunHistory` + `listCallHistory` + the two hydration helpers.
- No blockers. The HARD drift gate is green, so subsequent consumer wiring will not be blocked by registry parity.

## Verification (actual output)

- `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` → **5 passed**
- `npx vitest run server/lib/__tests__/llmRunHistory.test.ts` → **6 passed**
- `npx vitest run src/__tests__/lib/redis-registry.test.ts` → **41 passed** (HARD gate)
- Combined run (3 files) → **52 passed (3 files)**
- `npx tsc --noEmit -p tsconfig.server.json` → exit 0
- `npx tsc -b` (full project) → exit 0

## Self-Check: PASSED

- `server/lib/llmCallHistory.ts` — FOUND
- `server/lib/llmRunHistory.ts` — FOUND
- `server/lib/__tests__/llmCallHistory.test.ts` — FOUND
- `server/lib/__tests__/llmRunHistory.test.ts` — FOUND
- Commit `cb68abc` (Task 1) — FOUND
- Commit `d67ea9a` (Task 2) — FOUND
- Commit `2c0dcff` (Task 3) — FOUND
- Commit `b03b3ee` (Task 4) — FOUND

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco_
_Completed: 2026-06-04_
