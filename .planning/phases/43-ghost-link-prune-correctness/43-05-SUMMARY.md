---
phase: 43-ghost-link-prune-correctness
plan: 05
subsystem: api
tags: [url-liveness, prune, cron, operator-status, ghost-link, redis]

# Dependency graph
requires:
  - phase: 43-01
    provides: UrlLiveness schema with soft-404 + no-url statuses and evidence field; isTerminalDead predicate
  - phase: 43-03
    provides: attemptCount split-derivation semantics + no-url wiring (D-10)
  - phase: 43-04
    provides: GHOST-09 / SC-3 evidence sample + locked DEMOTE decision (D-14/D-15) in 43-VERIFICATION.md
provides:
  - Cron-only 403 exclusion in pruneDeadUrlEvents (prune-filter-local, not isTerminalDead)
  - Explicit cronPrune pins — unknown AND no-url never-prunable on both triggers (D-08/D-11)
  - soft-404 cron-prunable under the retained attemptCount >= 3 gate (D-05/D-12)
  - Widened DeadUrlSampleEntry with soft-404 status + evidence: string | null field (D-19)
affects: [44-events-subtab-pipeline-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Prune-filter-local status exclusion: cron-only 403 skip lives in pruneDeadUrlEvents, never in the shared isTerminalDead predicate (preserves dashboard count + manual prune + deadUrlSample)'
    - 'Asymmetric prune error budget pinned by test: unknown/no-url never-prunable on either trigger guards against future status additions silently widening prune'

key-files:
  created: []
  modified:
    - server/lib/urlLiveness.ts
    - server/routes/operator-status.ts
    - server/__tests__/lib/urlLiveness.cronPrune.test.ts

key-decisions:
  - 'DEMOTE implemented (43-VERIFICATION.md GHOST-09 locked decision): cron skips 403 regardless of attemptCount; manual still prunes it'
  - 'Cron-only 403 exclusion is prune-filter-local — isTerminalDead UNCHANGED so dashboard count, deadUrlSample, and manual prune all keep treating 403 as terminal-dead'
  - 'DeadUrlSampleEntry exposes soft-404 (terminal-dead) but NOT no-url (not terminal-dead, never reaches the sample)'
  - 'evidence sourced via value.evidence ?? null — pre-Phase-43 entries lacking the field coerce to null (TS-generic cacheGetSafe cast, no runtime Zod parse)'

patterns-established:
  - 'Status-demotion stays out of the shared terminal-dead predicate: only the destructive cron path filters it'

requirements-completed: [GHOST-09, GHOST-10]

# Metrics
duration: 9min
completed: 2026-06-09
---

# Phase 43 Plan 05: GHOST-09 Prune Demotion + GHOST-10 Server Exposure Summary

**Cron-only 403 prune exclusion (DEMOTE per locked evidence) implemented prune-filter-local, with unknown/no-url never-prunable pins, soft-404 cron-prunable under the retained >=3 gate, and DeadUrlSampleEntry widened with soft-404 + evidence for Phase 44.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-09T22:32:00Z
- **Completed:** 2026-06-09T22:34:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented the GHOST-09 DEMOTE decision recorded by Plan 04: one prune-filter-local line in `pruneDeadUrlEvents` skips `403` on the cron trigger regardless of `attemptCount`, while the manual trigger still prunes it. `isTerminalDead` is untouched, so the dashboard dead-URL count, the `deadUrlSample` drill-down, and the manual operator prune all keep treating `403` as terminal-dead.
- Pinned the asymmetric prune error budget: cronPrune test now asserts `unknown` (C) and `no-url` (H) are never-prunable on BOTH triggers (D-08/D-11), and `soft-404` is cron-prunable at `attemptCount >= 3` (F) but skipped at `< 3` (G) under the retained gate (D-05/D-12).
- Widened `DeadUrlSampleEntry` (operator-status.ts) with the `soft-404` status and an `evidence: string | null` field sourced from the stored entry, giving Phase 44 the data to mount (GHOST-10, D-19). Server-side only — no client UI.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): cron-403-skip + soft-404/no-url prune pins** - `f837679` (test)
2. **Task 1 (GREEN): cron-only 403 prune exclusion** - `3b2dbb9` (feat)
3. **Task 2: widen DeadUrlSampleEntry with evidence + soft-404** - `5abb6a2` (feat)

_Task 1 was TDD (tdd="true"): RED test commit then GREEN implementation commit._

## Files Created/Modified

- `server/lib/urlLiveness.ts` - Added the cron-only `403` exclusion (`opts.trigger === 'cron' && entry.status === '403'` → continue) between the `isTerminalDead` gate and the `attemptCount >= 3` gate in `pruneDeadUrlEvents`. Added comments documenting the prune-filter-local rationale and the D-14/D-15 evidence. `isTerminalDead` unchanged.
- `server/routes/operator-status.ts` - Added `'soft-404'` to the `DeadUrlSampleEntry.status` union and a new `evidence: string | null` field; sourced `evidence: value.evidence ?? null` in `buildDeadUrlSample`'s `sample.push`.
- `server/__tests__/lib/urlLiveness.cronPrune.test.ts` - Added `evidence` to all fixtures (Pitfall 5), added `soft-404` fixtures F/G and a `no-url` fixture H, updated the cron case (now prunes B, F; skips E, G), the manual case (prunes A, B, E, F, G), and added cron-403-skip/manual-403-prune, unknown+no-url both-trigger pins, and soft-404 gate cases.

## Decisions Made

- **DEMOTE, as locked.** 43-VERIFICATION.md §GHOST-09 records the locked decision (20/20 re-probed production `403` URLs serve a live article under a browser UA — bot-blocking-CDN false positives confirmed). Applied the cron-only `403` exclusion exactly as the plan's DEMOTE branch specified.
- **Exclusion kept out of `isTerminalDead`.** Per the RESEARCH anti-pattern, the exclusion lives only in the cron prune filter. This is what preserves the dashboard count, `deadUrlSample`, and manual prune for `403`.
- **`no-url` excluded from the sample union.** `DeadUrlSampleEntry.status` gained `soft-404` (terminal-dead) but NOT `no-url`, which is not terminal-dead and never reaches `buildDeadUrlSample`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. RED confirmed cleanly (cron pruned B, E, F — count 3 — before the exclusion), GREEN landed in one edit (cron prunes B, F — count 2), and the downstream cron-dependent assertions (audit-log prunedIds, splice remaining IDs, del keys) were updated in lockstep with the new 8-fixture set.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GHOST-09 (implementation half) and GHOST-10 (server exposure) both complete. Phase 44 can read `DeadUrlSampleEntry.evidence` (render as TEXT, not HTML — T-43-16) and the `soft-404` per-bucket status from `/api/operator-status` to mount the events-subtab pipeline detail.
- `npx vitest run server/__tests__/lib/urlLiveness.cronPrune.test.ts` (13 passing) and `urlLiveness.schema.test.ts` green; `npx tsc --noEmit` exits 0.

## Self-Check: PASSED

- FOUND: `.planning/phases/43-ghost-link-prune-correctness/43-05-SUMMARY.md`
- FOUND: commit `f837679` (RED test)
- FOUND: commit `3b2dbb9` (GREEN — cron 403 exclusion)
- FOUND: commit `5abb6a2` (DeadUrlSampleEntry widening)
- FOUND: cron-only 403 exclusion line in `server/lib/urlLiveness.ts`

---

_Phase: 43-ghost-link-prune-correctness_
_Completed: 2026-06-09_
