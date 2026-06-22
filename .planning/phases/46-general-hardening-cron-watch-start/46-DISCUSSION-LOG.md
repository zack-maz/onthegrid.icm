# Phase 46: General Hardening + Cron Watch Start - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 46-General Hardening + Cron Watch Start
**Mode:** `--auto` — no interactive prompts; each option auto-selected to the recommended default.
**Areas discussed:** Rate-limiter surface & 429 tracking (HARD-01), Cron missed-run detection (HARD-02), 7-day watch structure (CRON-WATCH-01), Nyquist backfill scope (HARD-03)

---

## HARD-01 — Rate-limiter visibility & 429 tracking

| Option                                                                | Description                                                  | Selected |
| --------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| Reuse `/api/operator-status` aggregator → DevApiStatus API Health tab | No new endpoint; Phase 44/45 sidecar pattern                 | ✓        |
| New dedicated `/api/rate-limit-status` endpoint                       | Separate surface, more code + new contract test              |          |
| Per-tier per-day Redis `INCR` sidecar for 429 counts (degrade-open)   | Mirrors `operator:replay-quota` / `url-liveness-count` idiom | ✓        |
| In-memory 429 counter                                                 | Resets on cold start; loses history under Fluid Compute      |          |
| Prove 999.1 Bearer bypass by TEST coverage (no runtime change)        | Extend `rateLimitPublic.test.ts` analog                      | ✓        |
| Add runtime assertion/guard in middleware                             | Unneeded unless a gap is found                               |          |

**Auto-selected:** aggregator surface + per-day Redis sidecar counters + test-only bypass proof.
**Notes:** D-01/D-02/D-03. 429 counter must degrade open — never convert a 429 into a 500.

---

## HARD-02 — Cron first-tick & missed-run detection

| Option                                                      | Description                                                       | Selected |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | -------- |
| Hardcode 3-entry schedule+grace table in `healthSources.ts` | 3 crons known/bounded; no SaaS; mirrors `FRESHNESS_THRESHOLDS_MS` | ✓        |
| Parse `vercel.json` crons at runtime                        | More moving parts; fragile                                        |          |
| External cron-monitor SaaS                                  | Explicitly disallowed (999.3 "no external SaaS")                  |          |
| 3-state semantics: unknown / missed / healthy               | Distinguishes "never fired" from "stopped firing"                 | ✓        |
| Keep current 2-state (unknown / fresh)                      | Misses the silent-stop signal                                     |          |
| Extend existing `probeCronTick` + `deriveStatus`            | Reuse, surfaced via `/api/health`                                 | ✓        |

**Auto-selected:** hardcoded schedule+grace table, 3-state semantics, extend existing probe.
**Notes:** D-04/D-05/D-06.

---

## CRON-WATCH-01 — 7-day non-blocking watch

| Option                                                                             | Description                                                 | Selected |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| Auto-capture daily via existing `/api/cron/health` → bounded ring + WATCH artifact | Phase 45 D-01 once-daily-ring idiom; no manual step         | ✓        |
| Manual daily operator capture                                                      | Error-prone; risks the Phase 31 silent early-close          |          |
| New dedicated watch cron                                                           | Violates the no-new-cron line                               |          |
| Early-close ONLY by explicit operator decision citing v1.5 Phase 31                | Default = run full 7 days; partial close is visibly partial | ✓        |
| Allow silent early-close at Day 1                                                  | Exactly the Phase 31 failure to avoid                       |          |
| Non-blocking — does not gate milestone close                                       | Roadmap-locked                                              | ✓        |

**Auto-selected:** auto-capture via health cron, explicit-only early-close, non-blocking.
**Notes:** D-07/D-08/D-09. Watch starts in 46, reports async through later phases.

---

## HARD-03 — Nyquist coverage backfill (Phase 39/40)

| Option                                                                                 | Description                                        | Selected |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- |
| Cover flight recorder + budget block + subtab consolidation, each with fault-injection | Targets the 3 named degrade-open surfaces          | ✓        |
| Broad line-coverage sweep across all Phase 39/40 code                                  | Coverage-for-its-own-sake; misses intent           |          |
| Unit tests w/ mocked-Redis-throw asserting degrade-open                                | Matches documented never-throws contracts          | ✓        |
| Full integration tests against live Redis                                              | Heavier, slower, not needed for degrade-open proof |          |

**Auto-selected:** 3-surface scoped tests + mocked-Redis fault injection.
**Notes:** D-10/D-11.

---

## Claude's Discretion

- Exact Redis key names/TTLs for the 429 sidecar and watch ring (sidecar lockstep pattern).
- Grace-window durations per cron in the schedule table.
- Dashboard block layout/placement within the API Health tab (behavioral tablist contract frozen).
- WATCH artifact filename/format.
- Rolling-window vs per-day for the 429 counter; watch-ring retention (7–14 entries).

## Deferred Ideas

- `npm audit fix` for 19 pre-existing transitive-dep vulns — out of HARD-01/02/03 scope; own phase or explicit `--all` fold.
- Phase 45 review Info findings (TrendSample `.strict()` drift-pin, water duplicate-label rows, `999_999_999` magic TTL) — small polish, not in scope.
- Reviewed-not-folded todos: 27.4.2 CI-health flip, 27.4.3 deck.gl v9 type drift — off-topic, own phases.
