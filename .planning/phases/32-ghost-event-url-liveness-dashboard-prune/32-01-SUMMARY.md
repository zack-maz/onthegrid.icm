---
phase: 32-ghost-event-url-liveness-dashboard-prune
plan: 01
subsystem: infra
tags: [zod, redis, quota, schema-contract, ttl, audit-log, typescript-union, vitest]

# Dependency graph
requires:
  - phase: 28.2
    provides: 'operator-action pattern (Bearer-gated endpoints + operator:audit-log SADD bounded set + per-Bearer replay-quota INCR), reused verbatim by pruneQuota.ts'
  - phase: 31
    provides: 'snapshot-cron-watch.test.ts schema-pinning pattern (Zod .strict() + WatchRowSchema), mirrored by UrlLivenessSchema contract test'
provides:
  - 'server/lib/urlLiveness.ts — UrlLivenessSchema (Zod .strict()), UrlLivenessStatus, UrlLiveness, ttlSecForStatus(), URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY'
  - "server/lib/pruneQuota.ts — checkPruneQuota(fingerprint), PruneQuotaResult, QUOTA_KEY_PREFIX = 'operator:prune-quota:'"
  - "server/lib/operatorAudit.ts — OperatorAuditEntry.operation union widened to admit 'prune-dead-urls' (no behavioral change)"
  - 'server/__tests__/lib/urlLiveness.schema.test.ts — D-22 canonical schema contract (14 tests)'
  - 'src/__tests__/lib/urlLiveness.schema.test.ts — D-22 literal-path shim (5 tests)'
  - 'server/__tests__/lib/pruneQuota.test.ts — INCR / 50-cap / 51st-denied / UTC-midnight-reset (6 tests)'
affects:
  [
    32-02-probe-primitive,
    32-03-prune-endpoint-and-cron,
    32-04-operator-status-aggregator,
    32-05-dashboard-button,
    32-06-close,
  ]

# Tech tracking
tech-stack:
  added: [] # Zero new npm dependencies per RESEARCH A9 (slopcheck N/A)
  patterns:
    - 'Zod .strict() schema as runtime contract pinned before any writer exists (mirrors snapshot-cron-watch.ts; D-22)'
    - 'Tiered TTL by status pure-function lookup (TTL_SEC_BY_STATUS map + ttlSecForStatus(); D-20)'
    - 'Per-Bearer per-day quota counter via INCR-then-EXPIRE-on-first idiom (mirrors replayQuota.ts; D-15)'
    - 'TypeScript union widening as standalone chore commit, separate from first consumer (PATTERNS.md Metadata Primary-risk mitigation)'
    - 'Dual schema-test placement: canonical at codebase-convention path + 5-line shim at literal CONTEXT path (RESEARCH A5 recommendation b)'
    - 'MEDIUM-02 plan-checker fix: NODE_ENV=test assertion at file-import time (regression guard against future runner config drift)'

key-files:
  created:
    - 'server/lib/urlLiveness.ts (153 lines)'
    - 'server/lib/pruneQuota.ts (108 lines)'
    - 'server/__tests__/lib/urlLiveness.schema.test.ts (133 lines, 14 tests)'
    - 'src/__tests__/lib/urlLiveness.schema.test.ts (67 lines, 5 tests)'
    - 'server/__tests__/lib/pruneQuota.test.ts (136 lines, 6 tests)'
  modified:
    - 'server/lib/operatorAudit.ts (+12 / -2; union widening + JSDoc note)'

key-decisions:
  - 'Schema test placement chosen as dual canonical + shim: canonical at server/__tests__/lib/urlLiveness.schema.test.ts (matches existing convention); 5-line direct-import shim at src/__tests__/lib/urlLiveness.schema.test.ts (literal CONTEXT D-22 path) — independent assertions, NOT a vitest test-file re-import, so the shim survives even if the canonical file moves'
  - "attemptCount JSDoc pins monotonic-with-reset-on-live-or-unknown semantics (resolves RESEARCH Open Question / A2) — pure-monotonic would conflate dead→live→dead with three-in-a-row-dead and falsely trigger D-12's cron auto-prune gate"
  - "pruneQuota.ts cloned verbatim from replayQuota.ts (single namespace swap to operator:prune-quota:) rather than refactored into a generic createDailyQuotaCounter() factory — CONTEXT D-15 explicit 'consistency-with-existing-pattern wins' + intentional future-divergence room if destructive-action cap ever needs to tighten"
  - "Union widening landed as standalone chore(32) commit (Task 5) — addresses PATTERNS.md Primary-risk that the union widening must happen before ANY caller writes operation: 'prune-dead-urls'; isolating it in its own commit makes Plan 32-03's first consumer commit reviewable in isolation"
  - "MEDIUM-02 surgical fix applied: pruneQuota.test.ts asserts expect(process.env.NODE_ENV).toBe('test') at file-import time so future runner config drift (e.g. vitest no longer forcing test mode) fails this file loudly"
  - "log binding pre-wired in urlLiveness.ts via const log = logger.child({ module: 'urlLiveness' }); void log — avoids follow-up edit in Plan 32-02 (probe/sweep consumers); zero runtime cost (single property read)"

patterns-established:
  - 'D-22 contract-pinning before writer: any future schema drift fails the test on the next vitest run; Plan 32-02 can edit the writer freely knowing the contract surface is locked'
  - 'Tiered TTL upper-bound assertion (exact equality + ≤ ceiling pair): catches both silent drift AND deliberate tightening, forcing CONTEXT updates when the policy changes'
  - "Lazy redis import inside the helper body (await import('../cache/redis.js')) so vitest's vi.mock('../../cache/redis.js') applies consistently — matches replayQuota / llmDLQ pattern, NOT top-level import"
  - 'TypeScript union pre-emptive widening: when a new operation tag is about to be written by a future commit, widen the union in a separate chore commit ahead of the consumer to keep the consumer commit reviewable in isolation'

requirements-completed: [GHOST-02]

# Metrics
duration: 12min
completed: 2026-05-21
---

# Phase 32 Plan 01: URL Liveness Foundation Summary

**Wave-0 foundation: UrlLivenessSchema (Zod .strict()) + tiered TTL helper + pruneQuota (50/24h per-Bearer) + audit-log union widened — all pinned by 25 contract tests before any Plan 32-02..06 writer exists.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-21T01:58:35Z (planning-step STATE.md commit)
- **Completed:** 2026-05-21T02:10Z (final chore commit `9201240`)
- **Tasks:** 5 (1 branch op + 4 atomic commits)
- **Files modified:** 6 (5 created + 1 modified)
- **Test files created:** 3 (25 new tests; all green)
- **Branch HEAD:** `9201240` (after Task 5)

## Accomplishments

- **`server/lib/urlLiveness.ts`** — D-19 + D-20 + D-22 foundation: `UrlLivenessSchema` (Zod `.strict()`), 5-status enum (`live | 404 | 403 | dead-host | unknown`), `ttlSecForStatus()` returning the tiered TTL (7d / 24h / 24h / 24h / 1h), `URL_LIVENESS_KEY_PREFIX` + `URL_LIVENESS_COUNT_KEY` constants, and the `attemptCount` JSDoc pinning monotonic-with-reset semantics.
- **`server/lib/pruneQuota.ts`** — D-15 helper: `checkPruneQuota(fingerprint)` returning `{allowed, used, cap, resetsAt, retryAfterSeconds}` via INCR-then-EXPIRE-on-first against `operator:prune-quota:{fp}:{YYYY-MM-DD}` with 48h sliding TTL. 50/24h cap inclusive (51st call → `allowed:false`).
- **`server/lib/operatorAudit.ts`** — D-14 prep: `OperatorAuditEntry.operation` widened from `'pipeline-swap' | 'replay'` to `'pipeline-swap' | 'replay' | 'prune-dead-urls'` so Plan 32-03 can write entries without TS2322. JSDoc updated to cite the `'cron:refresh-events'` fingerprint convention.
- **3 contract tests / 25 assertions** — all GREEN under `vitest --environment node` (server-side) and `vitest run` (jsdom shim is `// @vitest-environment node` even though it lives under `src/`).
- **Zero new npm dependencies** (RESEARCH A9 / Phase 32 slopcheck N/A).
- **Zero regressions** — full suite `npx vitest run` exits 0 with 2183 passed / 19 skipped / 5 todo (same baseline as pre-Task-1).

## Task Commits

Each task committed atomically on `feature/32-ghost-event-url-liveness-dashboard-prune`:

1. **Task 1: Cut feature branch** — no commit (branch op only; HEAD `5dbcf8b` → `feature/32-ghost-event-url-liveness-dashboard-prune` pushed to origin with upstream tracking)
2. **Task 2: UrlLiveness schema + TTL surface** — `3c6b9cd` (feat)
3. **Task 3: D-22 schema contract test + shim** — `7d69e16` (feat)
4. **Task 4: pruneQuota helper + test** — `b9b83d5` (feat)
5. **Task 5: Widen OperatorAuditEntry.operation union** — `9201240` (chore)

## Files Created/Modified

- `server/lib/urlLiveness.ts` (CREATED, 153 lines) — Zod schema, status enum, TTL map + `ttlSecForStatus()`, Redis key constants, pre-wired pino child logger
- `server/lib/pruneQuota.ts` (CREATED, 108 lines) — Verbatim clone of `replayQuota.ts` with `operator:prune-quota:` namespace + `checkPruneQuota()` + `PruneQuotaResult` rename
- `server/lib/operatorAudit.ts` (MODIFIED, +12 / -2) — Union widened to admit `'prune-dead-urls'`; JSDoc cites Plan 32-03 writers + CONTEXT D-11 fingerprint convention
- `server/__tests__/lib/urlLiveness.schema.test.ts` (CREATED, 133 lines, 14 tests) — D-22 canonical: parse round-trip + 4 strict-mode rejections + 5 TTL upper bounds + 5 exact-equality TTL assertions
- `src/__tests__/lib/urlLiveness.schema.test.ts` (CREATED, 67 lines, 5 tests) — D-22 literal-path shim: independent direct-import assertions covering strict-mode + 5 TTL upper bounds
- `server/__tests__/lib/pruneQuota.test.ts` (CREATED, 136 lines, 6 tests) — INCR-then-EXPIRE-on-first / second-call-no-EXPIRE / 50th-cap-inclusive / 51st-denied / UTC-midnight-resetsAt / `operator:prune-quota:` prefix sanity

## Decisions Made

### D-22 schema-test placement: dual canonical + shim

The plan offered three options (canonical-only, shim-only, dual). Picked the dual approach per RESEARCH A5 recommendation (b) so the literal CONTEXT path satisfies D-22's directive AND the codebase convention (server-side schema tests in `server/__tests__/`) is preserved. The shim is NOT a vitest cross-test re-import — it's an independent file that imports `UrlLivenessSchema` + `ttlSecForStatus` directly from the server-side module and re-runs minimal-but-genuine assertions (strict() rejection + 5 TTL upper bounds). If the canonical file is ever moved or deleted, the shim continues to enforce the contract.

### attemptCount semantics: monotonic-with-reset-on-live-or-unknown

CONTEXT explicitly deferred this to Claude's Discretion (§4). Picked monotonic-with-reset so the cron auto-prune rule (D-12 "≥3 consecutive ticks") fires only when a URL has been dead 3 probe ticks in a row — pure-monotonic would conflate dead→live→dead with 3-in-a-row-dead and falsely trigger the auto-prune. JSDoc on `UrlLivenessSchema.attemptCount` pins the semantics so Plan 32-02 has zero ambiguity when implementing the writer.

### pruneQuota.ts: verbatim clone, not a generic factory

CONTEXT D-15 explicitly says "consistency-with-existing-pattern wins." A `createDailyQuotaCounter(prefix, cap, ttlSec)` factory would compress code by ~50% but couples the two quota helpers' future evolution. They're more likely to diverge (e.g. tighter destructive-action cap on prune later) than to stay locked. Kept them as parallel files with byte-identical structure + key-namespace swap.

### Pre-emptive union widening as standalone commit

PATTERNS.md Primary-risk identifies the union widening as the single TypeScript coupling between Phase 32 and the existing audit-log surface. Two options: (a) bundle widening with Plan 32-03's first consumer commit, (b) standalone chore commit ahead of any consumer. Picked (b) so Plan 32-03's first commit (the prune endpoint + helper) is reviewable in isolation without the union-widening noise mixed in.

### MEDIUM-02 surgical fix in `pruneQuota.test.ts`

Plan-checker MEDIUM-02 warned about `process.env.NODE_ENV === 'test'`-gated exports. The `pruneQuota.test.ts` doesn't actually use conditional exports (it tests the helper directly via dynamic import after `vi.mock`), but the principle applies broadly: future tests that DO gate on test-mode behavior should fail loudly if NODE_ENV is wrong. Added `expect(process.env.NODE_ENV).toBe('test')` at file-import time as a regression guardrail.

## Deviations from Plan

**None - plan executed exactly as written.**

The plan-checker MEDIUM-02 surgical fix (NODE_ENV assertion in `pruneQuota.test.ts`) was applied as the plan-checker verdict explicitly instructed ("address inline during execution"). Not a deviation — this is the plan-checker's surgical addition to the plan.

The one small mid-stream adjustment: my first draft of `pruneQuota.ts` had a JSDoc line reading `Redis key prefix: 'operator:prune-quota:' (not 'operator:replay-quota:')` which tripped the `! grep -q "operator:replay-quota:"` automated verification. Rephrased to `(distinct namespace)` so the file contains zero `operator:replay-quota:` mentions. This is a single-word JSDoc tweak, not a deviation rule trigger.

## Self-Check: PASSED

**Files exist:**

- `server/lib/urlLiveness.ts` — FOUND
- `server/lib/pruneQuota.ts` — FOUND
- `server/__tests__/lib/urlLiveness.schema.test.ts` — FOUND
- `src/__tests__/lib/urlLiveness.schema.test.ts` — FOUND
- `server/__tests__/lib/pruneQuota.test.ts` — FOUND
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-01-SUMMARY.md` — FOUND (this file)

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**

- `3c6b9cd` feat(32): UrlLiveness schema + tiered TTL + key constants — FOUND
- `7d69e16` feat(32): UrlLiveness D-22 schema contract test + literal-path shim — FOUND
- `b9b83d5` feat(32): pruneQuota helper mirroring replayQuota (D-15, 50/24h) — FOUND
- `9201240` chore(32): widen OperatorAuditEntry.operation union for prune-dead-urls — FOUND

**Automated verify commands (all PASS):**

- `git rev-parse --abbrev-ref HEAD` → `feature/32-ghost-event-url-liveness-dashboard-prune`
- `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/urlLiveness.schema.test.ts server/__tests__/lib/pruneQuota.test.ts` → 3 test files / 25 tests passed
- `grep -q "URL_LIVENESS_KEY_PREFIX = 'events:url-liveness:'" server/lib/urlLiveness.ts` → OK
- `grep -q "URL_LIVENESS_COUNT_KEY = 'events:url-liveness-count'" server/lib/urlLiveness.ts` → OK
- `grep -q "\.strict()" server/lib/urlLiveness.ts` → OK
- `grep -q "operator:prune-quota:" server/lib/pruneQuota.ts` → OK
- `grep -q "checkPruneQuota" server/lib/pruneQuota.ts` → OK
- `! grep -q "operator:replay-quota:" server/lib/pruneQuota.ts` → OK
- `grep -q "'pipeline-swap' | 'replay' | 'prune-dead-urls'" server/lib/operatorAudit.ts` → OK
- `npm run typecheck` → `type-coverage success` (97.44%; ≥97 floor)
- `npm run lint` → 0 errors / 23 pre-existing warnings (none from Plan 32-01 files)
- `npx vitest run` → 2183 passed / 19 skipped / 5 todo / 0 failed (baseline preserved)

## Issues Encountered

**JSDoc grep collision** (Task 4): First draft of `pruneQuota.ts` JSDoc referenced `'operator:replay-quota:'` in a "not X" parenthetical that tripped the `! grep -q "operator:replay-quota:"` automated check. Rephrased to "distinct namespace" — the JSDoc still conveys the parallel-to-replayQuota intent without the literal string. Single-word fix, no code change.

## User Setup Required

None — no external service configuration needed for Plan 32-01. All 5 files are pure-TypeScript libraries + tests, no env vars, no new npm packages, no Vercel cron entries.

## Next Phase Readiness

**Plan 32-02 (probe primitive + sweep orchestrator)** is unblocked:

- `UrlLivenessSchema` is pinned + tested — probe writer can `cacheSetSafe(key, parsed, ttlSecForStatus(status))` immediately
- `URL_LIVENESS_KEY_PREFIX` + `URL_LIVENESS_COUNT_KEY` constants available
- `attemptCount` JSDoc resolves the monotonic-with-reset open question — no further consultation needed
- The `log = logger.child({ module: 'urlLiveness' })` binding is pre-wired so probe + sweep code can consume `log.info` / `log.warn` / `log.error` without re-editing imports

**Plan 32-03 (prune endpoint + cron)** is unblocked:

- `checkPruneQuota(fingerprint)` is implemented + tested — endpoint wires it directly with no rework
- `OperatorAuditEntry.operation` admits `'prune-dead-urls'` — `appendOperatorAuditEntry({operation: 'prune-dead-urls', ...})` compiles under strict mode
- The `bearerFingerprint: 'cron:refresh-events'` literal convention (D-11) is documented in the union widening JSDoc

**Plan 32-04 (operator-status aggregator)** is unblocked at the type level — Plan 04's reader-side `AuditEntry` interface widening in `server/routes/operator-status.ts` can land without TS2322 because the writer-side surface admits `'prune-dead-urls'`.

**Blockers / concerns:** None for Plan 32-01 completion. Plans 02-06 will surface their own MEDIUM concerns at plan-check time; the 3 plan-checker MEDIUMs against the 6-plan set are tracked in `32-PLAN-CHECK.md` for opportunistic resolution during execution.

---

_Phase: 32-ghost-event-url-liveness-dashboard-prune_
_Plan: 01_
_Completed: 2026-05-21_
