---
phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
plan: 01
subsystem: documentation
tags: [redis, registry, drift-gate, vitest, documentation, observability, claude-md, jsdoc]

requires:
  - phase: 34-cerebras-groq-deferred
    provides: cascade-shape table + Phase 34 deferral rationale (referenced from redis-keys.md retire classification)
  - phase: 29-llm-pipeline-narrowing
    provides: 800s maxDuration + qwen-only cascade — makes terminal-key writes reliable so partial-key retirement in plan 35-02 is safe
provides:
  - Mechanical drift-gate vitest pinning the 3-surface Redis-key registry (CLAUDE.md §Serverless Cache ↔ docs/architecture/redis-keys.md ↔ live grep over server/ + src/ production code)
  - Hand-authored deep-dive `docs/architecture/redis-keys.md` (12 family tables, 8 columns each, populated from grep-verified file:line refs)
  - CLAUDE.md §Serverless Cache refresh — 4 added keys (lineage trio + pipeline-audit + cost-shadow), 2 refined entries (news split into feed/gdelt, markets parametrized to `{range}`), cron parametric normalised from angle-brackets to curly-braces
  - Phase baseline measurements committed (bundle byte count 1,779,504 + Upstash dashboard PNG showing 443K/500K command budget) — close measurements in plan 35-06 will diff against these
affects:
  - 35-02 (partial-key retirement; will re-run drift gate after deletion to confirm registry stays clean)
  - 35-03 (freeClaudeRouter JSDoc; references the cost-shadow key documented here)
  - 35-04 (LLM-module JSDoc one-liners; verified against documented keys)
  - 35-05 (TTL review; uses the redis-keys.md TTL column as input)
  - 35-06 (phase close measurements; diffs bundle + command-budget against the baseline captured here)

tech-stack:
  added: []
  patterns:
    - 3-surface drift-gate pattern (markdown × markdown × code-grep parity, normalised on `:` boundaries)
    - EXEMPT_KEYS allowlist with `key` + `reason` so future readers audit exemptions without re-greping (D-02)
    - walkTsFiles production-only filter (skips `__tests__/` and `*.test.ts` / `*.spec.ts` files — test fixtures aren't registry-class)

key-files:
  created:
    - docs/architecture/redis-keys.md (27-key deep-dive inventory; 12 family tables, 8 columns each)
    - src/__tests__/lib/redis-registry.test.ts (40-assertion drift gate)
    - .planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-baseline-measurements.md
    - .planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/redis-budget-baseline-2026-05-27.png
  modified:
    - CLAUDE.md (§Serverless Cache: 4 add + 2 refine + 1 cron-parametric normalisation + 1 cost-shadow add)

key-decisions:
  - 'cron:lastTick:<name> → cron:lastTick:{name} (CLAUDE.md): the BACKTICK_KEY_RE character class admits `{}` but not `<>`. Picked curly-brace form to align with every other CLAUDE.md placeholder (`{eventId}`, `{provider}`, `{YYYY-MM-DD}`, `{lat}`, `{lon}`, `{hash}`).'
  - 'Document events:llm-cost-shadow:v3:{YYYY-MM-DD} as observability key (NOT exempt). It is a real production observability key written by freeClaudeRouter.ts:669 even with OpenRouter dormant. Marking it exempt would hide it from operator skim.'
  - 'walkTsFiles skips __tests__ and *.test.ts: production registry only. If a key is referenced ONLY from a test, the gate must flag that as a regression — not silently filter it. Test fixtures pollute the code-key set with truncated lat/lon literals (`geocode:33` from `geocode:33.25,44.25`) which are noise.'

patterns-established:
  - 'Drift gate as the load-bearing primitive — every subsequent registry edit must keep the test passing. plan 35-02 (partial-key retirement), plan 35-06 (close measurements), and any future Redis-key work will land WITH a re-run of `npx vitest run src/__tests__/lib/redis-registry.test.ts` exit 0.'
  - "EXEMPT_KEYS as audit surface — each entry MUST cite the surface (file:line, 'historical-fallback probe', 'test fixture', etc.) so future readers audit without re-greping. Empty-at-phase-close is the IDEAL state per D-02; the 6 entries here cover real historical / migration / fingerprint-sentinel cases."

requirements-completed:
  - DOCS-INT-03
  - REDIS-OPT-01
  - REDIS-OPT-02

duration: ~3h (continuation session)
completed: 2026-05-27
---

# Phase 35 Plan 01: Drift Gate + Baselines Summary

**The load-bearing primitive of Phase 35 — a mechanical 3-surface drift gate that fails the next `vitest run` if the Redis-key registry rots, plus the canonical deep-dive `docs/architecture/redis-keys.md` and refreshed CLAUDE.md §Serverless Cache.**

## Performance

- **Duration:** ~3h (continuation session after initial executor timeout)
- **Started:** 2026-05-26T22:08Z (initial executor)
- **Completed:** 2026-05-27T10:46Z (orchestrator finished tracking commits)
- **Tasks:** 4 of 4 + drift follow-through
- **Files modified:** 5 (CLAUDE.md, docs/architecture/redis-keys.md, src/**tests**/lib/redis-registry.test.ts, 35-baseline-measurements.md, redis-budget-baseline-2026-05-27.png)

## Accomplishments

- **Mechanical drift gate landed and PASSING.** `npx vitest run src/__tests__/lib/redis-registry.test.ts` exits 0 with 40 assertions across 4 sub-suites (regex-vs-list lockstep, ≥10-key sanity guard, CLAUDE.md ↔ redis-keys.md bidirectional parity, documented-key → code-reference orphan check + inverse). Drift between any pair of surfaces fails the next vitest run.
- **27-key deep-dive registry authored.** `docs/architecture/redis-keys.md` lists every key with Writers / Readers / TTL / Value / Purpose / Cardinality / Classification columns. Classifications: ≈ 15 load-bearing, ≈ 10 observability, 1 retire (`events:llm:v3:partial` slated for plan 35-02). 12 family tables: events, flights, ships, sites, water, news, markets, geocode, llm, cron, operator, audit.
- **CLAUDE.md §Serverless Cache refreshed.** 4 new entries (lineage trio + pipeline-audit + cost-shadow), 2 refined entries (news split, markets parametrized), 1 cron-parametric normalisation (`<name>` → `{name}`). All edits surgical via Edit tool — no overwrite of unrelated content.
- **Phase baselines captured.** Bundle = 1,779,504 bytes (exact match with 2026-05-26 scout, 0% jitter). Upstash command budget = 443K / 500K monthly (88.6% consumed). Plan 35-06's close measurements will diff against both numbers.
- **3 real drift findings closed at phase start.** The gate's first run caught: (1) `cron:lastTick:<name>` invisible to regex; (2) `events:llm-cost-shadow:v3:{date}` undocumented; (3) test-fixture false positives polluting the code-key set. All three closed before commit, gate now green.

## Task Commits

Each task committed atomically:

1. **Task 1: Branch cut + baseline measurements** — `df872c8` (chore — D-19, D-20, D-27)
2. **Task 2: CLAUDE.md §Serverless Cache surgical edits** — `997e500` (docs — D-14, D-23; 4 add + 2 refine)
3. **Task 3: `docs/architecture/redis-keys.md` deep-dive inventory** — `bcff898` (docs — D-05, D-06, D-08)
4. **Task 4 follow-through: drift-gate findings closed** — `37e76ad` (fix — cron parametric form + cost-shadow doc)
5. **Task 4: `src/__tests__/lib/redis-registry.test.ts` drift gate** — `e88cdea` (test — D-01, D-02, D-03, D-04)

## Files Created/Modified

- `docs/architecture/redis-keys.md` — NEW. 27-key deep-dive inventory, 12 family tables.
- `src/__tests__/lib/redis-registry.test.ts` — NEW. 40-assertion drift gate.
- `CLAUDE.md` — §Serverless Cache: +4 keys, refined 2 entries, normalised cron parametric form.
- `.planning/phases/35-.../35-baseline-measurements.md` — NEW. Bundle byte count + PNG filename + date.
- `.planning/phases/35-.../redis-budget-baseline-2026-05-27.png` — NEW. Upstash dashboard PNG.

## Deviations from Plan

- **Plan-stated Task 1 expected single atomic commit; orchestrator coordinated the Upstash PNG capture instead of the executor.** Per plan's `<orchestrator_directives>` and CONTEXT.md D-20 ("no Claude Code path to the Upstash Console"), the Step C screenshot is fundamentally a human-action checkpoint. The executor halted at Step C, the orchestrator handled the PNG (Playwright was attempted and confirmed Upstash requires login that I lack credentials for; user captured manually), then the continuation executor committed Step D + E atomically per spec.
- **Task 4 became 2 commits, not 1.** The drift gate found 3 real findings (`<name>` regex miss, `events:llm-cost-shadow:v3` undocumented, test-fixture false positives) on first run. Resolving them required CLAUDE.md + redis-keys.md edits in addition to the test file. Two commits keeps the registry-doc fix logically separate from the test-file addition — both are needed to land Task 4 with a green gate, but they're independently reviewable.
- **`events:llm-cost-shadow:v3:{YYYY-MM-DD}` was an unexpected discovery.** Not in the 35-RESEARCH.md §Grep Audit (it lives in freeClaudeRouter.ts:669 inside an `accrueShadowCost` function that the original grep audit may have missed because the variable name doesn't contain "key:"). Added to both surfaces with full Writer / Reader / TTL / Value columns.

## What This Enables

- **Plan 35-02** can delete the `events:llm:v3:partial` writer and re-run the drift gate to verify the retirement closes cleanly. The classification will flip from `retire` to deletion of the row.
- **Plan 35-03** has documented `events:llm-cost-shadow:v3` to point to in the freeClaudeRouter.ts JSDoc — confirming the file is alive and what its production observability key is.
- **Plan 35-04** can cite the documented key shapes from `docs/architecture/redis-keys.md` directly in module-level JSDoc one-liners (no re-research needed).
- **Plan 35-05** has TTL column in `docs/architecture/redis-keys.md` as the authoritative input for the read-only-at-default TTL review.
- **Plan 35-06** has bundle = 1,779,504 bytes + Upstash = 443K commands captured as the diff baseline. Close measurements will land with delta numbers in commit body.

## Self-Check: PASSED

- [x] `git rev-parse --abbrev-ref HEAD` outputs `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu`.
- [x] `wc -c api/vercel-entry.js` outputs 1,779,504 (recorded in 35-baseline-measurements.md).
- [x] `redis-budget-baseline-2026-05-27.png` exists (59,304 bytes; verified visual content shows Commands metric).
- [x] `35-baseline-measurements.md` exists with byte count + PNG filename + 2026-05-27 date + Phase 35 close-pointer header.
- [x] `grep -q "events:llm:v3:lineage:{eventId}" CLAUDE.md` exits 0.
- [x] `grep -q "events:llm:v3:lineage-keys" CLAUDE.md` exits 0.
- [x] `grep -q "events:llm:v3:group-lineage:{hash}" CLAUDE.md` exits 0.
- [x] `grep -q "events:llm-pipeline-audit" CLAUDE.md` exits 0.
- [x] `grep -q "events:llm-cost-shadow:v3" CLAUDE.md` exits 0 (added during drift follow-through).
- [x] `grep -q "markets:yahoo:{range}" CLAUDE.md` exits 0.
- [x] `news:feed` and `news:gdelt` appear as separate bullets in CLAUDE.md.
- [x] `docs/architecture/redis-keys.md` exists, has 12 family-table sections, contains `cron:lastTick:health` / `:warm` / `:refresh-events` as separate rows.
- [x] `src/__tests__/lib/redis-registry.test.ts` exists; line 1 is `// @vitest-environment node`; 40 assertions PASSING.
- [x] No file outside files_modified touched (except STATE.md / ROADMAP.md / config.json tracking — handled separately).
