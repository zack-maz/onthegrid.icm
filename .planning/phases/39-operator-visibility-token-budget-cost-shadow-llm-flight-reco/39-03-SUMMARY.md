---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
plan: 03
subsystem: api
tags: [operator-status, token-budget, cost-shadow, redis, zod, degrade-open, express]

# Dependency graph
requires:
  - phase: 28.2
    provides: '/api/operator-status Bearer-gated aggregator + degrade-open block pattern (actorQuality precedent)'
  - phase: 27.4
    provides: 'llmTokenBudget.ts (DAILY_LIMITS, getDailyTokens, budgetState, SOFT/HARD_CAP_RATIO)'
provides:
  - 'Bearer-gated, degrade-open tokenBudget field on GET /api/operator-status (GA-4 provider-keyed map)'
  - "Per-provider used/cap/soft/hard/state for nvidia_nim + today's cost-shadow USD"
  - 'Exported SOFT_CAP_RATIO / HARD_CAP_RATIO from llmTokenBudget.ts (no magic-number drift)'
  - 'Zod .strict() contract test pinning the tokenBudget read shape (dashboard regression lock)'
affects: [39-05 BudgetBlock UI, operator-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Degrade-open Redis block mirroring actorQuality VERBATIM (per-block try/catch -> null, route stays 200)'
    - 'Zod .strict() contract test at every object level to regression-lock a server response shape'
    - 'Provider-keyed map shape (GA-4) so restoring a provider is non-breaking under .strict()'

key-files:
  created: []
  modified:
    - server/lib/llmTokenBudget.ts
    - server/routes/operator-status.ts
    - server/routes/__tests__/operator-status.test.ts

key-decisions:
  - 'GA-4: tokenBudget uses a provider-keyed map (not flat) so a restored provider adds a key without breaking the .strict() pin'
  - 'Open Q1: used/cap read the dormant llm:tokens:nvidia_nim counter via getDailyTokens — reads 0 in the v3 path (honest; cost-shadow USD is the live signal)'
  - 'Rule 3 fix: plan referenced server/tsconfig.json which does not exist — used the real tsconfig.server.json for typecheck'

patterns-established:
  - 'tokenBudget degrade-open: any Redis throw inside the block leaves tokenBudget=null on a 200 response (T-39-03-D)'
  - 'Soft/hard thresholds recomputed from exported SOFT_CAP_RATIO/HARD_CAP_RATIO — single source of truth shared with budgetState()'

requirements-completed: [BUDGET-03, BUDGET-04]

# Metrics
duration: 4 min
completed: 2026-06-04
---

# Phase 39 Plan 03: Operator tokenBudget Field Summary

**Bearer-gated, degrade-open `tokenBudget` field on `GET /api/operator-status` carrying per-provider used/cap/soft/hard/state + today's cost-shadow USD (microcents->USD), pinned by a Zod `.strict()` contract test that fails the build on any shape drift.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-04T13:52:00Z
- **Completed:** 2026-06-04T13:55:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added a `tokenBudget` block to the operator-status aggregator using the GA-4 provider-keyed map shape (`{ providers: { nvidia_nim: { used, cap, soft, hard, state } }, costShadow: { tokensIn, tokensOut, usd } }`).
- Mirrored the `actorQuality` degrade-open contract VERBATIM: any Redis throw inside the block leaves `tokenBudget = null` on a 200 response — never bubbles to the 500 handler (T-39-03-D).
- Exported `SOFT_CAP_RATIO` / `HARD_CAP_RATIO` from `llmTokenBudget.ts` and recomputed `soft`/`hard` from them in the route — no magic-number drift between `budgetState()` and the dashboard read shape.
- Read today's `events:llm-cost-shadow:v3:{date}` HSET roll-up with `Number(x) || 0` coercion and converted integer microcents back to USD (÷1e6).
- Pinned the GA-4 shape with a Zod `.strict()` contract test that rejects extra keys at every object level (BUDGET-04) and proved degrade-open null on Redis throw (BUDGET-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: Export ratio constants + add tokenBudget degrade-open block** - `ee7d721` (feat)
2. **Task 2: Pin tokenBudget shape with Zod .strict() + degrade-open contract tests** - `06c8480` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan)

_Note: This TDD plan kept the implementation (Task 1) and the new contract assertions (Task 2) as separate commits per the plan's task split — Task 1's verification was "existing tests still green"._

## Files Created/Modified

- `server/lib/llmTokenBudget.ts` - Exported `SOFT_CAP_RATIO` (0.8) and `HARD_CAP_RATIO` (0.95) so the route shares the threshold source of truth with `budgetState`.
- `server/routes/operator-status.ts` - Added `TokenBudgetBlock` interface (GA-4 map shape), the degrade-open `tokenBudget` try/catch block (dormant-counter + cost-shadow read), and extended the final `res.json` with `tokenBudget`.
- `server/routes/__tests__/operator-status.test.ts` - Added `hgetall` to `mockRedis`; new describe block with a Zod `.strict()` pin (happy-path parse + extra-key rejection + microcents->USD conversion) and a degrade-open-on-throw test.

## Decisions Made

- **GA-4 (provider-keyed map):** chose the map shape over flat keys so a future restored provider adds a `providers` key without breaking the `.strict()` contract pin.
- **Open Q1 (used vs cap source):** read the dormant `llm:tokens:nvidia_nim:{date}` counter via `getDailyTokens('nvidia_nim')`. It reads 0 in the v3 path (`incrDailyTokens` is retired — Pitfall 2); this is honest (NIM free-tier isn't metered into that counter) and the live operator signal is `costShadow.usd`. A code comment at the block documents the 0 read so a future reader does not mistake it for a bug. Switching to a live `rateLimit.nvidia_nim` window later is non-breaking (same map shape).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced a non-existent server tsconfig path**

- **Found during:** Task 1 (typecheck verification)
- **Issue:** The plan's `<verify>` and `<acceptance_criteria>` ran `npx tsc --noEmit -p server/tsconfig.json`, but that file does not exist in the repo. The real server typecheck config is `tsconfig.server.json` at the repo root.
- **Fix:** Ran the typecheck against `tsconfig.server.json` (the config that actually includes `server/`). No source change required.
- **Files modified:** none (verification-path correction only)
- **Verification:** `npx tsc --noEmit -p tsconfig.server.json` exits 0 (server + test file typecheck clean).
- **Committed in:** n/a (no code impact)

---

**Total deviations:** 1 auto-fixed (1 blocking — verification-path correction)
**Impact on plan:** No scope creep. The fix only corrected the typecheck invocation path; all source acceptance criteria were met as written.

## Verification Results

**`npx vitest run server/routes/__tests__/operator-status.test.ts`** — PASS

```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

(20 pre-existing + 2 new: `.strict()` pin + degrade-open. The `.strict()` test asserts the live shape parses AND that injecting an extra key makes `.parse` throw; the degrade-open test asserts `hgetall` throw -> `tokenBudget === null` with route 200; conversion asserts `costShadow.usd === 0.03` for a 30000-microcent fixture.)

**`npx tsc --noEmit -p tsconfig.server.json`** — PASS (exit 0, no output).

**Source acceptance assertions:**

- `grep -c "export const SOFT_CAP_RATIO" server/lib/llmTokenBudget.ts` == 1 ✓
- `grep -c "export const HARD_CAP_RATIO" server/lib/llmTokenBudget.ts` == 1 ✓
- `grep -c "tokenBudget" server/routes/operator-status.ts` == 10 (>= 2) ✓
- `grep -c "events:llm-cost-shadow:v3" server/routes/operator-status.ts` == 2 (>= 1) ✓
- `grep -c ".strict()" server/routes/__tests__/operator-status.test.ts` == 10 (>= 1) ✓
- final `res.json` line includes `tokenBudget` ✓

## Issues Encountered

None — both tasks executed cleanly. The only friction was the wrong tsconfig path in the plan (handled as a Rule 3 deviation above).

## User Setup Required

None - no external service configuration required. The `tokenBudget` field rides the existing `dashboardAuth` Bearer gate; no new env vars or secrets.

## Next Phase Readiness

- Server contract for Plan 39-05's BudgetBlock UI is ready: `GET /api/operator-status` returns `tokenBudget` (GA-4 map) when Redis is healthy, `null` when it throws (200 preserved), with the shape regression-locked by Zod `.strict()`.
- No blockers. Note for 39-05: today's `providers.nvidia_nim.used` reads 0 in the v3 path (dormant counter) — render `costShadow.usd` as the live spend number.

---

_Phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco_
_Completed: 2026-06-04_

## Self-Check: PASSED

- `server/lib/llmTokenBudget.ts` exists with `export const SOFT_CAP_RATIO` / `HARD_CAP_RATIO` ✓
- `server/routes/operator-status.ts` exists with `tokenBudget` block + extended `res.json` ✓
- `server/routes/__tests__/operator-status.test.ts` exists with `.strict()` pin ✓
- Commit `ee7d721` (feat 39-03 Task 1) present in git log ✓
- Commit `06c8480` (test 39-03 Task 2) present in git log ✓
