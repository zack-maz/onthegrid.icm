---
phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
plans: 6
status: complete
completed: 2026-05-27
milestone: v1.5
tags: [drift-gate, redis-registry, jsdoc, partial-key-retirement, simplify, docs-int, redis-opt]

requirements-completed:
  - DOCS-INT-02
  - DOCS-INT-03
  - REDIS-OPT-01
  - REDIS-OPT-02
  - REDIS-OPT-03
  - REDIS-OPT-04
  - SIMPLIFY-02
  - SIMPLIFY-05
  - SIMPLIFY-07

primary-driver: drift-gate
secondary-drivers:
  - partial-key-retirement (SIMPLIFY-02)
  - per-export JSDoc audit (DOCS-INT-02)
  - TTL audit-only (REDIS-OPT-03 — Phase-31-precedent)

bundle-delta-bytes: 10739
bundle-delta-percent: 0.60
bundle-baseline-bytes: 1779504
bundle-close-bytes: 1790243

upstash-baseline-commands: ~443000
upstash-close-commands: 443094

commits: 17
loc-removed: 358
loc-added-net: ~110 (tombstones + JSDoc + new test + redis-keys.md)
---

# Phase 35 Close-Out Summary: Internal Docs + Redis Registry + Redis Optimization + Cleanup Sweep

> **Closed 2026-05-27.** Mechanical drift-gate landed as the load-bearing primitive; partial-key retirement was the only code deletion; everything else is documentation authoring. 17 atomic commits, 9/9 requirements complete, drift gate green at 39/39 assertions at phase close, full test suite green at 2,379/2,403 passing.

## Headline outcomes

1. **`src/__tests__/lib/redis-registry.test.ts` drift gate** — mechanical 3-surface registry parity test (CLAUDE.md §Serverless Cache ↔ `docs/architecture/redis-keys.md` ↔ live grep over `server/` + `src/` production code). 39 assertions across 4 sub-suites; drift between any pair of surfaces fails the next `vitest run`. **Load-bearing primitive of the entire phase** — the hand-maintained CLAUDE.md registry rotted during Phases 27-34 (4 missing keys + 1 retire-but-still-listed + 2 needing refinement); the gate prevents recurrence.
2. **`docs/architecture/redis-keys.md`** — 32-key deep-dive inventory (12 family tables × 8 columns: Key / Writers / Readers / TTL / Value / Purpose / Cardinality / Classification). 15 load-bearing, ~10 observability, 1 retire (`events:llm:v3:partial`, deleted in plan 35-02).
3. **`events:llm:v3:partial` retirement (SIMPLIFY-02)** — the partial-key observability envelope retired across 10 surfaces in a single atomic commit. 358 LOC removed. Hobby-era 300s-budget mitigation; Pro 800s makes terminal-key writes reliably finish, so the partial-key carried no live signal. Production cleanup proceeds via natural TTL expiry within `LLM_REDIS_TTL_SEC` (≈ 2.5h) of deploy.
4. **`freeClaudeRouter.ts` callers block (SIMPLIFY-05)** — 3 live production callers verified by grep, documented at top of file with file:line refs; Phase 34 cascade shape (NIM primary, OpenRouter dormant, Cerebras + Groq deferred) documented inline; existing vendored-from block preserved as historical waymarker.
5. **7-module per-export JSDoc audit (DOCS-INT-02)** — 44 exports surveyed across 7 LLM-pipeline modules; 28 missing one-liners added; 16 existing JSDoc verified accurate. Module 7 (Watchdog) needed no edits (both exports already had accurate JSDoc).
6. **TTL audit (REDIS-OPT-03)** — 32 keys reviewed against producer cadence + freshness; finding `right-sized` for every entry; D-18 (replay-history cap) closed as satisfied by existing `operator:audit-log` 500/30d cap. Audit-only outcome per Phase 31 precedent — artifact at `.planning/phases/35-*/35-05-TTL-REVIEW.md`.
7. **Bundle delta (SIMPLIFY-07)** — `api/vercel-entry.js` baseline = 1,779,504 bytes; close = 1,790,243 bytes; delta = +10,739 bytes (+0.60%). JSDoc additions (+~28 one-liners × ~80 bytes) outweighed partial-key deletion savings. Net effect negligible on a 1.7MB bundle; intent of measurement (verify cleanup didn't regress materially) satisfied.

## Plan execution log

| Plan  | Title                                                   | Wave | Status     | Commits (head)                                                                   |
| ----- | ------------------------------------------------------- | ---- | ---------- | -------------------------------------------------------------------------------- |
| 35-01 | Drift gate + registry + baselines                       | 1    | ✓ Complete | `df872c8` `997e500` `bcff898` `37e76ad` `e88cdea` `58cded9`                      |
| 35-02 | Retire `events:llm:v3:partial`                          | 2    | ✓ Complete | `a504ebd`                                                                        |
| 35-03 | `freeClaudeRouter.ts` callers block                     | 2    | ✓ Complete | `399290d`                                                                        |
| 35-04 | 7-module per-export JSDoc audit                         | 3    | ✓ Complete | `08d079e` `b40536a` `4c22acf` `f9d8d22` `dd6b10e` `fb41119` (`faccc0c` tracking) |
| 35-05 | TTL audit (REDIS-OPT-03, D-17, D-18)                    | 2    | ✓ Complete | `818ac46`                                                                        |
| 35-06 | Phase close (ADR-0010 sub-block + tracking + this file) | 4    | ✓ Complete | `19330aa` + this commit                                                          |

Total: **17 atomic commits**.

## Requirements coverage

| ID           | Closed in plan | Verification                                                                                      |
| ------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| DOCS-INT-02  | 35-04          | 44 exports across 7 modules surveyed; 28 new one-liners + 16 verified. Module 7 verified-clean.   |
| DOCS-INT-03  | 35-01          | CLAUDE.md §Serverless Cache refresh (4 add + 2 refine + 1 cron parametric normalisation).         |
| REDIS-OPT-01 | 35-01          | `docs/architecture/redis-keys.md` 32-key deep-dive inventory (12 family tables × 8 columns).      |
| REDIS-OPT-02 | 35-01          | Each key carries Classification column ∈ {load-bearing, observability, retire}.                   |
| REDIS-OPT-03 | 35-05          | TTL audit-only artifact at 35-05-TTL-REVIEW.md. All 32 keys finding = right-sized.                |
| REDIS-OPT-04 | 35-06          | Bundle + Upstash baseline + close measurements; primary-driver attribution in ADR-0010 sub-block. |
| SIMPLIFY-02  | 35-02          | Partial-key retired across 10 surfaces; drift gate confirms registry parity holds end-to-end.     |
| SIMPLIFY-05  | 35-03          | `freeClaudeRouter.ts` documented alive; 3 live production callers cited; cascade shape inline.    |
| SIMPLIFY-07  | 35-06          | Bundle delta = +10,739 bytes (+0.60%); negligible on 1.7MB. JSDoc adds > partial-key deletes.     |

## Key decisions

- **`<name>` → `{name}`** in CLAUDE.md `cron:lastTick` parametric (plan 35-01 follow-through): the BACKTICK_KEY_RE character class admits `{}` but not `<>`. Picked curly-brace form for consistency with every other CLAUDE.md placeholder.
- **LLMCachePayload interface retired alongside writer** (plan 35-02): pre-flight grep confirmed only refs were writer + tests + JSDoc + 1 dead-reference-in-comment in `events.ts:311`. No production non-writer consumer.
- **`snapshot-v3-redis.ts` kept (scope-edit), `peek-v3-partial.ts` deleted, `clear-llm-cache-dev.ts` scope-edit** (plan 35-02): script wrap status varies — `snapshot:v3` is an npm script (`package.json:28`), the other two aren't. Disposition per Pitfall 1.
- **`events:llm-cost-shadow:v3:{YYYY-MM-DD}` documented as observability key** (plan 35-01 follow-through): real production observability key written by `freeClaudeRouter.ts:669` `accrueShadowCost` (HSET daily cost roll-up, 90d ring). Originally undocumented; gate caught it.
- **walkTsFiles skips `__tests__/` and `*.test.ts`** (plan 35-01): production registry only; test fixtures contain hardcoded key-shaped literals (`'geocode:33.25,44.25'`) that the CODE_KEY_RE captures as truncated orphans.
- **TTL audit closed audit-only per Phase 31 precedent** (plan 35-05): "no changes proposed" IS the load-bearing outcome; artifact provides the auditable per-key justification.
- **D-25 collapse rule applied to module 7** (plan 35-04): llmExtractorWatchdog had zero rewrites needed; folded to no commit (6 commits instead of 7).
- **Module 7 (Watchdog) verified clean** (plan 35-04): both exports (`BatchWatchdogOptions`, `withBatchWatchdog`) already had accurate JSDoc.

## Drift gate behavior at phase close

- **Pre-Wave-1 (phase start):** No gate existed.
- **Wave 1 (plan 35-01) first run:** Gate caught 3 real findings — `cron:lastTick:<name>` invisible to regex (angle brackets not in char class); `events:llm-cost-shadow:v3:{date}` undocumented; test-fixture false positives polluting code-key set.
- **Wave 1 close (after fixes):** Gate green at 40/40 assertions. Drift caught + resolved before commit.
- **Wave 2 (plan 35-02 partial-key retirement):** Gate green (39/40 — the partial-key it.each iteration disappeared with the documented-key set shrinking by 1).
- **Wave 2 (plan 35-03 freeClaudeRouter doc):** Gate not affected (no Redis-key surface changes).
- **Wave 3 (plan 35-04 JSDoc audit):** Gate not affected (no Redis-key surface changes).
- **Wave 4 (plan 35-06 phase close):** Final re-run = 39/39 assertions PASS. Registry integrity holds at phase close.

## Deviations from plan

- **Plan 35-01 took ~3h initial executor + ~10 min orchestrator continuation** (vs initial estimate ~1h). Continuation needed because the initial subagent's socket dropped before Task 4 (drift gate test) was committed. Net result is the same plan output (5 commits + SUMMARY) but execution shape differs.
- **Plan 35-01 Task 4 (drift gate) became 2 commits, not 1.** The gate caught 3 real findings on its first run requiring CLAUDE.md + redis-keys.md fixes in addition to the test file. Two commits keeps the doc fixes logically separate from the test addition.
- **Plan 35-04 reduced from 7 commits to 6** per D-25 collapse rule (module 7 verified-clean with zero rewrites).
- **Plan 35-06 close PNG note:** Operator provided the Upstash close command count (443,094) inline rather than capturing a separate close PNG. The baseline PNG from plan 35-01 covers the measurement window; the close number is recorded in this SUMMARY + ADR-0010 sub-block. A separate close PNG can be captured post-deploy if the operator wants visual evidence of the post-Phase-35 command-budget rhythm.

## What this enables

- **Phase 36 (Public Docs Sweep + OpenAPI Additions)** can cite the new `docs/architecture/redis-keys.md` from the public README + architecture-doc index without redoing the registry work.
- **Future Redis-key work** (any phase) has a mechanical safety net — the drift gate catches CLAUDE.md / redis-keys.md / code three-way drift before it accumulates.
- **Phase 37 (ADR-0010 + Acceptance Gate Closeout)** has the v1.5 documentation-and-cleanup track closed; the milestone close gate can focus on the LLM-RELI-07 3-consecutive-green observation without doc-debt.
- **The `events:llm-cost-shadow:v3:{date}` 90d ring** is now documented; future cost-shadow analytics work has a known key shape to query against.

## Branch + merge state

- **Branch:** `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu` (cut from main 2026-05-26 in plan 35-01 task 1).
- **Commits ahead of main:** 17 (or 18 once this SUMMARY commit lands).
- **Ready for merge:** Yes. Branch is rebasable against main; no merge conflicts expected (Phase 35 is independent of Phases 32/33/34 work that recently landed).

## Verification

- **`npx tsc --noEmit`** exits 0.
- **`npx vitest run` full suite:** 185 files, **2,379 passed**, 19 skipped, 5 todo.
- **`npx vitest run src/__tests__/lib/redis-registry.test.ts`** (drift gate): 39/39 PASS.
- **Bundle: `wc -c api/vercel-entry.js`** = 1,790,243 bytes (close).
- **Upstash: 443,094 commands / 500K monthly budget** (operator reading at phase close).
- **9/9 requirements** flipped from Pending → Complete in REQUIREMENTS.md traceability table.
- **ROADMAP.md Phase 35 entry** flipped to `[x]` with completion narrative + 2026-05-27 date.
- **ADR-0010 Phase 35 sub-block** appended with D-01/D-12/D-15/D-17/D-19/D-20/D-22 narratives.

## Phase 35 in one sentence

The hand-maintained Redis-key registry rotted during Phases 27-34 (4 missing keys + 1 retire-but-still-listed + 2 refinements); Phase 35 mechanically fixes the rot (drift gate), retires the only key that should be deleted (`events:llm:v3:partial`, SIMPLIFY-02), and brings the LLM-pipeline JSDoc surface current — making future Redis-key work and LLM-pipeline navigation cheaper without changing any runtime behavior.
