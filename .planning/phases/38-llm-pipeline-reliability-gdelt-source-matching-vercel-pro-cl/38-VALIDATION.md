---
phase: 38
slug: llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-04
validated: 2026-06-04
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `38-RESEARCH.md` §"Validation Architecture". The Per-Task Verification Map below was
> populated post-execution from the six plan SUMMARYs and audited against the live codebase on
> 2026-06-04 (see Validation Audit at the bottom). All 27 requirements are COVERED by automated
> verification; zero gaps; `nyquist_compliant: true`.

---

## Test Infrastructure

| Property                | Value                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Framework**           | Vitest (jsdom for `src/`, node for `server/`)                                                                              |
| **Config file**         | `vite.config.ts` (test.alias mocks maplibre-gl + @deck.gl/mapbox for jsdom)                                                |
| **Quick run command**   | `npx vitest run <path>` (single file/dir)                                                                                  |
| **Full suite command**  | `npx vitest run`                                                                                                           |
| **Server-only command** | `npx vitest run server/`                                                                                                   |
| **Typecheck**           | `npm run typecheck` (`tsc -b && type-coverage`)                                                                            |
| **Estimated runtime**   | full suite 2444 tests; phase-38 server subset (14 files) ~47s; frontend subset (2 files) <1s                               |
| **Final baseline**      | 2444 passed / 0 failed (commit `05bf712`); typecheck PASS (type-coverage 97.66%); `npm audit --audit-level=moderate` clean |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>` + `npm run typecheck`. For LLM-PURGE tasks, `npm run typecheck` was the PRIMARY gate (deletion correctness = no dangling importers).
- **After every plan wave:** Run `npx vitest run server/` (server strands) or `npx vitest run` (cross-tier waves).
- **Before `/gsd-verify-work`:** Full `npx vitest run` GREEN + `npm run typecheck` PASS + `npm audit` clean.
- **Max feedback latency:** < ~60s for the touched-file + typecheck loop.

---

## Per-Task Verification Map

> Populated post-execution from the six plan SUMMARYs and audited against the live codebase on
> 2026-06-04. Rows are at requirement granularity (each requirement maps to one or more plan tasks).
> Every row has a runnable automated command. Status reflects the 2026-06-04 audit re-run.

| Req            | Plan  | Wave | Threat Ref | Secure Behavior                                                      | Test Type           | Automated Command                                                                                                                                                                        | File Exists | Status    |
| -------------- | ----- | ---- | ---------- | -------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| LLM-FIX-01     | 38-01 | 1    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/routes/health.test.ts`                                                                                                                                  | ✅          | ✅ green  |
| LLM-FIX-02     | 38-01 | 1    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/routes/water.test.ts`                                                                                                                                   | ✅          | ✅ green  |
| LLM-FIX-03     | 38-01 | 1    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/lib/llmEvalHarness.test.ts`                                                                                                                             | ✅          | ✅ green  |
| LLM-FIX-04     | 38-01 | 1    | T-38.01-01 | `/api/operator-status` no-500 under Redis death                      | integration (chaos) | `npx vitest run server/__tests__/resilience/redis-death.test.ts`                                                                                                                         | ✅          | ✅ green  |
| LLM-FIX-05     | 38-01 | 1    | T-38.01-02 | replay/prune 503-not-500 on `redis.incr` death (no stack-trace leak) | integration (chaos) | `npx vitest run server/__tests__/resilience/quota-chaos.test.ts`                                                                                                                         | ✅          | ✅ green  |
| LLM-FIX-06     | 38-01 | 1    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/routes/events.test.ts`                                                                                                                                  | ✅          | ✅ green  |
| LLM-PURGE-01   | 38-02 | 2    | —          | N/A                                                                  | typecheck + grep    | `npm run typecheck` + `test ! -f server/lib/llmEventExtractor.ts`                                                                                                                        | ✅ (gate)   | ✅ green  |
| LLM-PURGE-02   | 38-02 | 2    | —          | N/A                                                                  | typecheck + grep    | `npm run typecheck` + `grep -c "export.*callLLM" server/adapters/llm-provider.ts` → 0                                                                                                    | ✅ (gate)   | ✅ green  |
| LLM-PURGE-03   | 38-02 | 2    | —          | N/A                                                                  | grep                | `grep -rn "v1\|v2 default" server/lib/llmEventExtractor.v3.ts` (stale headers gone)                                                                                                      | ✅ (gate)   | ✅ green  |
| LLM-PURGE-04   | 38-02 | 2    | —          | N/A                                                                  | typecheck + grep    | `grep -c "export const enrichedEventV1\|enrichedEventV2\|batchResponseV2" server/lib/llmSchema.ts` → 0                                                                                   | ✅ (gate)   | ✅ green  |
| LLM-PURGE-05   | 38-02 | 2    | —          | N/A                                                                  | unit + typecheck    | `npx vitest run server/__tests__/routes/events.test.ts` + `grep -c "appendPipelineAudit\|PipelineFlipsBlock" server/ src/` → 0 live                                                      | ✅ (gate)   | ✅ green  |
| LLM-PURGE-06   | 38-02 | 2    | —          | N/A                                                                  | grep                | `grep -c "CEREBRAS\|GROQ" server/config.ts` → 0 live (tombstone comment only)                                                                                                            | ✅ (gate)   | ✅ green  |
| LLM-PURGE-07   | 38-02 | 2    | —          | N/A                                                                  | grep                | `grep -c "adapter source files remain importable" CLAUDE.md` → 0                                                                                                                         | ✅ (gate)   | ✅ green  |
| LLM-PURGE-08   | 38-02 | 2    | —          | N/A                                                                  | grep                | `grep -c "incrOpenRouterDaily\|getOpenRouterDaily" server/` → 0 live; OpenRouter dormant entry preserved                                                                                 | ✅ (gate)   | ✅ green  |
| LLM-PURGE-09   | 38-02 | 2    | —          | N/A                                                                  | grep                | `grep "writePartialCache" server/lib/llmExtractionPipeline.ts` (stale comment gone)                                                                                                      | ✅ (gate)   | ✅ green  |
| GDELT-MATCH-01 | 38-03 | 2    | —          | N/A                                                                  | unit (script)       | `npx vitest run server/__tests__/scripts/audit-gdelt-corpus.test.ts`                                                                                                                     | ✅          | ✅ green  |
| GDELT-MATCH-02 | 38-06 | 3    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/lib/eventGrouping.dedup.test.ts`                                                                                                                        | ✅          | ✅ green  |
| GDELT-MATCH-03 | 38-06 | 3    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/lib/corroboration.test.ts`                                                                                                                              | ✅          | ✅ green  |
| GDELT-MATCH-04 | 38-06 | 3    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/lib/relevanceScorer.test.ts`                                                                                                                            | ✅          | ✅ green  |
| WATER-LATIN-01 | 38-04 | 2    | —          | N/A                                                                  | unit (script)       | `npx vitest run server/__tests__/scripts/audit-water-names.test.ts`                                                                                                                      | ✅          | ✅ green  |
| WATER-LATIN-02 | 38-04 | 2    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/lib/romanize.test.ts`                                                                                                                                   | ✅          | ✅ green  |
| WATER-LATIN-03 | 38-04 | 2    | —          | N/A                                                                  | unit                | `npx vitest run server/__tests__/adapters/overpass-water.test.ts`                                                                                                                        | ✅          | ✅ green  |
| WATER-LATIN-04 | 38-04 | 2    | —          | N/A                                                                  | RTL                 | `npx vitest run src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx src/lib/__tests__/waterLabel.test.ts`                                                              | ✅          | ✅ green  |
| VERCEL-PRO-01  | 38-05 | 2    | —          | N/A                                                                  | manual (defer doc)  | `grep -n "PRO-01" docs/architecture/deployment.md` (defer-with-rationale recorded)                                                                                                       | ✅ doc      | ✅ manual |
| VERCEL-PRO-02  | 38-05 | 2    | —          | N/A                                                                  | manual (defer doc)  | `grep -n "PRO-02" docs/architecture/deployment.md` (defer-with-rationale recorded)                                                                                                       | ✅ doc      | ✅ manual |
| VERCEL-PRO-03  | 38-05 | 2    | —          | N/A                                                                  | unit (smoke)        | `npx vitest run server/__tests__/vercel-entry.test.ts`                                                                                                                                   | ✅          | ✅ green  |
| VERCEL-PRO-04  | 38-05 | 2    | —          | N/A                                                                  | doc grep (manual)   | `grep -rEn "Hobby\|10.second\|60s ceiling\|3 cron" docs/architecture/deployment.md docs/runbook.md docs/degradation.md docs/architecture/llm-pipeline-reliability.md CLAUDE.md` → 0 live | ✅ docs     | ✅ manual |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ✅ manual (verified, non-runtime)_

---

## Requirement → Test Map (authoritative; reconciled to executed reality)

| Req ID           | Behavior                                                                                                          | Test Type           | Automated Command                                                                      | File Exists?                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| LLM-FIX-01       | news fallback emits `cache-fallback-active:`, llmEvents emits `llm-optional-fallback-active:`                     | unit                | `npx vitest run server/__tests__/routes/health.test.ts`                                | ✅ (assertion tightened)     |
| LLM-FIX-02       | empty Open-Meteo result writes fresh `{data:[],failed:true,fetchedAt}` sentinel; probe reads degraded-not-unknown | unit                | `npx vitest run server/__tests__/routes/water.test.ts`                                 | ✅ (sentinel write+tolerate) |
| LLM-FIX-03       | `actorMatchRate` returns `null` when no ground-truth actors                                                       | unit                | `npx vitest run server/__tests__/lib/llmEvalHarness.test.ts`                           | ✅ (0→null cases)            |
| LLM-FIX-04       | extended chaos mock (11 raw-redis methods); `/api/operator-status` no-500 under Redis death                       | integration (chaos) | `npx vitest run server/__tests__/resilience/redis-death.test.ts`                       | ✅ (17 `vi.fn(redisDeath)`)  |
| LLM-FIX-05       | quota endpoints 503-not-500 when `redis.incr` throws (replay-endpoint leak closed)                                | integration (chaos) | `npx vitest run server/__tests__/resilience/quota-chaos.test.ts`                       | ✅ (NEW, 198 lines)          |
| LLM-FIX-06       | events route mocks use `schemaVersion: 'v3'`                                                                      | unit                | `npx vitest run server/__tests__/routes/events.test.ts`                                | ✅ (0 `schemaVersion: 'v1'`) |
| LLM-PURGE-01..09 | no importer of v1/v2 extractors/schemas/shim/pipelineAudit/OpenRouter-dead-writers/Cerebras-Groq                  | typecheck + grep    | `npm run typecheck` + deletion grep-gates (see Per-Task Map)                           | ✅ typecheck is the gate     |
| GDELT-MATCH-01   | audit script categorizes corpus (high/neutral/low, orphans, dup clusters)                                         | unit (script)       | `npx vitest run server/__tests__/scripts/audit-gdelt-corpus.test.ts`                   | ✅ (238 lines, 7 tests)      |
| GDELT-MATCH-02   | dedup collapses high-confidence dups only (AND-gate), preserves distinct multi-strike tail                        | unit                | `npx vitest run server/__tests__/lib/eventGrouping.dedup.test.ts`                      | ✅ (NEW)                     |
| GDELT-MATCH-03   | three-gate corroboration (temporal/geo/strict-keyword) applied only on genuine corroboration                      | unit                | `npx vitest run server/__tests__/lib/corroboration.test.ts`                            | ✅ (NEW)                     |
| GDELT-MATCH-04   | `compositeScore` additive, optional, reorders not mutates                                                         | unit                | `npx vitest run server/__tests__/lib/relevanceScorer.test.ts`                          | ✅ (extended)                |
| WATER-LATIN-01   | audit counts non-Latin gate-rejections per script                                                                 | unit (script)       | `npx vitest run server/__tests__/scripts/audit-water-names.test.ts`                    | ✅ (NEW)                     |
| WATER-LATIN-02   | romanize produces searchable Latin token (passes `isLatin`, no `@`, ≥2 chars)                                     | unit                | `npx vitest run server/__tests__/lib/romanize.test.ts`                                 | ✅ (NEW)                     |
| WATER-LATIN-03   | romanized facility admits past gate; `name:en` injected BEFORE gate; original preserved                           | unit                | `npx vitest run server/__tests__/adapters/overpass-water.test.ts`                      | ✅ (7 new cases)             |
| WATER-LATIN-04   | detail/tooltip/search display `nameLatin`, original on hover                                                      | RTL                 | `npx vitest run src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx` | ✅ (extended)                |
| VERCEL-PRO-01    | vercel.json→vercel.ts: deferred with rationale (D-09)                                                             | manual (defer doc)  | `grep -n "PRO-01" docs/architecture/deployment.md`                                     | ✅ (deployment.md:177+)      |
| VERCEL-PRO-02    | Build Output API: deferred with rationale (D-09)                                                                  | manual (defer doc)  | `grep -n "PRO-02" docs/architecture/deployment.md`                                     | ✅ (deployment.md:177+)      |
| VERCEL-PRO-03    | Fluid Compute compat; no per-request global hazard                                                                | unit (smoke)        | `npx vitest run server/__tests__/vercel-entry.test.ts`                                 | ✅ (concurrent-req smoke)    |
| VERCEL-PRO-04    | docs assert Pro semantics (800s / 40-cron); no stale Hobby/timeout claims on 5 surfaces                           | doc grep (manual)   | grep 5 in-scope surfaces → 0 live claims                                               | ✅ (5 surfaces clean)        |

---

## Wave 0 Requirements

All planning-draft Wave 0 items were resolved during execution (verified 2026-06-04):

- [x] `server/__tests__/resilience/quota-chaos.test.ts` — LLM-FIX-05 (`redis.incr`-throws → 503-not-500). Created (38-01, commit `4e49cdc`); the test exposed a real replay-endpoint HTTP-500 leak, which was fixed.
- [x] GDELT-MATCH-01 audit script + test (`scripts/audit-gdelt-corpus.ts` + `server/__tests__/scripts/audit-gdelt-corpus.test.ts`). Created (38-03, commits `ff940c0`/`9ba5261`).
- [x] GDELT-MATCH-03 corroboration-gate unit test (`server/__tests__/lib/corroboration.test.ts`). Created (38-06, commits `197c3be`/`2fb6c80`).
- [x] WATER-LATIN-01 audit script (`scripts/audit-water-names.ts` + test). Created (38-04, commit `59e16e8`).
- [x] Fix `src/__tests__/lib/actorCatalog.test.ts` stale fixture path (CI-green). Repointed to v1.5-phases archive (38-01, commit `3c3f418`).
- [x] `npm audit fix` for `qs` (+ `brace-expansion`) moderate (CI-green). 0 moderate-or-higher (38-01, commit `3c3f418`).
- [x] Verify `server/__tests__/routes/water.test.ts` covers the LLM-FIX-02 sentinel path. Sentinel-write + sentinel-tolerate assertions added (38-01, commit `3af2f42`).

---

## Manual-Only Verifications

| Behavior                                                 | Requirement       | Why Manual                                                                                                        | Test Instructions / Status                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs assert Pro semantics; no stale Hobby/timeout claims | VERCEL-PRO-04     | Doc-content assertion, not runtime behavior                                                                       | ✅ `grep -rEn "Hobby\|10.second\|60s ceiling\|3 cron"` over the 5 in-scope surfaces returns 0 LIVE claims (correctly-framed "Hobby-era … Pro 800s" historical context and immutable ADR-0002 are out of scope) |
| vercel.json→vercel.ts migration deferred                 | VERCEL-PRO-01     | Defer-with-rationale decision, not runtime behavior                                                               | ✅ Recorded in `deployment.md:177-190` (net-zero simplification; revisit v1.7)                                                                                                                                 |
| Build Output API migration deferred                      | VERCEL-PRO-02     | Defer-with-rationale decision, not runtime behavior                                                               | ✅ Recorded in `deployment.md:177-190` (risks maxDuration/includeFiles/rewrites; Phase 999.2 open)                                                                                                             |
| Vercel CLI bumped 52 → 54.9.0                            | VERCEL-PRO-04     | Dev-tool version, not in test scope                                                                               | ✅ `vercel --version` reports 54.9.0 (dev-machine global, not a package.json dep)                                                                                                                              |
| WATER-LATIN transliteration quality acceptance           | WATER-LATIN-01/02 | Subjective "searchable Latin token that admits the facility" bar (abjad vowel-less ceiling — RESEARCH D-08 reset) | ✅ `romanize.test.ts` asserts the machine bar (isLatin / no `@` / ≥2 chars) on the RESEARCH sample table; human transliteration-prettiness is out of scope by D-08                                             |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (all Wave 0 resolved)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (all resolved during execution)
- [x] No watch-mode flags
- [x] Feedback latency < 60s (touched-file + typecheck loop)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated — 2026-06-04 (no gaps; 27/27 requirements COVERED by automated verification or recorded manual gate)

---

## Validation Audit 2026-06-04

State A audit of the planning-draft VALIDATION.md against the executed phase (6 plans, commits through `05bf712`). The draft's Per-Task Map was `_TBD_` and all Wave 0 items were open at draft time; this audit reconciled both to the shipped reality and re-ran every verification command live.

| Metric                               | Count |
| ------------------------------------ | ----- |
| Requirements audited                 | 27    |
| COVERED (automated test, runs green) | 22    |
| Manual gate (verified, non-runtime)  | 5     |
| PARTIAL                              | 0     |
| MISSING                              | 0     |
| Gaps found                           | 0     |
| Resolved (this audit)                | 0     |
| Escalated to manual-only             | 0     |

**Audit evidence (re-run 2026-06-04):**

- 14 phase-38 server test files → 339 passed; 2 phase-38 frontend test files → 14 passed (353 total, all green).
- `npm run typecheck` → PASS (type-coverage 97.66%, above 97 floor) — the LLM-PURGE deletion-correctness gate.
- Deletion grep-gates: `enrichedEventV1/V2/batchResponseV2` exports = 0; `incrOpenRouterDaily/getOpenRouterDaily` live = 0; `CEREBRAS/GROQ` live in config.ts = 0 (tombstone comment only); `appendPipelineAudit/PipelineFlipsBlock` live = 0; `llmEventExtractor.ts` + `pipelineAudit.ts` deleted.
- VERCEL-PRO-04: 5 in-scope surfaces clean; broader doc matches are correctly-framed "Hobby-era … Pro 800s" historical context, the immutable ADR-0002 decision record (out of scope), or a factual "3 cron handlers" statement.

**Outcome:** Phase 38 is Nyquist-compliant. No auditor spawn was required (Step 3: no gaps).
