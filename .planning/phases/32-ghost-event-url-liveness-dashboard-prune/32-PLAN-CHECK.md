---
phase: 32
slug: ghost-event-url-liveness-dashboard-prune
status: pass
checker_iterations: 1
verdict: PASS
high_severity: 0
medium_severity: 3
low_severity: 5
created: 2026-05-19
---

# Phase 32 Plan-Check Verdict

> Produced by `gsd-plan-checker` on 2026-05-19 against the 6 PLAN.md files + CONTEXT/RESEARCH/PATTERNS/VALIDATION upstream artifacts. Goal-backward analysis: "If a competent executor follows these plans literally, do they deliver the Phase 32 goal?"

## VERDICT: PASS

- **Overall:** Plans are mechanically complete and correctly wired. All 22 D-N decisions, all 5 GHOST-0[1-5] requirements, all 12 mandatory invariants from RESEARCH covered.
- **Strict DAG:** depends_on chain forms a clean sequential graph (01 → 02 → 03 → 04 → 05 → 06). No cycles, no forward references.
- **Threat model:** All HIGH-severity threats (T-32-01..03, 05, 06) have non-trivial mitigations. T-32-04 (audit-log eviction) and T-32-07 (prune mid-read race) are accept-disposition with documented rationale.
- **VALIDATION alignment:** 22 task rows in `32-VALIDATION.md` map 1:1 to 22 tasks across the 6 plans. `nyquist_compliant: true` justified.
- **Replan recommended:** NO (zero HIGH-severity concerns).

---

## MEDIUM-Severity Concerns (3) — address inline during execution

### MEDIUM-01: Upstash `redis.scan` API shape — Plan 03 Task 1
**Risk:** If the executor's SCAN call doesn't match `@upstash/redis ^1.37.0`'s `Promise<[number, string[]]>` return shape, the prune helper silently no-ops in production while mocked tests pass green.
**Fix:** Add a one-line interface note in Plan 03 Task 1's `<interfaces>` block citing the exact SCAN signature. Alternative: skip SCAN entirely and iterate the in-memory `events:llm:v3` entity list (already loaded from `cacheGetSafe`). Researcher's RESEARCH section flagged this as acceptable O(N-events).

### MEDIUM-02: `__test__` conditional export — Plan 02 Task 2
**Risk:** `process.env.NODE_ENV === 'test'`-gated exports for module-private throttle helpers depend on Vitest setting `NODE_ENV=test` reliably during the run.
**Fix:** Add `expect(process.env.NODE_ENV).toBe('test')` at the top of `urlLiveness.sweep.test.ts`, or pivot to `vi.importActual` + `vi.mock` injection for module-private visibility.

### MEDIUM-03: `fetchOpStatus` reference — Plan 05 Task 1
**Risk:** Plan 05 Task 1 action body calls `void fetchOpStatus()` after a successful prune but does not declare its scope/origin in `<interfaces>`.
**Fix:** Add `fetchOpStatus` to Plan 05 Task 1's `<interfaces>` block with its declaration line from `DevApiStatus.tsx` (or correct call shape — e.g. `setOpStatusRefreshTick(t => t + 1)`).

---

## LOW-Severity Concerns (5) — opportunistic during execution

- **LOW-01** `pruneDeadUrlEvents` reads `events:llm:v3` twice (minor Redis command overhead; comment for cost analysis).
- **LOW-02** Schema-validation failure log level — `log.error` vs `log.warn` inconsistency between `persistLiveness` and `runProbeSweep`.
- **LOW-03** Drill-down list missing in Plan 05 — ROADMAP success criterion 1 says "count + drill-down list" but Plan 05 Task 1 only renders the count + button. **Operator-visible scope gap; see decision below.**
- **LOW-04** No time-bound on Plan 06 Task 4 UAT checkpoint — could leave STATE.md hanging if operator delays.
- **LOW-05** Plan 02 Task 4 per-host-throttle test uses real timers — potential CI flakiness on slow runners. Add `{ timeout: 10_000 }` or use `vi.useFakeTimers()`.

---

## Decision Coverage Matrix (22/22 ✓)
See plan-checker verdict above — all D-01 through D-22 traced to specific tasks across the 6 plans. D-05 corrected (`data.source` for both raw GDELT and v3) is honored everywhere.

## Requirement Coverage Matrix (5/5 ✓)
GHOST-01 through GHOST-05 each have one or more covering tasks.

## Invariant Coverage (12/12 ✓)
All 12 mandatory invariants from RESEARCH (sidecar count key, deadline guard, direct helper invocation, monotonic-with-reset attemptCount, dual schema test placement, cron bearerFingerprint literal, in-memory throttle, chaos-test extension, CLAUDE.md registry update, branch-per-phase, atomic per-decision commits, zero new deps) are addressed.

---

## Recommendation

**Proceed to execution.** No replan required.

- The 3 MEDIUM concerns are surgical interface fixes (one-line each) that the executor can land inline as part of the relevant tasks; they do not block plan-level dependencies.
- The 5 LOW concerns are observational and can be addressed opportunistically during execution.
- **LOW-03 (drill-down list)** is the most user-visible — operator should decide whether to escalate to Plan 05 scope (small render block addition) or accept the count-only surface as sufficient for v1.
