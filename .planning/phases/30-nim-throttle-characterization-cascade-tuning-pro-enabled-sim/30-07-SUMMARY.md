---
phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
plan: 07
subsystem: docs
tags: [docs, reliability, adr, closeout, simplify-01, simplify-03, llm-reli, phase-30-final]

# Dependency graph
requires:
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/01
    provides:
      - retryAfterMs telemetry + scripts/analyze-llm-run.ts (D-01) — the Findings table's source-of-truth telemetry surface
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/02
    provides:
      - run-1-throttle-snapshot.json — Run 1 baseline numbers transcribed verbatim into the Findings table
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/03
    provides:
      - SIMPLIFY-01 retirement narrative + ~22 → 1 Redis SET-call delta — quoted in the Retired Mechanisms block
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/04
    provides:
      - SIMPLIFY-03 elimination narrative + LOC delta — quoted in the Retired Mechanisms block
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/05
    provides:
      - Pre/post defaults table (BACKOFF_MS, RETRY_ATTEMPTS, JITTER_MS, LLM_BATCH_TIMEOUT_MS, LLM_BATCH_SIZE promotion) — copied verbatim into the Tuned Defaults block
  - phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/06
    provides:
      - run-2-throttle-snapshot.json — Run 2 validation numbers; Plan 06 SUMMARY guidance to cite Run 2's null throttle window over Run 1's synthetic 306
provides:
  - docs/architecture/llm-pipeline-reliability.md — measurement home for Run 1 + Run 2 throttle findings + tuned defaults + retired mechanisms + Phase 31 placeholder
  - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md Phase 30 sub-block — decisions D-01 through D-07 with their final numbers + rationale; fresh <expand_at_36> marker for Phase 36 closeout
  - CLAUDE.md pointer line under "LLM Event Pipeline" — single dash-bullet pointing to the new architecture doc; 5018-token Phase 29 D-06 budget preserved
affects:
  - phase: 31-cron-stability-validation
    consumes: docs/architecture/llm-pipeline-reliability.md "7-Day Watch" placeholder section — appends daily observations there
  - phase: 36-adr-0009-acceptance-gate-closeout
    consumes: docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md fresh <expand_at_36> marker — appends Phase 36 closeout there

# Tech tracking
tech-stack:
  added: [] # pure documentation; no production code path touched
  patterns:
    - 'Atomic single-commit closeout pattern (CONTEXT D-08 Commit 7): all three docs writes land in one commit so the closure is a single revertable unit'
    - 'ADR decision / architecture doc measurement separation: ADR-0010 holds the decisions (immutable per Nygard short format); architecture doc holds the numbers (mutable as Phase 31 watch appends)'
    - "<expand_at_36> marker pattern: ADR-0010 stub from Phase 29 left a marker; Phase 30 replaces it with the new sub-block + a fresh marker at the end of the block so Phase 36's closeout has a deterministic insertion point"
    - "Honest framing of Path B sanity-check tuning: doc explicitly distinguishes 'conservative defensive choices grounded in measured per-batch latency' from 'empirical fits to a measured throttle window' so future readers don't mistake the new defaults for measurement-derived numbers"
    - 'INCONCLUSIVE-as-status pattern for the eval gate: doc + ADR both record the eval-harness fixture-bundling blocker honestly rather than papering over with PASSED/FAILED that would be misleading'

key-files:
  created:
    - 'docs/architecture/llm-pipeline-reliability.md (107 lines; Findings table + Tuned Defaults table + Retired Mechanisms block + Phase 31 placeholder)'
    - '.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-07-SUMMARY.md (this file)'
  modified:
    - 'docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md (+34 lines; Phase 30 sub-block appended below the <expand_at_36> marker; marker moved to end of new block; Phase 29 content above the marker byte-identical to prior HEAD)'
    - "CLAUDE.md (+1 line; one new dash-bullet under 'LLM Event Pipeline' as the final bullet of that section before '## Serverless Cache (Phase 13)')"

key-decisions:
  - 'Single atomic commit (CONTEXT D-08 Commit 7 message format) rather than per-file commits — the three writes are semantically coupled (architecture doc + ADR + CLAUDE.md pointer move together or not at all), and the rollback is a single git revert.'
  - "Run 2's null throttleWindowMs cited as the canonical value in the Findings table over Run 1's synthetic 306 — per Plan 06 SUMMARY guidance ('Run 2's analyzer returned null honestly... the actual change is just sample-size variance'). The 306 is documented for context but explicitly flagged as 'synthetic gap-inference, no real signal'."
  - "Path B framing called out at the top of the architecture doc (right after the 3-line metadata block) so future readers can't miss that the tuning was sanity-check mode, not measured-tuning mode. Same framing in the ADR sub-block D-02 entry."
  - 'Eval gate documented as INCONCLUSIVE (not PASSED, not FAILED) in both the Findings table and the Tuned Defaults block. PASS_MARGIN values explicitly stated as N/A in the ADR sub-block. The blocker carries forward to Phase 31 / a follow-up plan.'
  - "Plan 03's ~22 → 1 SET-call delta calculated from Run 2's batchCount=213 × prior 10-batch cadence + 1 terminal write = 22 — math reproduced inline in both the architecture doc Retired Mechanisms block AND the ADR D-04 entry so the audit signal is verifiable without leaving the doc."
  - 'Rollback recipe in architecture doc + ADR explicitly distinguishes env-tunable knobs (LLM_V3_CONCURRENCY / LLM_BATCH_SIZE / LLM_BATCH_TIMEOUT_MS — revert via env) from router constants (BACKOFF_MS / JITTER_MS / RETRY_ATTEMPTS — revert via git revert). Cites the specific Plan 05 commit hash (6d6b427) and Plan 04 commit hash (32a2b51) as the revert targets.'
  - "CLAUDE.md insertion uses the '**bold lead** — body' bullet style matching all surrounding bullets in the LLM Event Pipeline section. Single line, no other CLAUDE.md edits. wc -l delta exactly +1."
  - "Prettier auto-formatted the architecture doc's table column widths only (content byte-identical); ran prettier --write then re-checked all three files for green status before staging the commit."

requirements-completed: [LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03]
requirements-addressed: [LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03]

# Metrics
duration: ~10min
completed: 2026-05-17T05:52:48Z
task-count: 4
file-count: 3
commits:
  - hash: '48a1857'
    type: docs
    scope: '30'
    title: 'write docs/architecture/llm-pipeline-reliability.md + ADR-0010 append (D-06)'
    files: 3
    diff: '+138 / -0'
---

# Phase 30 Plan 07: Reliability Doc + ADR-0010 Append + CLAUDE.md Pointer (D-06) Summary

**Closes Phase 30's 7-commit atomic-per-decision ladder (CONTEXT D-08 Commit 7). Three documentation writes — new architecture doc, ADR-0010 sub-block append, CLAUDE.md pointer — landed in a single atomic commit. All numbers transcribed verbatim from Run 1 + Run 2 snapshot JSONs; no placeholders; eval gate honestly documented as INCONCLUSIVE; Path B / sanity-check framing called out so future readers understand the new defaults are conservative defensive choices grounded in measured per-batch latency, NOT empirical fits to a measured throttle window.**

## Tasks Executed

| Task | Name                                                                                                                        | Status   | Commit  |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| 1    | Write docs/architecture/llm-pipeline-reliability.md (Findings + Tuned Defaults + Retired Mechanisms + Phase 31 placeholder) | complete | 48a1857 |
| 2    | Append Phase 30 sub-block to ADR-0010 `<expand_at_36>` section (D-01 through D-07, marker moved to end of new block)        | complete | 48a1857 |
| 3    | Insert one pointer line into CLAUDE.md under "LLM Event Pipeline" (matching dash-bullet style)                              | complete | 48a1857 |
| 4    | Atomic commit closing Phase 30 ladder (Commit 7 of 7 per CONTEXT D-08)                                                      | complete | 48a1857 |

All four tasks landed in the single atomic commit `48a1857` per CONTEXT D-08 Commit 7 message format ("one commit closes the ladder").

## Files Modified

| File                                                      | Insertions | Deletions | Net      |
| --------------------------------------------------------- | ---------- | --------- | -------- |
| docs/architecture/llm-pipeline-reliability.md             | 107        | 0         | +107     |
| docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md | 30         | 0         | +30      |
| CLAUDE.md                                                 | 1          | 0         | +1       |
| **Total**                                                 | **138**    | **0**     | **+138** |

`git show --stat 48a1857` confirms `3 files changed, 138 insertions(+)` (pure additions; no deletions of Phase 29 ADR content; no other CLAUDE.md edits).

## Snapshot Values Transcribed (audit trail)

All numerical values in the architecture doc Findings table sourced directly from the snapshot JSONs committed in Plans 02 + 06:

**Run 1** (`run-1-throttle-snapshot.json`, runTimestamp 1778980781669 = 2026-05-17T01:19:41Z):

| Field                     | Value (verbatim) | Cell in Findings table                          |
| ------------------------- | ---------------- | ----------------------------------------------- |
| `durationMs`              | 122628           | Total wall-clock (ms)                           |
| `batchCount`              | 213              | Total batches                                   |
| `watchdogTimeoutCount`    | 0                | Watchdog hard-kill count                        |
| `throttleWindowMs.path`   | "B"              | Path (A/B)                                      |
| `throttleWindowMs.median` | 306              | Throttle window median (ms) — flagged synthetic |
| `throttleWindowMs.p95`    | 306              | Throttle window p95 (ms)                        |
| `steadyStateRpm`          | 0                | Steady-state RPM                                |
| `recoveryIntervalMs`      | null             | Recovery interval (ms)                          |
| `perBatchLatency.p50`     | 21053            | p50 batch latency (ms)                          |
| `perBatchLatency.p95`     | 33263            | p95 batch latency (ms)                          |
| `evalScore.total`         | 0                | Eval rows — INCONCLUSIVE                        |

**Run 2** (`run-2-throttle-snapshot.json`, runTimestamp 1778985361424 = 2026-05-17T02:36:01Z):

| Field                     | Value (verbatim) | Cell in Findings table                                                |
| ------------------------- | ---------------- | --------------------------------------------------------------------- |
| `durationMs`              | 124533           | Total wall-clock (ms)                                                 |
| `batchCount`              | 213              | Total batches                                                         |
| `watchdogTimeoutCount`    | 0                | Watchdog hard-kill count                                              |
| `throttleWindowMs.path`   | "B"              | Path (A/B)                                                            |
| `throttleWindowMs.median` | null             | Throttle window median (ms) — cited as canonical per Plan 06 guidance |
| `throttleWindowMs.p95`    | null             | Throttle window p95 (ms)                                              |
| `steadyStateRpm`          | 0                | Steady-state RPM                                                      |
| `recoveryIntervalMs`      | null             | Recovery interval (ms)                                                |
| `perBatchLatency.p50`     | 19211            | p50 batch latency (ms)                                                |
| `perBatchLatency.p95`     | 33755            | p95 batch latency (ms)                                                |
| `evalScore.total`         | 0                | Eval rows — INCONCLUSIVE                                              |

## Tuned Defaults Transcribed (from Plan 05)

All values in the architecture doc Tuned Defaults table sourced directly from Plan 05's commit bodies + the `.env.example` / `server/config.ts` schema changes:

| Knob                   | v1.4 default   | v1.5 default (Phase 30)  | Plan 05 source commit          |
| ---------------------- | -------------- | ------------------------ | ------------------------------ |
| `LLM_V3_CONCURRENCY`   | 12             | 12 (UNCHANGED)           | held — Path B disabled formula |
| `LLM_BATCH_SIZE`       | 2 (hard-coded) | 2 (env-tunable per D-07) | 6a60179 + e7c639d              |
| `LLM_BATCH_TIMEOUT_MS` | 90000          | 120000                   | e7c639d                        |
| `BACKOFF_MS`           | `[1000, 4000]` | `[2000, 8000, 32000]`    | 6d6b427                        |
| `JITTER_MS`            | 250            | 500                      | 6d6b427                        |
| `RETRY_ATTEMPTS`       | 2              | 3                        | 6d6b427                        |

## Retired Mechanisms Audit Signals (from Plans 03 + 04)

- **SIMPLIFY-01 (Plan 03):** Redis SET-calls on `events:llm:v3` per cron run dropped from ~22 (calculation: `floor(batchCount=213 / 10) + 1 = 22`) to **1** (terminal end-of-run write only) — approximately a **95% reduction**. LOC delta: **-92 lines** across `llmExtractionPipeline.ts` (-86), `server/config.ts` (-1), `.env.example` (-5). Source commits: 6bdea38, 3635e2a, 87d9b57.
- **SIMPLIFY-03 (Plan 04):** Watchdog soft-warn tier (60s log-only) eliminated; single-tier hard-kill watchdog retained. LOC delta: **-97 lines net** across `llmExtractorWatchdog.ts` (-44), `llmExtractorWatchdog.test.ts` (-22), `llmEventExtractor.v3.ts` (-25), `llmProgress.ts` (-6). Source commits: 32a2b51, 8c7b03a.

## Path B Honesty (CONTEXT D-08 honest-framing principle)

The architecture doc opens with a callout block immediately after the metadata header:

> Both Run 1 and Run 2 hit Path B of the throttle-characterization decision tree — NIM returned zero 429s during either run (213 batches each, ~123s wall-clock). The "tuned defaults" in this doc are therefore conservative defensive choices grounded in measured per-batch latency, NOT empirical fits to a measured throttle window. Plan 05 explicitly ran in sanity-check mode rather than measured-tuning mode.

The same framing recurs in:

- ADR-0010 D-02 entry (tuning method)
- ADR-0010 D-03 entry (eval gate INCONCLUSIVE — `PASS_MARGIN: N/A`)
- Architecture doc Tuned Defaults block "Plan 06 deploy-gate verdict" paragraph
- Architecture doc Phase 31 placeholder (calls out eval-harness fix as prerequisite)

This honesty pattern is the deliberate Phase 30 closeout convention: future operators / Phase 31 / Phase 36 readers can see at a glance that the new defaults were not derived from a measured throttle signal, so re-tuning against real 429s is still a live concern when production traffic patterns shift.

## ADR-0010 `<expand_at_36>` Marker Preservation

Verified by `grep -c '<expand_at_36>' docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` returning exactly **1** after the commit. The marker was moved (not duplicated) — its prior position (between the Decision section and the Consequences section) has been replaced by the Phase 30 sub-block (with D-01 through D-07 entries + rollback recipe + out-of-scope-carries-forward list), and a fresh `<expand_at_36>` marker now sits at the END of the new block. Phase 36's final closeout has a deterministic insertion point.

Phase 29 content preceding the marker is byte-identical to prior HEAD (verified by `git diff HEAD~1 HEAD -- docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` showing additions only, no deletions).

## CLAUDE.md Pointer (Phase 29 D-06 5018-token budget preservation)

Single dash-bullet added as the final bullet of the `## LLM Event Pipeline` section (immediately before the `## Serverless Cache (Phase 13)` H2). Bullet shape matches the surrounding `**bold lead** — body` pattern. No other CLAUDE.md edits in this commit.

Verification:

- `git diff HEAD~1 HEAD -- CLAUDE.md` shows exactly one insertion (no deletions, no other lines touched)
- `wc -l` delta: 151 → 152 lines (+1)
- `grep -c '^- ' CLAUDE.md` delta: 98 → 99 dash-bullets (+1)
- `awk '/^## LLM Event Pipeline$/,/^## /' CLAUDE.md | grep -q 'llm-pipeline-reliability'` confirms the pointer sits inside the target section

## Prettier Compliance

Ran `npx prettier --check` on all three files post-edit; the architecture doc required column-width reformatting (`prettier --write` applied), then `prettier --check` re-run on all three returned `All matched files use Prettier code style!` Content byte-identical pre/post-reformat — only table column padding changed. Reformat applied before staging the commit.

## Phase 30 Ladder Summary (CONTEXT D-08 7-commit ladder)

| Commit      | Type            | Title                                                                          | D-N                    |
| ----------- | --------------- | ------------------------------------------------------------------------------ | ---------------------- |
| 88f70ba     | feat(30-01)     | widen callHistory with retryAfterMs + capture in NIM 429 catch path            | D-01                   |
| 388ed8b     | feat(30-01)     | add scripts/analyze-llm-run.ts + fixtures + npm script                         | D-01                   |
| d8b9f67     | feat(30)        | characterize NIM throttle on Pro 800s ceiling (Run 1)                          | D-02                   |
| 6bdea38     | refactor(30-03) | retire onBatchComplete periodic-flush block                                    | D-04 (SIMPLIFY-01)     |
| 32a2b51     | refactor(30-04) | delete soft-warn tier from BatchWatchdogOptions + watchdog tests               | D-05 (SIMPLIFY-03)     |
| 8c7b03a     | refactor(30-04) | drop softWarnMs args + 'watchdog-soft-warn' enum from v3 + llmProgress         | D-05                   |
| e7c639d     | feat(30-05)     | promote LLM_BATCH_SIZE to env-tunable + retune LLM_BATCH_TIMEOUT_MS from Run 1 | D-02/D-07              |
| 6a60179     | feat(30-05)     | wire v3 extractor BATCH_SIZE to env.LLM_BATCH_SIZE                             | D-07                   |
| 6d6b427     | feat(30-05)     | tune freeClaudeRouter RETRY_ATTEMPTS / BACKOFF_MS / JITTER_MS                  | D-02                   |
| e7aaf39     | feat(30)        | validate tuned defaults via Run 2                                              | D-02                   |
| **48a1857** | **docs(30)**    | **write docs/architecture/llm-pipeline-reliability.md + ADR-0010 append**      | **D-06 (this commit)** |

The 7 atomic D-N decisions per CONTEXT D-08 are all represented; intermediate `chore(30-03)`, `test(30-03)`, `docs(30-XX)` per-plan SUMMARY commits, and a `fix(30-05)` test-cascade auto-fix accompany the ladder but do not count toward the 7-decision ladder itself.

## Pointer for Phase 31 (LLM-RELI-06)

The architecture doc has a `## 7-Day Watch (Phase 31, LLM-RELI-06)` placeholder section. Phase 31 should:

1. Land the eval-harness ground-truth fixture-bundling fix first (the Phase 30 INCONCLUSIVE eval-gate blocker). Without this, the 7-day watch will be blind to eval drift across the operational week.
2. Append daily observations under the placeholder header (rather than restructuring the doc).
3. If the 7-day watch surfaces 429s (Path A signal), re-run `scripts/analyze-llm-run.ts` against the new `events:llm-summary:v3` data and re-derive the Tuned Defaults block against measured throttle window — replace the conservative defensive numbers with empirical fits.
4. Confirm LLM_V3_CONCURRENCY's held-at-12 default is correct; the formula `(observed_NIM_RPM × measured_batch_latency_seconds) / 60` should be computable once steadyStateRpm > 0.

## Pointer for Phase 36 (DOCS-PUB-04 / LLM-RELI-07 closeout)

The ADR-0010 `<expand_at_36>` marker now sits at the END of the Phase 30 sub-block. Phase 36 should append the milestone-closeout sub-block immediately below the marker (mirroring this plan's pattern) and move the marker one more time, OR delete the marker entirely if Phase 36 is the final closure.

## Self-Check: PASSED

- [x] `docs/architecture/llm-pipeline-reliability.md` exists — VERIFIED `test -f` exits 0
- [x] All four required sections present (Findings, Tuned Defaults, Retired Mechanisms, 7-Day Watch placeholder) — VERIFIED via grep
- [x] No placeholders remain (NEW_VALUE / NEW_BASE / PASTE_VALUE / YYYY-MM-DD / `$.foo`) — VERIFIED via negative grep
- [x] Doc ≥ 80 lines — VERIFIED `wc -l` returns 107
- [x] "Rollback recipe" present (case-insensitive) — VERIFIED
- [x] "Phase 30" appears ≥ 1 time — VERIFIED 6 occurrences
- [x] SIMPLIFY-01 + SIMPLIFY-03 both present — VERIFIED
- [x] `<expand_at_36>` count in ADR-0010 = 1 — VERIFIED (marker moved, not duplicated)
- [x] All 7 D-N entries (D-01 through D-07) present in ADR sub-block — VERIFIED via grep loop
- [x] No placeholders in ADR sub-block — VERIFIED
- [x] ADR diff additions-only (Phase 29 content byte-identical) — VERIFIED 0 deletions
- [x] CLAUDE.md +1 line vs HEAD — VERIFIED 151 → 152
- [x] CLAUDE.md +1 dash-bullet vs HEAD — VERIFIED 98 → 99
- [x] CLAUDE.md insertion inside "## LLM Event Pipeline" section — VERIFIED via awk
- [x] Commit subject matches CONTEXT D-08 format — VERIFIED `git log -1 --format=%s` returns `docs(30): write docs/architecture/llm-pipeline-reliability.md + ADR-0010 append (D-06)`
- [x] Commit body contains `Requirements: LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03` — VERIFIED
- [x] Commit touches exactly 3 files (CLAUDE.md + ADR + architecture doc, alphabetical) — VERIFIED
- [x] `git status --short` clean post-commit — VERIFIED empty
- [x] `git log --oneline --grep='feat(30)\|docs(30)' | wc -l` ≥ 7 — VERIFIED returns 7
- [x] Prettier check green on all three files — VERIFIED `All matched files use Prettier code style!`
