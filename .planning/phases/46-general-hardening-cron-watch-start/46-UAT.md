---
status: testing
phase: 46-general-hardening-cron-watch-start
source: [46-VERIFICATION.md]
started: 2026-06-22T00:00:00Z
updated: 2026-06-22T00:00:00Z
---

## Current Test

number: 1
name: Daily watch sample lands on first natural /api/cron/health tick
expected: |
After one natural midnight-UTC `/api/cron/health` run, `readWatchHistory()`
returns ≥1 `WatchSample` whose `tickDate` is the current UTC date, with
non-null `cronAgeMs` fields, eval-bundle scores, and `result: 'PASS'` when
Redis + eval are healthy. NON-BLOCKING — does not gate phase/milestone close.
awaiting: user response

## Tests

### 1. Daily watch sample auto-captured on the existing health cron

expected: After a natural `0 0 * * *` `/api/cron/health` tick, `readWatchHistory()` returns ≥1 `WatchSample` for the current UTC `tickDate` with non-null `cronAgeMs`, eval scores, and a PASS/FAIL `result`. The `cron:watch:v2` ring receives the row (no new cron, no new endpoint — piggybacks the existing health cron).
result: [pending]

### 2. 7-day watch ring accumulation (full CRON-WATCH-01 observation)

expected: After 7 natural `0 0 * * *` health-cron ticks, `readWatchHistory()` returns 7 rows (each with per-cron freshness ages, eval scores, PASS/FAIL) and `46-WATCH.md` `daysObserved` advances toward 7. Explicitly NON-BLOCKING (roadmap lock + CONTEXT D-09) — Phase 46 ships the structure; the 7-day clock runs asynchronously through later phases and does NOT gate phase or milestone close. Early close, if ever taken, requires an explicit operator decision citing the v1.5 Phase 31 precedent.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
