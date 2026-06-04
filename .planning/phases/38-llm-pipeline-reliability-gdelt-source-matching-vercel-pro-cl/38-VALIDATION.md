---
phase: 38
slug: llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `38-RESEARCH.md` §"Validation Architecture". The Per-Task Verification Map is
> populated once plan task IDs exist (post-planning); the Requirement → Test Map below is the
> authoritative source for that population.

---

## Test Infrastructure

| Property                | Value                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**           | Vitest (jsdom for `src/`, node for `server/`)                                                                                                              |
| **Config file**         | `vite.config.ts` (test.alias mocks maplibre-gl + @deck.gl/mapbox for jsdom)                                                                                |
| **Quick run command**   | `npx vitest run <path>` (single file/dir)                                                                                                                  |
| **Full suite command**  | `npx vitest run`                                                                                                                                           |
| **Server-only command** | `npx vitest run server/`                                                                                                                                   |
| **Typecheck**           | `npm run typecheck` (`tsc -b && type-coverage`)                                                                                                            |
| **Estimated runtime**   | ~full suite 2363 tests; server subset much faster                                                                                                          |
| **Current baseline**    | 2362 passed, 1 FAILED suite (`actorCatalog.test.ts` — stale planning-fixture path; fixed by CI-green companion), typecheck PASS, 1 moderate `qs` npm audit |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>` + `npm run typecheck`. For LLM-PURGE tasks, `npm run typecheck` is the PRIMARY gate (deletion correctness = no dangling importers).
- **After every plan wave:** Run `npx vitest run server/` (server strands) or `npx vitest run` (cross-tier waves).
- **Before `/gsd-verify-work`:** Full `npx vitest run` GREEN (requires the CI-green companion to fix the `actorCatalog` path + `qs` audit) + `npm run typecheck` PASS + `npm audit` clean.
- **Max feedback latency:** < ~60s for the touched-file + typecheck loop.

---

## Per-Task Verification Map

> Populated post-planning once task IDs (`38-PP-TT`) exist. Each row is derived from the
> Requirement → Test Map below. The planner MUST give every task an `<acceptance_criteria>`
> with a runnable `npx vitest run …` / `npm run typecheck` / `grep` command.

| Task ID | Plan  | Wave  | Requirement     | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status     |
| ------- | ----- | ----- | --------------- | ---------- | --------------- | --------- | ----------------- | ----------- | ---------- |
| _TBD_   | _TBD_ | _TBD_ | _per map below_ | —          | N/A             | _per map_ | _per map_         | _per map_   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Requirement → Test Map (authoritative; from RESEARCH.md)

| Req ID            | Behavior                                                                                      | Test Type           | Automated Command                                                                         | File Exists?                           |
| ----------------- | --------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| LLM-FIX-01        | news fallback emits `cache-fallback-active:`, llmEvents emits `llm-optional-fallback-active:` | unit                | `npx vitest run server/__tests__/routes/health.test.ts`                                   | ✅ (update :314,:368)                  |
| LLM-FIX-02        | empty Open-Meteo result writes fresh sentinel; probe reads degraded-not-unknown               | unit                | `npx vitest run server/__tests__/routes/water`                                            | ⚠️ verify coverage / Wave 0            |
| LLM-FIX-03        | `actorMatchRate` returns `null` when no ground-truth actors                                   | unit                | `npx vitest run server/__tests__/lib/llmEvalHarness.test.ts`                              | ✅ (flip :512,:542 to null)            |
| LLM-FIX-04        | extended chaos mock; `/api/operator-status` no-500 under Redis death                          | integration (chaos) | `npx vitest run server/__tests__/resilience/redis-death.test.ts`                          | ✅ (extend mock + routes)              |
| LLM-FIX-05        | quota endpoints 503-not-500 when `redis.incr` throws                                          | integration (chaos) | `npx vitest run server/__tests__/resilience/`                                             | ❌ Wave 0 (new dedicated test)         |
| LLM-FIX-06        | events route mocks use `schemaVersion: 'v3'`                                                  | unit                | `npx vitest run server/__tests__/routes/events.test.ts`                                   | ✅ (fix :354,:356,:833)                |
| LLM-PURGE-01..09  | no importer of v1/v2 extractors/schemas/shim/OpenRouter-dead-writers/Cerebras-Groq            | typecheck + grep    | `npm run typecheck` + `grep -rn "enrichedEventV1\|incrOpenRouterDaily\|CEREBRAS" server/` | ✅ typecheck is the gate               |
| LLM-PURGE-05      | `PipelineFlipsBlock` removed; `/llm-status` has no `pipelineFlips`                            | unit + typecheck    | `npx vitest run server/__tests__/routes/` + frontend RTL                                  | ✅                                     |
| GDELT-MATCH-01    | audit script categorizes corpus (high/neutral/low, orphans, dups)                             | smoke (script)      | run audit script against live/staging Redis                                               | ❌ Wave 0 (new script + test)          |
| GDELT-MATCH-02    | dedup collapses high-confidence dups only, preserves distinct                                 | unit                | `npx vitest run server/__tests__/lib/eventGrouping`                                       | ⚠️ extend existing                     |
| GDELT-MATCH-03    | three-gate boost applied only on genuine corroboration                                        | unit                | new test on corroboration fn                                                              | ❌ Wave 0                              |
| GDELT-MATCH-04    | `compositeScore` additive, optional, reorders not mutates                                     | unit                | `npx vitest run server/__tests__/lib/relevanceScorer`                                     | ⚠️ extend existing                     |
| WATER-LATIN-01    | audit counts non-Latin rejections per script                                                  | smoke (script)      | audit script                                                                              | ❌ Wave 0                              |
| WATER-LATIN-02/03 | romanized facility admits past gate; `name` preserved, `nameLatin` set                        | unit                | `npx vitest run server/__tests__/adapters/` + `src/lib/__tests__/waterLabel.test.ts`      | ⚠️ extend (gateSwap test exists)       |
| WATER-LATIN-04    | detail/tooltip/search display `nameLatin`                                                     | RTL                 | `npx vitest run src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx`    | ✅ extend                              |
| VERCEL-PRO-03     | Fluid Compute compat documented; no per-request global hazard                                 | review + smoke      | `npx vitest run server/__tests__/vercel-entry.test.ts`                                    | ✅                                     |
| VERCEL-PRO-04     | docs assert Pro semantics (800s / 40-cron); no stale Hobby claims                             | doc grep / manual   | `grep -rn "Hobby\|10.second\|60s ceiling\|3 cron" docs/ CLAUDE.md` returns 0              | manual                                 |
| CI-green (folded) | full suite green                                                                              | full                | `npx vitest run` exits 0                                                                  | ❌ Wave 0 (fix actorCatalog path + qs) |

---

## Wave 0 Requirements

- [ ] `server/__tests__/resilience/quota-chaos.test.ts` (or extend `redis-death.test.ts`) — covers LLM-FIX-05 (`redis.incr`-throws path; must 503-not-500 for the right reason)
- [ ] GDELT-MATCH-01 audit script + test (`scripts/audit-gdelt-corpus.ts` or similar)
- [ ] GDELT-MATCH-03 corroboration-gate unit test
- [ ] WATER-LATIN-01 audit script
- [ ] Fix `src/__tests__/lib/actorCatalog.test.ts:54` stale fixture path (CI-green; archived to `.planning/milestones/v1.5-phases/…`)
- [ ] `npm audit fix` for `qs` moderate (CI-green)
- [ ] Verify `server/__tests__/routes/water*.test.ts` covers the LLM-FIX-02 sentinel path (may need a new assertion)

_If a strand's behavior is already covered by existing infra, that strand has no Wave 0 entry._

---

## Manual-Only Verifications

| Behavior                                                 | Requirement       | Why Manual                                                                                                            | Test Instructions                                                                                                                                 |
| -------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs assert Pro semantics; no stale Hobby/timeout claims | VERCEL-PRO-04     | Doc-content assertion, not runtime behavior                                                                           | `grep -rn "Hobby\|10.second\|60s ceiling\|3 cron" docs/ CLAUDE.md` returns 0 matches (allow only historical/archival mentions explicitly labeled) |
| Vercel CLI bumped 52 → latest (54.9.0)                   | VERCEL-PRO-04     | Dev-tool version, not in test scope                                                                                   | Confirm `vercel --version` / package devDependency reflects latest                                                                                |
| WATER-LATIN transliteration quality acceptance           | WATER-LATIN-01/02 | Subjective "searchable Latin token that admits the facility" bar (abjad vowel-less ceiling — see RESEARCH D-08 reset) | Audit-sample review against the reset acceptance bar; per-script override list                                                                    |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
