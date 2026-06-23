# Phase 46 — CRON-WATCH-01: 7-Day Cron-Stability Watch (NON-BLOCKING)

**Started:** 2026-06-22
**Status:** Observing — auto-captured daily, runs asynchronously through later phases (D-09)
**Requirement:** CRON-WATCH-01

> **THIS WATCH IS NON-BLOCKING.** It does **NOT** gate Phase 46 close and does
> **NOT** gate milestone (v2.0) close. The roadmap lock is explicit:
> _"CRON-WATCH-01 is NON-BLOCKING and must not gate milestone close."_ No Phase 46
> verification depends on 7 wall-clock days elapsing. The 7-day clock runs in the
> background; this artifact + the dated Redis ring exist so that **a partial close
> is structurally visible (visibly partial) rather than a silent early-close**
> (the v1.5 Phase 31 failure mode this phase deliberately corrects).

## Progress

```
daysObserved: 0 / daysTarget: 7
```

- **Source of truth:** the `cron:watch:v2` bounded Redis ring (LPUSH+LTRIM
  14-cap, ~30d TTL), written once-daily by the EXISTING `/api/cron/health` run
  (`0 0 * * *`) via `server/lib/cronWatch.ts appendWatchSample` — **no new cron,
  no new endpoint, no manual daily step** (CONTEXT D-07).
- **This artifact** is the human-readable mirror of that ring. Read the live ring
  with `readWatchHistory()` (or via the `/api/operator-status` surface); the table
  below is updated as natural-cron samples land. `daysObserved` counts the natural
  (non-backfill) PASS rows accumulated since the start date above.

## How a sample is captured

Each midnight-UTC `/api/cron/health` tick appends one `WatchSample` to the ring
AFTER the `cron:lastTick:health` + trend-sample writes, inside its OWN try/catch
(Pitfall 4 — a watch-write failure NEVER degrades the health response). Each row
carries: `tickDate` (YYYY-MM-DD), per-cron freshness age (`cronAgeMs` for
`health` / `warm` / `refresh-events`; `null` = the cron's `cron:lastTick` key was
absent — a stalled cron reads as null/stale, itself a valid signal), the eval
bundle (`at5km / at20km / at100km`), `dlqCount`, `breakerTrips`, and a rolled-up
`result` (`PASS` iff Redis is up AND the eval bundle resolved cleanly, else
`FAIL`).

## Daily watch log

Mirrors the `cron:watch:v2` ring rows newest-first. A missing day (no row for a
calendar date) is itself the signal that the health cron did not fire that day —
record it as an explicit gap rather than back-dating a row.

| tickDate                                                                        | health | warm | refresh-events | eval @5/20/100km | dlq | breakerTrips | result | notes |
| ------------------------------------------------------------------------------- | ------ | ---- | -------------- | ---------------- | --- | ------------ | ------ | ----- |
| _(none yet — first natural-cron row lands on the next `0 0 * * *` health tick)_ |        |      |                |                  |     |              |        |       |

## earlyClose contract

```yaml
earlyClose:
  decided: false
  citesPhase31: false
  daysObservedAtClose: null
  caveat: null
```

Early close of this watch is permitted **ONLY** by an explicit operator decision
that:

1. **Cites the v1.5 Phase 31 early-close precedent** —
   `.planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/`
   (which closed at Day 1 / 7 under an operator decision, marking LLM-RELI-06
   "validated single-day, monitoring continues opportunistically"). Set
   `citesPhase31: true`.
2. **Records the day-count at close** (`daysObservedAtClose`) and the explicit
   **caveat** describing what the early close costs (the low-frequency failure
   modes — e.g. multi-day NIM-throttle cycles, daylight-cron correlations — that
   single-/partial-day observation cannot rule out).
3. Sets `decided: true`.

Until `decided: true` is recorded here with a Phase-31 citation, the default is to
**run the full 7 days, auto-reported**. Because the watch is non-blocking, leaving
it partial does **not** block any phase or milestone close — but the partiality is
visible here and in the dated ring, which is the whole point: this artifact + the
`cron:watch:v2` ring make a partial close **visibly partial** instead of a
silent Day-1 close-with-caveat (the v1.5 Phase 31 outcome this corrects).

## Notes

- The 7-day clock runs **asynchronously through later phases** (D-09). Phase 46
  ships the STRUCTURE (auto-capture + ring + this artifact + non-blocking
  framing); it does not wait for 7 elapsed days.
- The ring is bounded at 14 entries (7-day watch + one-week buffer) and
  self-expires at ~30d — no manual cleanup, no unbounded growth.
- DLQ count + breaker trips are recorded as `0` in the auto-captured row (the
  health handler does not read those keys today; adding Redis reads solely for the
  watch row was explicitly out of scope). The eval bundle and per-cron freshness
  ages are the load-bearing daily signals.
