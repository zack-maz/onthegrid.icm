---
phase: 32-ghost-event-url-liveness-dashboard-prune
plan: 03
subsystem: api
tags: [redis, scan, audit-log, quota, dashboardAuth, cron, vercel-pro, scan-cast, chaos, vitest]

# Dependency graph
requires:
  - phase: 32
    plan: 01
    provides: "checkPruneQuota(fingerprint), OperatorAuditEntry.operation widened to admit 'prune-dead-urls', bearerFingerprint() helper"
  - phase: 32
    plan: 02
    provides: 'buildProbeCandidates(), runProbeSweep({eventIdsWithUrls, deadlineMs}), SWEEP_SAFETY_MARGIN_MS, isTerminalDead(), URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY'
  - phase: 28.2
    provides: '/llm-replay route template + dashboardAuth + operator:audit-log SADD pattern (Plan 32-03 mirrors verbatim)'
  - phase: 29
    provides: 'Vercel Pro 800s maxDuration (D-08) — Pitfall 1 deadline budget is computed against this ceiling'
provides:
  - 'server/lib/urlLiveness.ts — pruneDeadUrlEvents({trigger, fingerprint?}) helper splicing dead-URL events out of events:llm:v3 + DEL liveness keys + DECRBY sidecar + audit-log entry'
  - 'server/routes/events.ts — POST /api/events/prune-dead-urls behind dashboardAuth + quota (50/24h manual; cron bypass) + 503-on-throw chaos-test contract'
  - "server/lib/llmExtractionPipeline.ts — runRefreshExtraction's safeWaitUntil IIFE extended with finally-block post-step: buildProbeCandidates → runProbeSweep → pruneDeadUrlEvents({trigger:'cron'}); cronStart captured at function entry; deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS; auto-prune gated on `Date.now() < deadlineMs`"
  - 'server/lib/llmExtractionPipeline.ts — exported LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC for downstream consumers (was: module-private)'
  - 'server/__tests__/lib/urlLiveness.cronPrune.test.ts — 10 helper-level tests pinning D-12 attemptCount gate + D-07 status filter + D-13 delete scope + D-14 audit-log shape + RESEARCH A8 fingerprint literal'
  - 'server/__tests__/routes/events.prune.test.ts — 8 route-level tests pinning D-09 Bearer gate + D-15 manual quota + cron bypass + 503-on-throw + audit delegation'
  - 'server/__tests__/routes/refresh-events-cron.prune.test.ts — 4 cron integration tests pinning post-step dispatch order + deadline plumbing'
  - 'server/__tests__/resilience/redis-death.test.ts — extended chaos coverage for POST /api/events/prune-dead-urls (200|503, NEVER 500)'
affects: [32-04-operator-status-aggregator, 32-05-dashboard-button, 32-06-close]

# Tech tracking
tech-stack:
  added: [] # Zero new npm dependencies — uses existing @upstash/redis ^1.37.0 SCAN + node:crypto for fingerprints
  patterns:
    - 'Bearer-gated destructive action: POST route mounted with dashboardAuth + per-fingerprint daily quota INCR + 503-on-redis-throw (chaos-test contract)'
    - "DIRECT helper invocation from cron (NOT self-HTTP) per RESEARCH A4: cron post-step calls pruneDeadUrlEvents({trigger:'cron'}) inside the same Vercel function instance as the extraction work — no env-dependent deployment URL, no second auth hop"
    - 'finally-block post-step inside safeWaitUntil IIFE: probe/prune cleanup runs on success AND error paths of the existing extraction logic — dead-URL cleanup is orthogonal to whether LLM extraction itself dispatched fresh enrichments this tick'
    - "Wall-clock deadline plumbing across handler↔helper boundary: cronStart captured at runRefreshExtraction() entry, deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS threaded into runProbeSweep AND used as the auto-prune gate so we stay inside Vercel Pro's 800s maxDuration with 60s safety margin reserved for prune + audit-log writes"
    - "MEDIUM-01 plan-checker pin: redis.scan cast to `Promise<[string | number, string[]]>` matches @upstash/redis ^1.37.0 — mirrors Plan 04's buildDeadUrlSample pattern"
    - 'Bulk DECRBY for sidecar count (not N×DECR) — one round-trip beats N — wrapped in try/catch + redis.set underflow floor (Pitfall 6 degrade-open mirroring persistLiveness shape)'
    - 'Audit-log responsibility lives in the helper, NOT the route: avoids double-write between manual-via-route and cron-via-direct-call; Task 2 test 8 pins this invariant'
    - 'Test-side flushSafeWaitUntil() helper: mocks safeWaitUntil to capture the IIFE promise into a shared array so integration tests can await the fire-and-forget post-step before assertions'
    - "Widen route try/catch to wrap the quota check too — chaos-test caught the original implementation calling checkPruneQuota's raw redis.incr OUTSIDE the try block, surfacing as 500 instead of 503 (Rule 2 inline fix)"

key-files:
  modified:
    - 'server/lib/urlLiveness.ts (540 → 870 lines; +330 lines for pruneDeadUrlEvents helper + JSDoc + Plan 32-03 imports)'
    - 'server/lib/llmExtractionPipeline.ts (+82 lines; cronStart capture + safeWaitUntil finally-block post-step + exports for LLM_EVENTS_KEY_ACTIVE / LLM_REDIS_TTL_SEC)'
    - 'server/routes/events.ts (+72 lines; POST /prune-dead-urls + imports for pruneDeadUrlEvents + checkPruneQuota)'
    - 'server/__tests__/resilience/redis-death.test.ts (+45 lines; standalone POST /prune-dead-urls 200|503 chaos test)'
  created:
    - 'server/__tests__/lib/urlLiveness.cronPrune.test.ts (320 lines, 10 tests)'
    - 'server/__tests__/routes/events.prune.test.ts (430 lines, 8 tests)'
    - 'server/__tests__/routes/refresh-events-cron.prune.test.ts (290 lines, 4 tests)'

key-decisions:
  - "Cron auto-prune uses DIRECT helper invocation, not self-HTTP (RESEARCH A4 / Discretion §3). Trade-off: bypasses the HTTP route's dashboardAuth gate but is the only caller inside the same Vercel function instance — the bearerFingerprint:'cron:refresh-events' literal in the audit-log unambiguously identifies the source. Self-HTTP would have required either env-dependent deployment URL or a localhost loopback hack; both fail the cron-only-writer discipline."
  - 'post-step lives in `finally` block (not in the success branch only): probe/prune cleanup runs even when the LLM extraction body throws. Dead-URL maintenance is orthogonal to whether LLM extraction dispatched fresh enrichments this tick — if extraction failed, we still want to probe + prune dead URLs from prior runs.'
  - "Route try/catch widened to include the quota check (Rule 2 inline fix caught by chaos test). The first implementation had checkPruneQuota BEFORE the try block; under Redis death its raw redis.incr threw and propagated to Express's default 500 handler. Widening the try/catch to wrap both the quota check AND the helper call surfaces ANY redis throw as 503 prune_failed."
  - "Exported LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC from llmExtractionPipeline.ts (was module-private). Hand-rolling the literals 'events:llm:v3' and 9000 in pruneDeadUrlEvents would have been the exact drift class CLAUDE.md §'Serverless Cache' warns against. One truth source — the cron writer and prune writer always agree on key + TTL."
  - "DECRBY (not N×DECR) for sidecar count maintenance — one round-trip beats N. Wrapped in try/catch + redis.set(KEY, 0) underflow floor mirroring persistLiveness's Pitfall 6 degrade-open semantics. If a concurrent prune race drives the counter past 0, the next tick's persistLiveness/pruneDeadUrlEvents re-stabilizes."
  - "Audit-log responsibility is the helper's, not the route's. Task 2 test 8 pins this so a future refactor can't accidentally introduce double-write between operator-via-HTTP and cron-via-direct-call."
  - 'MEDIUM-01 plan-checker pin applied inline at the SCAN call: cast `(await redis.scan(cursor, {...})) as [string | number, string[]]` matches @upstash/redis ^1.37.0 — silent shape drift now fails TypeScript instead of producing infinite SCAN loops in production.'

patterns-established:
  - "Bearer-gated destructive endpoint template: clone /llm-replay shape + swap to checkPruneQuota + tighten chaos-test contract (200|503, never 500). Future destructive operator endpoints inherit this exact shape — quota check INSIDE the try/catch, helper call INSIDE the try/catch, audit-log inside the helper, route returns helper's bare return value or 429/503 envelope."
  - "Cron post-step pattern: capture cronStart at runRefreshExtraction() entry, plumb deadline through to long-running probes, gate any subsequent destructive action on `Date.now() < deadlineMs`. Future cron-piggyback cleanup work (e.g. dead-news-cluster scan, stale-geocode prune) consumes this same plumbing — finally-block placement + try/catch wrap + bearerFingerprint:'cron:...' literal."
  - "DIRECT-helper-from-cron over self-HTTP-from-cron: any in-process cleanup that calls a Bearer-gated endpoint should be refactored as a shared helper that both the route AND the cron import. The route owns auth/quota/audit-log envelope; the cron consumes the bare helper with `bearerFingerprint:'cron:<job-name>'` for audit-log attribution."
  - 'Test-side safeWaitUntil draining: integration tests against fire-and-forget IIFE bodies need a shared `pendingPromises` array + `flushSafeWaitUntil()` helper so assertions can run after the post-step completes. Production semantics unchanged (D-12 hard block preserves void return).'

requirements-completed: [GHOST-01, GHOST-04]

# Metrics
duration: 14min
completed: 2026-05-21
---

# Phase 32 Plan 03: Prune Endpoint + Cron Auto-Prune Summary

**Wave-3 destructive-action surface: POST /api/events/prune-dead-urls behind dashboardAuth + 50/24h quota + cron auto-prune via DIRECT helper invocation inside safeWaitUntil — 22 new tests, 2239 total passing, zero regressions, chaos-test contract preserved.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-21T02:32:05Z
- **Completed:** 2026-05-21T02:45:42Z
- **Tasks:** 4 (atomic per-task commits)
- **Files modified:** 3 source + 1 chaos test (4 total)
- **Test files created:** 3 (22 new tests; all GREEN)
- **Branch HEAD:** `2524c34` (after Task 4)

## Accomplishments

- **`pruneDeadUrlEvents({trigger, fingerprint?})`** — single splice helper called by BOTH the dashboard button (manual via Plan 32-05 → Plan 32-03 Task 2 route) and the daily refresh-events cron (Plan 32-03 Task 3 direct invocation). Reads `events:llm:v3`, SCANs the `events:url-liveness:*` keyspace, filters terminal-dead entries (cron-trigger additionally requires `attemptCount >= 3` per D-12), splices the v3 array, bulk DELs the matching liveness keys, DECRBYs the sidecar count, writes the audit-log entry with `bearerFingerprint:'cron:refresh-events'` for cron-origin OR the operator's hash for manual. Returns `{prunedCount, prunedIds}`.
- **`POST /api/events/prune-dead-urls`** — Bearer-gated destructive endpoint mirroring `/llm-replay`'s template. trigger:'manual' consumes a 50/24h per-Bearer slot; trigger:'cron' BYPASSES quota (D-15 system-caller exemption). 200 returns `{prunedCount, prunedIds}`; 429 returns `{error:'prune_quota_exceeded',message,resetsAt}` + `Retry-After`; 503 returns `{error:'prune_failed', detail}` on any Redis throw (chaos-test contract — NEVER 500).
- **`runRefreshExtraction` cron post-step** — `safeWaitUntil` IIFE body extended with a finally-block: `cronStart` captured at function entry, `deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS` (60s safety margin), `buildProbeCandidates()` → `runProbeSweep({eventIdsWithUrls, deadlineMs})` → `pruneDeadUrlEvents({trigger:'cron'})` (gated on `Date.now() < deadlineMs`). All probe/prune errors caught locally so they don't break the extraction outcome.
- **`LLM_EVENTS_KEY_ACTIVE` + `LLM_REDIS_TTL_SEC`** — exported from `llmExtractionPipeline.ts` so the prune helper shares ONE truth source with the cron writer (no hand-rolled literals).
- **Chaos-test contract extension** — `server/__tests__/resilience/redis-death.test.ts` gains a standalone POST `/api/events/prune-dead-urls` test asserting 200|503 (never 500). Caught a real bug: the original route implementation had `checkPruneQuota` BEFORE the try block, so Redis death surfaced as 500. Widened the try/catch to wrap quota check + helper call.
- **22 new tests** — 10 cronPrune + 8 route + 4 cron integration. All GREEN under `vitest run`. Full suite: 2239 passed / 19 skipped / 5 todo / 0 failed (baseline 2216 → +23: 22 new + 1 chaos addition).
- **Zero new npm dependencies.**
- **Zero regressions** — typecheck + lint + build all clean.

## Task Commits

Each task committed atomically on `feature/32-ghost-event-url-liveness-dashboard-prune`:

1. **Task 1: pruneDeadUrlEvents helper + cronPrune test matrix** — `fa34bf1` (feat) — D-12 attemptCount gate + D-13 delete scope + D-14 audit-log shape + RESEARCH A8 fingerprint literal + MEDIUM-01 SCAN signature pin; exports LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC
2. **Task 2: POST /api/events/prune-dead-urls route** — `0c1b434` (feat) — dashboardAuth + checkPruneQuota + cron bypass + 503-on-throw + audit delegation
3. **Task 3: cron post-step inside safeWaitUntil** — `d845d90` (feat) — cronStart capture + finally-block probe/prune + deadline plumbing + DIRECT helper invocation
4. **Task 4: chaos-test extension** — `2524c34` (test) — standalone POST /prune-dead-urls 200|503 coverage + inline fix to widen route try/catch (caught by chaos test)

## Files Created/Modified

- `server/lib/urlLiveness.ts` (MODIFIED, 540 → 870 lines, +330) — added pruneDeadUrlEvents export with full JSDoc covering D-12/D-13/D-14/MEDIUM-01/Pitfall 4/6 + RESEARCH A4/A8; imports widened to admit LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC + appendOperatorAuditEntry
- `server/lib/llmExtractionPipeline.ts` (MODIFIED, +82 lines) — exported LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC (was private); imported buildProbeCandidates + runProbeSweep + pruneDeadUrlEvents + SWEEP_SAFETY_MARGIN_MS; captured cronStart at function entry; added finally-block to safeWaitUntil IIFE with the 3-step post-step + deadline gate + try/catch
- `server/routes/events.ts` (MODIFIED, +72 lines) — imported pruneDeadUrlEvents + checkPruneQuota; added block-scoped POST `/prune-dead-urls` registration after the `/llm-replay` block with full chaos-test-compatible try/catch wrapping both the quota check AND the helper call
- `server/__tests__/resilience/redis-death.test.ts` (MODIFIED, +45 lines) — added standalone Task-4 test asserting POST /prune-dead-urls returns 200|503 (never 500)
- `server/__tests__/lib/urlLiveness.cronPrune.test.ts` (CREATED, 320 lines, 10 tests) — cron attemptCount=3 gate / manual no-gate / unknown-never-pruned / live-never-pruned / audit-log cron literal / audit-log manual fingerprint / events:llm:v3 splice with LLM_REDIS_TTL_SEC / redis.del bulk DEL / DECRBY sidecar / empty v3 cache no-op
- `server/__tests__/routes/events.prune.test.ts` (CREATED, 430 lines, 8 tests) — 401 prod / 200 under-quota / 200 cap-inclusive / 429 over-cap + Retry-After / cron bypass / helper delegation / 503-on-throw / no double audit-log write
- `server/__tests__/routes/refresh-events-cron.prune.test.ts` (CREATED, 290 lines, 4 tests) — runProbeSweep called with future deadlineMs / pruneDeadUrlEvents({trigger:'cron'}) called once / dispatch order via mock.invocationCallOrder / existing dispatched:true contract preserved

## Decisions Made

### Cron auto-prune uses DIRECT helper invocation (NOT self-HTTP) per RESEARCH A4

CONTEXT D-11 left this to Claude's Discretion (option a = direct helper, option b = self-HTTP). Picked (a) because (1) the same Vercel function instance already has all the helper exports loaded, (2) self-HTTP would need either the deployment URL in env (env-bloat) or a localhost-loopback hack (Vercel rejects), (3) the audit-log attribution is unambiguous via the `bearerFingerprint:'cron:refresh-events'` literal so we don't lose the forensic distinction. The HTTP route at POST `/api/events/prune-dead-urls` (Task 2) remains for operator clicks AND for operator-simulated cron triggers (`{trigger:'cron'}` body bypasses quota).

### post-step in `finally` block (not success-only)

The plan didn't explicitly specify placement. Picked `finally` because dead-URL cleanup is orthogonal to whether LLM extraction itself succeeded — if extraction failed on this tick, we still want to probe/prune URLs from prior runs that may have gone dead. `finally` runs on both success AND error paths of the existing try/catch; the probe/prune sub-block has its own try/catch so its failure doesn't change the LLM extraction's reported outcome.

### Widen route try/catch to wrap the quota check (Rule 2 inline fix)

The first Task 2 implementation had `checkPruneQuota(fingerprint)` BEFORE the try block. The chaos test caught this on Task 4: under Redis death the raw `redis.incr` inside checkPruneQuota threw and propagated past the route handler, hitting Express's default error handler → 500. Fix: widen the try to wrap both the quota check AND the helper call. Under chaos, any raw redis throw now surfaces as 503 prune_failed instead of 500. This is Rule 2 (auto-add missing critical functionality — chaos contract is a correctness requirement, not a feature).

### Exported LLM_EVENTS_KEY_ACTIVE + LLM_REDIS_TTL_SEC from llmExtractionPipeline.ts

Plan Task 1 read_first hinted at this: "If they are not exported, export them in the same commit." Hand-rolling 'events:llm:v3' or 9000 inside urlLiveness.ts would have been the exact drift class CLAUDE.md §'Serverless Cache' warns against. One-line widening; one truth source.

### DECRBY (not N×DECR) for sidecar count

Picked single-call DECRBY since it's one Upstash REST round-trip vs. N for the decr-loop. Wrapped in try/catch + `redis.set(KEY, 0)` underflow floor mirroring persistLiveness's Pitfall 6 degrade-open semantics. The test accepts EITHER decr-loop OR decrby — but the implementation chose decrby.

### Test-side flushSafeWaitUntil draining

The Task 3 integration test needed to await the fire-and-forget IIFE before assertions could fire. Mocking `safeWaitUntil` as `(p) => p` returned the promise but nothing awaited it. Solution: mock captures the promise into a shared `pendingPromises` array; `flushSafeWaitUntil()` awaits all pending. Production semantics unchanged (safeWaitUntil remains void per D-12).

## Deviations from Plan

**Rule 2 — auto-add missing critical functionality (route try/catch widening, Task 4):**

- **Found during:** Task 4 chaos test
- **Issue:** Original Task 2 implementation had `checkPruneQuota(fingerprint)` BEFORE the try block. Under simulated Redis death, the raw `redis.incr` inside the lazy-loaded `pruneQuota` module threw and propagated past the route handler to Express's default 500 handler. Chaos-test contract violated.
- **Fix:** Widened the route's try/catch to wrap BOTH the quota check AND the helper call. Any redis throw now surfaces as 503 prune_failed. Single-line code shift; no logic change.
- **Files modified:** server/routes/events.ts
- **Commit:** 2524c34 (Task 4 — combined with the chaos test extension because the test caught the bug it tests)

No other deviations — the plan executed cleanly. The three small refinements documented in Decisions Made (finally-block placement, DECRBY-over-N×DECR, flushSafeWaitUntil pattern) are implementation choices the plan left to Claude's Discretion or which fell within the "Researcher's call" surface; they are not Rule 1-4 deviations.

## Self-Check: PASSED

**Files exist:**

- `server/lib/urlLiveness.ts` — FOUND (540 → 870 lines)
- `server/routes/events.ts` — FOUND (modified)
- `server/lib/llmExtractionPipeline.ts` — FOUND (modified)
- `server/__tests__/lib/urlLiveness.cronPrune.test.ts` — FOUND
- `server/__tests__/routes/events.prune.test.ts` — FOUND
- `server/__tests__/routes/refresh-events-cron.prune.test.ts` — FOUND
- `server/__tests__/resilience/redis-death.test.ts` — FOUND (extended)
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-03-SUMMARY.md` — FOUND (this file)

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**

- `fa34bf1` feat(32): pruneDeadUrlEvents helper with attemptCount gate + audit-log (D-12, D-13, D-14) — FOUND
- `0c1b434` feat(32): POST /api/events/prune-dead-urls behind dashboardAuth (D-09, D-14, D-15) — FOUND
- `d845d90` feat(32): cron post-step calls runProbeSweep + pruneDeadUrlEvents inside safeWaitUntil (D-02, D-11, Pitfall 1) — FOUND
- `2524c34` test(32): redis-death chaos covers POST /api/events/prune-dead-urls (200|503, never 500) — FOUND

**Automated verify commands (all PASS):**

- `git rev-parse --abbrev-ref HEAD` → `feature/32-ghost-event-url-liveness-dashboard-prune`
- `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts server/__tests__/routes/events.prune.test.ts server/__tests__/routes/refresh-events-cron.prune.test.ts` → 3 files / 22 tests passed (10 + 8 + 4)
- `npx vitest run server/__tests__/resilience/redis-death.test.ts` → 11 tests passed (10 existing + 1 new prune coverage)
- `grep -q "export async function pruneDeadUrlEvents" server/lib/urlLiveness.ts` → OK (line 760)
- `grep -q "post('/prune-dead-urls'" server/routes/events.ts` → OK (line 539)
- `grep -q "checkPruneQuota" server/routes/events.ts` → OK
- `grep -q "res\\.status(503)" server/routes/events.ts` → OK (chaos contract)
- `grep -q "runProbeSweep" server/lib/llmExtractionPipeline.ts` → OK
- `grep -q "pruneDeadUrlEvents" server/lib/llmExtractionPipeline.ts` → OK
- `grep -q "SWEEP_SAFETY_MARGIN_MS" server/lib/llmExtractionPipeline.ts` → OK
- `grep -q "'cron:refresh-events'" server/lib/urlLiveness.ts` → OK (RESEARCH A8 literal)
- `grep -q "attemptCount < 3" server/lib/urlLiveness.ts` → OK (D-12 gate)
- `grep -q 'Promise<\[string | number, string\[\]\]>' server/lib/urlLiveness.ts` → OK (MEDIUM-01 SCAN cast)
- `grep -q "LLM_EVENTS_KEY_ACTIVE" server/lib/urlLiveness.ts && grep -q "LLM_REDIS_TTL_SEC" server/lib/urlLiveness.ts` → OK (no hand-rolled literals; imported from llmExtractionPipeline.ts)
- **D-13 delete-scope proof** — `grep -nE "llmLineage|callHistory|news:" server/lib/urlLiveness.ts` returns ONE line (line 730 JSDoc documenting the NOT-touched scope — no functional reference)
- `npm run typecheck` → `type-coverage success` (97.49% — above 97 floor)
- `npm run lint` → 0 errors / 27 pre-existing warnings (none from Plan 32-03 files)
- `npm run build` → ESM build success / api/vercel-entry.js 1.69 MB
- `npx vitest run` → 2239 passed / 19 skipped / 5 todo / 0 failed (baseline 2216 → +23)

## Chaos-test command output snippet (Task 4)

```
RUN  v4.1.2 /Users/zackmaz/Desktop/otg-iran-monitor

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  19:42:24
   Duration  49.75s
```

The 11th test is the new `POST /api/events/prune-dead-urls returns 200 or 503 (NEVER 500) under Redis death` — proves the 200|503 contract holds end-to-end under simulated Upstash REST throwing on every call.

## Issues Encountered

**Chaos test caught a real route bug** (Task 4): the first implementation had `checkPruneQuota(fingerprint)` BEFORE the route's try block. Under Redis death the raw `redis.incr` inside checkPruneQuota threw and propagated to Express's default 500 handler. The chaos test FAILED on its first run with `AssertionError: expected 500 not to be 500`. Fix: widen the route try/catch to wrap the quota check (Rule 2 inline auto-fix, committed alongside the test extension in 2524c34).

**Test-side safeWaitUntil draining** (Task 3): the integration test for the cron post-step couldn't directly assert against the IIFE side effects because `safeWaitUntil` is intentionally void (D-12 hard block). Solution: mock `safeWaitUntil` to capture the IIFE promise into a shared `pendingPromises` array, then call `flushSafeWaitUntil()` after `runRefreshExtraction()` to drain pending work. This pattern is documented in the test file's JSDoc so future cron post-step tests can reuse it. Production semantics unchanged.

## User Setup Required

**None.** All changes are pure-TypeScript libraries + routes + tests. No env vars, no new npm packages, no Vercel cron entries (Plan 32-03 piggybacks on the existing 04:00 UTC `/api/cron/refresh-events`). The prune route mounts behind the existing `DASHBOARD_PASSWORD` Bearer gate — same auth surface as `/llm-replay`.

## Next Plan Readiness

**Plan 32-04 (operator-status aggregator)** is unblocked:

- `operator:audit-log` entries with `operation:'prune-dead-urls'` are now being written by both manual (route) and cron (helper) paths.
- `args.trigger`, `args.prunedCount`, `args.prunedIds` are stashed in the audit entry per RESEARCH Common Op 2 path (b) — Plan 32-04's aggregator just reads SMEMBERS, parses JSON, and groups by operation type.
- The sidecar `events:url-liveness-count` integer is maintained on both probe (INCR via Plan 02 persistLiveness) AND prune (DECRBY via Plan 03 pruneDeadUrlEvents) — Plan 32-04's dashboard count surface can read this single key.

**Plan 32-05 (dashboard button)** is unblocked:

- `POST /api/events/prune-dead-urls` is live, Bearer-gated, body `{trigger:'manual'}`.
- Returns `{prunedCount, prunedIds}` on success; 429 with `Retry-After` at quota; 503 with `prune_failed` on Redis death.
- Plan 32-05's button can `fetch('/api/events/prune-dead-urls', {method:'POST', body:JSON.stringify({trigger:'manual'})})` and render the JSON result directly.

**Plan 32-06 (close)** is unblocked at the dependency level.

**Blockers / concerns:** None for Plan 32-03 completion. Plan-checker LOW-01 (`pruneDeadUrlEvents reads events:llm:v3 twice`) is observably ONE read per call in the final implementation — the cost concern was a planning-time over-flag. No action needed.

---

_Phase: 32-ghost-event-url-liveness-dashboard-prune_
_Plan: 03_
_Completed: 2026-05-21_
