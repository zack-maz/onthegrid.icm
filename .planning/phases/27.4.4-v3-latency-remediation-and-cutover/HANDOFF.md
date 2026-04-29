---
phase: 27.4.4
plan: 02
artifact: HANDOFF
created: 2026-04-28T17:15Z
operator: zackmaz
supersedes: HANDOFF.md (2026-04-28T15:50Z) — Plan 01 mid-execution pause
---

# 27.4.4 — HANDOFF (Plan 01 CLOSED, Plan 02 PENDING)

Plan 01 is fully shipped. Plan 02 is operator-gated cutover work (live LLM
Gate B passes, Vercel prod env flips, two D-16 human approvals) that
cannot run autonomously. This handoff captures the state-of-the-world a
fresh session needs to resume.

## Current branch state

- Branch: `feature/27.4.4-v3-latency-remediation-and-cutover`
- HEAD: `0d248d7` (Plan 01 SUMMARY commit)
- Ahead of `main`: 11 commits this session + the pre-pause history (full
  list in `27.4.4-01-SUMMARY.md` § Helper landings).
- Working tree: clean.
- Test suite: 1026 / 0 todo / 0 regressions (was 1013 / 11 todo at the
  pause). Tasks 7+8+9 flipped 7+4+2 = 13 new real tests.

## Plan 01 — COMPLETE ✓

All 13 tasks closed. Closeout artifacts:

- `27.4.4-01-SUMMARY.md` — bake-off winner + max_tokens caps + 9-task
  helper landing list with commit SHAs + 2 D-16 approval timestamps +
  D-20 dry-run pass log + 2 honest deviations + Gate readiness checklist.
- `dry-run-test.json` — D-19 reference snapshot from Task 0c-postlude
  step 6 (cacheKeyPrefix:dev:, terminal=null, partial=present, audit=0,
  dlq=24, lineage=102, baselines=5).
- 5 new feat commits this session (`9f3acb4` D-18 → `5dc65ea` D-19) plus
  `0d248d7` Plan 01 closeout doc.

## Bake-off + combo path — load-bearing for Plan 02

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| Winner model       | `qwen/qwen3.5-397b-a17b`                                   |
| Locked at          | `freeClaudeRouter.ts NVIDIA_NIM_DEFAULT_MODEL` (`b44c4c7`) |
| Within20km         | 0.80 (16/20)                                               |
| Gen-duration p95   | 264.9s — FAILS ≤30s p95 floor                              |
| D-03 dual-floor    | 0/4 candidates cleared → combo path approved               |
| Required at Gate B | `V3_ADAPTIVE_BATCH=true` in Vercel prod env BEFORE Pass 1  |

**Plan 02 ships v3 for location-accuracy parity, not latency parity.**
This is intentional per D-16 #2 approval; the p95 cliff is treated as
ops cost, not a STOP-and-defer trigger.

## Vercel prod env state

| Var                  | Status                  | Notes                                                                                       |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| NVIDIA_NIM_API_KEY   | ✓ already set           | Inherited from 27.4.3.                                                                      |
| CRON_SECRET          | ✓ set 2026-04-28T17:13Z | Encrypted, Production scope. Verified via `vercel env ls production`.                       |
| LLM_PIPELINE_V3      | ✗ NOT set               | Operator chose to hold — flip BEFORE Gate B Pass 1.                                         |
| V3_ADAPTIVE_BATCH    | ✗ NOT set               | Combo-path requirement — flip to `true` BEFORE Pass 1.                                      |
| V3_LINEAGE_PREFILTER | ✗ NOT set               | Stays default OFF through Plan 02 (write-side cache out of scope per Plan 01 deviation #3). |

## Plan 02 — task-by-task action map

Plan 02 has 7 tasks across 3 waves. Operator-gated except Task 1.

### Wave 1

**Task 1 (auto, executor-runnable)** — `scripts/extract-gate-b-snapshot.sh`

- Small bash + jq helper. Pipes `/api/events/llm-status` through jq to
  emit 8 markdown table rows (7 D-08/D-09 gates + 1 D-15 fallbackRatio).
- Full script body inline in `27.4.4-02-PLAN.md` lines 167-205.
- Acceptance: `test -x`, `head -1` is `#!/bin/bash`, jq compile clean.
- Commit msg: `feat(27.4.4): extract-gate-b-snapshot.sh — operator helper for threshold table generation`.

**Task 2 (checkpoint:human-verify)** — Gate A re-baseline (resolver-only, prod) + D-16 #3

- Operator runs `npm run eval:replay` against PROD Redis from laptop.
- Persists baseline to `events:llm-eval-baseline:v3` (90d TTL).
- Verdicts:
  - PASS: ratio ≥ 0.890 AND drift < 5pp from 0.940 → proceed.
  - DRIFT: drift ≥ 5pp from 0.940 → STOP, escalate, defer per D-17.
  - FLOOR FAIL: ratio < 0.890 → STOP, defer per D-17.
- Operator writes Gate A section into `27.4.4-02-CUTOVER.md` (NEW file).
- D-16 STOP marker — resume on `gate-a: pass` or `gate-a: defer (<verdict>)`.
- Commit msg: `docs(27.4.4): Gate A re-baseline {ratio} (PASS) — checkpoint 3`.

### Wave 2

**Task 3 (checkpoint:human-verify, blocking)** — Gate B Pass 1

- Wall-clock ~30-45min sequential.
- Operator must FIRST flip Vercel prod env: `LLM_PIPELINE_V3=true`,
  `V3_ADAPTIVE_BATCH=true`, then redeploy (`vercel --prod` or push) to
  pick up the new env.
- 4-step sequence:
  1. `tsx scripts/snapshot-v3-redis.ts --label=gate-b-pass-1-start`
     (note: in prod this needs `.env.local` swapped to PROD Upstash;
     read-only so safe per A6/Pitfall 8).
  2. `curl -fsS "https://<vercel-prod-host>/api/events?force=true"` to
     kick off v3 extraction. Background fire-and-forget.
  3. Poll `/api/events/llm-status` every ~30s until `stage=idle` AND
     `completedBatches===totalBatches`.
  4. `bash scripts/extract-gate-b-snapshot.sh "https://<vercel-prod-host>"`
     to derive threshold table.
- Capture `tsx scripts/snapshot-v3-redis.ts --label=gate-b-pass-1-end`.
- Append Pass 1 section to `27.4.4-02-CUTOVER.md` (verbatim
  llm-status JSON + threshold table).
- D-08/D-09/D-15 gates (all 8 must PASS):
  - watchdogTimeoutCount === 0
  - DLQ count ≤ 5
  - duration_min ≤ 120
  - provenanceCounts populated
  - schema_fail rate ≤ 2%
  - latency.nvidia_nim.p95 ≤ 30000ms (relaxed by combo path framing
    but still tracked — failure here is acknowledged ops cost, not
    automatic abort. Operator decides whether to proceed.)
  - routingTrace primary share ≥ 90%
  - fallbackRatio ≤ 15%

**Task 4 (checkpoint:human-verify)** — Pass 1 verdict

- D-11: any gate FAIL on Pass 1 = overall fail + defer phase.
- Resume signal: `pass-1: pass` (proceed to Pass 2) OR
  `pass-1: defer (<which gate>)`.

### Wave 3

**Task 5 (checkpoint:human-verify, blocking)** — Gate B Pass 2

- Identical mechanics to Task 3, second consecutive run.
- D-10: 2 consecutive passes required to defeat false-positive risk
  (Plan 05 of 27.4.3 burned a single pass and let a model-specific
  long-tail surprise leak through).
- Snapshots: `--label=gate-b-pass-2-start` + `--label=gate-b-pass-2-end`.

**Task 6 (checkpoint:human-verify)** — Pass 2 verdict + D-16 #4

- Both passes must PASS all 8 gates AND have fallbackRatio ≤ 15%.
- D-16 STOP marker for cutover authorization.
- Resume signal: `pass-2: pass` (proceed to cutover POST) OR
  `pass-2: defer (<which gate>)`.

**Task 7 (auto + manual cleanup)** — Cutover POST + UAT close

- `curl -X POST https://<vercel-prod-host>/api/events/llm-pipeline -d '{"version":"v3"}'`
  — flips runtime override to v3 prod-wide. Returns 200 + appends entry
  to `events:llm-pipeline-audit`.
- Operator visually confirms Topbar PipelineVersionPill renders `v3` in
  prod browser.
- Edit `.planning/phases/27.4.2-ci-health-and-llm-v2-tuning/27.4.2-HUMAN-UAT.md`:
  close tests 1+2 with link to `27.4.4-02-CUTOVER.md` as evidence.
- Write `27.4.4-02-SUMMARY.md` closeout.
- Update `STATE.md` + ROADMAP.md to mark Phase 27.4.4 COMPLETE.

## Anti-patterns to preserve (carried from Plan 01 + new from this session)

1. **Don't run Task 4's 50-event LLM-in-loop bake-off** — locked decision per combo-path D-16 #2.
2. **Don't change `NVIDIA_NIM_DEFAULT_MODEL` from qwen** — winner is locked in `b44c4c7`.
3. **Don't enable `V3_LINEAGE_PREFILTER` in Vercel prod for Plan 02** — write-side cache is OUT OF SCOPE per Plan 01 deviation #3, so the read-side gate has nothing to read; Gate B telemetry comparability requires it OFF.
4. **DO enable `V3_ADAPTIVE_BATCH=true` in Vercel prod BEFORE Pass 1** — combo-path requirement per Plan 01 SUMMARY.
5. **Don't commit terminal-cache writes through `events:llm:v3`** — two-key discipline (terminal vs `:partial`) is load-bearing per Pitfall 3.
6. **Don't propagate `OPENROUTER_API_KEY` to Vercel prod env** — dev-only cascade fixture per CONTEXT D-12. Plan 02 Gate B does NOT need it.
7. **Re-test cascade smoke with EMPTY `NVIDIA_NIM_API_KEY` (not "invalid")** before Gate B Pass 1 — Plan 01 Task 12 was PARTIAL CONFIRM only because operator used `invalid` (yields 401 → `fall_through:nvidia_nim_429`) instead of empty (would yield `fall_through:nvidia_nim_no_client`). 5-minute smoke; re-runs against dev.
8. **Operator must swap `.env.local` Upstash URL/token from dev (Plan 01) BACK to prod for Tasks 2/3/5 snapshot calls.** Snapshot script is read-only (Pitfall 6) so this is safe; revert to dev after Plan 02 close.

## Resume command

```bash
/gsd-execute-phase 27.4.4 --interactive
```

The `--interactive` flag is the right shape because Plan 02 has 4 D-16
human-verify checkpoints; subagent-spawned executors can't pause for
operator decisions.

The next session should:

1. Read this HANDOFF.md first.
2. Read `27.4.4-02-PLAN.md` for full task specs (the 7 tasks above).
3. Read `27.4.4-01-SUMMARY.md` for the bake-off winner + combo-path framing.
4. Verify the operator's Vercel prod env state matches the table above.
5. Start with Task 1 (executor-runnable) → then walk through Tasks 2-7
   with operator approval at each D-16 checkpoint.

## Test suite baseline at handoff

```
Test Files  74 passed (74)
     Tests  1026 passed (1026)
```

Zero todos. All 11 baseline `it.todo` cases (7 lineage-prefilter +
4 eval-cron) flipped to real assertions across Plan 01 commits
`9f3acb4` + `0834c34`. Plus 2 new D-13 threshold tests in
`64307f4`.

## Where to find things

- **PLAN.md** for the cutover: `27.4.4-02-PLAN.md` (in this same dir).
- **Bake-off receipts**: `27.4.4-01-BAKEOFF.md`, `27.4.4-PREFLIGHT-CHARACTERIZATION.md`.
- **Plan 01 closeout**: `27.4.4-01-SUMMARY.md` + `dry-run-test.json`.
- **Per-task scripts**:
  - `scripts/snapshot-v3-redis.ts` (Plan 01 Task 11) — 6-key forensic capture.
  - `scripts/eval-replay.ts` (existing) — resolver-only eval against ground truth.
  - `scripts/extract-gate-b-snapshot.sh` (Plan 02 Task 1) — NOT YET CREATED.
- **Cutover doc to be created**: `27.4.4-02-CUTOVER.md` (operator-driven, populated incrementally Tasks 2 → 7).
- **27.4.2 UAT manifest** (Plan 02 Task 7 closes tests 1+2): `.planning/phases/27.4.2-ci-health-and-llm-v2-tuning/27.4.2-HUMAN-UAT.md`.
