---
phase: 32-ghost-event-url-liveness-dashboard-prune
plan: 02
subsystem: infra
tags: [redis, fetch, http-probe, ssrf-guard, concurrency, rate-limit, schema-contract, typescript, vitest]

# Dependency graph
requires:
  - phase: 32
    plan: 01
    provides: "UrlLivenessSchema (Zod .strict()), UrlLivenessStatus enum, ttlSecForStatus(), URL_LIVENESS_KEY_PREFIX, URL_LIVENESS_COUNT_KEY, pre-wired `log` binding, attemptCount JSDoc semantics"
provides:
  - "server/lib/urlLiveness.ts — probeUrl (D-16/D-17/D-21), runProbeSweep (D-03), buildProbeCandidates (D-04), persistLiveness (D-12/Pitfall-3, NODE_ENV-gated), waitForHostSlot + pruneStaleHostSlots (D-18/Pitfall-2, NODE_ENV-gated), isTerminalDead helper, SWEEP_SAFETY_MARGIN_MS constant, ProbeResult interface, isPrivateHost SSRF guard, PROBE_UA + MAX_REDIRECTS + PROBE_CONCURRENCY + PROBE_TIMEOUT_MS + PER_HOST_INTERVAL_MS + JITTER_MS knobs (D-18)"
  - "server/__tests__/lib/urlLiveness.probe.test.ts — 13 mocked-fetch tests (full D-07 taxonomy + SSRF + UA + Range fallback + redirect chain)"
  - "server/__tests__/lib/urlLiveness.sweep.test.ts — 20 tests (Tasks 2-5: throttle / persistLiveness / runProbeSweep / buildProbeCandidates)"
affects: [32-03-prune-endpoint-and-cron, 32-04-operator-status-aggregator, 32-05-dashboard-button, 32-06-close]

# Tech tracking
tech-stack:
  added: []  # Zero new npm dependencies — uses standard `fetch` + `AbortController` from Node 20 / Vercel runtime
  patterns:
    - "HEAD-then-GET probe with 405 fallback + manual redirect counting (Phase 32 divergence from nominatim.ts's fetch-with-timeout pattern; redirect:'manual' + Range:'bytes=0-1023')"
    - "SSRF defense-in-depth: PRIVATE_HOST_REGEX rejects loopback / RFC1918 / link-local / cloud-metadata / IPv6 ULA hostnames AND re-checks every redirect target"
    - "Per-host throttle Map with synchronous slot reservation (atomicity fix — `hostNext.set(...)` BEFORE the setTimeout-Promise await so N concurrent same-host dispatchers don't all read the same `prior` and coalesce to 1 throttle gap)"
    - "NODE_ENV='test'-gated `__test__` export for module-private throttle + writer helpers (MEDIUM-02 plan-checker fix; test file asserts process.env.NODE_ENV at file-load)"
    - "createLimit(N) FIFO concurrency primitive from server/lib/concurrencyLimit.ts (same primitive that gates LLM v3 batches)"
    - "Deadline guard at TASK ENTRY + AFTER throttle wait (two checkpoints — a saturated same-host batch can otherwise overrun Vercel maxDuration after the per-task gate nominally cleared)"
    - "Sidecar count INCR/DECR fires on prior→next dead-set transition only (Pitfall 3 throughput rule); raw redis.incr/decr wrapped in try/catch (Pitfall 6 degrade-open); underflow floors at 0 via redis.set"
    - "Probe entry writes go through cacheSetSafe EXCLUSIVELY (Pitfall 6 — chaos-test contract); the only raw redis.set call is the underflow floor on the count key"
    - "ISO-8601 byte-lex sort == chronological sort (well-known JS idiom — no Date.parse or library needed) for D-04 Tier B oldest-lastProbedAt ordering"

key-files:
  modified:
    - "server/lib/urlLiveness.ts (153 → 540 lines; +387 lines of probe + sweep + writer + sort + helpers)"
  created:
    - "server/__tests__/lib/urlLiveness.probe.test.ts (193 lines, 13 tests — full D-07 status taxonomy + SSRF guard + User-Agent + Range fallback + redirect chain)"
    - "server/__tests__/lib/urlLiveness.sweep.test.ts (485 lines, 20 tests — Tasks 2-5 mocked-fetch + Redis matrix)"

key-decisions:
  - "waitForHostSlot reserves the next slot synchronously BEFORE awaiting (atomicity fix caught during Task 4 testing) — without it, N concurrent same-host dispatchers all read the same `prior` value and race to update, coalescing to a single throttle gap instead of N-1. Math.max(now, target) floors against the negative-jitter case so the reservation never lands in the past."
  - "Deadline guard re-runs AFTER waitForHostSlot returns (two-checkpoint design) — a saturated same-host batch can consume seconds of throttle wait time and overrun Vercel maxDuration after the per-task entry gate nominally cleared. Adding a second `if (Date.now() > deadlineMs) skippedBudget++; return;` after the throttle wait closes that gap."
  - "SSRF guard re-checks every redirect target — a hostile 3xx Location header can otherwise pivot from a public host into the Vercel sandbox's private network. The defense-in-depth re-check inside the redirect loop covers this attack vector even though the initial URL is operator-stored (low-trust → can't be assumed safe regardless)."
  - "Probe entry writes route exclusively through cacheSetSafe (Pitfall 6). Sidecar INCR/DECR can't use cacheSetSafe (it wraps CacheEntry<T> shape, not integer counters) so raw redis.incr/decr are wrapped in try/catch and degrade-open. Underflow on DECR floors at 0 via the single raw `redis.set(URL_LIVENESS_COUNT_KEY, 0)` call — documented as the sole permitted bypass of the chaos-test contract."
  - "buildProbeCandidates uses a minimal local interface (ConflictEventEntityForProbe with just `id` + `data.source?`) rather than importing the full ConflictEventEntity discriminated union — avoids pulling MapEntity + server/types.js into the import graph. The runtime `typeof url === 'string'` guard defends against any drift in the assumed shape."
  - "NODE_ENV='test'-gated `__test__` export holds 4 module-private helpers (waitForHostSlot, pruneStaleHostSlots, hostNext, persistLiveness). MEDIUM-02 plan-checker fix: the sweep test file asserts `expect(process.env.NODE_ENV).toBe('test')` at file-import time so runner-config drift (vitest no longer forcing NODE_ENV=test) fails this file loudly instead of silently producing `__test__ === undefined`."
  - "LOW-05 plan-checker fix applied to both per-host throttle tests + the per-host throttle inside sweep test: `{timeout: 10_000}` 3rd arg to `it()` so slow CI runners don't flake. Real timers used (not vi.useFakeTimers) because the fake-timer setTimeout substitution would defeat the Math.max(now, prior+jitter) reservation arithmetic that the tests are proving."
  - "Combined Task 1 commit (probeUrl + SSRF guard) per the plan's fallback option — the diff-split between the main probe primitive and the SSRF early-return is awkward (the SSRF guard is 2 lines + 1 regex; pulling it into its own commit would leak the main probeUrl into a state where the redirect target re-check has no analog). One commit citing both decisions in the body is the plan-blessed alternative."

patterns-established:
  - "Atomic throttle reservation: capture `prior`, compute `target`, synchronously update the Map, THEN await. This is the canonical fix for ANY shared-state throttle map under concurrent dispatch — applies anywhere createLimit fans out to per-resource gates."
  - "Two-checkpoint deadline guard: check at task entry AND after any internal wait that could consume meaningful time (throttle, retry sleep, large fetch body). Single-checkpoint designs leak budget after the per-task entry gate."
  - "SSRF re-check on every redirect target: a stored URL that passes the initial guard can still pivot via a hostile Location header. Cheap to add (one regex match per hop), expensive to debug if missing."
  - "isTerminalDead() exported as a named helper so sweep (Task 3 sidecar maintenance) + prune (Plan 32-03's pruneDeadUrlEvents) share one truth source on what 'dead' means. Same pattern as `ttlSecForStatus` from Plan 32-01 — extract the predicate, don't duplicate it across consumers."
  - "Mocked-fetch matrix via vi.stubGlobal('fetch', mock) + dynamic import after vi.mock registration. Mirrors freeClaudeRouter.test.ts. Future probe-adjacent tests (e.g. Plan 32-04 prune helper that re-probes during the splice) should clone this boilerplate verbatim."

requirements-completed: [GHOST-01, GHOST-05]

# Metrics
duration: ~30min
completed: 2026-05-21
---

# Phase 32 Plan 02: Probe Primitive + Sweep Orchestrator Summary

**Wave-2 load-bearing layer: probeUrl HEAD-then-GET + SSRF guard + per-host 1s throttle + persistLiveness writer w/ monotonic-with-reset attemptCount + runProbeSweep w/ createLimit(8)+deadline + buildProbeCandidates D-04 sort — 33 new tests, 2216 total passing, zero regressions.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-21T19:10Z
- **Completed:** 2026-05-21T19:23Z
- **Tasks:** 5 (1 atomic commit per task)
- **Files modified:** 1 (urlLiveness.ts: 153 → 540 lines)
- **Test files created:** 2 (33 new tests; all green)
- **Branch HEAD:** `f7159f0` (after Task 5)
- **Commit chain:** 5 atomic commits on `feature/32-ghost-event-url-liveness-dashboard-prune`

## Accomplishments

- **`probeUrl(rawUrl)`** — single-URL HTTP liveness probe covering the full `UrlLivenessStatusSchema` taxonomy: HEAD-200 → live, HEAD-404/403 → '404'/'403', HEAD-405 → GET-w/-Range-200 → live, 3xx-chain ≤3-hops → terminal status wins, 4th 3xx → 'unknown', 5xx/451/410 → 'unknown', fetch-throw → 'dead-host', AbortController-timeout → 'dead-host', SSRF-target → 'unknown' (no fetch issued). Every request carries the D-21 PROBE_UA exactly + `redirect: 'manual'` so Phase 32 counts hops itself.
- **`isPrivateHost(hostname)` SSRF guard** — defense-in-depth regex (`/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1|fc|fd)/i`) rejects loopback / RFC1918 / link-local (AWS+GCP+Azure cloud metadata) / IPv6 ULA / ::1 targets before any fetch. Re-checks every redirect target so a hostile Location header can't pivot into the Vercel sandbox's private network.
- **`waitForHostSlot(hostname)` + `pruneStaleHostSlots()`** — module-singleton Map enforces the D-18 polite-citizen contract (≥1 req/s/host, ±200ms jitter) with synchronous slot reservation (atomicity fix — without it, N concurrent same-host dispatchers all read the same `prior` value and race to update, coalescing to 1 throttle gap). End-of-sweep cleanup drops entries older than now-60s (Pitfall 2 mitigation).
- **`persistLiveness(eventId, urlProbed, probeResult)`** — Redis writer for the per-event url-liveness entries. Implements the D-12 / RESEARCH A2 monotonic-with-reset attemptCount semantics (`prior=null + dead → 1`, `dead → dead → prior+1`, `dead → live|unknown → 0`, `not-dead + dead → 1`). Sidecar `events:url-liveness-count` INCR/DECR fires ONLY on the prior→next NOT-DEAD↔DEAD transition (Pitfall 3 throughput rule). DECR underflow floors at 0 via the lone permitted raw `redis.set(URL_LIVENESS_COUNT_KEY, 0)` call (Pitfall 6 chaos-test invariant preserved). Paranoid `UrlLivenessSchema.parse(next)` catches future schema drift before the write.
- **`runProbeSweep({ eventIdsWithUrls, deadlineMs })`** — single exported sweep entry point. `createLimit(PROBE_CONCURRENCY=8)` bounds in-flight tasks (mechanically observed peak ≤8 with 16 distinct-host items). Deadline guards run at TASK ENTRY + AFTER `waitForHostSlot` returns (two-checkpoint design — closes the "throttle wait pushes us past maxDuration" gap that single-checkpoint designs leak). Each task try/catches around URL.parse + probeUrl + persistLiveness so one bad URL never poisons the sweep. End-of-sweep `pruneStaleHostSlots()` runs (Pitfall 2).
- **`buildProbeCandidates()`** — reads `events:llm:v3` via `cacheGetSafe`, extracts each entity's `data.source` (D-05 — the primary URL identical between raw GDELT + LLM v3 per CLAUDE.md), and sorts: Tier A (no liveness key) first / Tier B (has key) ascending by `lastProbedAt`. ISO-8601 byte-lex sort == chronological sort (no library needed). Drops entities with empty/missing/null source.
- **`isTerminalDead(status)`** exported helper — Plan 32-03's `pruneDeadUrlEvents` will reuse this so sweep + prune share one truth source on what "dead" means.
- **`SWEEP_SAFETY_MARGIN_MS = 60_000`** exported constant — Plan 32-03 will pin `deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS` so the 60s safety margin reserves time for the post-sweep prune + audit-log writes under Vercel Pro's 800s `maxDuration` (Pitfall 1).
- **NODE_ENV-gated `__test__` export** — module-private helpers (`waitForHostSlot`, `pruneStaleHostSlots`, `hostNext`, `persistLiveness`) reachable from tests without breaking encapsulation in production builds. MEDIUM-02 plan-checker fix applied (NODE_ENV=test assertion at test-file load).

## Task Commits

Each task committed atomically on `feature/32-ghost-event-url-liveness-dashboard-prune`:

1. **Task 1: `probeUrl` + SSRF guard** — `e891f40` (feat) — HEAD-then-GET, redirect cap, SSRF defense-in-depth, User-Agent + Range header literals (D-16, D-17, D-18, D-21)
2. **Task 2: Per-host throttle** — `f54b4b2` (feat) — `waitForHostSlot` + `pruneStaleHostSlots` + NODE_ENV-gated `__test__` export (D-18, Pitfall 2)
3. **Task 3: `persistLiveness` writer** — `3534aa2` (feat) — Monotonic-with-reset attemptCount + sidecar INCR/DECR maintenance + isTerminalDead helper (D-12, Pitfall 3, Pitfall 6)
4. **Task 4: `runProbeSweep` orchestrator** — `f363080` (feat) — `createLimit(8)` + two-checkpoint deadline guard + end-of-sweep cleanup; included the `waitForHostSlot` atomicity fix (D-03, D-18, Pitfall 1, Pitfall 2)
5. **Task 5: `buildProbeCandidates` priority sort** — `f7159f0` (feat) — D-04 Tier-A-first + Tier-B-oldest-lastProbedAt + empty-source skip (D-04, D-05)

## Files Created/Modified

- `server/lib/urlLiveness.ts` (MODIFIED, 153 → 540 lines, +387 net) — added probe primitive + SSRF guard + throttle helpers + persistLiveness writer + runProbeSweep orchestrator + buildProbeCandidates sort + 6 D-18 constants + SWEEP_SAFETY_MARGIN_MS + ProbeResult interface + isTerminalDead helper + NODE_ENV-gated `__test__` export. Imports widened to `cacheGetSafe` + `cacheSetSafe` + `redis` from `../cache/redis.js` and `createLimit` from `./concurrencyLimit.js`.
- `server/__tests__/lib/urlLiveness.probe.test.ts` (CREATED, 193 lines, 13 tests) — mocked-fetch matrix: 200 / 404 / 403 / 405-then-GET-200 / 3xx-chain-≤3-then-200 / 3xx-chain->3-unknown / 5xx-unknown / fetch-throw-dead-host / fake-timer-timeout-dead-host / User-Agent-literal / Range-fallback-literal / SSRF-localhost-no-fetch / SSRF-10.x-no-fetch / SSRF-169.254-no-fetch.
- `server/__tests__/lib/urlLiveness.sweep.test.ts` (CREATED, 485 lines, 20 tests) — `Plan 02 Task 2 — per-host throttle` (4 tests), `Plan 02 Task 3 — persistLiveness writer` (7 tests), `Plan 02 Task 4 — runProbeSweep` (4 tests), `Plan 02 Task 5 — buildProbeCandidates` (5 tests).

## Decisions Made

### Combined Task 1 commit (plan-blessed fallback)

The plan offered "two atomic commits per CLAUDE.md atomic-per-decision convention" but flagged a fallback: "if that diff-split is awkward, ship them as one commit `feat(32): probeUrl + SSRF guard (D-16, D-17, D-18, D-21)` with a body listing both decisions." The diff was awkward because the SSRF guard isn't just a regex + early-return — it ALSO needs the redirect-target re-check inside the redirect loop. Splitting the regex into its own commit would leak the main probeUrl into a state where redirect targets bypass the guard. One commit citing both decisions is the plan-blessed alternative.

### waitForHostSlot atomicity fix (caught during Task 4 testing)

First Task 4 run showed `per-host throttle inside sweep` test failing at 1039ms (expected ≥2400ms). Root cause: N concurrent same-host dispatchers all read the same `prior` value before any of them wrote the reservation, then raced to update — coalescing to 1 throttle gap instead of N-1. Fix: reserve the next slot synchronously (`hostNext.set(...)` BEFORE the setTimeout-Promise await). Math.max(now, target) floors against negative-jitter (so a target in the past doesn't cause the reservation to land before `now`).

### Two-checkpoint deadline guard

Plan specified the deadline check inside each task body. During implementation I noticed a saturated same-host batch can consume seconds of `waitForHostSlot` wait time AFTER the entry-gate check nominally cleared — that would overrun Vercel `maxDuration` from inside the throttle, defeating Pitfall 1. Added a second `if (Date.now() > opts.deadlineMs)` check immediately after the throttle wait returns. Both checkpoints increment `skippedBudget` so the operator-visible accounting stays consistent.

### SSRF re-check on every redirect target

The plan's SSRF guard only specified the entry-point check. I extended the implementation to re-check every redirect target inside the `for (let hop = 0; ...)` loop because a public-host primary URL can still redirect to a private host via a hostile `Location` header. Cheap (one regex match per hop), expensive to debug if missing. Documented in the JSDoc + tested implicitly via the redirect-chain tests (which use only public-domain targets).

### LOW-05 plan-checker fix — real timers + 10s test timeout

The plan suggested either `{ timeout: 10_000 }` OR `vi.useFakeTimers()`. Chose the former for the per-host throttle tests because the fake-timer `setTimeout` substitution would defeat the `Math.max(now, prior+jitter)` reservation arithmetic that the tests are proving (the test asserts the wall-clock delta is ≥800ms — that requires real time to elapse). For the `fetch` timeout test (probe test), I used `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(11_000)` because the abort signal handler doesn't depend on real time.

### MEDIUM-02 plan-checker fix — NODE_ENV assertion at test-file load

Applied to both new test files: `expect(process.env.NODE_ENV).toBe('test')` at the top. Without this, a future runner-config change (vitest no longer forcing NODE_ENV=test) would silently produce `__test__ === undefined` and tests that destructure it would throw with a hard-to-diagnose "Cannot destructure property" error instead of the explicit "NODE_ENV is not 'test'" message.

### Plan 32-03 hook surface pinned

`SWEEP_SAFETY_MARGIN_MS` is exported as a named constant (not a magic number scattered across plan 03's call site). Plan 32-03's cron handler will compute `const deadline = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS` so the safety margin is visible in one place and the executor can't accidentally pass a different value.

## Deviations from Plan

**None substantive — plan executed end-to-end.**

Three small mid-stream refinements documented above:

1. **Combined Task 1 commit** (plan-blessed fallback) — applied per the plan's explicit "if that diff-split is awkward, ship them as one commit ... is acceptable fallback" clause.
2. **waitForHostSlot atomicity fix** — discovered during Task 4 testing. The plan's reservation pseudocode (`hostNext.set(hostname, Math.max(now, target) + PER_HOST_INTERVAL_MS)` AFTER the await) does NOT atomically reserve under concurrent same-host dispatch. Moved the `hostNext.set` BEFORE the await. Rule 1 (auto-fix bug — the throttle test caught a correctness defect in the original implementation).
3. **Two-checkpoint deadline guard** — added a second `Date.now() > deadlineMs` check after `waitForHostSlot` returns. Rule 2 (auto-add missing critical functionality — single-checkpoint design leaks budget after the per-task entry gate; this is a correctness requirement for Pitfall 1, not a feature add).

All three are surfaced inline in the relevant commit messages and the JSDoc of the affected helpers.

## Self-Check: PASSED

**Files exist:**
- `server/lib/urlLiveness.ts` — FOUND (153 → 540 lines)
- `server/__tests__/lib/urlLiveness.probe.test.ts` — FOUND
- `server/__tests__/lib/urlLiveness.sweep.test.ts` — FOUND
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-02-SUMMARY.md` — FOUND (this file)

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**
- `e891f40` feat(32): probeUrl HEAD-then-GET + SSRF guard (D-16, D-17, D-18, D-21) — FOUND
- `f54b4b2` feat(32): per-host 1s throttle + pruneStaleHostSlots (D-18, Pitfall 2) — FOUND
- `3534aa2` feat(32): persistLiveness writer + sidecar count maintenance (D-12, Pitfall 3) — FOUND
- `f363080` feat(32): runProbeSweep + createLimit(8) + deadline budget (D-03, Pitfall 1) — FOUND
- `f7159f0` feat(32): buildProbeCandidates with D-04 two-tier priority sort — FOUND

**Automated verify commands (all PASS):**
- `git rev-parse --abbrev-ref HEAD` → `feature/32-ghost-event-url-liveness-dashboard-prune`
- `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts server/__tests__/lib/urlLiveness.sweep.test.ts server/__tests__/lib/urlLiveness.schema.test.ts` → 3 test files / 47 tests passed (13 probe + 20 sweep + 14 schema)
- `grep -q "PROBE_UA = 'IranMonitor-LinkCheck/1.0" server/lib/urlLiveness.ts` → OK
- `grep -q "MAX_REDIRECTS = 3" server/lib/urlLiveness.ts` → OK
- `grep -q "PRIVATE_HOST_REGEX" server/lib/urlLiveness.ts` → OK
- `grep -q "redirect: 'manual'" server/lib/urlLiveness.ts` → OK
- `grep -q "Range = 'bytes=0-1023'" server/lib/urlLiveness.ts` → OK
- `grep -q "PER_HOST_INTERVAL_MS = 1_000" server/lib/urlLiveness.ts` → OK
- `grep -q "waitForHostSlot" server/lib/urlLiveness.ts` → OK
- `grep -q "pruneStaleHostSlots" server/lib/urlLiveness.ts` → OK
- `grep -q "function persistLiveness" server/lib/urlLiveness.ts` → OK
- `grep -q "isTerminalDead" server/lib/urlLiveness.ts` → OK
- `grep -q "redis.incr(URL_LIVENESS_COUNT_KEY)" server/lib/urlLiveness.ts` → OK
- `grep -q "export async function runProbeSweep" server/lib/urlLiveness.ts` → OK
- `grep -q "createLimit(PROBE_CONCURRENCY)" server/lib/urlLiveness.ts` → OK
- `grep -q "export async function buildProbeCandidates" server/lib/urlLiveness.ts` → OK
- **Pitfall 6 invariant**: `grep -nE "redis\.set\(" server/lib/urlLiveness.ts | grep -v COUNT_KEY | grep -v "JSDoc"` → 0 lines (the only real `redis.set` call is the documented underflow floor on `URL_LIVENESS_COUNT_KEY`; the one JSDoc reference at line 442 is documentation, not code)
- **SSRF guard test**: `expect(fetchMock).not.toHaveBeenCalled()` PASS for localhost / 10.x / 169.254.x targets (3 distinct SSRF assertions)
- **Concurrency cap test**: 16 distinct-host items → peak in-flight = 8 (mechanically observed via instrumented cacheSetSafe counter)
- `npm run typecheck` → `type-coverage success` (97.49% — above 97 floor)
- `npm run lint` → 0 errors / 24 pre-existing warnings (none from Plan 32-02 files)
- `npx vitest run` → 2216 passed / 19 skipped / 5 todo / 0 failed (was 2183 from Plan 01 baseline → +33 new tests, zero regressions)

## Pitfall Audit (RESEARCH §6)

- **Pitfall 1** (Vercel maxDuration overrun) — runProbeSweep's two-checkpoint deadline guard + SWEEP_SAFETY_MARGIN_MS=60_000 reserve time for the post-sweep prune. **Mitigated.**
- **Pitfall 2** (hostNext Map growth) — pruneStaleHostSlots() runs end-of-sweep + daily cold-start naturally resets. **Mitigated.**
- **Pitfall 3** (sidecar count throughput) — INCR/DECR fires ONLY on prior→next dead-set transition (not on same-state probes); 7-test matrix pins the semantics. **Mitigated.**
- **Pitfall 6** (chaos-test contract) — cacheSetSafe used exclusively for entry writes; raw redis.incr/decr/set wrapped in try/catch + degrade-open. `grep -nE "redis\.set\(" | grep -v COUNT_KEY` returns 0 functional lines. **Mitigated.**
- **SSRF (T-32-02)** — PRIVATE_HOST_REGEX rejects 9 ranges; re-checks every redirect target; 3 dedicated tests prove `fetchMock` is never called for private targets. **Mitigated.**
- **DoS via hanging probe (T-32-09)** — AbortController + 10s timeout × 3 redirect hops = ≤30s upper bound per URL. Tested via `vi.useFakeTimers` + `vi.advanceTimersByTimeAsync(11_000)`. **Mitigated.**

## Issues Encountered

**waitForHostSlot atomicity defect** (Task 4 testing): First run of `per-host throttle inside sweep gates same-host bursts` test failed at 1039ms (expected ≥2400ms). Root cause: N concurrent same-host dispatchers read the same `prior` value before any wrote the reservation. Fix landed inside the Task 4 commit (not as a separate "fix" commit) because the test that caught the defect lives in the same test file as the runProbeSweep tests — the fix and the regression-guard test ship together.

## User Setup Required

**None.** All 3 files are pure-TypeScript libraries + tests, no env vars, no new npm packages, no Vercel cron entries, no production Redis writes. The probe + sweep + persist surface is fully exercised by mocked-fetch + mocked-Redis tests; live behavior emerges when Plan 32-03's cron handler invokes `runProbeSweep` with real candidates.

## Next Plan Readiness

**Plan 32-03 (prune endpoint + cron wiring)** is unblocked:

- `runProbeSweep({ eventIdsWithUrls, deadlineMs })` is the single exported sweep entry point — Plan 32-03's cron handler wires it directly.
- `buildProbeCandidates()` returns the sorted candidate list with no extra orchestration needed — `runProbeSweep({ eventIdsWithUrls: await buildProbeCandidates(), deadlineMs })` is the canonical call site.
- `SWEEP_SAFETY_MARGIN_MS = 60_000` exported as a named constant — Plan 32-03's `deadlineMs = cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS` shares one truth source with the sweep implementation.
- `isTerminalDead(status)` exported so Plan 32-03's `pruneDeadUrlEvents` shares the same dead-set predicate with the sweep's sidecar maintenance — no risk of dead-set drift between probe-time INCR and prune-time DECR.
- `URL_LIVENESS_KEY_PREFIX` + `URL_LIVENESS_COUNT_KEY` (already exported from Plan 32-01) cover the namespace surface — Plan 32-03's prune-helper iterates `events:url-liveness:*` keys and DEL's them under one canonical prefix.
- The full D-12 attemptCount semantics are pinned by the 7-test matrix — Plan 32-03's `attemptCount >= 3` cron auto-prune gate consumes the exact counter shape this plan writes.

**Blockers / concerns:** None for Plan 32-02 completion. The Plan 03 plan-checker MEDIUM-01 (Upstash SCAN signature) is unaffected by Plan 32-02; it's a Plan 32-03 execute-time note.

---
*Phase: 32-ghost-event-url-liveness-dashboard-prune*
*Plan: 02*
*Completed: 2026-05-21*
