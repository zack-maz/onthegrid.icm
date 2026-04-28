---
phase: 27.4.4
plan: 01
artifact: HANDOFF
created: 2026-04-28T15:50Z
operator: zackmaz
session_commits: 11
session_tasks_complete: 9
session_tasks_remaining: 7
---

# 27.4.4 Plan 01 — HANDOFF

Plan 01 was paused mid-execution due to context budget. This handoff captures
state-of-the-world so a fresh `/gsd-execute-phase 27.4.4` session can pick
up cleanly at Task 7.

## Where we are

| Task                                   | Status                                                       | Commit                          |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| 0a — Wave 0 test stubs                 | ✓ done                                                       | `a258da0`                       |
| 0b — CHECKPOINT dev Redis isolation    | ✓ done (Option B / CACHE_KEY_PREFIX in `.env.local`)         | `2c13a5e`, `9df86c4`            |
| 0c — CHECKPOINT dev dry-run            | partial — **prelude steps 1-4 done**, postlude 5-6 deferred  | (operator-driven)               |
| 1 — Zod env vars + .env.example        | ✓ done                                                       | `3e9e809`                       |
| 2 — Bakeoff harness extensions         | ✓ done                                                       | `5789f9a`, `f239cca`, `d5f5d52` |
| 3 — CHECKPOINT D-05 preflight          | ✓ done (D-16 approval #1)                                    | `749ca57`                       |
| 4 — CHECKPOINT D-02 bake-off           | ✓ done **as combo-path** (D-16 approval #2; deviation noted) | `5706232`                       |
| 5 — Lock winner + MAX_TOKENS_PER_MODEL | ✓ done                                                       | `b44c4c7`                       |
| 6 — D-04 adaptive batching             | ✓ done (3-file atomic + 6 tests green)                       | `863eef3`                       |
| **7 — D-18 lineage pre-filter**        | **NOT STARTED**                                              | —                               |
| **8 — D-21 prewarm + D-13 threshold**  | **NOT STARTED**                                              | —                               |
| **9 — D-14 cron eval route**           | **NOT STARTED**                                              | —                               |
| **10 — A9 atomic UI commit**           | **NOT STARTED**                                              | —                               |
| **11 — Snapshot script**               | **NOT STARTED**                                              | —                               |
| **12 — CHECKPOINT OpenRouter cascade** | **NOT STARTED** (operator-driven)                            | —                               |
| **13 — Plan 01 SUMMARY.md**            | **NOT STARTED** (closeout)                                   | —                               |

## Combo-path framing — load-bearing for Plan 02

The 20-event preflight at `27.4.4-PREFLIGHT-CHARACTERIZATION.md` showed
**0/4 candidates clear D-03 dual hard floor**. Operator approved **combo
path** at 2026-04-28T15:30Z (`27.4.4-01-BAKEOFF.md`):

- **Winner:** `qwen/qwen3.5-397b-a17b` (locked in `NVIDIA_NIM_DEFAULT_MODEL`).
  - within20km 16/20 (0.80) — best of the 4 LIVE candidates.
  - gen-duration p95 = 264.9s (FAILS the ≤30s p95 floor).
- **Fallback:** itself qwen (no other LIVE candidate in 27.4.4's bake-off).
- **Plan 02 Gate B will:** ship `V3_ADAPTIVE_BATCH=true` in Vercel prod env
  BEFORE Pass 1; explicitly carry "expected p95 > 30s" — cutover ships v3
  for location-accuracy parity, not latency parity.
- **D-13 V3_WATCHDOG_ROLLBACK_THRESHOLD=2** (default; no override needed).
- **D-17 STOP-and-defer NOT triggered** — failure is model-related and
  within scope of D-04 adaptive batching.

## Operator state

- ✅ `NVIDIA_NIM_API_KEY=nvapi-...` present in `.env.local`.
- ✅ `LLM_PIPELINE_V3=true` in `.env.local`.
- ✅ `CACHE_KEY_PREFIX=dev:` in `.env.local` (D-20 Option B isolation).
- ✅ `OPENROUTER_API_KEY` — operator confirmed earlier; required for Task 12 cascade smoke.
- ✅ Prod Vercel env STILL points at canonical Upstash DB; production is unaffected.
- ⚠ `dev:`-prefixed keys exist in the shared Upstash DB. Cleanup recipe at end of phase: `redis.keys('dev:*')` + bulk delete.

## What's left — 7 tasks

The next session must execute these in order. Each task's full spec lives
in `27.4.4-01-PLAN.md` (the source of truth; this handoff summarizes only).

### Task 7 — D-18 lineage pre-filter (atomic 3-file commit)

- Files: `server/lib/llmLineage.ts`, `server/lib/llmEventExtractor.v3.ts`, `server/__tests__/lib/llmLineage-prefilter.test.ts`
- Add `computeGroupLineageHash` + `GROUP_LINEAGE_KEY_PREFIX` + `GROUP_LINEAGE_TTL_SEC` exports to llmLineage.ts. Sha256 hash inputs: `key + sorted(sourceUrls).join('|') + totalMentions`.
- Wire pre-filter loop at top of `processEventGroupsV3` BEFORE main batch loop, gated on `env.V3_LINEAGE_PREFILTER`. On hit, skip group + push cached event. On miss, fall through.
- Mirror `lineagePrefilterStats {hitCount, missCount}` + `lineagePrefilterEnabled` onto llmProgress (FIELDS ALREADY ADDED to llmProgress.ts in commit `863eef3` — just need to populate them).
- Flip 7 `it.todo` → real tests in `llmLineage-prefilter.test.ts`. Pattern same as v3-adaptive.test.ts (mutating updateProgress mock, hoisted env mock).
- WRITE-side cache population is OUT OF SCOPE — document in JSDoc that `redis.setex(cacheKey, ...)` lands in a future phase; for 27.4.4 the pre-filter only READS.
- Default OFF — V3_LINEAGE_PREFILTER stays false through Plan 02 Gate B.
- Acceptance: `grep "computeGroupLineageHash" server/lib/llmLineage.ts` returns ≥ 1; `grep "env.V3_LINEAGE_PREFILTER" server/lib/llmEventExtractor.v3.ts` returns ≥ 1; `npx vitest run server/__tests__/lib/llmLineage-prefilter.test.ts` reports `Tests 7 passed (7)`.

### Task 8 — D-21 NIM cold-start prewarm + D-13 retuned threshold (atomic 4-file commit)

- Files: `server/lib/freeClaudeRouter.ts`, `server/lib/llmEventExtractor.v3.ts`, `server/__tests__/lib/llmAutoRollback.test.ts`, `server/lib/llmProgress.ts` (already has the prewarm fields from commit `863eef3`).
- Add `prewarmIfCold()` function to freeClaudeRouter.ts. Module-level `lastNimCallTs` (in-memory only — NO Redis backing per RESEARCH §8). If `Date.now() - lastNimCallTs > 60_000`, fire a synthetic warmup request to NIM (`/v1/chat/completions` with 1-token prompt). Update llmProgress.prewarmCount / lastPrewarmTs / prewarmState.
- Call `prewarmIfCold()` from `processEventGroupsV3` before the main batch loop.
- Replace literal `3` in `checkWatchdogRecurrenceTrigger` (line ~759) with `env.V3_WATCHDOG_ROLLBACK_THRESHOLD`. Default already = 2 from Task 1's Zod schema.
- Add 2 new tests to `llmAutoRollback.test.ts` covering env-tunable threshold (default 2 + custom value).
- Acceptance: `grep "prewarmIfCold" server/lib/freeClaudeRouter.ts` returns ≥ 2; `grep "env.V3_WATCHDOG_ROLLBACK_THRESHOLD" server/lib/llmEventExtractor.v3.ts` returns 1; `npx vitest run server/__tests__/lib/llmAutoRollback.test.ts` reports the new tests passing.

### Task 9 — D-14 /api/cron/eval route + vercel.json crons[] entry (atomic 4-file commit)

- Files: `server/routes/eval-cron.ts` (NEW), `server/index.ts`, `vercel.json`, `server/__tests__/routes/eval-cron.test.ts`.
- Create `server/routes/eval-cron.ts` exporting `evalCronRouter`. POST handler reads `Authorization: Bearer <CRON_SECRET>` header. If `env.CRON_SECRET` is non-empty: 401 on missing/wrong header; 200 on valid. If `env.CRON_SECRET` is empty: pass through (preserves existing un-authed cron-warm/cron-health behavior). Calls `runEval()` from llmEvalHarness on the happy path.
- Mount in `server/index.ts`: `app.use('/api/cron/eval', evalCronRouter)`.
- Add `vercel.json crons[]` entry: `{path: "/api/cron/eval", schedule: "0 4 * * *"}`.
- Flip 4 `it.todo` → real tests in `eval-cron.test.ts`. Pattern same as routes/health.test.ts.
- Acceptance: 4 tests pass; `vercel.json` has crons entry.

### Task 10 — A9 atomic UI commit (4 files in SAME commit, verifiable by single `git show <sha> --stat`)

- Files: `src/hooks/useLLMStatusPolling.ts`, `src/components/ui/DevApiStatus.tsx`, plus llmProgress.ts (already done) + the 3 new dev-only cells.
- Add 3 dev-only cells to DevApiStatus.tsx Events tab gated on `import.meta.env.DEV && schemaVersion === 'v3'`:
  1. **Pre-warm cell** — reads `prewarmCount`, `lastPrewarmTs`, `prewarmState`. Renders e.g. "Prewarm: 12 fired (warm)" with a relative timestamp.
  2. **Adaptive batch cell** — reads `adaptiveBatchEnabled`, `adaptiveBatchStats`. Shows splitCount / retrySuccess / retryFail / dlqEnqueueCount as a compact strip.
  3. **Lineage prefilter cell** — reads `lineagePrefilterEnabled`, `lineagePrefilterStats`. Shows hitCount / missCount.
- Mirror the new fields in `useLLMStatusPolling.ts`'s LLMRunSummary type so client sees them under v3 polling.
- Single atomic commit — verified by `git show <sha> --stat | wc -l` showing all 3 source files (DevApiStatus + useLLMStatusPolling + maybe one type file).
- Default state when fields are undefined: render "—" placeholder, don't crash.

### Task 11 — D-19 forensic snapshot script (1-file commit)

- File: `scripts/snapshot-v3-redis.ts`.
- 6-key dispatch: reads `events:llm:v3` (get), `events:llm:v3:partial` (get), `events:llm:v3:lineage:*` (smembers? — no, this is hash keyspace; use `keys` + dispatch), `events:llm-pipeline-audit` (lrange), `events:llm-dlq` (smembers), `events:llm-eval-baseline:v3:*` (keys + get).
- CLI args: `--label=<name>` writes JSON to `.planning/phases/27.4.4-v3-latency-remediation-and-cutover/<name>.json`.
- Add npm script: `"snapshot:v3": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/snapshot-v3-redis.ts"`.
- RECOMMENDED per RESEARCH §6 Option C: add `--prod-confirm` flag requirement so accidental dev runs of the snapshot can't commit prod data (refuse to run unless flag is set OR `CACHE_KEY_PREFIX` is set).
- Acceptance: smoke run with `--label=test-1 --prod-confirm` writes a JSON file under the phase dir.

### Task 0c-postlude (operator-driven) — D-20 dry-run steps 5+6

- Step 5 (cron route): `curl -i http://localhost:3001/api/cron/eval` (no auth header). If `CRON_SECRET` unset locally → 200 + JSON body. If `CRON_SECRET` set → 401. Both shapes pass.
- Step 6 (snapshot): `npm run snapshot:v3 -- --label=dry-run-test --prod-confirm`. Writes JSON file under phase dir.
- Operator confirms: `dev-dry-run: pass` or `dev-dry-run: fail (<reason>)`.

### Task 12 (operator-driven) — D-12 OpenRouter cascade dev smoke

- Operator runs synthetic NIM-disable test (e.g. `NVIDIA_NIM_API_KEY=invalid npm run dev:server` then trigger /api/events).
- Expect audit log entry with `fall_through:nvidia_nim_no_client`.
- Operator confirms: `cascade-smoke: pass` or `cascade-smoke: fail (<reason>)`.

### Task 13 — Plan 01 SUMMARY.md

- Path: `.planning/phases/27.4.4-v3-latency-remediation-and-cutover/27.4.4-01-SUMMARY.md`.
- Sections required by must_haves:
  - Bake-off winner (qwen with combo-path framing).
  - max_tokens caps table (per Task 5's MAX_TOKENS_PER_MODEL).
  - 8 helper landings list (Tasks 1, 2, 5, 6, 7, 8, 9, 10, 11 + 0c prelude/postlude split note).
  - Dev dry-run pass log (operator confirmations from 0b, 0c-prelude, 0c-postlude).
  - 2 D-16 operator approval checkpoint pass timestamps:
    - #1 (preflight): `preflight: complete (combo-path)` at 2026-04-28T15:30Z.
    - #2 (bake-off): `bakeoff: winner=qwen/qwen3.5-397b-a17b (combo-path)` at 2026-04-28T15:30Z.
  - **Plan deviation log**: 50-event Task 4 bake-off skipped per combo-path D-16 approval; 20-event preflight data used as bake-off matrix instead.

## Resume command

```bash
/gsd-execute-phase 27.4.4
```

The next agent should:

1. Read this HANDOFF.md first.
2. Read `27.4.4-01-PLAN.md` for full task specs.
3. Read `27.4.4-PREFLIGHT-CHARACTERIZATION.md` and `27.4.4-01-BAKEOFF.md` for context on the combo-path verdict.
4. Verify the operator's `.env.local` still contains the required keys before resuming code-landing tasks.
5. Resume at Task 7 (D-18 lineage pre-filter).

## Critical anti-patterns to avoid

1. **Don't run Task 4's full 50-event bake-off** — it was explicitly skipped per combo-path. Re-running would waste ~30-50min wall clock + ~200 LLM calls for no decision signal.
2. **Don't change `NVIDIA_NIM_DEFAULT_MODEL` from qwen** — winner is locked. Future re-baseline is a different phase.
3. **Don't enable V3_ADAPTIVE_BATCH or V3_LINEAGE_PREFILTER by default** — both stay OFF through Plan 02 Gate B. Operator flips V3_ADAPTIVE_BATCH in Vercel prod env BEFORE Pass 1.
4. **Don't commit terminal-cache writes through `events:llm:v3`** — the two-key discipline (`events:llm:v3` terminal vs `events:llm:v3:partial` observability) is load-bearing per Pitfall 3.
5. **Don't propagate `OPENROUTER_API_KEY` to Vercel prod env** — it's a dev-only cascade smoke fixture per CONTEXT D-12. Plan 02 Gate B does not need it.

## Test suite baseline at handoff

```
Test Files  72 passed | 2 skipped (74)
     Tests  1013 passed | 11 todo (1024)
```

11 todo cases left to flip green:

- 7 in `server/__tests__/lib/llmLineage-prefilter.test.ts` (Task 7)
- 4 in `server/__tests__/routes/eval-cron.test.ts` (Task 9)

Plus 2 new tests for D-13 env-tunable threshold to add in Task 8.
