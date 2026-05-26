---
phase: 35
slug: internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from RESEARCH.md §Validation Architecture (line 707).

---

## Test Infrastructure

| Property               | Value                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | `vitest` ~3.x (existing)                                                                                                           |
| **Config file**        | `vite.config.ts:55-77` (`test: { environment: 'jsdom', ... }`) — D-01 vitest uses `// @vitest-environment node` directive override |
| **Quick run command**  | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                                                                          |
| **Full suite command** | `npx vitest run`                                                                                                                   |
| **Estimated runtime**  | ~45 seconds full suite; ~2 seconds drift-gate alone                                                                                |

---

## Sampling Rate

- **After every task commit (D-N):** Targeted vitest for the surface touched (e.g. partial-key tests after D-12; drift-gate after D-01..D-04).
- **After every plan wave:** `npx vitest run` full suite + `npx tsc --noEmit`.
- **Before `/gsd:verify-work`:** Full suite must be green AND `npx vitest run src/__tests__/lib/redis-registry.test.ts` green specifically.
- **Max feedback latency:** ~45 seconds.

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                            | Threat Ref | Secure Behavior                                                                                                          | Test Type           | Automated Command                                                                                                                                              | File Exists           | Status     |
| -------- | ---- | ---- | -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------- |
| 35-01-\* | 01   | 1    | DOCS-INT-03, REDIS-OPT-01              | —          | Drift-gate vitest catches any documented↔code mismatch                                                                   | unit (NEW)          | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                                                                                                      | ❌ W0 — to be created | ⬜ pending |
| 35-02-\* | 02   | 2    | SIMPLIFY-02                            | —          | After D-12, no production code references `EVENTS_LLM_V3_PARTIAL_KEY` constant nor the literal `'events:llm:v3:partial'` | unit + grep         | `npx vitest run server/__tests__/lib/llmExtractionPipeline.{terminalShape,incrementalWrite,crossBoundary}.test.ts server/__tests__/cache/redis-prefix.test.ts` | ✅ exists             | ⬜ pending |
| 35-03-\* | 03   | 2    | SIMPLIFY-05                            | T-35-04    | freeClaudeRouter.ts callers block contains zero secret material; existing tests still pass                               | smoke               | `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts`                                                                                                 | ✅ exists             | ⬜ pending |
| 35-04-\* | 04   | 2    | DOCS-INT-02                            | —          | All 7 LLM-pipeline modules compile + their tests pass after JSDoc edits                                                  | unit (full suite)   | `npx vitest run` + `npx tsc --noEmit`                                                                                                                          | ✅ exists             | ⬜ pending |
| 35-05-\* | 05   | 3    | REDIS-OPT-03 (D-17, D-18)              | —          | If TTL changes ship, targeted vitest for the affected cache module passes                                                | unit (case-by-case) | `npx vitest run` after each TTL change                                                                                                                         | ✅ varies             | ⬜ pending |
| 35-06-\* | 06   | 4    | REDIS-OPT-04 (D-19, D-20), SIMPLIFY-07 | —          | Bundle-size + Upstash deltas recorded in SUMMARY.md + ADR-0010                                                           | manual-only         | `wc -c api/vercel-entry.js` + dashboard PNG                                                                                                                    | n/a                   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `src/__tests__/lib/redis-registry.test.ts` — NEW (D-01) — covers DOCS-INT-03 + REDIS-OPT-01 3-surface parity (CLAUDE.md §Serverless Cache ↔ `docs/architecture/redis-keys.md` ↔ code grep). Uses `// @vitest-environment node` for filesystem access.
- [ ] `docs/architecture/redis-keys.md` — NEW (D-05) — the deep-dive inventory artifact the drift-gate parses (alongside CLAUDE.md).

_All other phase requirements are exercised by existing tests._

---

## Manual-Only Verifications

| Behavior                                           | Requirement                      | Why Manual                                                   | Test Instructions                                                                                                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wc -c api/vercel-entry.js` baseline + close delta | SIMPLIFY-07, REDIS-OPT-04 (D-19) | Build-artifact measurement; not a code behavior              | Run at plan 35-01 start (capture baseline = 1,779,504 bytes per RESEARCH.md §Sources); re-run at plan 35-06 close; record delta + percentage in SUMMARY.md                                                                                                |
| Upstash command-budget pre/post screenshots        | REDIS-OPT-04 (D-20)              | Upstash REST API does not expose `INFO commandstats` cleanly | Operator captures Upstash dashboard "Commands" PNG at plan 35-01 start (commit as `redis-budget-baseline-YYYY-MM-DD.png`) and at plan 35-06 close (`redis-budget-close-YYYY-MM-DD.png`); record delta + primary driver attribution in SUMMARY.md per D-21 |
| Cardinality column values in inventory table       | REDIS-OPT-01 (D-07)              | One-shot SCAN reading; continuous instrumentation deferred   | Operator runs `redis-cli SCAN` or reads Upstash dashboard at phase close; transcribes to inventory `Cardinality` column                                                                                                                                   |
| ADR-0010 Phase 35 sub-block content                | D-22                             | Markdown authored by human against measured deltas           | Reviewer reads the sub-block against the captured numbers + commit log                                                                                                                                                                                    |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (manual-only items are isolated to phase close)
- [ ] Wave 0 covers all MISSING references (`redis-registry.test.ts` + `redis-keys.md`)
- [ ] No watch-mode flags (all commands use `vitest run`, not `vitest`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter at phase close

**Approval:** pending
