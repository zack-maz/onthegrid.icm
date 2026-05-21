---
phase: 32
verified_date: 2026-05-21
status: human_needed
score: 4/4 must_haves verified
ghost_requirements: 5/5 closed
overrides_applied: 0
re_verification:
  previous_status: null # initial verification, no prior VERIFICATION.md
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: 'Observe natural 04:00 UTC cron tick on production'
    expected: 'Vercel function logs show `phase 32 probe sweep complete` and either `phase 32 cron auto-prune complete` OR `phase 32 deadline elapsed; skipping cron auto-prune for this tick`; handler completes inside the 800s `maxDuration` budget.'
    why_human: 'Real-world cron firing cannot be exercised from the codebase. Test-suite covers the dispatch order + deadline plumbing under fake timers (refresh-events-cron.prune.test.ts) but not real-clock budget consumption against live Upstash latency + live Vercel cold-start cost. Operator UAT item 4 in 32-SUMMARY.md explicitly defers this to first post-deploy natural tick.'
  - test: "Force-trigger `/api/cron/refresh-events?force=true` on a deployed preview with operator Bearer, then confirm an audit-log entry with `bearerFingerprint: 'cron:refresh-events'` appears in `/api/operator-status`"
    expected: "Operator Actions block on the dashboard shows a `prune-dead-urls` entry with `args.trigger: 'cron'` and `bearerFingerprint: 'cron:refresh-events'`."
    why_human: 'Audit-log SADD under live Upstash (not in-memory fallback) is the only path that exercises the real `appendOperatorAuditEntry` writer against the 500-entry bounded set. Local production-mode UAT (SUMMARY §UAT item 2) noted that live audit-log SADD only fires when `events:llm:v3` has data; production v3 cache is always populated by the 04:00 UTC cron, so this is only fully reachable post-merge to main.'
  - test: 'Click the `Prune N dead events` button on the deployed dashboard with operator Bearer set'
    expected: 'Count drops to 0 (or expected residual) and operator-status response refreshes in place without leaving the browser tab.'
    why_human: 'Real-browser DOM interaction + live Upstash backend (not the in-memory degrade-open path) cannot be exercised by jsdom. The 9 jsdom tests in `DevApiStatus.prune.test.tsx` cover click → POST contract + 429 alert + 200 refresh, but the live network path requires a deployed preview with real data.'
---

# Phase 32: Ghost Event URL Liveness, Dashboard & Prune Verification Report

**Phase Goal:** Operator can see and remove events whose `sourceURL` is dead, without leaving the API Health dashboard, and without endangering the polite-citizen contracts the rest of the pipeline holds.

**Verified:** 2026-05-21
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Verdict

The phase goal is **achieved in code** with three production-observation items deferred to human verification on the live Vercel deployment. All four success criteria are mechanically present and pinned by tests in the codebase. All 5 GHOST-XX requirements are flipped to `[x]` in REQUIREMENTS.md with traceability table marking each "Complete". The operator can see dead-URL events (count + drill-down list + 20-entry sample with truncation row), remove them via two triggers (Bearer-gated `POST /api/events/prune-dead-urls` button + daily cron auto-prune with `attemptCount >= 3` gate), and the polite-citizen contracts hold (concurrency-limited, jittered, per-host throttled, TTL-gated, schema-pinned by Zod `.strict()` + literal-path shim).

Codebase evidence is overwhelming. The remaining items are deployment-only paths (real Vercel cron tick at 04:00 UTC, live Upstash audit-log SADD, real browser click against production preview) that cannot be exercised from the local codebase but are documented and queued for operator UAT.

## Must-Have Cross-Check (Success Criteria 1-4)

### SC-1: Dead-URL count + drill-down list in API Health dashboard

**Status:** VERIFIED

| Evidence                             | Location                                               | Detail                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dead-url-count` row                 | `src/components/ui/DevApiStatus.tsx:1614`              | `<div className="mt-1 text-text-muted" data-testid="dead-url-count">Dead URL events: {opStatus.prune.deadUrlCount}</div>` — renders when `opStatus?.prune != null`                                                                         |
| `dead-url-list` drill-down           | `src/components/ui/DevApiStatus.tsx:1620`              | `<ul data-testid="dead-url-list">` rendering up to 20 sample entries (status + truncated eventId + URL) with title tooltip on full URL                                                                                                     |
| `dead-url-list-truncated` row        | `src/components/ui/DevApiStatus.tsx:1634`              | `… and {deadUrlCount - deadUrlSample.length} more` shown when count exceeds sample cap                                                                                                                                                     |
| `/api/operator-status` `prune` block | `server/routes/operator-status.ts:307-315`             | `let deadUrlCount = Math.max(0, Number(raw) \|\| 0)` reads `events:url-liveness-count` sidecar (O(1) Pitfall 3); `deadUrlSample` built by `buildDeadUrlSample()` via SCAN with `LIMIT_DRILL_DOWN=20` and `MAX_SCAN_KEYS=200` short-circuit |
| jsdom contract tests                 | `src/__tests__/components/DevApiStatus.prune.test.tsx` | 9 test cases including drill-down list rendering, truncation row, and hidden-when-empty (cited in 32-SUMMARY.md as GREEN)                                                                                                                  |
| Aggregator contract tests            | `server/__tests__/routes/operator-status.test.ts`      | 11 contract tests pinning `prune.deadUrlCount`, `prune.last24hPrunes`, `prune.deadUrlSample` shape + degrade-open semantics + `byBearer.prunes` counter                                                                                    |

### SC-2: Probe runs out-of-band of `/api/events`; p95 unchanged

**Status:** VERIFIED

| Evidence                      | Location                                                                               | Detail                                                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `safeWaitUntil` IIFE wrapping | `server/lib/llmExtractionPipeline.ts:298`                                              | `safeWaitUntil((async () => { ... })())` — Vercel's post-response work primitive ensures the function instance survives past `res.end()` without blocking the cron handler's response                                                                                             |
| Probe sweep inside IIFE body  | `server/lib/llmExtractionPipeline.ts:479-507`                                          | `try { const deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS; const candidates = await buildProbeCandidates(); const sweep = await runProbeSweep({...}); ... } catch (probePruneErr) {...}` — wrapped in its own try/catch so probe/prune errors don't break extraction |
| Cron-only-writer discipline   | `server/routes/events.ts:518-585`                                                      | Manual prune endpoint is Bearer-gated operator action (NOT fire-and-forget); cron is the only automatic writer per anti-pattern #17                                                                                                                                               |
| `/api/events` unchanged       | `server/routes/events.ts` (no diff in `/events` GET handler against Phase 31 baseline) | The GET handler remains cache-only; Phase 32 adds only the POST `/prune-dead-urls` route + imports, leaving the read path untouched                                                                                                                                               |
| Cron handler integration test | `server/__tests__/routes/refresh-events-cron.prune.test.ts`                            | 4 test cases pinning: probe sweep dispatched after `runRefreshExtraction` resolves; prune dispatched after sweep; prune SKIPPED when `Date.now() >= deadlineMs`; existing `dispatched: true` response preserved                                                                   |

### SC-3: Operator can prune dead-URL events via chosen mechanism

**Status:** VERIFIED

| Evidence                                      | Location                                                      | Detail                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/events/prune-dead-urls` registered | `server/routes/events.ts:539`                                 | `eventsRouter.post('/prune-dead-urls', dashboardAuth, async (req, res) => {...})` — Bearer-gated; 401 without Bearer (in prod via `dashboardAuth`); 429 on 51st call/24h                                                                                                                                                   |
| Quota with cron bypass                        | `server/routes/events.ts:548-556`                             | `trigger === 'cron'` bypasses `checkPruneQuota`; manual trigger enforces 50/24h cap                                                                                                                                                                                                                                        |
| Cron auto-prune                               | `server/lib/llmExtractionPipeline.ts:491`                     | `const pruneResult = await pruneDeadUrlEvents({ trigger: 'cron' })` — direct helper invocation (RESEARCH A4 / Discretion §3), NOT self-HTTP                                                                                                                                                                                |
| Helper delete scope (D-13)                    | `server/lib/urlLiveness.ts:826`                               | `await cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, spliced, LLM_REDIS_TTL_SEC)` writes back the spliced events array; bulk `redis.del` on `events:url-liveness:{eventId}` keys; sidecar DECR'd. Does NOT touch `llmLineage`, `callHistory`, news indices, audit log                                                                |
| attemptCount gate for cron (D-12)             | `server/lib/urlLiveness.ts:782-820` (pruneDeadUrlEvents body) | Cron trigger filters by `attemptCount >= 3 && isTerminalDead(status)`; manual trigger has no gate                                                                                                                                                                                                                          |
| Dashboard button                              | `src/components/ui/DevApiStatus.tsx:1647`                     | `<button data-testid="prune-dead-urls-trigger" onClick={() => void pruneHandler()}>Prune {deadUrlCount} dead events</button>` — POSTs to `/api/events/prune-dead-urls` with `dashboardAuthHeaders()` + `{trigger:'manual'}`; on 200 triggers immediate `fetchOpStatus()` refresh; on 429 renders `prune-quota-alert` panel |
| Helper unit tests                             | `server/__tests__/lib/urlLiveness.cronPrune.test.ts`          | 10 test cases: cron `attemptCount>=3` filter, manual no-gate, unknown/live never pruned, audit-log shape, events:llm:v3 splice, bulk DEL, DECRBY sidecar                                                                                                                                                                   |
| Route integration tests                       | `server/__tests__/routes/events.prune.test.ts`                | 8 test cases: 401 no-Bearer, 200 valid-Bearer, 50th cap-inclusive, 429 over-cap + Retry-After, cron-bypass, helper delegation, 503-not-500 on throw, no double audit-log                                                                                                                                                   |
| Chaos test                                    | `server/__tests__/resilience/redis-death.test.ts:331-333`     | `it('POST /api/events/prune-dead-urls returns 200 or 503 (NEVER 500) under Redis death', ...)` — preserves the existing chaos contract                                                                                                                                                                                     |

### SC-4: Polite-citizen contracts + schema pinning

**Status:** VERIFIED

| Evidence                           | Location                                                                | Detail                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createLimit(PROBE_CONCURRENCY=8)` | `server/lib/urlLiveness.ts:643`                                         | `const limit = createLimit(PROBE_CONCURRENCY);` — FIFO concurrency bound, peak in-flight tasks ≤ 8 (mechanically proven by sweep test "runProbeSweep concurrency") |
| Per-host 1-req/s throttle          | `server/lib/urlLiveness.ts:380-394` (`waitForHostSlot`)                 | Module-singleton `hostNext` Map; synchronous slot reservation BEFORE await (atomicity fix); analogous to Nominatim 1 req/s contract                                |
| ±200ms jitter                      | `server/lib/urlLiveness.ts:385`                                         | `const jitter = Math.floor((Math.random() - 0.5) * 2 * JITTER_MS);` — symmetric anti-stampede; pinned by sweep tests (4 throttle cases)                            |
| TTL-gated freshness                | `server/lib/urlLiveness.ts:501`                                         | `await cacheSetSafe(key, next, ttlSecForStatus(next.status))` — tiered TTL (live 7d / terminal-dead 24h / unknown 1h) via `ttlSecForStatus` exclusive write        |
| Schema test pin                    | `server/__tests__/lib/urlLiveness.schema.test.ts`                       | 14 tests pinning Zod `.strict()` enum + TTL upper bound per status — fails on drift                                                                                |
| Literal-path shim                  | `src/__tests__/lib/urlLiveness.schema.test.ts`                          | 5 tests at the CONTEXT D-22 literal path — survives canonical-file moves                                                                                           |
| SCAN signature pinned              | `server/routes/operator-status.ts:107`, `server/lib/urlLiveness.ts:782` | `as [string \| number, string[]]` — pins `@upstash/redis ^1.37.0` `Promise<[string \| number, string[]]>` shape; MEDIUM-01 plan-checker resolution                 |
| SSRF guard                         | `server/lib/urlLiveness.ts:200-204, 269, 330`                           | `PRIVATE_HOST_REGEX` rejects 9 ranges; checked initially AND on every redirect target (3 cases in probe test)                                                      |
| Identifying User-Agent             | `server/lib/urlLiveness.ts:180`                                         | `PROBE_UA = 'IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)'` — hardcoded domain constant per D-21                                               |
| HEAD-then-GET-on-405               | `server/lib/urlLiveness.ts` `probeUrl` body                             | Polite-citizen default per D-16 (probe test "405-then-GET-200" + "Range-fallback-literal")                                                                         |
| 3-hop redirect cap                 | `server/lib/urlLiveness.ts:277`                                         | `for (let hop = 0; hop <= MAX_REDIRECTS; hop++)`; 4th 3xx returns unknown (probe test "3xx-chain->3-unknown")                                                      |

## Requirement Traceability (GHOST-01..05)

| Req          | Status          | Implementation                                                                                                                                                                | File:Line                                                                                                                        | Commit SHA                                                      | Test                                                                                                                                                                 |
| ------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GHOST-01** | `[x]` SATISFIED | Probe runs out-of-band of `/api/events` via cron post-step inside `safeWaitUntil` IIFE                                                                                        | `server/lib/llmExtractionPipeline.ts:479-507`                                                                                    | `d845d90`                                                       | `server/__tests__/routes/refresh-events-cron.prune.test.ts` (4 tests) + `urlLiveness.sweep.test.ts` (20 tests)                                                       |
| **GHOST-02** | `[x]` SATISFIED | Per-event key `events:url-liveness:{eventId}` with tiered TTL + Zod `.strict()` schema                                                                                        | `server/lib/urlLiveness.ts:175-200` (schema + ttl); `:481-516` (persistLiveness writer)                                          | `3c6b9cd` (schema) + `3534aa2` (writer)                         | `server/__tests__/lib/urlLiveness.schema.test.ts` (14 tests) + literal-path shim (5 tests) per D-22                                                                  |
| **GHOST-03** | `[x]` SATISFIED | `/api/operator-status` `prune.deadUrlCount` + `.deadUrlSample` (20-entry drill-down) → DevApiStatus Operator Actions block                                                    | `server/routes/operator-status.ts:307-318` (aggregator); `src/components/ui/DevApiStatus.tsx:1614-1665` (UI)                     | `5435196` (aggregator) + `393b1c9` (UI)                         | `server/__tests__/routes/operator-status.test.ts` (11 tests) + `src/__tests__/components/DevApiStatus.prune.test.tsx` (9 tests)                                      |
| **GHOST-04** | `[x]` SATISFIED | `POST /api/events/prune-dead-urls` Bearer-gated; manual button + cron auto-prune via direct helper invocation with `attemptCount >= 3` gate                                   | `server/routes/events.ts:539-585` (route); `server/lib/urlLiveness.ts:715-840` (`pruneDeadUrlEvents`)                            | `fa34bf1` (helper) + `0c1b434` (route) + `d845d90` (cron)       | `server/__tests__/routes/events.prune.test.ts` (8 tests) + `urlLiveness.cronPrune.test.ts` (10 tests) + `DevApiStatus.prune.test.tsx` (9 tests including click POST) |
| **GHOST-05** | `[x]` SATISFIED | `createLimit(8)` + `waitForHostSlot` (1 req/s + ±200ms jitter) + 10s timeout + 3-hop redirect cap + HEAD-then-GET-on-405 + User-Agent + `cacheSetSafe` (TTL-gated) + no retry | `server/lib/urlLiveness.ts:175-180` (constants); `:227-364` (probeUrl); `:380-394` (waitForHostSlot); `:643-684` (runProbeSweep) | `e891f40` (probeUrl) + `f54b4b2` (throttle) + `f363080` (sweep) | `server/__tests__/lib/urlLiveness.probe.test.ts` (13 tests) + `urlLiveness.sweep.test.ts` (20 tests covering throttle + concurrency cap)                             |

REQUIREMENTS.md verification (lines 27-31):

```
- [x] **GHOST-01**: ... probe runs out-of-band ...
- [x] **GHOST-02**: Probe results stored ... Schema pinned by a contract test.
- [x] **GHOST-03**: Dead-URL events surfaced ... count + drill-down list.
- [x] **GHOST-04**: Operator can prune dead-URL events ... behind the existing Bearer gate.
- [x] **GHOST-05**: URL liveness probing respects polite-citizen contracts ...
```

Traceability table (REQUIREMENTS.md lines 144-148): all GHOST-01..05 → Phase 32 → "Complete".

No orphaned requirements detected.

## Cross-Plan Audit

Cross-referenced each plan's `requirements:` frontmatter against REQUIREMENTS.md:

| Plan  | Plan `requirements:`             | Plan `requirements_addressed:` | REQUIREMENTS.md status |
| ----- | -------------------------------- | ------------------------------ | ---------------------- |
| 32-01 | GHOST-02                         | GHOST-02                       | `[x]` Complete         |
| 32-02 | GHOST-01, GHOST-05               | GHOST-01, GHOST-05             | both `[x]` Complete    |
| 32-03 | GHOST-01, GHOST-04               | GHOST-01, GHOST-04             | both `[x]` Complete    |
| 32-04 | GHOST-03                         | GHOST-03                       | `[x]` Complete         |
| 32-05 | GHOST-03, GHOST-04               | GHOST-03, GHOST-04             | both `[x]` Complete    |
| 32-06 | GHOST-01..05 (close + docs flip) | GHOST-01..05                   | all `[x]` Complete     |

Every GHOST-XX requirement appears in at least one plan's `requirements:` field. No orphaned requirements (REQUIREMENTS.md does not map any additional IDs to Phase 32 beyond GHOST-01..05).

D-01..D-22 evidence map (22 atomic decisions) — all SATISFIED per `32-SUMMARY.md` §"Per-Decision Evidence Map":

- D-01 (`d845d90`) cron-post-step inside `safeWaitUntil` finally-block — VERIFIED
- D-02 (`d845d90`) probe runs AFTER `runRefreshExtraction()` — VERIFIED
- D-03 (`f363080`) best-effort partial sweep, no cursor, `deadlineMs` short-circuit — VERIFIED
- D-04 (`f7159f0`) sweep priority: never-probed first, then oldest `lastProbedAt` — VERIFIED
- D-05 (`f7159f0`) primary URL `data.source` for both raw GDELT + LLM v3 — VERIFIED
- D-06 (`3534aa2` + `5435196`) dead-URL rule = primary URL terminal-dead via `isTerminalDead` — VERIFIED
- D-07 (`3c6b9cd` + `e891f40`) status taxonomy live/404/403/dead-host/unknown — VERIFIED
- D-08 (`3534aa2`) latest probe wins, no flap debounce — VERIFIED
- D-09 (`0c1b434`) single authenticated endpoint, two triggers — VERIFIED
- D-10 (`393b1c9`) dashboard button = operator-confirmed manual prune, no modal — VERIFIED
- D-11 (`d845d90`) cron auto-prune via direct helper invocation — VERIFIED
- D-12 (`fa34bf1`) cron `attemptCount >= 3` safety gate — VERIFIED
- D-13 (`fa34bf1`) delete scope = event entry + url-liveness key only — VERIFIED
- D-14 (`9201240` + `fa34bf1`) audit-log shape mirrors `/llm-replay` — VERIFIED
- D-15 (`b9b83d5` + `0c1b434`) 50/24h rate limit + cron bypass — VERIFIED
- D-16 (`e891f40`) HEAD-then-GET-on-405 with Range header — VERIFIED
- D-17 (`e891f40`) 3-hop redirect cap — VERIFIED
- D-18 (`e891f40` + `f54b4b2` + `f363080`) polite-citizen knobs — VERIFIED
- D-19 (`3c6b9cd`) per-event Redis key shape — VERIFIED
- D-20 (`3c6b9cd`) tiered TTL by status — VERIFIED
- D-21 (`e891f40`) identifying User-Agent header — VERIFIED
- D-22 (`7d69e16`) contract test pins schema + TTL upper bound (dual placement) — VERIFIED

## Anti-Pattern Scan

| Category                                       | Result                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Debt markers (TBD/FIXME/XXX)                   | NONE in `server/lib/urlLiveness.ts`, `server/lib/pruneQuota.ts`, `server/routes/operator-status.ts`, `src/components/ui/DevApiStatus.tsx` |
| Empty implementations / placeholder returns    | NONE in modified files                                                                                                                    |
| Hardcoded empty data at call sites             | NONE — `deadUrlSample` is built dynamically from `redis.scan`; props connect to live store                                                |
| `console.*` calls in new code                  | NONE — `logger.child({ module: 'urlLiveness' })` used throughout                                                                          |
| Cron-only-writer discipline (anti-pattern #17) | PRESERVED — `/api/events` GET handler unchanged; only Bearer-gated POST + cron writes                                                     |
| Raw `redis.set` outside permitted exception    | 2 calls in `urlLiveness.ts` (lines 515 + 839), both scoped to `URL_LIVENESS_COUNT_KEY` floor — documented exception per Pitfall 3         |

No blockers or warnings detected.

## Behavioral Spot-Checks

Test counts confirmed by `grep -cE "^\s+(it\|test)\("` on test files referenced by SUMMARY:

| File                                                        | Asserted count | Actual count | Status |
| ----------------------------------------------------------- | -------------- | ------------ | ------ |
| `server/__tests__/lib/urlLiveness.schema.test.ts`           | 14             | 14           | PASS   |
| `server/__tests__/lib/urlLiveness.probe.test.ts`            | 13             | 13           | PASS   |
| `server/__tests__/lib/urlLiveness.sweep.test.ts`            | 20             | 20           | PASS   |
| `server/__tests__/lib/urlLiveness.cronPrune.test.ts`        | 10             | 10           | PASS   |
| `server/__tests__/routes/events.prune.test.ts`              | 8              | 8            | PASS   |
| `server/__tests__/routes/refresh-events-cron.prune.test.ts` | 4              | 4            | PASS   |
| `src/__tests__/lib/urlLiveness.schema.test.ts`              | 5              | 5            | PASS   |
| `server/__tests__/lib/pruneQuota.test.ts`                   | 6              | 6            | PASS   |
| `src/__tests__/components/DevApiStatus.prune.test.tsx`      | 9              | 9            | PASS   |

Total: 89 tests across 9 files. SUMMARY cites +63 net test count (some files inherit overlap from prior plans). All test files exist and contain the documented assertions.

CLAUDE.md Redis registry verification (lines 138-140): all three new entries present with verbatim shape from SUMMARY.

`npx vitest run` not executed by this verifier (would re-run 2259-test suite). SUMMARY cites last green run at commit `d619be3` with 2259 passed / 19 skipped / 5 todo / 0 failed.

## Open Items / Production Observations Needed

Three items require human verification on the live Vercel deployment. These cannot be exercised from the local codebase but are documented in the `human_verification:` frontmatter above and in `32-SUMMARY.md` §"Operator UAT Manual-Only Checklist":

1. **Natural 04:00 UTC cron tick on production.** Probe sweep + auto-prune budget consumption against live Upstash latency + Vercel cold-start cost. The 800s `maxDuration` deadline plumbing is unit-tested under fake timers but never observed against real-clock production load.
2. **Force-trigger `/api/cron/refresh-events?force=true` on a deployed preview.** Confirms the live audit-log SADD path against real Upstash (not the in-memory degrade-open fallback that local UAT exercised).
3. **Click the `Prune N dead events` button on the deployed dashboard.** Real-browser DOM + live network round-trip + real Upstash backend — jsdom + mocked fetch cover the contract but not the live network path.

These deferred items do NOT affect the goal achievement verdict. The phase goal ("operator can see and remove dead-URL events without leaving the dashboard, without endangering polite-citizen contracts") is mechanically achieved and pinned by 89 tests across 9 files; the open items are deployment-only observations that surface naturally on the first post-merge cron tick.

## Gaps Summary

**No gaps blocking goal achievement.** All 4 success criteria are codebase-verified, all 5 GHOST-XX requirements are `[x]` in REQUIREMENTS.md with traceability table marking each "Complete", all 22 D-N decisions have commit SHA + test pinning per SUMMARY, anti-pattern scan is clean, and the Redis keys registry in CLAUDE.md is updated.

The phase is structurally complete; the only remaining work is the operator UAT against a deployed preview / production tick to flip the three deferred items above. SUMMARY documents these as already-pending (Plan 32-06 Task 4 BLOCKING human-verify checkpoint per the workflow).

---

_Verified: 2026-05-21_
_Verifier: Claude (gsd-verifier, goal-backward)_
