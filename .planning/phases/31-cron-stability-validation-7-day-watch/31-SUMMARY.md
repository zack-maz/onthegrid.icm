# Phase 31 — Cron Stability Validation (7-Day Watch)

**Status:** Closed early under operator decision — 2026-05-19
**Requirement:** LLM-RELI-06 → **validated single-day, monitoring continues opportunistically**

## Outcome

Phase 31 was scoped for a 7-day natural-cron observation window (D-04, D-05). Day 1 passed cleanly. The operator elected to close the phase at Day 1 rather than wait for Days 2–7 — the daily watch is unblocking nothing downstream that cannot also be unblocked by the snapshot harness remaining in place, and the LLM-RELI track does not need 7 days of evidence to clear v1.5 spine work.

LLM-RELI-06 is therefore declared **"validated single-day, monitoring continues opportunistically"** in `.planning/REQUIREMENTS.md`. This is weaker than the original D-04 7-consecutive bar; the caveat is captured here and in `docs/architecture/llm-pipeline-reliability.md`. The phase 36 acceptance gate (LLM-RELI-07, 3 consecutive `prod-connectivity-audit.yml` exit-0 runs) remains in force and is the mechanical reliability check at milestone close.

## What landed

| Plan      | Status             | Notes                                                                             |
| --------- | ------------------ | --------------------------------------------------------------------------------- |
| 31-01     | Complete (PR #23)  | 4 prep fixes (eval bundle, diff filter, analyzer --help, runbook quarterly probe) |
| 31-02     | Complete (PR #23)  | `scripts/snapshot-cron-watch.ts` + `watch-log.json` + 18 contract tests           |
| 31-03     | Complete (PR #26)  | D-02 prep-validation force-trigger; Day-0 row committed                           |
| **31-04** | **Closed early**   | 1 / 7 days observed (Day 1 PASS, `d0c16e4`); Days 2–7 not pursued                 |
| **31-05** | Complete (this PR) | Caveat-marked closeout                                                            |

## Day-1 evidence (sole watch row, plus Day-0 baseline)

| tickDate   | natural | result | healthStatus | batchCount | breakerTrips | dlq                       | eval@5/20/100km    | notes                                                                                                                                      |
| ---------- | ------- | ------ | ------------ | ---------- | ------------ | ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-18 | false   | PASS   | healthy      | 216        | 0            | 0                         | 0.98 / 0.98 / 0.98 | D-02 force-trigger; cold-cache baseline                                                                                                    |
| 2026-05-19 | true    | PASS   | healthy      | 180        | 0            | 4 × `v3:timeout_watchdog` | 0.98 / 0.98 / 0.98 | Day 1 natural cron. **`batchCount` dropped 216 → 180** — prep #2 diff-filter measurably working under warm cache. DLQ reasons whitelisted. |

Full row data: [`watch-log.json`](./watch-log.json).

## Caveat — what the early close costs

- We have **1 day** of natural-cron evidence, not 7. The original D-04 rationale ("strict 7-consecutive") was to catch low-frequency failure modes (e.g. NIM throttle cycles that recur every few days, daylight-cron correlations) that single-day observation cannot rule out.
- The eval baseline shift, breaker trip count, and DLQ taxonomy on Day 1 are all clean. There is no negative evidence forcing escalation — the phase did not fail; it was closed unobserved.
- The D-05 escalation gate to Phase 31.1 ("3 reset cycles → limiter rework") is **deferred, not cancelled**. If any subsequent ad-hoc snapshot row classifies FAIL, the operator should append it to `watch-log.json` and treat it as Day-1 of the 31.1 escalation conversation.

## What stays in place

- **Snapshot harness** — `scripts/snapshot-cron-watch.ts` + `npm run watch:snapshot -- --http` is unchanged and operational. Ad-hoc capture is one command; rows append idempotently by `tickDate`.
- **Eval bundle in production** — prep #1 (`api/_eval/` build-time copy, PR #25) means `runEval()` continues to report real accuracy in `/api/cron/health`. Drift is observable even without active watch days.
- **Diff-filter prefix-add fix** — prep #2 (PR #23 `1bfec94`) keeps warm-cache cron runs at the lower batch count visible on Day 1 (216 → 180 = 16% reduction).
- **Whitelisted DLQ taxonomy** — `v3:timeout_watchdog` + `v3:adaptive-retry-fail` defined in `classifyTick()` (`scripts/snapshot-cron-watch.ts`) as PASS-compatible. Any other DLQ reason flips a future snapshot to FAIL.
- **Cron schedule** — `/api/cron/refresh-events 0 4 * * *` is unchanged. Cron-tick observability via `cron:lastTick:refresh-events` (Phase 28.2.7) is unchanged.

## Resume / re-open path

If 7-day evidence becomes load-bearing later (e.g. milestone audit pushback, Phase 36 acceptance-gate complications, or an unrelated incident sharpens the need to characterize Day-2-through-Day-7 behavior):

1. Re-open Phase 31 (or open 31.2 as a new shorter watch phase).
2. Run `npm run watch:snapshot -- --http --notes='Day-N resumed watch'` each morning; the script appends to the existing `watch-log.json` idempotently.
3. Day 1 of the resumed watch is the first natural-cron snapshot taken after re-open. The existing Day-1 row (2026-05-19) does NOT count toward the new 7 — operator notes in the resumed PLAN.md state that explicitly.
4. Reset `consecutivePassCount` mentally to 0 and run to 7.

## Decisions consumed (CONTEXT.md)

D-01 (4 prep fixes), D-02 (prep-validation force-trigger), D-06 (dual JSON + markdown artifact), D-07 (snapshot script), and D-08 (atomic per-decision commits) all landed. **D-04 (strict 7-consecutive) and D-05 (3-reset-cycles → 31.1 escalation) are deferred — see Caveat above.** D-03 (whitelist-only DLQ pass-rule) remains the classifier and protects any future ad-hoc snapshot.

## What's next

Per `.planning/STATE.md` advance: Phase 32 (Ghost Event URL Liveness, Dashboard & Prune) — independent of the LLM-RELI spine per ROADMAP parallelization notes, GHOST-01..05.

Phase 36 (ADR-0010 + acceptance gate closeout) is still the mechanical milestone-close gate. The 3-consecutive `prod-connectivity-audit.yml` exit-0 + `allTiersGreen=true` requirement remains untouched by this early-close.
