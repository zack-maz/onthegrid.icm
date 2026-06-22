---
phase: 46-general-hardening-cron-watch-start
plan: 03
subsystem: cron-stability-watch
tags: [CRON-WATCH-01, cron-watch, redis-ring, degrade-open, non-blocking, observability]
requires:
  - server/lib/trendHistory.ts (verbatim structural template: pipeline LPUSH+LTRIM+EXPIRE ring)
  - server/routes/cron-health.ts (existing 0 0 * * * health cron handler + computed cronAgeMs)
  - .planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/ (early-close precedent to cite)
provides:
  - 'server/lib/cronWatch.ts — appendWatchSample/readWatchHistory bounded ring (cron:watch:v2.0)'
  - 'daily appendWatchSample call on /api/cron/health (own try/catch, degrade-open)'
  - 'cron:watch:v2.0 Redis key (registered in CLAUDE.md)'
  - '46-WATCH.md — NON-BLOCKING watch artifact with daysObserved/daysTarget + earlyClose-cites-Phase-31 contract'
affects:
  - Phase 47 load test (the watch ring + cron-tick freshness corroborate cron survival)
  - milestone v2.0 close (NON-BLOCKING — does NOT gate close; partial close is structurally visible)
tech-stack:
  added: []
  patterns:
    - 'Once-daily bounded ring (Pattern D): redis.pipeline() LPUSH+LTRIM+EXPIRE, reader caps at MAX-1'
    - 'Degrade-open ring writer appended in its own try/catch AFTER the lastTick + trend writes (Pitfall 4)'
    - 'Mocked-Redis-throw harness (Pattern E) adapted for redis.pipeline() chaining'
    - 'NON-BLOCKING async watch — structural visibility (dated ring + artifact) instead of a silent early-close'
key-files:
  created:
    - server/lib/cronWatch.ts
    - server/lib/__tests__/cronWatch.test.ts
    - .planning/phases/46-general-hardening-cron-watch-start/46-WATCH.md
  modified:
    - server/routes/cron-health.ts
    - server/__tests__/routes/cron-health.test.ts
    - CLAUDE.md
decisions:
  - 'cron:watch:v2.0 cap 14 (7-day watch + one-week buffer, within the D-07 7-14 bound), ~30d TTL (trendHistory family)'
  - 'cronAgeMs hoisted to outer scope in cron-health so the watch row REUSES the computed ages (no re-read of cron:lastTick)'
  - 'dlqCount/breakerTrips recorded as 0 — health handler does not read those keys; no new Redis reads added just for the watch row'
  - 'result = PASS iff redisOk AND eval bundle resolved cleanly (evalScore !== null && evalError === null) else FAIL'
  - 'TDD on Task 1 (RED: module-missing import error → GREEN: verbatim trendHistory copy)'
metrics:
  duration: ~5min
  completed: 2026-06-22
  tasks: 3
  files: 6
  tests_added: 9
status: complete
---

# Phase 46 Plan 03: Cron Stability Watch Start (CRON-WATCH-01) Summary

Started the NON-BLOCKING 7-day cron-stability watch by adding a `cron:watch:v2.0`
bounded Redis ring (verbatim structural copy of `trendHistory.ts`) that the
EXISTING `/api/cron/health` `0 0 * * *` run auto-captures one daily sample into —
no new cron, no new endpoint — with a human-readable `46-WATCH.md` artifact whose
non-blocking framing + dated ring make a partial close structurally visible,
correcting the v1.5 Phase 31 silent Day-1 early-close.

## What Was Built

**Task 1 — `cronWatch.ts` bounded ring + degrade-open tests (TDD)** (`12362d1`)

- `server/lib/cronWatch.ts`: a verbatim structural copy of `trendHistory.ts`.
  Exports `CRON_WATCH_KEY = 'cron:watch:v2.0'`, `CRON_WATCH_MAX = 14`,
  `CRON_WATCH_TTL_SEC = 30*24*3600`. `WatchSample` modeled on the Phase 31
  `watch-log.json` row (`sampledAt`, `tickDate`, `cronAgeMs:{health,warm,'refresh-events':number|null}`,
  `eval:{at5km,at20km,at100km}`, `dlqCount`, `breakerTrips`, `result:'PASS'|'FAIL'`).
  `appendWatchSample` does ONE atomic `redis.pipeline()` LPUSH+LTRIM(0,MAX-1)+EXPIRE
  round-trip and NEVER throws; `readWatchHistory` reads via `lrange`, parses the
  dual-shape (raw-string OR already-object Upstash REST), and returns `[]` on throw.
- `cronWatch.test.ts`: 6 tests using the Pattern E mocked-Redis-throw harness
  (pipeline-chaining variant copied from `trendHistory.test.ts`) — key/cap/TTL
  constants, pipeline command shape, exec-reject no-op, newest-first read,
  dual-shape parse, lrange-reject `[]`.

**Task 2 — daily `appendWatchSample` on `/api/cron/health`** (`dba77c6`)

- `cron-health.ts`: hoisted the per-cron `cronAgeMs` object to an outer scope so
  the watch row REUSES the already-computed ages (no second `cron:lastTick:{name}`
  read — D-07). Added a SEPARATE try/catch calling `appendWatchSample(...)` AFTER
  the existing `appendTrendSample` block (which itself follows the
  `cron:lastTick:health` write at :133). `result` is `PASS` iff Redis is up AND
  the eval bundle resolved cleanly, else `FAIL`. `dlqCount`/`breakerTrips` are `0`
  (best-effort; no new Redis reads). The whole append is wrapped so a watch-write
  throw is logged and the health response continues (Pitfall 4 / T-46-03-01).
- `cron-health.test.ts`: mocked `cronWatch.js` + `trendHistory.js`; added 3 tests
  — appends one watch sample (PASS) on a successful run, records FAIL when the
  eval bundle errors (still 200), and a throwing `appendWatchSample` does NOT
  degrade the health response.

**Task 3 — WATCH artifact + CLAUDE.md key** (`7a562db`)

- `46-WATCH.md`: NON-BLOCKING header (cites the roadmap lock), a
  `daysObserved: 0 / daysTarget: 7` counter, a daily watch-log table mirroring the
  ring, and an `earlyClose` contract (`decided:false, citesPhase31:false,
daysObservedAtClose:null, caveat:null`) permitting early close ONLY by an
  explicit operator decision that cites the v1.5 Phase 31 precedent and records
  the day-count + caveat. Notes the 7-day clock runs asynchronously through later
  phases (D-09) and that the ring + artifact make a partial close visibly partial.
- `CLAUDE.md`: registered `cron:watch:v2.0` in the active Redis-key registry (cron
  family, after `cron:lastTick:{name}`) — cap 14 / ~30d TTL, writer/reader,
  piggybacks the existing health cron, NON-BLOCKING framing.

## Deviations from Plan

None — plan executed exactly as written. The `cronAgeMs` hoist (Task 2) is the
plan's explicit "REUSE the already-computed per-cron cronAgeMs — do NOT re-read"
instruction realized in code, not a deviation.

## Threat Mitigations Applied

- **T-46-03-01 (DoS — watch append degrading health):** mitigated. The
  `appendWatchSample` call sits in its own try/catch AFTER the `lastTick:health` +
  trend writes; a throw is logged + swallowed and the health response continues.
  Verified by the "throwing appendWatchSample does NOT degrade the health
  response" test.
- **T-46-03-02 (DoS — ring unbounded growth):** mitigated. Bounded
  LPUSH+LTRIM(0,13) cap 14 (reader caps at MAX-1) + ~30d self-expiring TTL, in one
  atomic pipeline so a kill never leaves a no-TTL or over-cap ring.
- **T-46-03-03 (Info disclosure — eval/DLQ exposure):** accepted (per plan; same
  data already on `/api/cron/health`; the WATCH artifact lives in `.planning/`).
- **T-46-03-04 (Tampering — row values):** mitigated. All sample fields are
  server-computed; the Redis key is a static literal (no injection surface).

## Verification

- `npx vitest run server/lib/__tests__/cronWatch.test.ts server/__tests__/routes/cron-health.test.ts` → 12 passed.
- `npx vitest run server/` → 121 files / 1493 tests passed.
- `test -f 46-WATCH.md && grep daysObserved 46-WATCH.md && grep cron:watch:v2.0 CLAUDE.md` → OK.
- NON-BLOCKING confirmed: NO Phase 46 verification depends on elapsed wall-clock days.

## Known Stubs

None.

## Self-Check: PASSED

- Files: all 6 (3 created, 3 modified) FOUND on disk.
- Commits: `12362d1`, `dba77c6`, `7a562db` all FOUND in git log.
