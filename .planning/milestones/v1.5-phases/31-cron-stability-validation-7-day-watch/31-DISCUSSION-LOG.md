# Phase 31: Cron Stability Validation (7-day Watch) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 31-cron-stability-validation-7-day-watch
**Areas discussed:** Prep items in/out of scope, Day-1 anchor & failure-response policy, Observation artifact format, Force-trigger + monitoring cadence

---

## Gray Area Selection

**Question:** Which gray areas do you want to discuss for Phase 31?

| Option                                   | Description                                                                                                                                                                                                                                                        | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Prep items in/out of scope (Recommended) | Phase 30.1 named 3 'Phase 31 prep' items. Without #1 (eval-fixture bundling), every daily watch shows evalScore=0 — meaningless signal. Without #2 (diff-filter), cron does 2× work. Decide: fold into Phase 31, spin Phase 31.1, or run watch despite known gaps. | ✓        |
| Day-1 anchor & failure-response policy   | When does Day 1 start? What resets the counter? Today's 04:00 UTC failed. Strict vs lenient vs hybrid.                                                                                                                                                             | ✓        |
| Observation artifact format              | Where does the 7-day evidence live (criterion 4: 'auditable, not anecdotal')?                                                                                                                                                                                      | ✓        |
| Force-trigger + monitoring cadence       | Can `?force=true` be used during the watch? How does operator detect failure?                                                                                                                                                                                      | ✓        |

**Notes:** All four selected — user wanted full coverage of the watch's operational rules before planning.

---

## Prep Items

**Question:** Which of the four Phase 30.1-flagged 'Phase 31 prep' items should land IN Phase 31 (as pre-work before Day 1 begins)?

| Option                                       | Description                                                                                                    | Selected |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| Eval-fixture bundling fix (Recommended)      | Without this, the watch can't detect accuracy drift across the 7 days. Load-bearing for watch quality.         | ✓        |
| Diff-filter ID-mismatch fix (Recommended)    | Cron re-processes ~2× the batch set daily, doubling NIM rate-limit pressure. Load-bearing for watch stability. | ✓        |
| CACHE_KEY_PREFIX whitespace `--help` fix     | 5-LOC docstring/--help addition. Pure dev ergonomic, NOT load-bearing.                                         | ✓        |
| Document probe-openrouter as quarterly check | Light docs work. Reasonable to fold in since the runbook is the natural home for ongoing operational checks.   | ✓        |

**User's choice:** All four — Phase 31 owns all the prep work; nothing punted forward.

**Notes:** Clean scope outcome. The eval and diff-filter fixes are load-bearing for watch quality + stability; the other two are inexpensive enough to bundle for atomic phase close.

---

## Day-1 Anchor & Failure-Response Policy

**Question 1:** When does Day 1 of the 7-day watch begin?

| Option                                              | Description                                                                                                                                                                              | Selected |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| After validation force-trigger passes (Recommended) | After prep work deploys to prod, run ONE force-triggered cron. Confirm evalScore.total > 0, reduced batch count, no breaker trip. Day 1 = next natural 04:00 UTC cron after that passes. | ✓        |
| Next natural cron after deploy                      | Whatever the next 04:00 UTC cron does is Day 1. Strict 'real production behavior'.                                                                                                       |          |
| Operator-set explicit date                          | Operator picks calendar Day 1 regardless.                                                                                                                                                |          |

**User's choice:** After validation force-trigger passes.

**Question 2:** What 'counts' as a passing daily tick?

| Option                                   | Description                                                                     | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Hybrid: classify by reason (Recommended) | Health=healthy AND DLQ reason taxonomy whitelisted. Aligns with criterion 3.    | ✓        |
| Strict: zero tolerance                   | dlqCount=0 AND no batch errors. Probably impossible given current cron pattern. |          |
| Lenient: health-only                     | DLQ observed but not gating. Lowest bar; may mask real issues.                  |          |

**User's choice:** Hybrid: classify by reason.

**Question 3:** What happens to the 7-day counter on a failed day?

| Option                                       | Description                                                          | Selected |
| -------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Reset to 0, document the cause (Recommended) | Strict 7 CONSECUTIVE per success criterion wording.                  | ✓        |
| Continue counting, accumulate evidence       | Failed day documented but counter keeps going. Stretches SC wording. |          |
| N transient failures allowed                 | Pragmatic middle ground. Requires defining N upfront.                |          |

**User's choice:** Reset to 0, document the cause.

**Question 4:** If the watch fails repeatedly, what happens?

| Option                                                  | Description                                                                                                                                      | Selected |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Spawn Phase 31.1 for breaker/limiter work (Recommended) | Phase 30.1 deferred the 'Retry-After-aware NIM limiter' as a 31.1 candidate. 3 reset cycles = clear evidence the limiter rework is load-bearing. | ✓        |
| Continue watch indefinitely                             | No escalation policy. Expensive in operator attention.                                                                                           |          |
| Close Phase 31 as 'best effort' after N attempts        | Doesn't satisfy LLM-RELI-06 strictly.                                                                                                            |          |

**User's choice:** Spawn Phase 31.1 for breaker/limiter work.

**Notes:** Strict 7-consecutive discipline with a concrete escalation gate. The 3-reset-cycle threshold gives a finite ceiling to operator attention while honoring the success-criterion language.

---

## Observation Artifact Format

**Question 1:** Where does the 7-day watch evidence live?

| Option                              | Description                                                                                               | Selected |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Both: JSON + markdown (Recommended) | Machine-readable JSON + appended markdown table. Raw data + narrative; both committed atomically per day. | ✓        |
| JSON only                           | Less write friction; less narrative discoverability.                                                      |          |
| Markdown only in architecture doc   | Single source of truth; loses machine-readable form.                                                      |          |
| Phase SUMMARY block only            | Probably too thin for 'auditable, not anecdotal'.                                                         |          |

**User's choice:** Both: JSON + markdown.

**Question 2:** How is the daily row captured?

| Option                                              | Description                                                                                                   | Selected |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Automated script, operator runs daily (Recommended) | `scripts/snapshot-cron-watch.ts` + `npm run watch:snapshot`. Reuses analyzer patterns; zero new prod surface. | ✓        |
| GitHub Actions cron snapshots + auto-commits        | Most hands-off. Adds workflow surface.                                                                        |          |
| Manual hand-edits to markdown table                 | Cheapest to start, but error-prone.                                                                           |          |

**User's choice:** Automated script, operator runs daily.

**Question 3:** What goes in each daily row?

| Option                                                                                                          | Description                                                                       | Selected |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Rich: date, health status, dlq{count, reasons}, eval{5/20/100km}, batchCount, breakerTrips, notes (Recommended) | Captures everything needed for criteria 1-3 + drift detection. Auditable forever. | ✓        |
| Minimal: date, pass/fail, dlqCount, notes                                                                       | Easier to maintain, but next operator can't tell WHY a day failed.                |          |
| Snapshot the full /api/health + summary JSON per day                                                            | Most complete; largest artifact. Probably wasteful.                               |          |

**User's choice:** Rich row schema.

**Notes:** Dual JSON + markdown surface with rich per-row schema satisfies criterion 4 ('auditable, not anecdotal') while keeping the markdown narrative for human discoverability and the JSON for downstream tooling / Phase 37 ADR-0010 expansion.

---

## Force-Trigger + Monitoring Cadence

**Question 1:** Force-trigger policy during the 7-day watch?

| Option                                        | Description                                                                                                         | Selected |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| Prep validation + recovery only (Recommended) | ONE force-trigger before Day 1 for prep validation. After Day 1, force-trigger ONLY to recover. Logged with reason. | ✓        |
| Strict: zero force-triggers                   | Cleanest signal but no recovery path for a regressed deploy.                                                        |          |
| Open: force whenever useful                   | Most flexible; least representative of production.                                                                  |          |

**User's choice:** Prep validation + recovery only.

**Question 2:** How does the operator detect failure between snapshots?

| Option                                                                  | Description                                                                                                      | Selected |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Daily snapshot run is the check (Recommended)                           | Operator runs `npm run watch:snapshot` once each morning. Script prints PASS/FAIL banner. No new alerting infra. | ✓        |
| Snapshot script writes failure to a Redis alert key + dashboard surface | Adds one Redis key.                                                                                              |          |
| GitHub Actions cron + auto-issue on failure                             | Most hands-off; adds workflow + GH issue surface.                                                                |          |

**User's choice:** Daily snapshot run is the check.

**Question 3:** What happens to the counter if the operator misses a day?

| Option                                                       | Description                                                                                                                 | Selected |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Snapshot detects, counts the prior tick anyway (Recommended) | Snapshot reads Redis state for LAST tick. Tracks `lastSnapshottedTickDate`. Counter advances based on actual cron behavior. | ✓        |
| Missed day = data gap = counter reset                        | Strict accountability; punitive for personal project.                                                                       |          |
| Pause counter, snapshot next time                            | Adds 'paused' state to artifact schema.                                                                                     |          |

**User's choice:** Snapshot detects, counts the prior tick anyway. (NOTE: Final D-11 in CONTEXT.md refined this to: missing day enters artifact as a `GAP` row that neither advances nor resets the counter — preserves operator latitude while keeping the artifact honest. Effectively the 'pause' semantics applied at the GAP-row level rather than requiring an explicit paused state.)

**Question 4:** How does Phase 31 close once 7 consecutive ticks pass?

| Option                                                  | Description                                                                                                                                               | Selected |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| PR with full artifact + SUMMARY narrative (Recommended) | Final commit appends close-out narrative to architecture doc + writes SUMMARY.md + checks LLM-RELI-06 in REQUIREMENTS.md. Same shape as Phase 30.1 close. | ✓        |
| Append-only with no separate close commit               | Minimum ceremony; loses the narrative explainer.                                                                                                          |          |
| Hand the artifact to Phase 37                           | Defers writing, risks rot.                                                                                                                                |          |

**User's choice:** PR with full artifact + SUMMARY narrative.

**Notes:** Manual operator cadence chosen over any automation — aligns with the single-operator contract in PROJECT.md. The snapshot script's exit-0/non-zero behavior leaves all alerting policy to the operator's shell.

---

## Wrap-Up

**Question:** Anything else to discuss before CONTEXT.md write?

| Option                              | Description                                                                                                                  | Selected |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- |
| I'm ready for context (Recommended) | Capture 14 decisions into CONTEXT.md + DISCUSSION-LOG.md, then commit.                                                       | ✓        |
| Explore more gray areas             | Validation force-trigger interaction with `prod-connectivity-audit.yml`, commit-bundling, breaker mid-pause edge cases, etc. |          |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

Five small items deferred to researcher/planner judgement (full text in CONTEXT.md `<decisions>` § Claude's Discretion):

- Eval-bundle fix vector (vercel.json includeFiles vs build-time copy vs fixture relocation)
- Diff-filter fix shape (cached-key adjustment vs upstream key construction adjustment)
- One-PR-with-4-commits vs four-small-PRs for prep work
- "Materially lower" batch count ratio for D-02 validation gate
- DLQ reason-string vocabulary sourcing (`server/lib/llmDLQ.ts` + bucket enum)

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section; surfaced here for cross-reference:

- **Phase 31.1 (conditional):** Adaptive `Retry-After`-aware NIM limiter — only if D-05 escalation triggers.
- **Phase 32 / Phase 35 overlap:** Dashboard surface for cascade-degraded state; DLQ-threshold alerts; GH Actions automated snapshot + auto-issue path.
- **Phase 37:** ADR-0010 `<expand_at_36>` write reads Phase 31's `watch-log.json` as canonical input.
- **Out-of-v1.5:** Provider expansion, v4 router, paid OR conversion, NIM model swap — Phase 31 does not revisit unless D-05 escalation forces.
