---
phase: 32-ghost-event-url-liveness-dashboard-prune
plan: 04
subsystem: api
tags:
  [redis, sidecar, scan, audit-log, aggregator, dashboardAuth, scan-cast, low-03-drilldown, vitest]

# Dependency graph
requires:
  - phase: 32
    plan: 01
    provides: "URL_LIVENESS_COUNT_KEY + URL_LIVENESS_KEY_PREFIX exports; OperatorAuditEntry.operation widened to admit 'prune-dead-urls'; UrlLiveness type"
  - phase: 32
    plan: 02
    provides: 'events:url-liveness-count sidecar maintained by persistLiveness (INCR on live→dead); isTerminalDead() predicate exported'
  - phase: 32
    plan: 03
    provides: "events:url-liveness-count DECRBY on prune; operator:audit-log entries with operation='prune-dead-urls' written by both manual route and cron auto-prune"
  - phase: 28.2
    provides: '/api/operator-status aggregator scaffold (audit24h + byBearer + advEval — Phase 32 Plan 04 adds the `prune` sibling block)'
provides:
  - 'server/routes/operator-status.ts — GET /api/operator-status response gains `prune: {deadUrlCount, last24hPrunes, deadUrlSample}` sibling block'
  - "server/routes/operator-status.ts — local AuditEntry.operation union widened to 'pipeline-swap' | 'replay' | 'prune-dead-urls'"
  - 'server/routes/operator-status.ts — byFingerprint Map value extended with `prunes: number` counter; byBearer[] result shape carries the new field'
  - 'server/routes/operator-status.ts — buildDeadUrlSample() module-private helper: SCAN events:url-liveness:* (cap 20 entries, MAX_SCAN_KEYS=200 budget); degrade-open on Redis throw'
  - 'server/routes/__tests__/operator-status.test.ts — 11 new contract tests pinning deadUrlCount + last24hPrunes + byBearer.prunes + deadUrlSample shapes + degrade-open paths'
affects: [32-05-dashboard-button-and-drilldown-list, 32-06-close]

# Tech tracking
tech-stack:
  added: [] # Zero new npm dependencies — reuses existing @upstash/redis ^1.37.0 SCAN + cache/redis cacheGetSafe + lib/urlLiveness exports
  patterns:
    - 'Sidecar-key O(1) read for dashboard counts (Pitfall 3 mitigation): `redis.get(URL_LIVENESS_COUNT_KEY)` replaces what would have been an N×GET over the events:url-liveness:* keyspace per dashboard poll. Maintained jointly by Plan 32-02 (INCR on probe) and Plan 32-03 (DECRBY on prune).'
    - 'Defensive numeric coercion at every Redis-integer reader boundary: `Math.max(0, Number(raw) || 0)` handles null absence, string drift, NaN garbage, and DECR underflow with one expression. T-32-11 mitigation.'
    - "Per-block try/catch envelope inside the aggregator GET handler: sidecar count read, advEval read, and buildDeadUrlSample SCAN each have their own degrade-open try/catch so a single subsystem failure doesn't cascade past its block. Mirrors the advEval pattern at the same offset (Pitfall 6 chaos-test contract for read-only routes)."
    - 'Derived counter inside an already-parsed audit pass: `last24hPrunes` filters the SAME `last24h` array the existing aggregator already iterates — zero additional Redis round-trips. Same pattern used by `byFingerprint` for swaps/replays/prunes.'
    - "Bounded SCAN drill-down with dual budget guards (LOW-03 drill-down resolution): LIMIT_DRILL_DOWN=20 caps the payload, MAX_SCAN_KEYS=200 caps the wall-clock budget. Cursor short-circuited via `cursor = 0` assignment inside the loop so a runaway keyspace can't blow the aggregator budget."
    - 'MEDIUM-01 plan-checker pin (also applied in Plan 32-03 pruneDeadUrlEvents): `redis.scan(cursor, opts)` cast `as [string | number, string[]]` matches @upstash/redis ^1.37.0 — silent shape drift fails TypeScript instead of producing infinite SCAN loops in production. Tests mock the tuple shape verbatim.'
    - 'Single truth source for terminal-dead predicate: `isTerminalDead(status)` imported from urlLiveness.ts (not duplicated as a local string-union check). Same predicate used by sweep sidecar maintenance + prune helper + this aggregator. Drift impossible by construction.'
    - "AuditEntry.operation union widening applied in TWO places per phase (Plan 32-01 widened the canonical OperatorAuditEntry in operatorAudit.ts; Plan 32-04 widens the LOCAL copy in operator-status.ts). Otherwise SADD entries with `operation: 'prune-dead-urls'` parse successfully at the canonical layer but drop silently from the aggregator pass."

key-files:
  modified:
    - 'server/routes/operator-status.ts (155 → 326 lines; +174 lines for `prune` block + buildDeadUrlSample helper + AuditEntry/aggregator widening + JSDoc; -4 lines from the old byFingerprint Map type signature)'
    - 'server/routes/__tests__/operator-status.test.ts (148 → 521 lines; +373 lines for the Phase 32 Plan 04 describe block + extended mock surface for redis.scan / cacheGetSafe)'
  created: [] # No new files — all changes are extensions

key-decisions:
  - 'Helper extraction over inline SCAN loop: `buildDeadUrlSample()` is module-private (not exported) so its degrade-open try/catch is the canonical scope for SCAN failures. Inlining the loop inside the GET handler would have either (a) added a 3rd nested try/catch making the handler hard to read or (b) collapsed the SCAN error path into the outer 500 handler — both worse than helper extraction.'
  - "deadUrlSample short-circuit uses `cursor = 0` (not `break` from the outer do/while): the do/while loop condition checks `cursor !== 0 && cursor !== '0'`, so assigning 0 lets the existing loop exit naturally. `break` would have worked equally but `cursor = 0` is uniform with the LIMIT_DRILL_DOWN and MAX_SCAN_KEYS exhaustion paths inside the inner for-loop. Single termination mechanism throughout."
  - 'Local AuditEntry vs canonical OperatorAuditEntry kept SEPARATE (not refactored to import-and-reuse). The local interface ignores `args` / `result` / `errorMessage` deliberately — the aggregator only reads `timestamp` / `bearerFingerprint` / `operation`. Coupling the local copy to the full canonical type would force future audit-log extensions to widen this aggregator surface unnecessarily. Local-narrow + sync-on-union-widening is the lower-coupling design.'
  - "Mocked `redis.scan` returns `[0, []]` by default (not `mockResolvedValue` per-test): individual tests override via `mockResolvedValueOnce` / `mockImplementation`, but the default exists in `beforeEach` so any test that doesn't care about the sample path gets a clean empty drill-down without per-test boilerplate. Mirrors the existing `mockRedis.smembers.mockResolvedValue([])` default at the original test scaffold."
  - "Test mock for `cacheGetSafe` returns the cached envelope shape `{data, stale, lastFresh}` (not just the `data` payload) so it matches the runtime contract from `server/cache/redis.ts:211`. Tests that mock it as a bare value would compile against the type signature but the route's `cached?.data` dereference would dispense `undefined` and the SCAN filter would silently drop every entry. Caught during local test authoring."

patterns-established:
  - 'Dashboard aggregator sidecar-read pattern: `redis.get<number | string>` + `Math.max(0, Number(raw) || 0)` is the canonical shape for ANY future numeric sidecar surfaced on /api/operator-status. Future GHOST-style ghost-counters (e.g. stale-news-cluster count, orphaned-geocode count) clone this exactly.'
  - 'Bounded SCAN drill-down for aggregator surfaces: any future dashboard list that needs more than a count + less than a full streaming export uses this triple: (a) LIMIT_DRILL_DOWN to cap payload, (b) MAX_SCAN_KEYS to cap wall-clock budget, (c) `cursor = 0` short-circuit inside both inner-break and outer-loop-exit paths.'
  - 'Per-block degrade-open inside an aggregator: the route handler stays the backstop for unexpected throws (returns 500 once), but every individual sub-block (audit-log read, sidecar read, eval-payload read, SCAN drill-down) MUST have its own try/catch returning a safe default. This is the read-only-route correctness contract — partial degrade is always better than no surface.'

requirements-completed: [GHOST-03]

# Metrics
duration: 11min
completed: 2026-05-20
---

# Phase 32 Plan 04: /api/operator-status `prune` Block Summary

**Wave-4 dashboard-aggregator surface: GET /api/operator-status now returns `{audit24h, byBearer, advEval, prune}` where `prune.{deadUrlCount, last24hPrunes, deadUrlSample}` gives Plan 32-05's dashboard component the count + drill-down list it needs in a single Bearer-gated call — O(1) sidecar read for the count, in-memory derivation for the prune counter, bounded SCAN drill-down for the sample. 11 new contract tests; 2250 total passing (+11); zero regressions; chaos-test contract preserved by per-block degrade-open envelopes.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-21T02:53:00Z (approximate — STATE.md last activity)
- **Completed:** 2026-05-21T03:04:00Z
- **Tasks:** 1 (atomic TDD pair: RED commit `af11707`, GREEN commit `5435196`)
- **Files modified:** 1 source + 1 test (2 total)
- **Test files created:** 0 (extended existing operator-status.test.ts)
- **Branch HEAD after Plan 04:** `5435196` (feat commit)

## Accomplishments

- **`prune` sibling block on `/api/operator-status`** — response payload extends from `{audit24h, byBearer, advEval}` to `{audit24h, byBearer, advEval, prune}`. The `prune` block has three fields:
  - `deadUrlCount: number` — sidecar O(1) read of `events:url-liveness-count` (the integer key Plan 32-02 INCRs on live→dead transitions and Plan 32-03 DECRBYs on prune). Defensive coercion `Math.max(0, Number(raw) || 0)` floors at 0 across null absence, NaN garbage, string drift, and DECR underflow (T-32-11 mitigation).
  - `last24hPrunes: number` — counts audit-log entries with `operation === 'prune-dead-urls'` within the rolling 24h window. Derived from the SAME `last24h` array the existing aggregator already iterates — zero extra Redis round-trips.
  - `deadUrlSample: Array<{eventId, url, status}>` — bounded drill-down list (LOW-03 plan-checker resolution). SCAN over `events:url-liveness:*` with LIMIT_DRILL_DOWN=20 payload cap + MAX_SCAN_KEYS=200 wall-clock-budget cap. Each entry: bare `eventId` (no key prefix), the last URL probed, and the terminal-dead status (`'dead-host' | '403' | '404'`).
- **`byBearer[].prunes` counter** — per-fingerprint result shape extends from `{actions, swaps, replays}` to `{actions, swaps, replays, prunes}`. Increments per `prune-dead-urls` audit entry, attributed to BOTH operator fingerprints AND to the literal `'cron:refresh-events'` pseudo-fingerprint (RESEARCH A8) so manual + cron prunes stay distinguishable.
- **Local `AuditEntry.operation` union widening** — extended from `'pipeline-swap' | 'replay'` to `'pipeline-swap' | 'replay' | 'prune-dead-urls'`. Without this widening, SADD entries with the new tag would parse fine at the canonical `OperatorAuditEntry` layer (widened in Plan 32-01) but drop silently from the aggregator pass.
- **`buildDeadUrlSample()` module-private helper** — extracted SCAN loop with the dual budget guards (LIMIT_DRILL_DOWN + MAX_SCAN_KEYS) wrapped in a degrade-open `try/catch` returning `[]` on any throw. The SCAN signature `as [string | number, string[]]` cast matches `@upstash/redis ^1.37.0` — MEDIUM-01 plan-checker pin (also applied in Plan 32-03 `pruneDeadUrlEvents`). Cursor short-circuits via `cursor = 0` for uniform termination across LIMIT exhaustion + MAX_SCAN_KEYS exhaustion + natural cursor return.
- **11 new contract tests** — extended `server/routes/__tests__/operator-status.test.ts` with a `Phase 32 Plan 04 prune block` describe. Three test groups: (1) `deadUrlCount` × 5 (happy path, null, NaN, throw, negative-floor), (2) `last24hPrunes` + `byBearer.prunes` × 2, (3) `deadUrlSample` × 4 (shape filter, LIMIT cap, SCAN-throw degrade-open, MAX_SCAN_KEYS budget). All 14 file-total tests GREEN under `vitest run`.
- **Full vitest run** — 2250 passed / 19 skipped / 5 todo / 0 failed (baseline 2239 from Plan 03 → +11 new). `npm run typecheck` clean (type-coverage 97.50%, above 97 floor). `npm run build` clean (api/vercel-entry.js 1.70 MB; rebuild deferred to phase close per existing convention).
- **Zero new npm dependencies.**
- **Zero regressions** — typecheck + lint + build + full suite all clean.

## Task Commits

Plan 32-04 lands as TWO atomic commits on `feature/32-ghost-event-url-liveness-dashboard-prune` per TDD RED → GREEN discipline:

1. **RED — failing contract tests** — `af11707` (test) — 11 new tests asserting the `prune` block shape + degrade-open paths. Tests RED until the production code lands.
2. **GREEN — production change** — `5435196` (feat) — `prune` block implementation + AuditEntry union widening + byBearer.prunes counter + buildDeadUrlSample helper. All 14 tests GREEN.

## Files Created/Modified

- `server/routes/operator-status.ts` (MODIFIED, 155 → 326 lines, +174 / -4) — added imports for `URL_LIVENESS_COUNT_KEY`, `URL_LIVENESS_KEY_PREFIX`, `isTerminalDead`, `UrlLiveness`, `cacheGetSafe`; added `LIMIT_DRILL_DOWN = 20`, `MAX_SCAN_KEYS = 200`, `DeadUrlSampleEntry` type, `buildDeadUrlSample()` helper; widened local `AuditEntry.operation` union; extended `byFingerprint` Map value type with `prunes: number` + aggregator loop increment; appended `prune` block to the GET handler with per-block try/catch on the sidecar read; updated `res.json({...})` to include the new sibling field.
- `server/routes/__tests__/operator-status.test.ts` (MODIFIED, 148 → 521 lines, +373) — extended `mockRedis` with `scan: vi.fn()`; added module-level `mockCacheGetSafe = vi.fn()`; extended `vi.mock('../../cache/redis.js', ...)` to expose both; appended a new `describe('/api/operator-status — Phase 32 Plan 04 prune block', ...)` block with 11 tests across 3 groups.

## Decisions Made

### Helper extraction over inline SCAN loop

`buildDeadUrlSample()` is module-private (not exported). Inlining the loop inside the GET handler would either (a) add a third nested try/catch making the handler hard to read or (b) collapse the SCAN error path into the outer 500 handler — both worse than helper extraction. The function is small enough that the export surface stays minimal; tests exercise it via the route handler's end-to-end behavior.

### `cursor = 0` short-circuit (not `break` from the outer do/while)

The do/while loop condition checks `cursor !== 0 && cursor !== '0'`. Assigning `cursor = 0` inside the inner for-loop lets the existing loop exit naturally on all three termination paths: (1) LIMIT_DRILL_DOWN cap (20 dead entries collected), (2) MAX_SCAN_KEYS cap (200 keys scanned), (3) natural SCAN cursor return to 0. Single termination mechanism throughout, fewer branches to test.

### Local `AuditEntry` vs canonical `OperatorAuditEntry` kept SEPARATE (not refactored to import-and-reuse)

The local interface ignores `args` / `result` / `errorMessage` deliberately — the aggregator only reads `timestamp` / `bearerFingerprint` / `operation`. Coupling the local copy to the full canonical type would force future audit-log extensions to widen this aggregator surface unnecessarily. Local-narrow + sync-on-union-widening is the lower-coupling design (and the existing Plan 28.2 aggregator established this pattern).

### Default mocks in `beforeEach` for `scan` + `cacheGetSafe`

Individual tests override via `mockResolvedValueOnce` / `mockImplementation`, but the default (`[0, []]` for scan, `null` for cacheGetSafe) exists in `beforeEach` so any test that doesn't care about the sample path gets a clean empty drill-down without per-test boilerplate. Mirrors the existing `mockRedis.smembers.mockResolvedValue([])` default at the original Phase 28.2 scaffold.

### Mocked `cacheGetSafe` returns the cached envelope shape (not just the data payload)

Tests mock `cacheGetSafe` to return `{data: <UrlLiveness>, stale: false, lastFresh: <ms>}` matching the runtime contract from `server/cache/redis.ts:211`. Tests that mocked it as a bare value would compile against the type signature but the route's `cached?.data` dereference would dispense `undefined` and the SCAN filter would silently drop every entry. Caught during local test authoring before the RED commit.

## Deviations from Plan

**None.** Plan 32-04 executed exactly as written. The plan's Task 1 action block specified `cursor: number | string = 0`, the SCAN cast pattern, and the per-test mock seeds verbatim; all three landed unchanged. The plan ordered the commits as "feat then test" but TDD discipline reverses that (RED first, GREEN second) — the plan's text was a verbal ordering and explicitly accepted one combined commit as fallback, so the test-first-then-feat ordering is within the plan's discretion clause. No Rule 1-4 deviations.

## Self-Check: PASSED

**Files exist:**

- `server/routes/operator-status.ts` — FOUND (155 → 326 lines)
- `server/routes/__tests__/operator-status.test.ts` — FOUND (148 → 521 lines)
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-04-SUMMARY.md` — FOUND (this file)

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**

- `af11707` test(32-04): add failing contract tests for /api/operator-status prune block — FOUND
- `5435196` feat(32-04): /api/operator-status surfaces prune block (GHOST-03, Pitfall 3) — FOUND

**Automated verify commands (all PASS):**

- `git rev-parse --abbrev-ref HEAD` → `feature/32-ghost-event-url-liveness-dashboard-prune`
- `npx vitest run server/routes/__tests__/operator-status.test.ts` → 14 tests passed (3 original + 11 new)
- `grep -q "URL_LIVENESS_COUNT_KEY" server/routes/operator-status.ts` → OK (2 references: import + use)
- `grep -q "URL_LIVENESS_KEY_PREFIX" server/routes/operator-status.ts` → OK (4 references: import + match-pattern + 2× strip-prefix)
- `grep -q "isTerminalDead" server/routes/operator-status.ts` → OK (4 references: import + filter + 2× JSDoc)
- `grep -q "prune-dead-urls" server/routes/operator-status.ts` → OK (4 references: union + aggregator filter + filter + JSDoc)
- `grep -q "deadUrlCount" server/routes/operator-status.ts` → OK (5 references: JSDoc + handler local + Math.max + prune obj + JSDoc)
- `grep -q "deadUrlSample" server/routes/operator-status.ts` → OK (multiple references)
- `grep -q "buildDeadUrlSample" server/routes/operator-status.ts` → OK (3 references: declaration + call + JSDoc)
- `grep -q "prunes: number\\|prunes: 0\\|prunes += 1" server/routes/operator-status.ts` → OK (3 occurrences: type + init + increment)
- `grep -q 'Promise<\[string | number, string\[\]\]>' server/routes/operator-status.ts` → OK (1 occurrence at the SCAN cast — matches Plan 32-03's pattern)
- `grep -c "URL_LIVENESS_COUNT_KEY\\|events:url-liveness-count" server/routes/operator-status.ts` → 2 (one import reference, one redis.get use — exactly as the plan's <verification> expected: "should be 1 or 2")
- `npm run typecheck` → `type-coverage success` (97.50% — above 97 floor)
- `npx eslint server/routes/operator-status.ts server/routes/__tests__/operator-status.test.ts` → 0 errors / 0 warnings on these files
- `npm run build` → ESM build success / api/vercel-entry.js 1.70 MB (rebuild artifact NOT committed per existing convention — Plan 32-06 close PR will commit the final bundle)
- `npx vitest run` → 2250 passed / 19 skipped / 5 todo / 0 failed (baseline 2239 → +11 new)

## Test command output snippet

```
RUN  v4.1.2 /Users/zackmaz/Desktop/otg-iran-monitor

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  19:55:37
   Duration  548ms (transform 184ms, setup 54ms, import 334ms, tests 32ms, environment 0ms)
```

11 new Phase 32 Plan 04 tests (in addition to the 3 original Phase 28.2 W5 tests):

```
✓ /api/operator-status — Phase 32 Plan 04 `prune` block (11)
  ✓ prune.deadUrlCount: reads sidecar key when present as a number
  ✓ prune.deadUrlCount: defaults to 0 when sidecar key absent (null)
  ✓ prune.deadUrlCount: defaults to 0 when sidecar returns NaN garbage
  ✓ prune.deadUrlCount: defaults to 0 when redis.get throws (degrade-open, 200 preserved)
  ✓ prune.deadUrlCount: floors negative counts at 0 (underflow defense)
  ✓ prune.last24hPrunes: counts only `prune-dead-urls` entries in the last 24h window
  ✓ byBearer[].prunes: increments per prune-dead-urls entry, attributed to bearer fingerprint
  ✓ prune.deadUrlSample: returns terminal-dead entries with {eventId, url, status} shape
  ✓ prune.deadUrlSample: caps at 20 entries when more than 20 terminal-dead exist
  ✓ prune.deadUrlSample: defaults to [] when SCAN throws (degrade-open, deadUrlCount still populated)
  ✓ prune.deadUrlSample: short-circuits SCAN at MAX_SCAN_KEYS=200 to bound budget
```

## Sample response shape

Curl-style sample of the new `/api/operator-status` response. Bearer header omitted for brevity; Plan 32-05's dashboard fetches this via `dashboardAuthHeaders()`:

```json
{
  "audit24h": 12,
  "byBearer": [
    {
      "bearerFingerprint": "a3f9c8d1",
      "actions": 8,
      "swaps": 0,
      "replays": 5,
      "prunes": 3
    },
    {
      "bearerFingerprint": "cron:refresh-events",
      "actions": 4,
      "swaps": 0,
      "replays": 0,
      "prunes": 4
    }
  ],
  "advEval": {
    "total": 25,
    "blocked": 24,
    "leaked": 1,
    "score": 0.96
  },
  "prune": {
    "deadUrlCount": 17,
    "last24hPrunes": 7,
    "deadUrlSample": [
      {
        "eventId": "ev-abc123",
        "url": "https://example.com/article-1",
        "status": "404"
      },
      {
        "eventId": "ev-def456",
        "url": "https://example.com/article-2",
        "status": "dead-host"
      }
    ]
  }
}
```

## Issues Encountered

**`cacheGetSafe` mock-shape mismatch caught during local test authoring** (pre-RED-commit): the first draft of the deadUrlSample tests mocked `cacheGetSafe` returning a bare `UrlLiveness` payload, but the route's `cached?.data` dereference expects the cached-envelope shape `{data, stale, lastFresh}`. The bare-value mock would have compiled fine and made every entry silently drop. Fixed by aligning the mock to the runtime contract from `server/cache/redis.ts:211` before committing the RED gate. This is a planning-time pattern issue (not a deviation); the plan's action body specified the SCAN signature but not the cacheGetSafe envelope shape — flagged here for Plan 32-05's dashboard tests to learn from.

## User Setup Required

**None.** All changes are pure-TypeScript route + test extensions. No env vars, no new npm packages, no Vercel config edits. The `/api/operator-status` endpoint is already Bearer-gated (mounted behind `dashboardAuth`); the new `prune` block inherits the same auth surface. Plan 32-05's dashboard component fetches via `dashboardAuthHeaders()` (already imported per Plan 32-03 patterns).

## Next Plan Readiness

**Plan 32-05 (dashboard button + drill-down list)** is unblocked:

- `/api/operator-status` JSON response now contains the full `prune` block surface — count, last24h aggregate, AND the cap-20 drill-down list.
- LOW-03 plan-checker drill-down resolution is fully delivered server-side: Plan 32-05's UI just renders `opStatus.prune.deadUrlSample` as a `<ul data-testid="dead-url-list">` with status badge + eventId + url + truncation row when `prune.deadUrlCount > prune.deadUrlSample.length`.
- MEDIUM-03 plan-checker resolution (Plan 05 `fetchOpStatus` reference) is unaffected by Plan 04 — the dashboard already polls /api/operator-status and Plan 05's instruction to hoist `fetchOpStatus` into a named callback for prune-button reuse remains valid.
- Sample shape is documented in the curl example above + pinned by the 11 new contract tests — Plan 32-05's dashboard tests can mock the response without ambiguity about field types.

**Plan 32-06 (close)** is unblocked at the dependency level. Phase-close PR will rebuild `api/vercel-entry.js` once per the existing per-phase build-artifact convention.

**Blockers / concerns:** None. Plan-checker MEDIUM-01 (SCAN signature pin) is satisfied for the second time in the phase (Plan 32-03 + Plan 32-04 both apply the cast). LOW-03 (drill-down list) is fully resolved — Plan 32-05's UI work consumes the deadUrlSample directly.

---

_Phase: 32-ghost-event-url-liveness-dashboard-prune_
_Plan: 04_
_Completed: 2026-05-20_
