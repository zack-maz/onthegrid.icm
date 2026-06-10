---
phase: 43-ghost-link-prune-correctness
plan: 03
subsystem: ghost-event-url-liveness
tags: [url-liveness, attempt-count, no-url-classification, evidence, tdd]
requires:
  - server/lib/urlLiveness.ts (Plan 43-01 7-status schema + evidence field; Plan 43-02 probeUrl emits evidence)
provides:
  - persistLiveness split attemptCount derivation (live=0, unknown=preserve, no-url=0, dead-monotonic)
  - persistLiveness urlProbed widened to string|null
  - buildProbeCandidates source-less no-url write (no fetch) + classifiedNoUrl return
  - buildProbeCandidates return shape { candidates, classifiedNoUrl }
  - cron post-step log line reports classifiedNoUrl
affects:
  - Plan 43-04 (cron-only 403 prune demotion — reads attemptCount >= 3 gate; no-url already excluded from prune)
  - Phase 44 (downstream readers of the no-url per-bucket count + classifiedNoUrl coverage accounting)
tech-stack:
  added: []
  patterns:
    - 'status-specific attemptCount derivation: live resets, unknown preserves prior, no-url=0, dead-monotonic — two independent axes (history vs sidecar membership)'
    - 'side-effecting persistLiveness no-url write (no fetch) replaces silent source-less drop; degrade-open per event'
    - 'return-shape widening { candidates, classifiedNoUrl } threaded into cron log line for coverage accounting'
key-files:
  created: []
  modified:
    - server/lib/urlLiveness.ts
    - server/lib/llmExtractionPipeline.ts
    - server/__tests__/lib/urlLiveness.sweep.test.ts
    - server/__tests__/routes/refresh-events-cron.prune.test.ts
decisions:
  - 'D-10: persistLiveness reset rule split by status — live→0, unknown→preserve prior?.attemptCount ?? 0, no-url→0, dead→dead→+1, not-dead→dead→1. Fixes the flaky-host evasion where unknown reset the count.'
  - 'D-10/Pitfall 4: sidecar DECR on dead→{unknown,no-url} retained while attemptCount is preserved — attemptCount (consecutive-dead history) and the sidecar (current terminal-dead membership) are independent axes.'
  - 'D-08: no-url is not terminal-dead, so a fresh source-less no-url write has priorDead=false → no sidecar INCR; prune SEES the event and explicitly skips it (never prunes for lacking a URL).'
  - 'D-09: buildProbeCandidates returns classifiedNoUrl; cron post-step log.info reports { probed, skippedBudget, classifiedNoUrl }.'
  - 'D-16: no-url evidence literal = "no-url: event has no source URL".'
  - 'Accumulation-test correction: the canonical RESEARCH derivation [VERIFIED] makes unknown→dead start at 1 (prior unknown is not-dead); the flaky-host fix works because unknown PRESERVES the gate-read value across blips so a dead-run accumulates past >=3 — the RED test was corrected to this verified semantics.'
metrics:
  duration_min: 6
  completed: 2026-06-10
  tasks: 2
  files: 4
---

# Phase 43 Plan 03: attemptCount Semantics + no-url Coverage Summary

Implemented the two GHOST-08 attemptCount fixes and the GHOST-07 source-less coverage. `persistLiveness` now derives the next `attemptCount` per status — `live` fully resets to 0, `unknown` PRESERVES the prior count (the flaky-host fix: a transient blip no longer wipes the consecutive-dead run a repeat offender accumulates toward the `>=3` cron prune gate), `no-url` is 0, dead→dead increments monotonically — while the sidecar dead-count DECR on dead→unknown is retained (history and membership are independent axes). `buildProbeCandidates` replaces its silent drop of source-less events with an explicit `no-url` liveness write (no fetch) and returns a `classifiedNoUrl` count that the cron post-step log line now reports.

## What Was Built

- **Task 1 (`test` `a4103c4` RED → `feat` `e181e61` GREEN)** — split attemptCount derivation + evidence (GHOST-08):
  - `persistLiveness` `!nextDead` branch split into explicit cases: `live`→0, `unknown`→`prior?.attemptCount ?? 0` (D-10 PRESERVE), `no-url`→0, `priorDead`→`prior.attemptCount + 1`, else 1.
  - Sidecar count logic UNCHANGED — DECR still fires on `priorDead && !nextDead` (dead→{unknown,no-url} both DECR while attemptCount is preserved); INCR on not-dead→dead. The two axes stay decoupled (Pitfall 4).
  - `evidence: probeResult.evidence` was already wired through `persistLiveness` in Plan 01; this plan adds the explicit write-side assertion.
  - Writer JSDoc rewritten to the new split rule.
  - Sweep test: FLIPPED the `dead→unknown` case to assert attemptCount PRESERVED (3) + DECR still fires; added a dead-run-with-unknown-blip accumulation case crossing `>=3`; added an evidence-on-write assertion; added `evidence` to the prior `cacheHit` fixtures.

- **Task 2 (`test` `75d0e5e` RED → `feat` `0c790d6` GREEN)** — source-less → no-url + classifiedNoUrl (GHOST-07):
  - `persistLiveness` `urlProbed` widened to `string | null` (no-url writes `null` → `lastUrlProbed: null`, satisfying the Plan 01 nullable schema).
  - `buildProbeCandidates` replaces the silent `continue` for source-less events with a side-effecting `persistLiveness(id, null, { status:'no-url', httpStatus:null, finalUrl:'', evidence:'no-url: event has no source URL' })` (no HTTP), wrapped per-event in try/catch (degrade-open). No sidecar INCR fires (no-url is not-dead, fresh event has `priorDead=false`).
  - Return type widened from `Array<{eventId,url}>` to `{ candidates: Array<{eventId,url}>; classifiedNoUrl: number }`; `classifiedNoUrl` increments per source-less event.
  - `llmExtractionPipeline.ts` cron post-step destructures `{ candidates, classifiedNoUrl }` and adds `classifiedNoUrl` to the `log.info` object (D-09). The degrade-open try/catch wrapping is unchanged.
  - Sweep test: extended the buildProbeCandidates block with source-less cases asserting the exact no-url entry shape, no fetch, the `classifiedNoUrl` count, candidate-array exclusion, and no sidecar INCR; updated the pre-existing 4 buildProbeCandidates cases to destructure `.candidates`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated cron prune route mock to the new buildProbeCandidates shape**

- **Found during:** Post-Task-2 full route-suite verification.
- **Issue:** `server/__tests__/routes/refresh-events-cron.prune.test.ts:240` mocked `buildProbeCandidates` returning the bare array shape. With the Task 2 return-shape change, the cron post-step's `{ candidates }` destructure read `undefined`, failing the `eventIdsWithUrls` assertion (1 test).
- **Fix:** Updated `mockBuildProbeCandidates.mockResolvedValue` to return `{ candidates: [...], classifiedNoUrl: 0 }`. Direct consequence of the Task 2 return-shape widening, not new scope.
- **Files modified:** `server/__tests__/routes/refresh-events-cron.prune.test.ts`
- **Commit:** `10b0242`

### Test-Semantics Correction (within Task 1 GREEN)

The Task 1 RED accumulation test initially asserted `unknown→dead` increments to 2. The canonical RESEARCH derivation (`§"attemptCount derivation under the NEW D-10 rule"` `[VERIFIED]`) makes `unknown→dead` start at 1 (the prior `unknown` is not terminal-dead, so the not-dead→dead branch applies). The accumulation past `>=3` is genuinely driven by a consecutive dead-run where `unknown` blips PRESERVE the gate-read value rather than zeroing it. The test was corrected to this verified semantics inside the Task 1 GREEN commit (`e181e61`) — the implementation matches RESEARCH exactly; the initial RED expectation was the error.

## Verification

- `npx vitest run server/__tests__/lib/urlLiveness.sweep.test.ts` — 24 passed (flipped attemptCount + accumulation + no-url + evidence).
- `npx vitest run server/__tests__/lib/urlLiveness` — 95 passed (all 4 urlLiveness suites).
- `npx vitest run server/__tests__/lib/llmExtractionPipeline` — 15 passed.
- `npx vitest run server/__tests__/routes` — 181 passed (20 files; no regression).
- `npx tsc --noEmit` — exit 0 (signature + return-shape widenings + caller update compile).
- `grep "prior?.attemptCount" server/lib/urlLiveness.ts` → match (unknown-preserve branch).
- `grep "classifiedNoUrl"` → 6 in urlLiveness.ts, 2 in llmExtractionPipeline.ts; cron post-step log line includes it.
- `grep "no-url"` → 21 in urlLiveness.ts, 6 in sweep test.

## TDD Gate Compliance

`test(...)` RED commits precede their `feat(...)` GREEN commits for both tasks: Task 1 `a4103c4`→`e181e61`, Task 2 `75d0e5e`→`0c790d6`. RED was verified failing before each GREEN (2 then 6 failing). No REFACTOR commit needed — implementation was clean on first GREEN.

## Known Stubs

None. The split attemptCount derivation, no-url write path, and classifiedNoUrl accounting are end-to-end functional. The cron-only 403 prune demotion (GHOST-09) and operator-status soft-404/no-url surfacing are Plan 04 scope — documented forward-references, not blocking stubs.

## Threat Flags

None beyond the plan's pre-registered register. T-43-08 (no-url prune over-aggression) is mitigated — no-url is not terminal-dead, no sidecar INCR on the no-url write (asserted). T-43-09 (flaky-host evasion) is mitigated — unknown preserves the count so a repeat offender accumulates past `>=3` (accumulation test pins it). T-43-10 (sweep degrade-open) is mitigated — the per-event no-url write is wrapped in try/catch and the cron post-step retains its outer try/catch. Zero packages installed (T-43-SC n/a).

## Self-Check: PASSED

All 4 modified files exist on disk; all 5 task commits (`a4103c4`, `e181e61`, `75d0e5e`, `0c790d6`, `10b0242`) present in git history.
