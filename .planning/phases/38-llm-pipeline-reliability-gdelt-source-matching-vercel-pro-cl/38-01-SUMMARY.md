---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 01
subsystem: api
tags: [health-probe, audit, eval-harness, chaos-testing, resilience, redis, npm-audit]

# Dependency graph
requires:
  - phase: 37-adr-0010-acceptance-gate-closeout
    provides: LLM-optional probe contract (probeCacheKey fallbackHealthyKey) + redis-death chaos test scaffold
provides:
  - Token-split health probe — news emits cache-fallback-active:, llmEvents keeps llm-optional-fallback-active: (honest single-source semantics)
  - Open-Meteo degraded sentinel ({ data: [], failed: true, fetchedAt }) on water:precip total-batch failure (degraded-not-unknown)
  - Honest actorMatchRate (number | null) — null when no ground-truth actors present, distinct from a real 0%
  - Extended Redis-death chaos mock (11 raw-redis methods) + /api/operator-status no-500 coverage
  - NEW server/__tests__/resilience/quota-chaos.test.ts (dedicated redis.incr-throws proof for the quota path)
  - Replay-endpoint quota-counter death fix (503-not-500) — Pitfall 5 false-negative closed
  - Green full vitest suite + 0 moderate npm-audit vulnerabilities (CI-green companion)
affects: [phase-38-other-strands (PURGE/GDELT-MATCH/WATER-LATIN/VERCEL-PRO use the extended chaos mock + quota-chaos scaffold), phase-39-budget-dashboard (consumes honest actorMatchRate null), audit-tier]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-probe fallback-reason token (default cache-fallback-active:, llmEvents overrides) — honest single-source health semantics"
    - "Degraded-not-unknown cache sentinel ({ data, failed, fetchedAt }) — distinguishes total upstream failure from cold cache at the audit tier"
    - "null-vs-0 metric honesty (actorMatchRate number | null) — not-applicable distinct from measured-zero"
    - "Surgical chaos mock (mock ONLY redis.incr, leave cacheGetSafe healthy) — exposes the Pitfall 5 'right answer wrong reason' false-negative the whole-client mock masks"

key-files:
  created:
    - server/__tests__/resilience/quota-chaos.test.ts
  modified:
    - server/routes/health.ts
    - server/routes/water.ts
    - server/lib/llmEvalHarness.ts
    - server/lib/llmProgress.ts
    - server/routes/events.ts
    - server/__tests__/resilience/redis-death.test.ts
    - server/__tests__/routes/events.test.ts
    - src/__tests__/lib/actorCatalog.test.ts
    - src/hooks/useLLMStatusPolling.ts
    - .planning/milestones/v1.5-phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-AUDIT-REPORT.md
    - package-lock.json

key-decisions:
  - "probeCacheKey takes a fallbackReasonToken param (default cache-fallback-active:); only llmEvents passes the LLM-specific token via runProbe — keeps the dedicated :284 LLM-only path untouched"
  - "Open-Meteo sentinel stored as the data PAYLOAD ({ data: [], failed: true, fetchedAt }), normalized to [] on read via a type-guard so the client never sees the envelope and the route never 500s on a stale sentinel"
  - "actorTotal === 0 returns null (covers BOTH no-GT-actors AND a Redis throw before any iteration); a genuine mid-loop compute failure still falls back to 0 — the two stay distinguishable"
  - "33-AUDIT-REPORT.md eval block documents null=not-populated (requires staging run + expectedActor1/2 backfill), deferred to v1.7 — so the surface is never misread as 0% actor accuracy"
  - "Replay endpoint's checkReplayQuota wrapped in try/catch returning 503 replay_quota_unavailable — quota-counter death is infra death (503), distinct from the inner extract_failed (500) LLM-failure semantic"

patterns-established:
  - "Honest single-source health tokens: a shared probe helper must not hard-code a domain-specific fallback reason — parameterize it so every probe's reason means what it says"
  - "Audit sentinel: when 'no data' has two meanings (cold vs failed), write a fresh distinguishable sentinel so the audit reads degraded-not-unknown"
  - "Dedicated chaos test per unguarded raw-redis path: mock the single failing primitive (redis.incr) with everything else healthy to defeat the degrade-open short-circuit that masks the bug"

requirements-completed: [LLM-FIX-01, LLM-FIX-02, LLM-FIX-03, LLM-FIX-04, LLM-FIX-05, LLM-FIX-06]

# Metrics
duration: 7min
completed: 2026-06-03
---

# Phase 38 Plan 01: LLM-FIX Honest-Signals Strand + CI-Green Companion Summary

**Six honest-signal bug fixes that make every health probe, audit tier, and eval metric mean what it says — plus a dedicated quota-chaos test that exposed (and a route fix that closed) a real Pitfall-5 HTTP-500 leak on the replay endpoint, with the full suite green and npm audit clean.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-03T23:34:33-07:00
- **Completed:** 2026-06-03T23:41:57-07:00
- **Tasks:** 3 completed
- **Files modified:** 15 (1 created, 14 modified)

## Accomplishments

- **Honest single-source health semantics (LLM-FIX-01):** the shared `probeCacheKey` helper no longer hard-codes the LLM fallback token. The `news` probe now emits the generic `cache-fallback-active:`; only `llmEvents` keeps `llm-optional-fallback-active:`. The loose `/fallback-active/` test that passed accidentally is tightened to `/cache-fallback-active/`.
- **Degraded-not-unknown audit sentinel (LLM-FIX-02 / D-05):** a total Open-Meteo batch failure now writes a fresh `{ data: [], failed: true, fetchedAt }` sentinel to `water:precip`, so the audit tier reads `degraded` (fresh write) instead of `unknown` (cold cache) — while the failure stays detectable. The reader normalizes the sentinel to `[]` and never throws.
- **Honest actorMatchRate (LLM-FIX-03 / D-06):** `EvalScore.actorMatchRate` widened to `number | null`; returns `null` (not `0`) when no ground-truth actors are present, rippling cleanly through `llmProgress.ts`, `useLLMStatusPolling.ts`, and the already-guarded `DevApiStatus` consumer. `33-AUDIT-REPORT.md` documents the null=not-populated gap (v1.7 defer).
- **Chaos coverage (LLM-FIX-04):** the Redis-death chaos mock now exposes 11 raw-redis methods (`incr/sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire`) and proves `/api/operator-status` never returns HTTP 500 under Redis death.
- **Dedicated quota-chaos proof + route fix (LLM-FIX-05):** the new `quota-chaos.test.ts` mocks ONLY `redis.incr` (cacheGetSafe healthy) and exposed that the replay endpoint returned a 500 when the quota counter dies — a real Pitfall-5 leak. Fixed the route to degrade to 503.
- **v3 mock drift (LLM-FIX-06):** flipped all `schemaVersion: 'v1'` mocks in `events.test.ts` to `'v3'` (v1 deleted Phase 29).
- **CI-green:** repointed the `actorCatalog.test.ts` fixture path to the v1.5-phases archive (the sole failing suite on main) and ran `npm audit fix` → 0 moderate vulnerabilities. Full suite: **2391 passed / 19 skipped / 5 todo**.

## Task Commits

Each task was committed atomically:

1. **Task 1: Health-probe token split + Open-Meteo sentinel + actorMatchRate honesty (LLM-FIX-01/02/03)** — `3af2f42` (fix)
2. **Task 2: Chaos-mock extension + dedicated quota-chaos test + events.test v3 drift (LLM-FIX-04/05/06)** — `4e49cdc` (fix, includes the Rule-1 replay-endpoint route fix)
3. **Task 3: CI-green companion — actorCatalog fixture path + qs npm-audit (folded)** — `3c3f418` (fix)

## Files Created/Modified

- `server/__tests__/resilience/quota-chaos.test.ts` (NEW) — dedicated `redis.incr`-throws chaos test proving prune + replay endpoints return 503-not-500
- `server/routes/health.ts` — `probeCacheKey` `fallbackReasonToken` param; `runProbe` passes the LLM token only for `llmEvents`
- `server/routes/water.ts` — Open-Meteo empty-batch sentinel write + `PrecipEmptySentinel` type/guard/normalizer; sentinel-tolerant reads
- `server/lib/llmEvalHarness.ts` — `EvalScore.actorMatchRate: number | null`; returns `null` when `actorTotal === 0`
- `server/lib/llmProgress.ts` — widened `actorMatchRate?: number | null` in both evalScore shapes
- `server/routes/events.ts` — **[Rule 1/2 deviation]** wrapped `checkReplayQuota` in try/catch → 503 `replay_quota_unavailable`
- `server/__tests__/resilience/redis-death.test.ts` — 11 raw-redis methods added to the chaos mock; `/api/operator-status` no-500 coverage
- `server/__tests__/routes/events.test.ts` — `schemaVersion` v1→v3 mock flips
- `server/__tests__/routes/health.test.ts` — news assertion tightened to `/cache-fallback-active/`
- `server/__tests__/routes/water.test.ts` — sentinel-write + sentinel-tolerate assertions
- `server/__tests__/lib/llmEvalHarness.test.ts` — no-GT + Redis-throw cases flipped 0→null
- `src/__tests__/lib/actorCatalog.test.ts` — fixture path repointed to v1.5-phases archive
- `src/hooks/useLLMStatusPolling.ts` — `actorMatchRate?: number | null` type widening (ripple)
- `.planning/milestones/v1.5-phases/33-.../33-AUDIT-REPORT.md` — actor-accuracy eval block documents null=not-populated, v1.7 defer
- `package-lock.json` — `npm audit fix` (qs 6.15.0→6.15.2, brace-expansion 5.0.5→5.0.6)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Rule 2 - Missing error handling] Replay endpoint returned HTTP 500 on quota-counter death**

- **Found during:** Task 2 (writing the LLM-FIX-05 quota-chaos test)
- **Issue:** `eventsRouter.post('/llm-replay/:groupKey')` called `checkReplayQuota` (a raw `redis.incr` with no enclosing try/catch in `replayQuota.ts`) OUTSIDE any handler-level try/catch. When the quota counter died, the throw bubbled to the Express error handler as an HTTP 500 — leaking a stack trace through the Bearer-gated operator boundary (threat T-38.01-02). The prune endpoint already wrapped its quota call (Phase 32), but the replay endpoint did not — the exact Pitfall-5 "right answer, wrong reason" false-negative the new test was designed to catch. The quota-chaos test FAILED against the pre-fix code (500), confirming a genuine bug rather than a test artifact.
- **Fix:** wrapped `checkReplayQuota` in a try/catch returning `503 replay_quota_unavailable`. Kept the inner extraction try/catch's `500 extract_failed` (an LLM-failure semantic, distinct from infra death).
- **Files modified:** `server/routes/events.ts`
- **Commit:** `4e49cdc`

**2. [Rule 3 - Blocking type consistency] actorMatchRate `number | null` type ripple**

- **Found during:** Task 1
- **Issue:** widening `EvalScore.actorMatchRate` to `number | null` failed typecheck downstream until the same widening was applied to the two `llmProgress.ts` evalScore shapes and the two `useLLMStatusPolling.ts` mirrors.
- **Fix:** applied the `number | null` widening at all four sites. The `DevApiStatus` consumer already guarded with `typeof === 'number'`, so it needed no change.
- **Files modified:** `server/lib/llmProgress.ts`, `src/hooks/useLLMStatusPolling.ts`
- **Commit:** `3af2f42`

**3. [Rule 3 - Out-of-scope advisory bundled into in-scope fix] brace-expansion advisory**

- **Found during:** Task 3
- **Issue:** `npm audit` reported TWO moderate advisories (the planned `qs` DoS plus a newly-surfaced `brace-expansion` advisory not present at RESEARCH time). The acceptance criterion is "0 moderate-or-higher vulnerabilities."
- **Fix:** `npm audit fix` resolved both (transitive-dep patch bumps; no direct dependency added to package.json). Lockfile-only change.
- **Files modified:** `package-lock.json`
- **Commit:** `3c3f418`

### Scope notes

- `33-AUDIT-REPORT.md` had no pre-existing dedicated "actor-accuracy eval block" section; added one (rather than overwriting a non-existent stub) documenting the null=not-populated semantics and the v1.7 staging-run requirement.
- `package.json` was listed as a modifiable file but `npm audit fix` only changed the lockfile (the safe outcome — no direct-dependency version change).

## Authentication Gates

None.

## Known Stubs

None. All changes wire real behavior; the only `null`/empty values introduced are the deliberate honest-signal sentinels (Open-Meteo `{ failed: true }` and `actorMatchRate: null`), both documented and intentional.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond the three mitigations already in the plan's threat register (T-38.01-01/02/SC), all of which are now proven by the chaos tests.

## Verification

- Task 1: `npx vitest run server/__tests__/routes/health.test.ts server/__tests__/routes/water.test.ts server/__tests__/lib/llmEvalHarness.test.ts` → 57 passed; `npm run typecheck` → exit 0
- Task 2: `npx vitest run server/__tests__/resilience/ server/__tests__/routes/events.test.ts` → 51 passed; acceptance greps: 17 `vi.fn(redisDeath)` (≥15), operator-status present, 0 `schemaVersion: 'v1'`, incr mocked in quota-chaos
- Task 3: `npx vitest run src/__tests__/lib/actorCatalog.test.ts` → 24 passed; `npm audit --audit-level=moderate` → 0 vulnerabilities
- Plan gate: `npx vitest run` → 187 files passed / 2 skipped, **2391 tests passed / 19 skipped / 5 todo**; `npm run typecheck` → exit 0; `npm run lint` → 0 errors (23 pre-existing warnings, out of scope); `npm audit --audit-level=moderate` → clean

## Self-Check: PASSED

- All created/modified files exist on disk (verified `server/__tests__/resilience/quota-chaos.test.ts`, `server/routes/health.ts`, `server/routes/water.ts`, `server/lib/llmEvalHarness.ts`)
- All three task commits exist in git history (`3af2f42`, `4e49cdc`, `3c3f418`)
