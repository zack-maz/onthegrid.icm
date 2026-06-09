# Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup - Research

**Researched:** 2026-06-04
**Domain:** Node/TypeScript serverless backend cleanup (LLM pipeline, GDELT corpus quality, romanization, Vercel Pro reconciliation)
**Confidence:** HIGH (live-code verified; all file:line targets confirmed against current `main` working tree)

## Summary

This phase is a 5-strand reliability/quality/cleanup pass with **zero new capabilities**. The CONTEXT (D-01..D-09) already locks every fork; research's job was to (a) verify the live-code state of every punch-list target before the planner writes no-op deletions, (b) fill the operator-deferred open evaluations (WATER-LATIN library quality, GDELT dedup/corroboration design, VERCEL-PRO migration ship/defer), and (c) surface implementation landmines.

**Live-state headline:** Every LLM-PURGE and LLM-FIX target is confirmed STILL PRESENT in current code — none have silently resolved. The `actorCatalog.test.ts` suite is **currently RED on `main`** (1 failed suite of 188; stale planning-fixture path after the Phase 33 dir was archived to `.planning/milestones/v1.5-phases/`). The 2026-04-22 CI-health snapshot's "32 filter-test failures" and "v1 extractor references" are **resolved** — only 1 real failure remains (`2362 passed | 1 failed suite`). `npm audit` is 1 moderate (`qs` DoS, `npm audit fix`-able). Typecheck PASSES. The Phase-30 "eval fixtures not bundled" blocker is **already fixed** (build copies fixtures to `api/_eval/`).

**The two highest-value research findings that change the plan:**

1. **WATER-LATIN:** The locked `transliteration` package produces **vowel-less consonant-skeleton + ASCII-artifact output** for Arabic/Persian/Hebrew (empirically: بغداد→`bGdd`, تهران→`thrn`, תל אביב→`tl byb`). This is expected — abjad scripts don't encode short vowels as code points, so NO pure-JS library can vowelize them. The realistic D-08 acceptance bar must be **"machine-searchable Latin token that admits the facility past the gate,"** NOT "pretty human name." With cleanup overrides (strip `@`/uppercase-emphatic artifacts) `transliteration` clears that bar. ICU would not meaningfully beat it (same vowel-less ceiling) at far higher serverless cost — **recommend keep `transliteration`, lower the bar to honest "searchable token."**
2. **VERCEL-PRO:** `vercel.json` has **no `headers` block** (CONTEXT's "rewrites, headers, crons" overstates it — it's crons + rewrites + functions only). `@vercel/config@0.5.1` exists. `vercel-entry.ts` already documents Fluid-Compute compatibility. **Recommend DEFER VERCEL-PRO-01 and VERCEL-PRO-02** — no config-drift handlers exist to delete (no net simplification), and the git-tracked-artifact discipline issue is real but Build Output API is a deploy-path risk mid-cleanup. Ship the safe work (PRO-03/04).

**Primary recommendation:** Decompose into 5 strand-aligned plans + 1 CI-green companion (foldable into LLM-FIX per Claude's discretion). Sequence GDELT-MATCH-01 audit as a hard gate before 02-04. Lower the WATER-LATIN acceptance bar to "searchable token." Defer both VERCEL-PRO migrations with recorded rationale.

## Architectural Responsibility Map

| Capability                                           | Primary Tier          | Secondary Tier                                 | Rationale                                                  |
| ---------------------------------------------------- | --------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Health-probe token honesty (LLM-FIX-01)              | API / Backend         | —                                              | `server/routes/health.ts` probe layer; pure server concern |
| Open-Meteo cache-write policy (LLM-FIX-02)           | API / Backend         | Database/Storage (Redis)                       | `water.ts` route + Upstash cache write                     |
| Eval scorer honesty (LLM-FIX-03)                     | API / Backend         | —                                              | `llmEvalHarness.ts` cron/eval lib                          |
| Chaos test coverage (LLM-FIX-04/05)                  | API / Backend (test)  | —                                              | resilience test harness, server tier                       |
| events.test mock drift (LLM-FIX-06)                  | API / Backend (test)  | —                                              | route test                                                 |
| Dead-code deletion (LLM-PURGE-01..09)                | API / Backend         | Browser/Client (PURGE-05 `PipelineFlipsBlock`) | mostly server libs; one frontend block deletion            |
| GDELT dedup before enrichment (GDELT-MATCH-02)       | API / Backend         | —                                              | `eventGrouping.ts` pre-LLM stage                           |
| Corroboration + composite rerank (GDELT-MATCH-03/04) | API / Backend         | Browser/Client (dashboard ordering)            | server computes additive score; client reads ordering      |
| Romanization (WATER-LATIN-01..03)                    | API / Backend         | —                                              | `overpass-water.ts` adapter, fetch-time                    |
| `nameLatin` display (WATER-LATIN-04)                 | Browser/Client        | API / Backend (field source)                   | React detail/tooltip/search consumers                      |
| Vercel config + Fluid Compute (VERCEL-PRO)           | CDN / Static (config) | API / Backend (`createApp`)                    | `vercel.json` + serverless entry                           |

## Standard Stack

### Core (new dependency this phase)

| Library           | Version | Purpose                                               | Why Standard                                                                                                                |
| ----------------- | ------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `transliteration` | 2.6.1   | Romanize non-Latin water-facility names (WATER-LATIN) | Locked by D-08. Zero deps, serverless-safe, 494 dependents, maintained (last publish 2026-01-20) `[VERIFIED: npm registry]` |

### Supporting / dev-tool

| Library          | Version         | Purpose                                                                   | When to Use                                                                                                |
| ---------------- | --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `vercel` CLI     | 54.9.0 (latest) | Dev-env CLI bump 52→latest (VERCEL-PRO-04)                                | Global/dev tool, NOT a package.json dep `[VERIFIED: npm registry]`                                         |
| `@vercel/config` | 0.5.1           | Typed `vercel.ts` config — **EVALUATED, recommend DEFER** (VERCEL-PRO-01) | Only if migration shows net simplification (it doesn't — see VERCEL-PRO strand) `[VERIFIED: npm registry]` |

### Alternatives Considered (WATER-LATIN library)

| Instead of        | Could Use                      | Tradeoff                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transliteration` | `@sindresorhus/transliterate`  | Cleaner Arabic ASCII (بغداد→`bghdad` vs `bGdd`, no uppercase artifacts) BUT **zero Hebrew coverage** (passes Hebrew through untouched). Would need a 2nd lib for Hebrew. `[VERIFIED: tested in /tmp/translit-test session]`                     |
| `transliteration` | `hebrew-transliteration` 2.9.1 | Hebrew-only (תל אביב→`tl ʾbyb`); still vowel-less + emits `ʾ` (aleph). Would be a per-script supplement, not a replacement. `[VERIFIED: tested]`                                                                                                |
| `transliteration` | ICU / `full-icu`               | D-08 fallback-only. Same vowel-less ceiling for abjad scripts (ICU `Any-Latin` is also code-point-based for unvocalized text) at native-binary serverless cost. **No quality win to justify the weight.** `[ASSUMED — not tested this session]` |

**Installation:**

```bash
npm install transliteration@2.6.1
# Dev environment only (NOT package.json): npm install -g vercel@latest
```

## Package Legitimacy Audit

> slopcheck was UNAVAILABLE this session (pip install failed in sandbox). Per protocol, packages are tagged `[ASSUMED]` and the planner should gate the `transliteration` install behind a `checkpoint:human-verify` task. Manual legitimacy verification was performed in lieu of slopcheck and is documented below — all signals are strongly positive.

| Package           | Registry | Age                                      | Downloads                     | Source Repo                                       | slopcheck   | Disposition                                                                |
| ----------------- | -------- | ---------------------------------------- | ----------------------------- | ------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `transliteration` | npm      | mature (v2.6.1, last publish 2026-01-20) | 494 dependent projects (high) | github.com/yf-hk/transliteration (HTTP 200, live) | unavailable | Approved — manual-verified, no postinstall, zero deps, maintainer `erichu` |
| `@vercel/config`  | npm      | v0.5.1                                   | (Vercel-official scope)       | vercel/vercel monorepo                            | unavailable | DEFERRED (not installing — eval says defer)                                |

**Manual verification (in lieu of slopcheck):** `transliteration` — `npm view scripts.postinstall` = empty (no install hook); `dependencies` = `{}` (zero transitive surface); GitHub repo returns HTTP 200; established maintainer; widely depended-upon. No slopsquat / cross-ecosystem signals. **Planner: still add a `checkpoint:human-verify` before `npm install` per graceful-degradation rule.**

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Strand 1 — LLM-FIX (honest signals)

**Theme (unifying):** every fix makes a probe/audit/eval signal mean what it says.

### LLM-FIX-01 — `lastErrorReason` token split

**Live state VERIFIED.** Both sites now emit the SAME token `llm-optional-fallback-active:` — but the line at `server/routes/health.ts:170` is inside the **generic** `probeCacheKey(name, key, fallbackHealthyKey?)` helper (defined line ~135), which is called by BOTH:

- `llmEvents` probe (line ~413, `fallbackHealthyKey: SOURCE_KEYS.events` i.e. `events:gdelt`) — LLM case, token is honest.
- `news` probe (line ~426, `fallbackHealthyKey: NEWS_RSS_ONLY_KEY`) — **NEWS case, token is a LIE** (says "llm-optional" for an RSS fallback).

The dedicated LLM-only path at `health.ts:284` ("refresh-events cron fresh, llm:lastProgress empty") legitimately keeps `llm-optional-fallback-active:`.

**Recommended approach:** Make `probeCacheKey` emit the **generic** `cache-fallback-active:` token, and pass a per-probe `fallbackReasonToken` (or branch on `name === 'llmEvents'`) so only `llmEvents` keeps `llm-optional-fallback-active:`. The `:284` LLM-only path is untouched.
**Test fix:** `health.test.ts:314` asserts `/llm-optional/` (llmEvents — keep). `health.test.ts:368` asserts `/fallback-active/` for **news** — tighten to `/cache-fallback-active/` (the regex `/fallback-active/` currently matches the LLM token accidentally — that's the "passes for wrong reason" bug). CONTEXT cites `:314,:368` as the update sites — confirmed correct.
**Landmine:** the CONTEXT/REQUIREMENTS text says `:170` is _currently_ the generic `cache-fallback-active:` token — **that is stale**; live code has `llm-optional-fallback-active:` at `:170`. The fix DIRECTION is unchanged (split the tokens) but the planner must not assume `:170` already says `cache-fallback-active:`.

### LLM-FIX-02 — Open-Meteo empty-result cache policy

**Live state VERIFIED.** `server/routes/water.ts:357-360`:

```ts
// Only cache non-empty results — empty means all batches failed
if (precipData.length > 0) {
  await cacheSetSafe(PRECIP_KEY, precipData, WATER_PRECIP_REDIS_TTL_SEC);
}
```

On total batch failure nothing is written → cache stays cold → audit reads cold → tier degraded→unknown (the Phase 37 audit failure).
**Recommended approach (D-05 sentinel — shape is planner discretion):** On `precipData.length === 0`, write a distinguishable sentinel so the audit sees a FRESH write but the failure stays detectable. Suggested shape (matches the `CacheEntry<T>` `{data, fetchedAt}` convention in `server/cache/redis.ts`):

```ts
// suggested — final shape is planner's call
await cacheSetSafe(
  PRECIP_KEY,
  { data: [], failed: true, fetchedAt: Date.now() },
  WATER_PRECIP_REDIS_TTL_SEC,
);
```

**Landmine:** `PRECIP_KEY` (`water:precip`) is read by `findNearestPrecip` (consumer) and by the health probe. The sentinel must (a) deserialize cleanly for `findNearestPrecip` (empty `data: []` → no precip overlay, acceptable), and (b) carry a fresh `fetchedAt`/`lastFresh` so the probe sees freshness. Verify the reader tolerates `data: []` without throwing. A genuinely-empty _successful_ result and a _failed_ result both produce `[]` data — `failed: true` is the only discriminator; the probe should treat a fresh sentinel as "degraded but not unknown," not "healthy."

### LLM-FIX-03 — `actorMatchRate` null-not-0 + `33-AUDIT-REPORT.md` note

**Live state VERIFIED.** `server/lib/llmEvalHarness.ts:388`:

```ts
const actorMatchRate = actorTotal === 0 ? 0 : actorMatched / actorTotal;
```

When ground-truth has no `expectedActor1`, `actorTotal === 0` → silent `0` → misread as "0% actor accuracy." The `EvalScore` type at `:154` declares `actorMatchRate: number`.
**Recommended approach (D-06):** Change the type to `actorMatchRate: number | null` and return `null` (NOT `0`) when `actorTotal === 0`. Audit it the `try/catch` fallback at `:386` currently also falls back to `0` ("falling back to 0") — leave that as `0` (a real computation failure ≠ "no ground truth") OR distinguish; planner's call, but the `actorTotal===0` branch is the honest-signal target. Then replace the TBD stub in `33-AUDIT-REPORT.md` with an explicit "not yet populated — requires staging run (deferred to v1.7)" note.
**Landmines:**

- `EvalScore.actorMatchRate` is consumed downstream — `llmProgress.ts:123,296` already type it `actorMatchRate?: number`. Widening to `number | null` will ripple through `buildSummary`, the eval-baseline Redis write (`events:llm-eval-baseline:v3`), and `health.test`/`llmEvalHarness.test`. Existing test `llmEvalHarness.test.ts:512,542` asserts `actorMatchRate` is `0` in the no-ground-truth case — those assertions **must flip to `null`**.
- `33-AUDIT-REPORT.md` canonical path is `.planning/milestones/v1.5-phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-AUDIT-REPORT.md` (the Phase 33 dir was archived). Edit THAT file, not a `.planning/phases/33-...` path (which no longer exists outside worktrees).

### LLM-FIX-04 / LLM-FIX-05 — chaos-mock extension + dedicated quota-path test

**Live state VERIFIED.** `server/__tests__/resilience/redis-death.test.ts:188-199` mocks `redis` with only `{ping, get, set, del}` (plus `cacheGet`/`cacheSet`). `redis.incr` (and `sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire`) are NOT mocked → they pass through to `actual` (real Upstash, or undefined). Route coverage list at `:258-265` is the 8 cached GET routes — **`/api/operator-status` is absent.**
**Recommended approach:**

- **LLM-FIX-04:** Extend the mock to add `incr/sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire` as `vi.fn(redisDeath)`. Add `/api/operator-status` to the route coverage list (note: it's Bearer-gated — the chaos test must send the Bearer or assert 401/503, not 500). This proves the "no HTTP 500 under Redis death" guarantee for the ~11 raw-redis call sites (pruneQuota, replayQuota, DLQ, operator audit log, lineage, cost-shadow, dead-URL sample, pipelineAudit — though pipelineAudit's writer is being DELETED by PURGE-05, so drop it from the proof list).
- **LLM-FIX-05:** Add a DEDICATED quota-path chaos test. Root cause (verified via `cacheGetSafe` degrade-open semantics): `pruneQuota.ts:~93` + `replayQuota.ts:~67` call `await redis.incr(key)` with no try/catch, BUT the current test keeps `redis.incr` real, and `cacheGetSafe` returns an empty set and short-circuits the request BEFORE `incr` fires — so the 503 outcome is correct for the WRONG reason. The new test must mock `redis.incr` to throw (now possible via FIX-04's extended mock) and prove the quota endpoints still return 503 (or 200), never 500, when `incr` itself dies.
  **Landmine:** When `incr` becomes mocked-to-throw, code paths that previously relied on a real `incr` (e.g. a passing-through counter) will now exercise the error branch. Verify `pruneQuota`/`replayQuota` actually have NO try/catch around `incr` (REQUIREMENTS asserts this) — if they DO swallow it, the "503 for right reason" assertion needs adjusting. Quick check before planning: `grep -n "redis.incr" server/lib/pruneQuota.ts server/lib/replayQuota.ts` and confirm no enclosing try/catch.

### LLM-FIX-06 — `events.test.ts` v1→v3 mock drift

**Live state VERIFIED.** `server/__tests__/routes/events.test.ts:354, 356, 833` all default `schemaVersion: 'v1'` (deleted Phase 29). Lines:

- `:354` `mockProcessEventGroups.mockResolvedValue({ schemaVersion: 'v1', events: null });`
- `:356` `mockGeocodeEnrichedEvents.mockResolvedValue({ schemaVersion: 'v1', events: [] });`
- `:833` same as `:354`.
  **Recommended approach:** Mechanical `'v1'` → `'v3'`. Confirm the mock shape still matches the post-PURGE-01 `ExtractorRun` (which is `schemaVersion: 'v3'` only — see `llmEventExtractor.ts` stub). Coordinate with PURGE-01: after the stub is deleted/inlined, these mocks must match the v3 return shape of `processEventGroupsV3`.

### Folded CI-health (`phase-27.4.2-ci-health.md`)

**Live CI state VERIFIED against `main` (2026-06-04):**

- `npx vitest run`: **2362 passed | 1 FAILED suite | 19 skipped | 5 todo (188 files)**. The single failure is `src/__tests__/lib/actorCatalog.test.ts` → `ENOENT` on `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/cameo-codes.json`. **Root cause:** the Phase 33 dir was archived to `.planning/milestones/v1.5-phases/33-.../cameo-codes.json`; the test's hard-coded path at `actorCatalog.test.ts:54` was not updated. **Fix:** repoint the `codebookPath` resolve() to the `v1.5-phases` location (or copy the fixture into a stable test-fixtures dir).
- `npm run typecheck` (`tsc -b && type-coverage`): **PASSES** (97.58% type-coverage, success).
- `npm audit`: **1 moderate** — `qs` 6.11.1 DoS (GHSA-q8mj-m7cp-5q26), fix via `npm audit fix`. The 2026-04-22 snapshot's larger vuln set is resolved.
- The 2026-04-22 snapshot's "32 filter-test failures" and "references to deleted `llmEventExtractor.v1.ts`" are **GONE** — do not plan to fix them.
  **Recommendation:** Greening main is two small fixes (actorCatalog path + `qs` bump) — fold into the LLM-FIX test plan per Claude's discretion (D-01). Do NOT scope the stale 2026-04-22 items.

---

## Strand 2 — LLM-PURGE (Phase 29 finishing pass)

**All targets VERIFIED PRESENT in current code — no no-op deletions.** Per-REQ live state:

### LLM-PURGE-01 — delete `llmEventExtractor.ts` stub

**VERIFIED:** `server/lib/llmEventExtractor.ts` exists (95 lines, re-export barrel). Sole live importer: `llmExtractionPipeline.ts:38-42` imports `processEventGroups`, `geocodeEnrichedEvents`, `GeocodedEnrichedEventV3`.
**Approach:** Rewire `llmExtractionPipeline.ts:38-42` to import `processEventGroupsV3` + `geocodeEnrichedEventsV3` directly from `llmEventExtractor.v3.js`. **Landmine:** the stub wraps the v3 functions in a tagged `ExtractorRun`/`GeocoderResult` shape (`{schemaVersion:'v3', events, matchedNewsByGroup, bellingcatByGroup}`). The pipeline consumes that tagged shape. Either (a) inline the wrapper into the pipeline, or (b) call v3 directly and drop the wrapper — but then update the pipeline's consumption (it currently branches on `.schemaVersion`/`.events`). Also `events.test.ts` mocks (`mockProcessEventGroups`) must match the new direct shape — coordinate with LLM-FIX-06.

### LLM-PURGE-02 — delete `llm-provider.ts` `callLLM` shim

**VERIFIED — CONTEXT'S "last importer is llmResolver.ts" IS STALE.** `llmResolver.ts:18` already imports `callLLM` directly from `freeClaudeRouter.js` (Pitfall-3 fix already landed). The shim `server/adapters/llm-provider.ts` exports TWO symbols:

- `callLLM` (legacy adapter) — **NO live importers** (the v1/v2 extractors that used it are already deleted). Safe to delete.
- `isLLMConfigured()` — **STILL imported by `llmExtractionPipeline.ts:32` AND `events.ts:5`.** Must NOT be deleted; relocate or keep.
  **Approach:** Delete only the `callLLM` export + its `routerCallLLM` import + the stale "v1+v2 extractors (deleted in Plan 05+06)" docstring. Keep `isLLMConfigured` (either leave the file as a 1-function module, or relocate `isLLMConfigured` into `freeClaudeRouter.ts`/`config.ts` and repoint the 2 importers). **Do not delete the whole file** — that breaks `llmExtractionPipeline` and `events.ts`.

### LLM-PURGE-03 — rewrite stale headers

**VERIFIED:** `llmEventExtractor.v3.ts:1-15` header claims "NIM → OpenRouter cascade"; `:73-79` references deleted v1/v2; `freeClaudeRouter.ts:1-15` lists `llm-provider.ts:23` as a live caller (becomes stale after PURGE-02). `events.ts:99-107` `RecentEnrichedEvent` v2 projection; `llmExtractionPipeline.ts:11-12` "~95 minutes worst-case at LLM_V3_CONCURRENCY=1".
**Approach:** Docstring-only edits. Coordinate with PURGE-02 (remove the `llm-provider.ts:23` caller line from the `freeClaudeRouter` header) and PURGE-08 (narrow "NIM → OpenRouter" to "NIM primary; OpenRouter dormant-gated").

### LLM-PURGE-04 — collapse `llmSchema.ts`

**VERIFIED:** `enrichedEventV1` (`:62`), `enrichedEventV2` (`:106`), `batchResponseV2` (`:487`) all present; `enrichedEventAny` (`:212`) is a `discriminatedUnion('schemaVersion', [enrichedEventV1, enrichedEventV2, enrichedEventV3])`; stale commentary at `:209` ("v1 retained for D-40 rollback / v2 retained as default LLM_PIPELINE_V2=true").
**Landmine (important):** `enrichedEventV3 = enrichedEventV2.extend({...})` at `:193` — **v3 is DEFINED BY EXTENDING v2.** Deleting `enrichedEventV2` outright will break the v3 definition. The collapse must either inline v2's fields into a standalone `enrichedEventV3`, or keep `enrichedEventV2` as an un-exported base. Do NOT blindly delete the `enrichedEventV2` const. After collapse, `enrichedEventAny` becomes a single-arm passthrough (just `enrichedEventV3`). Verify no production importer of `enrichedEventV1`/`enrichedEventV2`/`batchResponseV2` (grep before deleting their exported types).

### LLM-PURGE-05 — `pipelineAudit` (D-03 Path A full delete)

**VERIFIED:** `server/lib/pipelineAudit.ts:31` `appendPipelineAudit` writer present; `src/components/ui/DevApiStatus.tsx:2841` `PipelineFlipsBlock` defined + rendered at `:3044`; `openapi.yaml:1841` entry. `llmEventExtractor.v3.ts:77` comment references it.
**Approach (Path A):** Delete `appendPipelineAudit` writer; narrow `PipelineFlipEntry` `from/to` union to v3-only (or delete the type if unused after); delete `PipelineFlipsBlock` + its `:3044` render call + the `LLMStatus['pipelineFlips']` field plumbing; delete the `openapi.yaml:1841` entry. The `events:llm-pipeline-audit` Redis key drains on its 90d TTL (~2026-09-01) — no migration. **Landmines:** (1) `listPipelineAudit` reader — check if anything else reads it (`/api/operator-status`?) before deleting both writer and reader. (2) `pipelineFlips` is threaded through `LLMStatus` type → `/llm-status` route → `DevApiStatus` props; remove the whole chain or TypeScript breaks. (3) If LLM-FIX-04 added pipelineAudit to the chaos-proof list, remove it there too.

### LLM-PURGE-06 — Cerebras/Groq env + test references

**VERIFIED:** `config.ts:31-32` (`CEREBRAS_API_KEY`/`GROQ_API_KEY` Zod defaults), `:242,:245` (apiKey wiring). `replayQuota.ts:21` threat-model comment cites "Cerebras free-tier 1M/day".
**Test refs broader than CONTEXT stated:** grep found Cerebras/Groq strings in `llmTokenBudget.test.ts`, `llmCircuitBreaker.test.ts` (the two CONTEXT named) PLUS `llm-provider.test.ts`, `llmEvalHarness.adversarial.test.ts`, `events.test.ts`, `llm-optional.test.ts`, `events.replayQuota.test.ts`, `events.prune.test.ts`, `refresh-events-cron.prune.test.ts`, `events-fallback.test.ts`. **Planner must triage:** many are likely incidental (e.g. a provider-name string in a fixture or an unrelated comment) vs. dead (testing a deleted Cerebras code path). `llm-provider.test.ts` is the highest-risk — it tests the shim being modified in PURGE-02; reconcile together. `llmProgress.test.ts` is verified clean (finding #26 correction). **Re-anchor** `replayQuota.ts:21` from "Cerebras 1M/day" to "nvidia_nim: 1_000_000".
**Landmine:** `config.ts` uses `parseEnv()` Zod fail-fast (Phase 26.3). Deleting the env keys is safe (they have `.default('')`), but anything importing `env.CEREBRAS_API_KEY`/`env.GROQ_API_KEY` will TS-error. Grep `env.CEREBRAS\|env.GROQ` across `server/` first; `config.ts:242,245` wire them into a providers map that may need pruning too.

### LLM-PURGE-07 — Cerebras/Groq adapter source files

**VERIFIED (scout was right):** `server/adapters/` has ZERO Cerebras/Groq references — the adapter source files are **already gone.** LLM-PURGE-07 reduces to a **docs-only edit:** delete the stale `CLAUDE.md` "Cerebras + Groq adapter source files remain importable for emergency rollback today" note. **Do NOT plan a file deletion** — there is no file to delete. (Env-var + test references are PURGE-06's job.)

### LLM-PURGE-08 — OpenRouter dead writer paths (D-04 Path A: gate, don't delete)

**VERIFIED:** `freeClaudeRouter.ts:310` `incrOpenRouterDaily` defined; called at `:464` (`if (p.name === 'openrouter') await incrOpenRouterDaily()`); `:644` snapshot comment. `allProviders` at `:372` includes an `openrouter` entry whose client is `null` when `!env.OPENROUTER_API_KEY` (`:241`); filtered out at `:386` when `skipOpenRouter`. `skipOpenRouter: true` confirmed at **`v3.ts:629` and `:951`** (NOT 622/929 — CONTEXT'S correction is right; CLAUDE.md/ADR-0010 cite the old lines).
**Approach (Path A — gate, don't delete):** Gate the OpenRouter provider entry behind `env.OPENROUTER_API_KEY` presence (it partially is — client is `null` without key, but the entry still appears in `allProviders` and the `incrOpenRouterDaily` call path exists). Remove `incrOpenRouterDaily` + `getOpenRouterDaily` + the unreachable daily-cap writes (`:464`, `:644`). Preserve ADR-0010's "dormant, could wake if key set" semantics — OpenRouter stays a _potential_ provider, just without the dead Redis counter. **Fix the `skipOpenRouter` line-drift citations in CLAUDE.md + ADR-0010** (622/929 → 629/951).
**Landmine:** Confirm `getOpenRouterDaily`/`incrOpenRouterDaily` truly have no other callers (e.g. a `/llm-status` budget read) before deleting. The `llm:tokens:openrouter:YYYY-MM-DD` Redis key drains on its 48h TTL.

### LLM-PURGE-09 — stale `writePartialCache` comments

**VERIFIED:** `llmExtractionPipeline.ts:376` comment claims `writePartialCache` lives in v3 extractor; Phase 35 D-12/SIMPLIFY-02 retired it (corroborated by `v3.ts:119,264,269,436,565,872` tombstone comments). `:98` already has a correct "writePartialCache writer was deleted" comment — so `:376` internally contradicts the module.
**Approach:** Delete/rewrite the `:376-377` comment to match the `:98` truth. Pure comment edit.

**LLM-PURGE wave ordering (dependency-aware):** PURGE-04 (schema) and PURGE-01/02 (extractor/shim) are the structural changes; PURGE-03/06/07/09 are docstring/reference cleanup; PURGE-05 (pipelineAudit) touches frontend + openapi; PURGE-08 touches the router. Suggest: structural deletions first (01, 02, 04), then router gate (08), then UI/audit (05), then pure-text (03, 06, 07, 09). Run `npm run typecheck` after each structural deletion.

---

## Strand 3 — GDELT-MATCH (audit-gated, non-destructive — D-07)

### GDELT-MATCH-01 — Phase-22-style audit (Plan 1, hard gate)

**Reusable precedent VERIFIED:** `server/lib/eventAudit.ts` (`buildAuditRecord`, `PipelineTrace`, `PhaseA/BChecks`, `ConfidenceSubScores`) is the existing audit-record scaffolding. `server/lib/sourceTiers.ts` (`getSourceTier`, `getHighestTier`, tier 1/2/3 domain+name sets) classifies sources. The live corpus is `events:llm:v3` (`LLM_EVENTS_KEY_ACTIVE`).
**Audit methodology (the planner turns this into Plan 1):**

1. Read `events:llm:v3` (`cacheGetSafe<ConflictEventEntity[]>`). For each event, extract source URLs → `getHighestTier()` → bucket **high-confidence (tier 1)** / **neutral (tier 2)** / **low-confidence (tier 3 / null)**.
2. **Orphan detection:** cross-reference each event against `news:gdelt` (GDELT-DOC clusters) — events with no matching DOC cluster (by temporal+geo+keyword) are "orphans" (GDELT-events with no corroborating news).
3. **Duplicate-source detection:** group events by the existing `eventGrouping.ts` key (CAMEO-root + day-bucket + 50km radius — see `groupGdeltRows`); multiple events collapsing to one group = duplicate-source candidates.
4. Output a report (counts per bucket, orphan list, duplicate-cluster sizes) that **sizes** the dedup threshold (02), corroboration tuning (03), and composite weights (04). **This MUST run first and gate 02-04.**
   **Where it runs:** A script (`scripts/`) or a Bearer-gated `/api/operator-status`-style read, reusing `eventAudit.ts` types. Likely a one-shot analysis script against live Redis (mirrors the Phase 22 `run-audit.ts` pattern).

### GDELT-MATCH-02 — mention-collapse dedup BEFORE enrichment

**Injection point VERIFIED:** `server/lib/eventGrouping.ts:groupGdeltRows(entities)` already collapses GDELT rows by **CAMEO-root + same day-bucket + ≤50km (`GROUP_RADIUS_KM`)** into `EventGroup`s — this runs BEFORE LLM enrichment (the pipeline calls `groupGdeltRows` then `processEventGroups`). This IS the natural mention-collapse stage; the existing Jaccard-0.8 dedup is in `newsClustering.ts` (NEWS path, separate).
**Recommended approach (conservative, high-confidence-only per D-07):** Tighten `groupGdeltRows` or add a pre-pass that collapses **only** rows sharing strong signal — recommend a multi-gate AND: (same canonical actor pair) AND (same CAMEO root) AND (same day-bucket) AND (≤ small radius, e.g. 5-10km, tighter than the 50km grouping radius) AND (title/URL token overlap above a high Jaccard, e.g. ≥0.85). Collapsing to one canonical row reduces redundant LLM calls. **Threshold values are planner's discretion, informed by the GDELT-MATCH-01 audit** (D-07). Default to CONSERVATIVE (collapse fewer; a missed dedup is cheaper than a wrongly-merged distinct event).
**Landmine:** `groupGdeltRows` grouping (50km) already merges spatially-near events for enrichment — do NOT confuse "grouping for batch enrichment" (existing, coarse) with "dedup-collapse of true duplicates" (new, tight). The new dedup must run as a distinct, tighter pass and preserve genuinely-distinct events. Reversibility: dedup must be a pre-enrichment filter that drops only collapse-targets, never mutating the raw `events:gdelt` cache.

### GDELT-MATCH-03 — extend Bellingcat three-gate corroboration to OSINT

**Reusable precedent VERIFIED:** `llmResolver.ts:507` `resolveViaBellingcat` (the `bellingcat-coord-passthrough` resolver path) + the Phase-22 three-gate (temporal AND geographic AND keyword) pattern. `news:gdelt` (GDELT-DOC) clusters are the OSINT corroboration source already threaded into the v3 prompt (`llmEventExtractor.v3.ts:107` NEWS BLOCK).
**Recommended approach:** Generalize the three-gate (temporal window AND geographic radius AND keyword/actor overlap) from Bellingcat-specific to any tier-1/2 OSINT source in `news:gdelt`. Apply a **confidence boost** to an event when a genuine 3-gate corroboration exists (a news cluster within the temporal+geo window AND keyword-matched); **withhold** the boost when corroboration is coincidental (only 1-2 gates pass). This feeds GDELT-MATCH-04's composite. Reuse `sourceTiers.getSourceTier` to weight the corroborating source.
**Landmine:** "coincidental" corroboration is the false-positive risk — two unrelated events in the same city on the same day pass temporal+geographic but not keyword. The keyword gate must be strict (actor or specific-action match, not generic "Iran"/"strike"). Tuning is informed by GDELT-MATCH-01.

### GDELT-MATCH-04 — source-tier composite rescore (ADDITIVE, non-mutating)

**Reusable precedent VERIFIED:** `relevanceScorer.ts:computeRelevanceScore` already produces a 0-1 score from NLP-triple (0-0.45) + conflict-verb (0-0.35) + source-reliability (0-0.20, tier-based via `getSourceReliability`). `SOURCE_RELIABILITY` map at `:31`.
**Recommended approach (D-07 additive):** Add a per-event `compositeScore` field = function of **tier** (from `sourceTiers`) × **corroboration** (from GDELT-MATCH-03 boost) × **specificity** (e.g. precision tier `exact/neighborhood/city/region` from the existing v3 schema, and/or NLP-triple completeness). This is an ADDITIVE field on the event object that **re-orders the dashboard top-of-list WITHOUT mutating or dropping the raw corpus** — reversible, low-risk. The dashboard reads `compositeScore` for ordering; the raw `events:llm:v3` corpus is untouched.
**Landmine:** Must not break the existing event Zod schema (`enrichedEventV3`) — add `compositeScore` as an OPTIONAL field (`.optional()`) so old cached events without it still validate. Coordinate with PURGE-04 (the schema collapse) — add the field to the collapsed v3 schema.

**GDELT-MATCH dependency wave:** 01 (audit) → gates → 02 (dedup) + 03 (corroboration) → 04 (composite reads 03's boost). 01 is a hard prerequisite.

---

## Strand 4 — WATER-LATIN (romanization — D-08)

### WATER-LATIN-01 — audit non-Latin facility names

**Live state:** The admission gate is `overpass-water.ts:836`: `if (facilityType !== 'desalination' && !hasLatinLabel(tags))` → rejects with `no_resolved_name` bucket. `hasLatinLabel` (`:208`) requires `name:en`/`name`/`operator` to pass `isLatin` (`:397`, `/^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u`) AND not match `GENERIC_OSM_NAME_RE` (`:206`, bare "dam"/"reservoir"/"desalination"). A facility whose only name is Arabic/Persian/Hebrew gets dropped.
**Audit approach:** Read `water:facilities:v3` cache (or re-run the Overpass fetch) and count: total elements, count rejected by `hasLatinLabel`, samples per script (test `isLatin` false + classify by Unicode block: Arabic `؀-ۿ`, Hebrew `֐-׿`). The existing rejection-bucket telemetry (`no_resolved_name`) surfaces in `DevApiStatus` — quantify from there.

### WATER-LATIN-02 — library evaluation (HIGHEST RESEARCH VALUE — D-08 quality gate)

**EMPIRICALLY TESTED this session** (`/tmp/translit-test`, `transliteration@2.6.1`):

| Original (script)                      | `transliteration` output | Verdict                                  |
| -------------------------------------- | ------------------------ | ---------------------------------------- |
| بغداد (Arabic, Baghdad)                | `bGdd`                   | vowel-less + uppercase emphatic artifact |
| سد الموصل (Arabic, Mosul Dam)          | `sd lmwSl`               | vowel-less, `S`=ص artifact               |
| محطة تحلية (Arabic, desal plant)       | `mHT@ tHly@`             | `@`=ة artifact, `H`=ح, `T`=ط             |
| تهران (Persian, Tehran)                | `thrn`                   | vowel-less (correct consonants)          |
| سد کرج (Persian, Karaj Dam)            | `sd khrj`                | vowel-less; `kh`=ک                       |
| مאگר כנרת (Hebrew, Kinneret reservoir) | `mgr knrt`               | vowel-less                               |
| תל אביב (Hebrew, Tel Aviv)             | `tl byb`                 | vowel-less                               |

**Root-cause finding (HIGH confidence):** `transliteration` uses **1-to-1 Unicode code-point mapping** (unidecode-family). Arabic/Persian/Hebrew are **abjads** — short vowels are not encoded as code points — so ANY code-point-based romanizer (including ICU `Any-Latin` for unvocalized text) produces consonant skeletons. This is a property of the script, not a library defect. `[CITED: github.com/yf-hk/transliteration — "1-to-1 Unicode code point mapping... inherent limitations with context-dependent characters"]`

**Comparison (tested):**

- `@sindresorhus/transliterate`: Arabic slightly cleaner (`bghdad` no uppercase artifacts) but **zero Hebrew coverage** (passes Hebrew through unchanged).
- `hebrew-transliteration@2.9.1`: Hebrew-aware (`tl ʾbyb`) but still vowel-less + emits `ʾ`.
- ICU: same vowel-less ceiling, native-binary serverless cost.

**RECOMMENDATION (ship/keep `transliteration` — but RESET the acceptance bar):**
The realistic, honest D-08 acceptance bar is **"a machine-searchable Latin token that admits the facility past the gate and is greppable in the search bar,"** NOT "a human-pretty romanization." `transliteration` clears that bar IF the planner adds a small post-process override pass:

1. Strip/normalize the ASCII artifacts: map `@`→`a`/drop, lowercase the emphatic uppercase (`S/H/T/D/Z`→`s/h/t/d/z`), collapse repeated separators.
2. If output is empty or < 2 chars after cleanup (pure-diacritic input), fall back to the original `name` + a country/type qualifier so the gate still admits via the `operator`/city path.
3. Apply title-case (existing `toTitleCase` at `:404`) for display.
   **Per-script overrides:** likely needed for (a) Hebrew final-form letters, (b) Persian-specific letters (گ/پ/چ/ژ — `transliteration` handles these as `g/p/ch/zh`, acceptable), (c) Arabic ة (currently `@` — must override to `a`/`ah`). Add overrides ONLY where the audit-sample shows the gate still rejects.
   **ICU fallback:** D-08 says ICU only if `transliteration` fails the bar. With the bar correctly set to "searchable token," `transliteration` + artifact-cleanup PASSES — **do not adopt ICU** (no quality win, native-binary serverless risk). Record this as the D-08 evaluation outcome.

### WATER-LATIN-03 — adapter injection

**Injection point VERIFIED:** `overpass-water.ts`, BEFORE the `hasLatinLabel` gate at `:836`. Romanize `tags['name']` (when non-Latin and no Latin `name:en`) into a synthetic Latin string, inject it so `hasLatinLabel` admits, AND populate a new `nameLatin` field on the facility. Preserve original `name` (the `WaterFacility` type uses `label` for display — `server/types.ts:205`).
**Type change:** Add `nameLatin?: string` to `WaterFacility` (`server/types.ts:205`). The facility is built at `:928` (`label: extractLabel(...)`). Romanization should feed `extractLabel` or run alongside it so the admitted facility carries both the original (in `label`/a preserved field) and `nameLatin`.
**Landmine:** The gate uses `name:en`/`name`/`operator`. If you romanize `name` into a synthetic Latin value and pass THAT to `hasLatinLabel`, ensure `GENERIC_OSM_NAME_RE` doesn't reject it (a romanized "سد" → "sd" is fine; but a facility named only "سد"/"Dam" should still be filtered as generic — preserve that filter). Desalination already bypasses `hasLatinLabel` (D-03 exemption) — don't double-process it.

### WATER-LATIN-04 — consumer surfaces

**Consumers VERIFIED:** `src/components/detail/WaterFacilityDetail.tsx`, `src/components/map/EntityTooltip.tsx`, `src/components/map/layers/WaterOverlay.tsx`, search bar, proximity alerts. `WaterFacilityDetail.gateSwap.test.tsx` exists (regression anchor).
**Approach:** Display `nameLatin` when set, with the original `name`/`label` available on hover or as a sub-label (D-08). Update the search bar to index `nameLatin` (so operators can type the romanized name). Update proximity-alert label rendering.
**Landmine:** `WaterFacilityDetail.gateSwap.test.tsx` and `src/lib/__tests__/waterLabel.test.ts` (`makeFacility` helper) will need `nameLatin` in their fixtures — extend `makeFacility` and add render-contract assertions.

---

## Strand 5 — VERCEL-PRO (reconciliation — D-09)

### VERCEL-PRO-01 — `vercel.json` → `vercel.ts` (`@vercel/config`) **→ RECOMMEND DEFER**

**Live state VERIFIED:** `vercel.json` contains `$schema`, `framework: vite`, `crons` (3), `rewrites` (4), `functions.api/vercel-entry.js` (`maxDuration: 800`, `includeFiles: api/_eval/*.json`). **There is NO `headers` block** (CONTEXT's "rewrites, headers, crons" is inaccurate). `@vercel/config@0.5.1` exists on the registry. `@vercel/config` is NOT installed.
**Evaluation:** D-09 says "ship if it lets us delete config drift handlers; defer if no net simplification." **There are no config-drift handlers to delete** — the current `vercel.json` is a static, schema-validated JSON file with no runtime drift logic. Migrating to typed `vercel.ts` adds a build step (TS→config), a new dependency, and deploy-path risk, for the sole benefit of type-checking a 20-line JSON file that's already `$schema`-validated by the editor.
**RECOMMENDATION: DEFER.** Rationale: net-zero simplification, adds a dependency + build complexity, touches the production deploy path mid-cleanup (the exact risk D-09 warns against). Record this rationale; Phase 999.2 framing is unaffected (that's PRO-02). `[VERIFIED: vercel.json read; @vercel/config existence confirmed via npm view]`

### VERCEL-PRO-02 — Build Output API for `api/vercel-entry.js` **→ RECOMMEND DEFER**

**Live state VERIFIED:** The build (`package.json:13`) runs `tsup server/vercel-entry.ts → api/vercel-entry.js` and the ~1.7MB artifact is git-tracked (Phase 999.2 discipline issue). Build Output API (`.vercel/output/`) would let the artifact be build-generated instead of tracked.
**Evaluation:** The git-tracked-artifact problem is REAL, but migrating to Build Output API is a **fundamental change to how the function is deployed** (`.vercel/output/functions/*.func` + `config.json` instead of the `functions` key in `vercel.json` + rewrites). It risks the production deploy path (the 800s `maxDuration`, the `includeFiles` eval-fixture copy, the rewrite map) for a discipline cleanup. D-09 default is defer-unless-clear-win; this is not a clear win mid-cleanup.
**RECOMMENDATION: DEFER.** A lower-risk alternative to the git-tracked-artifact issue: add `api/vercel-entry.js` to `.gitignore` and rely on the Vercel build to regenerate it (the build already produces it) — but even that should be its own validated change, not bundled into Phase 38. Phase 999.2 stays open. Record rationale. `[VERIFIED: build script + vercel.json read]`

### VERCEL-PRO-03 — Fluid Compute compatibility on `createApp()` **→ SHIP (likely no-op)**

**Live state VERIFIED:** `createApp` lives in `server/index.ts` (NOT `server/app.ts` — CONTEXT's path is slightly off). The Vercel entry is `server/vercel-entry.ts`, which already documents Fluid-Compute posture:

```
// Vercel handles its own SIGTERM (500ms window) — no custom shutdown handler needed.
// Upstash Redis is REST-based, so there are no persistent connections to drain.
```

It memoizes `app = createApp()` at module load (request reuse across warm invocations) and surfaces init errors as 500s.
**Evaluation:** Fluid Compute defaults (request reuse, in-function concurrency, no graceful-shutdown requirement for stateless REST) are ALREADY satisfied — Upstash is REST (no connection pool to drain), the app is memoized, no global mutable per-request state leaks (verify: the in-memory `callHistory`/`llmProgress` singletons are intentionally process-scoped and already have Redis write-through per Phase 28.2.7). **Likely a no-op + documentation confirmation.**
**RECOMMENDATION: SHIP** (verify-and-document). Action: confirm no per-request global mutation hazard under concurrency (Fluid Compute runs multiple requests per instance); document the compat verdict in deployment.md. `[VERIFIED: vercel-entry.ts + createApp location]`

### VERCEL-PRO-04 — Hobby→Pro docs-drift repair + CLI bump **→ SHIP**

**Live state VERIFIED:** Vercel CLI installed locally is **52.0.0**; latest is **54.9.0**. Docs-drift targets (per CONTEXT/REQUIREMENTS — verify each at edit time):

- `CLAUDE.md:101` "Hobby cap 3 entries" (the cron-schedule line) → Pro allows 40 cron entries.
- `docs/architecture/deployment.md:56` "Hobby tier's 60s ceiling", `:133` "caps at 3 cron entries".
- `docs/runbook.md:539-547` "10-second limit".
- `docs/degradation.md:329` "Vercel function 10s timeout".
- `docs/architecture/llm-pipeline-reliability.md:6` header (the `[VERIFIED]` doc says "NIM + OpenRouter cascade on Vercel Pro's 800s" at `:7` but `:6` framing / `:134` NIM-only inconsistency — reconcile to "Pro 800s, NIM-primary").
  **RECOMMENDATION: SHIP.** Pure docs edits + `npm install -g vercel@54.9.0` in dev env (NOT a package.json change). **Platform reality to fold in** (per harness + verified): Pro `maxDuration` ceiling 800s (in use), default function timeout now 300s (Fluid Compute era), cron cap 40 (not 3), Fluid Compute is the default, `vercel.ts` is the _recommended_ config approach (but we're deferring it — note in docs that we evaluated and deferred). `[VERIFIED: vercel CLI 52.0.0 local, 54.9.0 latest]`

---

## Don't Hand-Roll

| Problem                          | Don't Build             | Use Instead                                                               | Why                                                                                                                                       |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Romanizing Arabic/Persian/Hebrew | A hand-written char map | `transliteration` + small override pass                                   | The lib already ships the full Unicode→ASCII table; hand-rolling re-derives 1000s of mappings and still hits the abjad vowel-less ceiling |
| GDELT mention-collapse           | A new clustering engine | Extend `eventGrouping.ts:groupGdeltRows` (CAMEO+day+radius already there) | The spatial-temporal grouping primitive exists and runs pre-enrichment                                                                    |
| Source-tier scoring              | A new scorer            | Extend `relevanceScorer.ts` + `sourceTiers.ts`                            | Tier multipliers + reliability map already built and tested                                                                               |
| Corroboration gate               | A new matcher           | Generalize the Phase-22 Bellingcat three-gate                             | Pattern + `resolveViaBellingcat` already exist                                                                                            |
| Audit record shape               | A new schema            | Reuse `eventAudit.ts` `buildAuditRecord`/`PipelineTrace`                  | Phase-22 audit scaffolding is in the repo                                                                                                 |

**Key insight:** Phase 38 is overwhelmingly _extension and deletion_ of existing primitives, not greenfield. Every GDELT-MATCH and WATER-LATIN target has an in-repo precedent. The risk is breaking existing behavior, not building new behavior.

## Runtime State Inventory

> This phase includes deletions (LLM-PURGE) that touch Redis keys + cached corpus. Runtime-state audit:

| Category            | Items Found                                                                                                                                                                                                                                                                                                                                                                                                                                               | Action Required                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Stored data         | `events:llm-pipeline-audit` (90d TTL, PURGE-05 deletes writer) — drains naturally ~2026-09-01, no migration. `llm:tokens:openrouter:YYYY-MM-DD` (48h TTL, PURGE-08 removes writer) — drains naturally. `events:llm:v3` corpus (GDELT-MATCH-04 adds OPTIONAL `compositeScore` — old entries without it must still validate). `water:facilities:v3` (WATER-LATIN adds `nameLatin` — old cached entries lack it; 24h TTL self-heals on next Overpass fetch). | Code edits only; no data migration. Make new schema fields `.optional()`.         |
| Live service config | `vercel.json` crons (3) unchanged. No external UI-stored config touched.                                                                                                                                                                                                                                                                                                                                                                                  | None                                                                              |
| OS-registered state | None — Vercel-managed. CLI bump is dev-env only.                                                                                                                                                                                                                                                                                                                                                                                                          | `npm install -g vercel@latest` (dev machine)                                      |
| Secrets/env vars    | `CEREBRAS_API_KEY`/`GROQ_API_KEY` deleted from `config.ts` (PURGE-06) — they have `.default('')`, deleting is safe; verify no `env.CEREBRAS_*` reader remains. `OPENROUTER_API_KEY` retained (D-04 gate).                                                                                                                                                                                                                                                 | Grep `env.CEREBRAS\|env.GROQ` before deleting; no deploy-env secret change needed |
| Build artifacts     | `api/vercel-entry.js` git-tracked artifact (PRO-02 evaluated → DEFER, stays tracked). `api/_eval/*.json` eval fixtures copied at build (already working).                                                                                                                                                                                                                                                                                                 | None this phase                                                                   |

**Nothing found requiring data migration** — all new fields are additive/optional; all deleted Redis keys drain on TTL. Verified by key-registry cross-reference (CLAUDE.md Serverless Cache section) + grep.

## Common Pitfalls

### Pitfall 1: Deleting `llm-provider.ts` wholesale breaks the pipeline

**What goes wrong:** PURGE-02 reads as "delete the shim," but `isLLMConfigured` (still imported by `llmExtractionPipeline.ts:32` + `events.ts:5`) lives in that file. Deleting the whole file = compile break.
**How to avoid:** Delete only `callLLM`; keep/relocate `isLLMConfigured`. Grep importers first.

### Pitfall 2: Deleting `enrichedEventV2` breaks `enrichedEventV3`

**What goes wrong:** `enrichedEventV3 = enrichedEventV2.extend({...})` — v3 is built FROM v2.
**How to avoid:** Inline v2's fields into a standalone v3 schema, or keep v2 un-exported as a base. Don't delete the const blindly.

### Pitfall 3: Stale file:line citations across CONTEXT/CLAUDE.md/ADR

**What goes wrong:** Several cited lines have drifted: `health.ts:170` already says `llm-optional` (not generic); `skipOpenRouter` is 629/951 not 622/929; `createApp` is in `index.ts` not `app.ts`; `33-AUDIT-REPORT.md` moved to `v1.5-phases`; `vercel.json` has no `headers` block; PURGE-06 test refs are broader than the 2 named files.
**How to avoid:** Re-grep every file:line at plan-write time. This RESEARCH.md re-verified all of them against the 2026-06-04 working tree — trust THIS doc's line numbers over CONTEXT/CLAUDE.md where they conflict.

### Pitfall 4: WATER-LATIN over-promising romanization quality

**What goes wrong:** Planning toward "pretty human-readable romanization" sets an unachievable bar (abjad vowel-less ceiling) and triggers an unnecessary ICU adoption.
**How to avoid:** Set the D-08 acceptance bar to "searchable Latin token that admits the facility." `transliteration` + artifact-cleanup meets it. Keep `transliteration`, skip ICU.

### Pitfall 5: Chaos test false-negative (the "right answer, wrong reason" trap)

**What goes wrong:** LLM-FIX-05's whole point — `cacheGetSafe` degrade-open short-circuits BEFORE `redis.incr` fires, so the 503 is correct but unproven. Extending the mock without a dedicated `incr`-throws test repeats the trap.
**How to avoid:** The new quota test must mock `redis.incr` to throw and assert no-500. Don't rely on the route-level chaos sweep.

### Pitfall 6: GDELT dedup merging distinct events

**What goes wrong:** Over-aggressive mention-collapse merges two real, distinct events (e.g. two strikes same city same day).
**How to avoid:** Conservative AND-gated threshold (actor + CAMEO + tight radius + high title-Jaccard), informed by GDELT-MATCH-01 audit. Prefer under-collapsing. Keep it pre-enrichment and non-mutating to raw caches.

## Validation Architecture

> nyquist_validation is ENABLED. Existing infra: Vitest (jsdom frontend, node server); chaos tests in `server/__tests__/resilience/`.

### Test Framework

| Property           | Value                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Framework          | Vitest (jsdom for `src/`, node for `server/`)                                                                |
| Config file        | `vite.config.ts` (test.alias mocks for maplibre/deck.gl)                                                     |
| Quick run command  | `npx vitest run <path>` (single file/dir)                                                                    |
| Full suite command | `npx vitest run`                                                                                             |
| Server-only        | `npx vitest run server/`                                                                                     |
| Typecheck          | `npm run typecheck` (`tsc -b && type-coverage`)                                                              |
| Current baseline   | 2362 passed, 1 FAILED suite (`actorCatalog.test.ts` — fix in CI-green), typecheck PASS, 1 moderate npm audit |

### Phase Requirements → Test Map

| Req ID            | Behavior                                                                                      | Test Type           | Automated Command                                                                         | File Exists?                           |
| ----------------- | --------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- |
| LLM-FIX-01        | news fallback emits `cache-fallback-active:`, llmEvents emits `llm-optional-fallback-active:` | unit                | `npx vitest run server/__tests__/routes/health.test.ts`                                   | ✅ (update :314,:368)                  |
| LLM-FIX-02        | empty Open-Meteo result writes fresh sentinel, probe sees degraded-not-unknown                | unit                | `npx vitest run server/__tests__/routes/water`                                            | ⚠️ verify coverage / Wave 0            |
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
| VERCEL-PRO-04     | docs assert Pro semantics (800s/40-cron)                                                      | doc grep / manual   | `grep -rn "Hobby\|10.second\|60s ceiling\|3 cron" docs/ CLAUDE.md` returns 0              | manual                                 |
| CI-green (folded) | full suite green                                                                              | full                | `npx vitest run` exits 0                                                                  | ❌ Wave 0 (fix actorCatalog path + qs) |

### Sampling Rate

- **Per task commit:** `npx vitest run <touched test file>` + `npm run typecheck` (PURGE tasks: typecheck is the primary gate).
- **Per wave merge:** `npx vitest run server/` (server strands) or `npx vitest run` (cross-tier).
- **Phase gate:** full `npx vitest run` GREEN (requires CI-green companion to fix actorCatalog) + `npm run typecheck` + `npm audit` clean before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `server/__tests__/resilience/quota-chaos.test.ts` (or extend redis-death) — covers LLM-FIX-05 (`redis.incr`-throws path)
- [ ] GDELT-MATCH-01 audit script + test (`scripts/audit-gdelt-corpus.ts` or similar)
- [ ] GDELT-MATCH-03 corroboration-gate unit test
- [ ] WATER-LATIN-01 audit script
- [ ] Fix `src/__tests__/lib/actorCatalog.test.ts:54` path (CI-green; → `.planning/milestones/v1.5-phases/...`)
- [ ] `npm audit fix` for `qs` moderate (CI-green)
- [ ] Verify `server/__tests__/routes/water*.test.ts` covers the LLM-FIX-02 sentinel path (may need new assertion)

## Sources

### Primary (HIGH confidence)

- Live working tree `/Users/zackmaz/Desktop/otg-iran-monitor` @ branch `chore/start-v1-6-production-hardening`, 2026-06-04 — all file:line targets grep-verified; full `vitest run` + `typecheck` + `npm audit` executed.
- Empirical library test `/tmp/translit-test` — `transliteration@2.6.1`, `@sindresorhus/transliterate`, `hebrew-transliteration@2.9.1` run against Arabic/Persian/Hebrew samples.
- `.planning/phases/38-.../38-CONTEXT.md` (D-01..D-09); `.planning/REQUIREMENTS.md` §Phase 38; `docs/architecture/llm-pipeline-reliability.md`.

### Secondary (MEDIUM confidence)

- `npm view transliteration / @vercel/config / vercel / unidecode` — registry versions + metadata.
- WebFetch github.com/yf-hk/transliteration — "1-to-1 Unicode code point mapping" limitation statement.

### Tertiary (LOW confidence)

- WebSearch transliteration-library ecosystem survey (cross-checked against empirical test — promoted to HIGH for the claims that matched the test).

## Assumptions Log

| #   | Claim                                                                                           | Section            | Risk if Wrong                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| A1  | ICU `Any-Latin` has the same vowel-less ceiling as `transliteration` for unvocalized abjad text | WATER-LATIN-02     | LOW — if ICU is meaningfully better, D-08 fallback applies; but serverless cost still disfavors it. Not tested this session. |
| A2  | `transliteration` install gated behind `checkpoint:human-verify` (slopcheck unavailable)        | Package Legitimacy | LOW — manual verification was strongly positive (zero deps, no postinstall, live repo, 494 dependents)                       |
| A3  | PURGE-06 incidental Cerebras/Groq test refs are mostly fixture strings, not dead code paths     | LLM-PURGE-06       | MEDIUM — planner must triage each of the ~11 test files; some may be live-coupled (esp. `llm-provider.test.ts`)              |
| A4  | `pruneQuota.ts`/`replayQuota.ts` `redis.incr` truly lack try/catch                              | LLM-FIX-05         | LOW — REQUIREMENTS asserts it; quick grep confirms before planning                                                           |

## Open Questions

1. **Does `listPipelineAudit` (reader) have any consumer besides the deleted `PipelineFlipsBlock`?**
   - What we know: PURGE-05 Path A deletes the writer + UI block. `pipelineAudit.ts:44` `listPipelineAudit` exists.
   - What's unclear: whether `/api/operator-status` or any route reads it.
   - Recommendation: grep `listPipelineAudit` importers before deleting the reader; if only the deleted UI consumed it, delete both.

2. **Exact GDELT dedup/corroboration thresholds** — deferred to GDELT-MATCH-01 audit output (D-07). Planner sets after the audit runs. Default conservative.

3. **Open-Meteo sentinel shape** — planner's discretion (D-05). Recommended `{data:[], failed:true, fetchedAt}` matching `CacheEntry<T>`; verify `findNearestPrecip` tolerates `data:[]`.

## Environment Availability

| Dependency        | Required By                            | Available         | Version                   | Fallback                                           |
| ----------------- | -------------------------------------- | ----------------- | ------------------------- | -------------------------------------------------- |
| Node              | build/test                             | ✓                 | v25.6.1 (pkg pins `>=20`) | —                                                  |
| npm               | install/audit                          | ✓                 | 11.9.0                    | —                                                  |
| Vitest            | all tests                              | ✓                 | (via devDeps)             | —                                                  |
| `transliteration` | WATER-LATIN                            | ✗ (not installed) | 2.6.1 target              | none — must install (gated)                        |
| Vercel CLI (dev)  | VERCEL-PRO-04 bump                     | ✓                 | 52.0.0 (→54.9.0)          | —                                                  |
| `@vercel/config`  | VERCEL-PRO-01 (DEFER)                  | ✗                 | 0.5.1 avail               | n/a — deferred                                     |
| Upstash Redis     | GDELT/WATER audits against live corpus | (remote)          | —                         | run audits against staging or read cached snapshot |

**Missing dependencies with no fallback:** `transliteration` (must `npm install`, gated behind checkpoint).
**Missing dependencies with fallback:** GDELT-MATCH-01 / WATER-LATIN-01 audits need live Redis (`events:llm:v3` / `water:facilities:v3`) — fall back to staging or a captured snapshot if prod Redis access is unavailable during planning.

## Metadata

**Confidence breakdown:**

- LLM-FIX / LLM-PURGE live state: HIGH — every target grep-verified against current working tree; line drifts corrected.
- GDELT-MATCH design: MEDIUM-HIGH — reusable assets verified present; exact thresholds gated on the 01 audit (correctly deferred per D-07).
- WATER-LATIN library: HIGH — empirically tested all candidate libraries on real Arabic/Persian/Hebrew samples; recommendation grounded in observed output.
- VERCEL-PRO: HIGH — `vercel.json`, `vercel-entry.ts`, CLI version, `@vercel/config` existence all verified; ship/defer recommendations grounded in observed config (no headers block, no drift handlers).
- CI state: HIGH — full suite + typecheck + audit run this session.

**Research date:** 2026-06-04
**Valid until:** ~2026-07-04 (stable backend; re-grep file:line if other v1.6 phases land first and move code — Pitfall 3 applies)
