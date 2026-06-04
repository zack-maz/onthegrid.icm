# Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** ~30 (mostly MODIFY; 4 NEW)
**Analogs found:** 30 / 30 (100% — every target has an in-repo precedent; this phase is extension + deletion, not greenfield)

> **Line-number authority:** RESEARCH.md re-verified every file:line against the 2026-06-04 working tree. Where CONTEXT.md / CLAUDE.md / ADR-0010 disagree, trust RESEARCH.md (Pitfall 3). Re-grep at plan-write time if other v1.6 phases land first.

---

## File Classification

| File                                                                                                          | Strand              | New/Mod       | Role             | Data Flow                  | Closest Analog                                              | Match       |
| ------------------------------------------------------------------------------------------------------------- | ------------------- | ------------- | ---------------- | -------------------------- | ----------------------------------------------------------- | ----------- |
| `server/routes/health.ts`                                                                                     | LLM-FIX-01          | MOD           | route            | request-response (probe)   | self (`probeCacheKey` :134)                                 | in-place    |
| `server/__tests__/routes/health.test.ts`                                                                      | LLM-FIX-01          | MOD           | test             | —                          | self (:314,:368)                                            | in-place    |
| `server/routes/water.ts`                                                                                      | LLM-FIX-02          | MOD           | route            | CRUD (cache write)         | self (:357-361) + `CacheEntry<T>`                           | in-place    |
| `server/lib/llmEvalHarness.ts`                                                                                | LLM-FIX-03          | MOD           | lib              | batch/eval                 | self (:388)                                                 | in-place    |
| `.planning/milestones/v1.5-phases/33-.../33-AUDIT-REPORT.md`                                                  | LLM-FIX-03          | MOD           | docs             | —                          | self                                                        | in-place    |
| `server/__tests__/lib/llmEvalHarness.test.ts`                                                                 | LLM-FIX-03          | MOD           | test             | —                          | self (:512,:542 flip to null)                               | in-place    |
| `server/__tests__/resilience/redis-death.test.ts`                                                             | LLM-FIX-04          | MOD           | test (chaos)     | —                          | self (:188-204 mock shape)                                  | in-place    |
| `server/__tests__/resilience/quota-chaos.test.ts`                                                             | LLM-FIX-05          | **NEW**       | test (chaos)     | —                          | `redis-death.test.ts`                                       | exact       |
| `server/__tests__/routes/events.test.ts`                                                                      | LLM-FIX-06          | MOD           | test             | —                          | self (:354,:356,:833 v1→v3)                                 | in-place    |
| `src/__tests__/lib/actorCatalog.test.ts`                                                                      | CI-green            | MOD           | test             | —                          | self (:54 path repoint)                                     | in-place    |
| `server/lib/llmExtractionPipeline.ts`                                                                         | PURGE-01/03/09      | MOD           | lib              | orchestration              | self (:38-42 import rewire)                                 | in-place    |
| `server/lib/llmEventExtractor.ts`                                                                             | PURGE-01            | DELETE        | lib              | re-export barrel           | — (delete stub)                                             | n/a         |
| `server/adapters/llm-provider.ts`                                                                             | PURGE-02            | MOD           | adapter          | shim                       | self (delete `callLLM` only)                                | in-place    |
| `server/lib/llmResolver.ts`                                                                                   | PURGE-02 / GDELT-03 | MOD           | lib              | request-response           | self (:18 import; :507 Bellingcat gate)                     | in-place    |
| `server/lib/llmSchema.ts`                                                                                     | PURGE-04            | MOD           | lib (Zod)        | schema                     | self (:62,:106,:193,:212)                                   | in-place    |
| `server/lib/pipelineAudit.ts`                                                                                 | PURGE-05            | DELETE writer | lib              | pub-sub (audit)            | — (delete `appendPipelineAudit`)                            | n/a         |
| `src/components/ui/DevApiStatus.tsx`                                                                          | PURGE-05            | MOD           | component        | —                          | self (`PipelineFlipsBlock` :2841,:3044 delete)              | in-place    |
| `openapi.yaml`                                                                                                | PURGE-05            | MOD           | config (spec)    | —                          | self (:1841 delete)                                         | in-place    |
| `server/config.ts`                                                                                            | PURGE-06            | MOD           | config (Zod env) | —                          | self (:31-32,:242,:245)                                     | in-place    |
| `server/adapters/freeClaudeRouter.ts`                                                                         | PURGE-03/08         | MOD           | adapter          | request-response (cascade) | self (:310,:464,:644 OpenRouter)                            | in-place    |
| `server/lib/llmEventExtractor.v3.ts`                                                                          | PURGE-03/05/08      | MOD           | lib              | batch                      | self (header :1-15; :629,:951 skipOpenRouter)               | in-place    |
| `CLAUDE.md` / `docs/adr/0010-*.md`                                                                            | PURGE-07/08         | MOD           | docs             | —                          | self (stale notes; 622/929→629/951)                         | in-place    |
| `scripts/audit-gdelt-corpus.ts`                                                                               | GDELT-01            | **NEW**       | script           | batch (read+report)        | `scripts/audit-events.ts`                                   | exact       |
| `server/lib/eventAudit.ts`                                                                                    | GDELT-01            | reuse         | lib              | —                          | self (`buildAuditRecord`/`PipelineTrace`)                   | reuse       |
| `server/lib/eventGrouping.ts`                                                                                 | GDELT-02            | MOD           | lib              | transform (collapse)       | self (`groupGdeltRows` :60)                                 | in-place    |
| `server/__tests__/lib/eventGrouping.*.test.ts`                                                                | GDELT-02            | MOD           | test             | —                          | self (extend)                                               | in-place    |
| `server/lib/sourceTiers.ts`                                                                                   | GDELT-01/04         | reuse         | lib              | —                          | self (`getHighestTier`)                                     | reuse       |
| `server/lib/relevanceScorer.ts`                                                                               | GDELT-04            | MOD           | lib              | transform (score)          | self (`computeRelevanceScore`, `SOURCE_RELIABILITY` :31)    | in-place    |
| `server/__tests__/.../corroboration-gate.test.ts`                                                             | GDELT-03            | **NEW**       | test             | —                          | existing lib unit tests                                     | role-match  |
| `server/adapters/overpass-water.ts`                                                                           | WATER-01/03         | MOD           | adapter          | transform (fetch-time)     | self (`hasLatinLabel` :208, gate :836, `extractLabel` :928) | in-place    |
| `server/types.ts`                                                                                             | WATER-03            | MOD           | config (type)    | —                          | self (`WaterFacility` :205 add `nameLatin?`)                | in-place    |
| `scripts/audit-water-names.ts`                                                                                | WATER-01            | **NEW**       | script           | batch (read+report)        | `scripts/audit-events.ts` + `refresh-water-facilities.ts`   | exact       |
| `src/components/detail/WaterFacilityDetail.tsx` + tooltip/overlay/search                                      | WATER-04            | MOD           | component        | —                          | self (current `name`/`label` render)                        | in-place    |
| `src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx`                                       | WATER-04            | MOD           | test             | —                          | self + `makeFacility` helper                                | in-place    |
| `vercel.json`                                                                                                 | VERCEL-01/04        | EVAL/MOD      | config           | —                          | self (no `headers` block; crons+rewrites+functions only)    | in-place    |
| `server/index.ts` / `server/vercel-entry.ts`                                                                  | VERCEL-03           | verify        | config (entry)   | —                          | self (`createApp` in **index.ts** NOT app.ts)               | verify-only |
| `docs/architecture/deployment.md`, `runbook.md`, `degradation.md`, `llm-pipeline-reliability.md`, `CLAUDE.md` | VERCEL-04           | MOD           | docs             | —                          | self (Hobby→Pro drift)                                      | in-place    |

---

## Pattern Assignments

### LLM-FIX-01 — `server/routes/health.ts` (route, probe)

**Pattern at the modification site** (`:134-172`) — the generic `probeCacheKey(name, key, fallbackHealthyKey?)` helper currently hard-codes `llm-optional-fallback-active:` at `:170`, but it is called by BOTH `llmEvents` (honest) and `news` (a lie — RSS fallback). Split: emit generic `cache-fallback-active:` by default; only `llmEvents` keeps the LLM token.

```ts
// server/routes/health.ts:170 — current (the LIE for news)
errorReason: `llm-optional-fallback-active: ${fallbackHealthyKey} fresh, ${key} cold`,
```

The dedicated LLM-only path at `:284` legitimately keeps `llm-optional-fallback-active:` — do NOT touch it. Add a per-probe `fallbackReasonToken` param (or branch on `name === 'llmEvents'`).

**Test fix** (`health.test.ts`): `:314` asserts `/llm-optional/` (llmEvents — keep). `:368` asserts `/fallback-active/` for **news** — tighten to `/cache-fallback-active/` (the loose regex matches the LLM token accidentally = "passes for wrong reason").

---

### LLM-FIX-02 — `server/routes/water.ts` (route, cache write)

**Pattern at site** (`:357-362`):

```ts
// Only cache non-empty results — empty means all batches failed
if (precipData.length > 0) {
  await cacheSetSafe(PRECIP_KEY, precipData, WATER_PRECIP_REDIS_TTL_SEC);
}
res.json({ data: precipData, stale: false, lastFresh: Date.now() });
```

**D-05 sentinel** — on `precipData.length === 0`, write a distinguishable fresh sentinel matching the `CacheEntry<T>` `{data, fetchedAt}` convention (`server/cache/redis.ts`):

```ts
await cacheSetSafe(
  PRECIP_KEY,
  { data: [], failed: true, fetchedAt: Date.now() },
  WATER_PRECIP_REDIS_TTL_SEC,
);
```

**Landmine:** `PRECIP_KEY` (`water:precip`) read by `findNearestPrecip` — verify it tolerates `data: []` without throwing. Probe must treat a fresh sentinel as "degraded but not unknown," not "healthy." Note the `cacheSetSafe(FACILITIES_KEY, {...})` precedent at `:347-351` for the envelope shape.

---

### LLM-FIX-03 — `server/lib/llmEvalHarness.ts` (lib, eval)

**Pattern at site** (`:388`):

```ts
const actorMatchRate = actorTotal === 0 ? 0 : actorMatched / actorTotal;
```

**D-06:** change `EvalScore.actorMatchRate` type (`:154`) to `number | null`; return `null` (not `0`) on `actorTotal === 0`. Leave the `try/catch` fallback at `:386` ("falling back to 0") as `0` (a real compute failure ≠ "no ground truth").

**Ripple (landmine):** `llmProgress.ts:123,296` type it `actorMatchRate?: number` → widen. Tests `llmEvalHarness.test.ts:512,542` assert `0` in the no-ground-truth case → flip to `null`. Edit `33-AUDIT-REPORT.md` at the **archived** path `.planning/milestones/v1.5-phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/` — replace TBD stub with explicit "not yet populated — requires staging run (deferred v1.7)."

---

### LLM-FIX-04 / 05 — chaos tests

**Analog (canonical chaos pattern):** `server/__tests__/resilience/redis-death.test.ts:185-204`:

```ts
const redisDeath = (): never => {
  throw new Error('ECONNREFUSED: redis is dead (chaos test)');
};
vi.mock('../../cache/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cache/redis.js')>();
  return {
    ...actual,
    redis: {
      ping: vi.fn(redisDeath),
      get: vi.fn(redisDeath),
      set: vi.fn(redisDeath),
      del: vi.fn(redisDeath),
    },
    cacheGet: vi.fn(redisDeath),
    cacheSet: vi.fn(redisDeath),
    // cacheGetSafe/cacheSetSafe pass through from `actual` — system under test
  };
});
```

Server boot pattern (`:217-225`): `const { createApp } = await import('../../index.js'); const app = createApp(); server = app.listen(0, ...)`. Route coverage list at `:257-266` (8 GET routes; `/api/operator-status` ABSENT).

- **LLM-FIX-04 (MOD):** extend `redis` mock to add `incr, sadd, smembers, scard, srem, zadd, hset, hincrby, scan, lpush, expire` as `vi.fn(redisDeath)`. Add `/api/operator-status` to coverage — it is **Bearer-gated**, so assert 401/503 (send Bearer) NOT 500. Drop `pipelineAudit` from the proof list (its writer is deleted by PURGE-05).
- **LLM-FIX-05 (NEW `quota-chaos.test.ts`):** copy the redis-death mock shape; mock `redis.incr` to throw; assert quota endpoints (pruneQuota/replayQuota call `await redis.incr(key)` with NO try/catch) return 503/200 never 500. **Pitfall 5:** the current pass is a false-negative — `cacheGetSafe` degrade-open short-circuits BEFORE `incr` fires. The new test must exercise `incr` directly. Pre-check: `grep -n "redis.incr" server/lib/pruneQuota.ts server/lib/replayQuota.ts` confirms no enclosing try/catch.

---

### LLM-FIX-06 — `events.test.ts` (test, mock drift)

Mechanical `'v1'`→`'v3'` at `:354, :356, :833`:

```ts
mockProcessEventGroups.mockResolvedValue({ schemaVersion: 'v1', events: null }); // → 'v3'
mockGeocodeEnrichedEvents.mockResolvedValue({ schemaVersion: 'v1', events: [] }); // → 'v3'
```

**Coordinate with PURGE-01:** after the `llmEventExtractor.ts` stub is inlined, these mocks must match `processEventGroupsV3`'s direct return shape.

---

### LLM-PURGE — deletions & shim narrowing

- **PURGE-01** (`llmExtractionPipeline.ts:38-42`): rewire from the deleted `llmEventExtractor.ts` barrel to import `processEventGroupsV3`/`geocodeEnrichedEventsV3` from `llmEventExtractor.v3.js` directly. Stub wraps v3 in a tagged `{schemaVersion:'v3', events, matchedNewsByGroup, bellingcatByGroup}` — inline the wrapper or drop it and update the pipeline's `.schemaVersion`/`.events` consumption.
- **PURGE-02 (Pitfall 1):** `llm-provider.ts` exports `callLLM` (NO live importers — safe delete) AND `isLLMConfigured()` (still imported by `llmExtractionPipeline.ts:32` + `events.ts:5` — KEEP). Delete only `callLLM` + `routerCallLLM` import + stale docstring. `llmResolver.ts:18` already imports `callLLM` from `freeClaudeRouter.js` directly (CONTEXT's "last importer" claim is stale).
- **PURGE-04 (Pitfall 2):** `llmSchema.ts` — `enrichedEventV3 = enrichedEventV2.extend({...})` at `:193`. Do NOT delete `enrichedEventV2` blindly; inline its fields into a standalone v3 or keep v2 un-exported as base. `enrichedEventAny` (`:212`) collapses to single-arm `enrichedEventV3` passthrough. Grep for production importers of V1/V2/`batchResponseV2` first.
- **PURGE-05 (D-03 Path A full delete):** delete `appendPipelineAudit` (`pipelineAudit.ts:31`), `PipelineFlipsBlock` (`DevApiStatus.tsx:2841` + render `:3044`), `LLMStatus['pipelineFlips']` plumbing chain (`/llm-status` route → props), `openapi.yaml:1841`. **Open Q:** grep `listPipelineAudit` importers — if only the deleted UI read it, delete the reader too. Key `events:llm-pipeline-audit` drains on 90d TTL.
- **PURGE-06:** delete `config.ts:31-32` (`CEREBRAS_API_KEY`/`GROQ_API_KEY` `.default('')`) + `:242,:245` wiring. Re-anchor `replayQuota.ts:21` comment to `nvidia_nim: 1_000_000`. **Triage ~11 test files** (`llm-provider.test.ts` highest-risk). Pre-grep `env.CEREBRAS\|env.GROQ` across `server/`.
- **PURGE-07:** docs-only — delete CLAUDE.md "Cerebras + Groq adapter source files remain importable" note. NO file deletion (adapters already gone).
- **PURGE-08 (D-04 Path A: gate, don't delete):** `freeClaudeRouter.ts` — remove `incrOpenRouterDaily`/`getOpenRouterDaily` (`:310,:464,:644`); keep OpenRouter as dormant key-gated provider. Fix `skipOpenRouter` citations CLAUDE.md/ADR `622/929` → **`v3.ts:629,:951`**.
- **PURGE-09:** rewrite `llmExtractionPipeline.ts:376` comment to match the truthful `:98` ("writePartialCache writer deleted").

**Wave order:** structural (01,02,04) → router gate (08) → UI/audit (05) → pure-text (03,06,07,09). `npm run typecheck` after each structural deletion (typecheck is the PURGE gate).

---

### GDELT-MATCH-01 — `scripts/audit-gdelt-corpus.ts` (NEW)

**Analog: `scripts/audit-events.ts`** (CLI tsx audit pattern):

```ts
#!/usr/bin/env tsx
import type { AuditRecord } from '../server/lib/eventAudit.js';
const WAR_START = Date.UTC(2026, 1, 28);
function parseArgs(argv: string[]) {
  /* --fresh / -o / --sample-rate */
}
function printSummary(records: AuditRecord[]) {
  /* bucket counts, sorted breakdown */
}
```

Reuse `eventAudit.ts` (`buildAuditRecord`, `PipelineTrace`) + `sourceTiers.getHighestTier()` for tier-1/2/3 buckets. Read `events:llm:v3` via `cacheGetSafe<ConflictEventEntity[]>`. Cross-reference `news:gdelt` for orphans; group via `eventGrouping.groupGdeltRows` for duplicate-cluster sizing. **Hard gate** — runs as Plan 1; sizes 02-04 thresholds.

---

### GDELT-MATCH-02 — `server/lib/eventGrouping.ts` (transform)

**Pattern (`groupGdeltRows` :60, `EventGroup` :17-27):** existing collapse = same day-bucket AND CAMEO-root AND ≤50km (`GROUP_RADIUS_KM`). Add a **distinct tighter pre-pass** (Pitfall 6 — do NOT confuse coarse batch-grouping with true dedup): conservative AND-gate (same canonical actor pair AND same CAMEO root AND same day-bucket AND ≤5-10km AND title/URL Jaccard ≥0.85). Pre-enrichment filter; never mutates raw `events:gdelt`. Thresholds informed by GDELT-MATCH-01.

---

### GDELT-MATCH-03 — corroboration gate (NEW test + `llmResolver.ts` extension)

**Analog: Bellingcat three-gate** at `llmResolver.ts:507` `resolveViaBellingcat` (temporal AND geographic AND keyword). Generalize to any tier-1/2 OSINT source in `news:gdelt`; apply confidence boost only on genuine 3-gate match. **Landmine:** keyword gate must be strict (actor/specific-action, not generic "Iran"/"strike") to avoid coincidental same-city-same-day false positives. New unit test mirrors existing `server/__tests__/lib/*.test.ts` structure.

---

### GDELT-MATCH-04 — `server/lib/relevanceScorer.ts` (transform, score)

**Pattern (`computeRelevanceScore`, `SOURCE_RELIABILITY` :31, 4-tier 1.0/0.9/0.8/0.6):** existing 0-1 score = NLP-triple (0-0.45) + conflict-verb (0-0.35) + source-reliability (0-0.20). Add additive per-event `compositeScore` = tier × corroboration-boost (from MATCH-03) × specificity (precision tier / NLP completeness). **Landmine:** add to the collapsed v3 schema (coordinate w/ PURGE-04) as `.optional()` so old cached events still validate. Dashboard reads it for ordering; raw `events:llm:v3` untouched (D-07 non-mutating).

---

### WATER-LATIN-03 — `server/adapters/overpass-water.ts` (transform, fetch-time)

**Gate pattern (the injection point — romanize BEFORE this):**

```ts
// :836 — admission gate
if (facilityType !== 'desalination' && !hasLatinLabel(tags)) {
  return { verdict: 'reject', bucket: 'no_resolved_name' };
}
```

```ts
// :208 — hasLatinLabel: name:en / name / operator must pass isLatin AND not match GENERIC_OSM_NAME_RE
export function hasLatinLabel(tags: Record<string, string>): boolean {
  const isRealLatin = (s) => !!s && isLatin(s) && !GENERIC_OSM_NAME_RE.test(s);
  /* name:en → name → operator */
}
const GENERIC_OSM_NAME_RE = /^(dam|reservoir|desalination(?:\s+plant)?)$/i; // :206
```

**D-08 approach:** romanize non-Latin `tags['name']` via `transliteration` + artifact-cleanup pass (strip `@`→`a`/`ah`, lowercase emphatic `S/H/T/D/Z`, collapse separators). Acceptance bar = **"searchable Latin token that admits the gate,"** NOT pretty (abjad vowel-less ceiling — Pitfall 4; do NOT adopt ICU). Inject synthetic Latin so `hasLatinLabel` admits; populate new `nameLatin`. Preserve original via `label` (built at `:928` `extractLabel`). Don't double-process desalination (already gate-exempt). Add `nameLatin?: string` to `WaterFacility` (`server/types.ts:205`).

**WATER-LATIN-01 (NEW `scripts/audit-water-names.ts`):** analog `scripts/audit-events.ts` + `scripts/refresh-water-facilities.ts`. Read `water:facilities:v3`; count total / `hasLatinLabel`-rejected / per-script (Arabic `؀-ۿ`, Hebrew `֐-׿`, test `isLatin` false). Validates `transliteration` quality before lock-in.

**WATER-LATIN-04 consumers:** display `nameLatin` with original on hover/sub-label; index `nameLatin` in search bar; update proximity-alert labels. Extend `makeFacility` helper (`src/lib/__tests__/waterLabel.test.ts`) + `WaterFacilityDetail.gateSwap.test.tsx` fixtures with `nameLatin`.

---

### VERCEL-PRO

- **PRO-01/02 (EVAL → DEFER, record rationale):** `vercel.json` has NO `headers` block (crons + rewrites + `functions.maxDuration:800` + `includeFiles` only) and no config-drift handlers → net-zero simplification. `@vercel/config@0.5.1` not installed. Build Output API risks the deploy path mid-cleanup. Phase 999.2 stays open.
- **PRO-03 (SHIP, likely no-op):** `createApp` is in **`server/index.ts`** (NOT app.ts — Pitfall 3). `server/vercel-entry.ts` already memoizes `app = createApp()` and documents Fluid-Compute posture (Upstash REST = no connections to drain). Verify no per-request global mutation hazard; document verdict in `deployment.md`. Test analog: `server/__tests__/vercel-entry.test.ts`.
- **PRO-04 (SHIP, docs + dev CLI bump):** `CLAUDE.md:101` "Hobby cap 3 entries"; `deployment.md:56,:133`; `runbook.md:539-547`; `degradation.md:329`; `llm-pipeline-reliability.md:6` header → reconcile to Pro 800s / 40-cron / Fluid-Compute-default / NIM-primary. `npm install -g vercel@54.9.0` (dev only, NOT package.json).

---

## Shared Patterns

### Cache write envelope (`CacheEntry<T>`)

**Source:** `server/cache/redis.ts` `{data, fetchedAt}`; live precedent `water.ts:347-351`.
**Apply to:** LLM-FIX-02 sentinel, GDELT-MATCH-04 schema field, WATER-LATIN-03 facility cache. All new schema fields `.optional()` so old cached entries (24h–90d TTL) self-heal without migration.

### Degrade-open chaos resilience

**Source:** `redis-death.test.ts:185-204` (`redisDeath`/`vi.fn` mock) + `cacheGetSafe` degrade-open.
**Apply to:** LLM-FIX-04/05. The trap (Pitfall 5): `cacheGetSafe` short-circuits before raw `redis.*` calls — mock the raw method directly to prove the call site.

### CLI audit script

**Source:** `scripts/audit-events.ts` (`#!/usr/bin/env tsx`, `parseArgs`, `printSummary`, `cacheGetSafe` read, `eventAudit.ts` types).
**Apply to:** GDELT-MATCH-01, WATER-LATIN-01 (new audit scripts).

### Tier/reliability scoring

**Source:** `relevanceScorer.ts:31` `SOURCE_RELIABILITY` + `sourceTiers.ts` `getHighestTier`.
**Apply to:** GDELT-MATCH-01 bucketing, GDELT-MATCH-04 composite.

### Three-gate corroboration

**Source:** `llmResolver.ts:507` `resolveViaBellingcat` (temporal AND geo AND keyword).
**Apply to:** GDELT-MATCH-03.

---

## No Analog Found

None. Every target — including the 4 NEW files — maps to an in-repo precedent (Don't-Hand-Roll table, RESEARCH §353). The risk is breaking existing behavior, not building new behavior.

---

## Metadata

**Analog search scope:** `server/routes/`, `server/lib/`, `server/adapters/`, `server/__tests__/resilience/`, `scripts/`, `src/components/`, docs/, config.
**Files scanned:** ~18 read in detail; line numbers inherited from RESEARCH.md's 2026-06-04 grep-verified working tree.
**Pattern extraction date:** 2026-06-04
