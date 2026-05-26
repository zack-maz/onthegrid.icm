# Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 21 (3 new, 18 modified)
**Analogs found:** 21 / 21 (every Phase 35 deliverable has an in-tree precedent)

This phase is documentation-and-cleanup with one load-bearing primitive (D-01 drift-gate vitest) and one well-bounded code deletion (D-12 partial-key retirement). Every executor task can copy a pattern from an existing file — there is no greenfield architecture.

---

## File Classification

| File                                                                  | Role                                | Data Flow                      | Closest Analog                                                                               | Match Quality                                |
| --------------------------------------------------------------------- | ----------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/__tests__/lib/redis-registry.test.ts`                            | NEW test (drift-gate)               | fs + regex parse + assertion   | `src/__tests__/lib/colorBridge.test.ts` + `src/__tests__/lib/actorCatalog.test.ts`           | exact (3-template composite)                 |
| `docs/architecture/redis-keys.md`                                     | NEW architecture doc                | markdown + tables              | `docs/architecture/llm-pipeline-reliability.md`                                              | exact (same dir, same shape)                 |
| `server/lib/llmEventExtractor.v3.ts`                                  | code edit (deletion) + JSDoc        | partial-key retirement         | `server/lib/llmExtractionPipeline.ts:93-97` (precedent SIMPLIFY-01 retirement)               | exact (same retirement class)                |
| `server/lib/llmExtractionPipeline.ts`                                 | code edit (comment cleanup) + JSDoc | supporting-comment removal     | self (lines 93-97 already retired SIMPLIFY-01 in the same style)                             | exact (in-file precedent)                    |
| `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`    | test edit                           | drop partial-key assertions    | self (lines 320-345 terminal-key assertion stays; lines 347-361 partial-key assertion drops) | exact (in-file split point)                  |
| `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` | test edit                           | drop partial-key assertions    | sibling `terminalShape.test.ts`                                                              | exact                                        |
| `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts`    | test edit                           | drop partial-key assertions    | sibling `terminalShape.test.ts`                                                              | exact                                        |
| `server/__tests__/cache/redis-prefix.test.ts`                         | test edit                           | fixture line update            | self (lines 120-125, single literal removal)                                                 | exact (1-line surgical)                      |
| `server/lib/llmResolver.ts`                                           | JSDoc-only edit                     | public-API one-liners          | `server/lib/llmExtractionPipeline.ts` JSDoc style                                            | exact                                        |
| `server/lib/llmCircuitBreaker.ts`                                     | JSDoc-only edit                     | public-API one-liners          | self (existing block lines 1-11, exports lines 18-65)                                        | exact (already partial)                      |
| `server/lib/llmDLQ.ts`                                                | JSDoc-only edit                     | public-API one-liners          | self (existing block lines 1-9; exports lines 17-100)                                        | exact (already partial)                      |
| `server/lib/llmTokenBudget.ts`                                        | JSDoc-only edit                     | public-API one-liners          | self (lines 1-8 + 26-31 + 47-51 already have block-level JSDoc)                              | exact (already partial)                      |
| `server/lib/llmExtractorWatchdog.ts`                                  | JSDoc-only edit                     | public-API one-liners          | self (already well-documented at lines 30-66)                                                | exact (well-doc'd already; minimal delta)    |
| `server/lib/freeClaudeRouter.ts`                                      | doc-comment edit (callers block)    | top-of-file `/** */` augment   | self (lines 1-16 existing vendored-from block)                                               | exact (PREPEND callers block above existing) |
| `CLAUDE.md` §Serverless Cache                                         | markdown surgical edit              | add 4 keys, remove 1, refine 2 | self (lines 116-140 existing 1-line-per-key shape)                                           | exact (in-file edit pattern)                 |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`           | markdown append                     | new sub-block at EOF           | self lines 52-106 (Phase 30, 30.1, 34 sub-blocks)                                            | exact (3 prior precedents)                   |

---

## Pattern Assignments

### `src/__tests__/lib/redis-registry.test.ts` (NEW test, drift-gate)

**Primary analog:** `src/__tests__/lib/actorCatalog.test.ts` (fs + readFileSync + path-shim + assertion).
**Secondary analog:** `src/__tests__/lib/colorBridge.test.ts` (byte-identity sentinel — describe block grouping, narrative header).
**Tertiary analog:** `server/__tests__/lib/urlLiveness.schema.test.ts` (`// @vitest-environment node` directive for fs-heavy tests under default-jsdom config).

**Top-of-file directive + narrative-header pattern** — copy from `urlLiveness.schema.test.ts:1-25`:

```typescript
// @vitest-environment node
/**
 * Phase 35 D-01 — Redis-key registry drift gate.
 *
 * Parses the two markdown surfaces (CLAUDE.md §Serverless Cache + docs/architecture/redis-keys.md)
 * and the codebase for Redis-key string literals, asserts every documented key is referenced in
 * code and every code-referenced key is documented in BOTH surfaces (D-03 both-surfaces parity).
 *
 * Mirrors:
 *   - colorBridge.test.ts byte-identity sentinel pattern (parse two surfaces, assert parity)
 *   - actorCatalog.test.ts catalog-invariant pattern (per-entry assertions + orphan check)
 *   - urlLiveness.schema.test.ts schema-pinning pattern (literal contracts fail loud on drift)
 */
```

**fs + path shim + import block pattern** — copy from `actorCatalog.test.ts:33-49`:

```typescript
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

// __dirname shim for ESM test files (jsdom default env in vite.config.ts).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source-of-truth path resolved relative to this test file:
const codebookPath = resolve(
  __dirname,
  '../../../.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/cameo-codes.json',
);
const codebook = JSON.parse(readFileSync(codebookPath, 'utf-8')) as { ... };
```

**describe-block grouping pattern** — copy from `colorBridge.test.ts:25-101`:

```typescript
describe('Phase 35 D-01 — Redis-key registry drift gate', () => {
  describe('CLAUDE.md ↔ redis-keys.md surface parity (D-03)', () => {
    it('every documented key in CLAUDE.md is also documented in redis-keys.md', () => { ... });
    it('every documented key in redis-keys.md is also documented in CLAUDE.md', () => { ... });
  });

  describe('documented-key → code reference (no orphans in docs)', () => {
    it.each([...claudeKeys])('documented key %s has ≥1 reference in code', (key) => { ... });
  });

  describe('code-key → documentation (no undocumented drift)', () => {
    it('every code key matches a documented key', () => { ... });
  });
});
```

**`it.each` orphan-check pattern with guard against empty input** — copy from `actorCatalog.test.ts:73-92`:

```typescript
describe('Phase 35 D-01 — orphan check', () => {
  const allKeys = [...documentedKeys];

  it('registry has at least one documented key (guard against silent empty-input it.each pass)', () => {
    // If the registry parse returns an empty set the it.each below would
    // silently pass on zero iterations. Phase 35 ships with ≥ 25 documented
    // keys post-D-14 — assert ≥ 10 to be safe.
    expect(allKeys.length).toBeGreaterThanOrEqual(10);
  });

  it.each(allKeys)('documented key %s has at least one code reference', (key) => {
    expect(codeKeys.has(key)).toBe(true);
  });
});
```

**EXEMPT_KEYS shape (D-02 — empty at phase close, structurally available)** — adapted from CONTEXT.md D-02:

```typescript
const EXEMPT_KEYS: ReadonlyArray<{ key: string; reason: string }> = [
  // example: { key: 'events:llm:v2', reason: 'historical-fallback probe in health.ts:315 — retired but not yet deleted' },
];
```

---

### `docs/architecture/redis-keys.md` (NEW architecture doc)

**Primary analog:** `docs/architecture/llm-pipeline-reliability.md` (same directory, same family of phase-anchored architecture docs).

**Header + opening prose pattern** — copy from `llm-pipeline-reliability.md:1-10`:

```markdown
# Redis Key Registry (v1.5)

> Auditable inventory of every Redis key written or read by `otg-iran-monitor` in production. Pinned by `src/__tests__/lib/redis-registry.test.ts` — drift fails the next `vitest run`.

**Source of truth:** Code (line references below). This document is the operator skim's companion deep-dive; the test is the gate.
**Companion surface:** [`CLAUDE.md` §"Serverless Cache (Phase 13)"](../../CLAUDE.md) — same key list, one-line-per-key shape, refreshed in lockstep.
**Phase 35 measurement window:** Upstash command budget {baseline %} → {close %} (see `redis-budget-baseline-YYYY-MM-DD.png` / `redis-budget-close-YYYY-MM-DD.png` in `.planning/phases/35-*/`).

---
```

**Table column shape (D-06)** — verbatim from CONTEXT.md D-06 + RESEARCH.md Common Operation 1-3:

```markdown
## events:\*

| Key                     | Writers                                                                   | Readers                                                                                         | TTL                 | Value                   | Purpose                                                                                                                                                  | Cardinality         | Classification   |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------- |
| `events:llm:v3`         | `server/lib/llmExtractionPipeline.ts:88` (const) + cron writer end-of-run | `server/routes/events.ts:78`; `server/lib/healthSources.ts:53`; `server/lib/urlLiveness.ts:585` | 9000s (≈2.5h hard)  | `ConflictEventEntity[]` | Terminal LLM-enriched cache; sole cache served to `/api/events`. ADR-0010 invariant.                                                                     | 1                   | **load-bearing** |
| `events:llm-dlq`        | `server/lib/llmDLQ.ts:60` `redis.sadd`                                    | `server/lib/llmDLQ.ts:88` `redis.smembers`; `/api/operator-status`                              | 7d; SADD capped 200 | JSON `DLQEntry`         | Dead-letter queue for exhausted-retry events                                                                                                             | ≤ 200 (bounded)     | observability    |
| `events:llm:v3:partial` | (none after Phase 35 D-12)                                                | (none)                                                                                          | (n/a)               | (n/a)                   | **RETIRED Phase 35 / SIMPLIFY-02.** Hobby-era 300s-budget mitigation; Pro 800s makes terminal writes reliable. Natural TTL expiry within 2.5h of deploy. | 0 (post-retirement) | **retire**       |
```

**Family-grouping ordering (Claude's-Discretion-3 → prefix family):**

1. `events:*`
2. `flights:*`
3. `ships:*`
4. `sites:*`
5. `water:*`
6. `news:*`
7. `markets:*`
8. `geocode:*`
9. `llm:*`
10. `cron:*`
11. `operator:*`
12. `audit:*`

---

### `server/lib/llmEventExtractor.v3.ts` (code edit — D-12 partial-key retirement + D-09 JSDoc)

**Primary analog:** `server/lib/llmExtractionPipeline.ts:93-97` — the SIMPLIFY-01 retirement that established the "deletion with a tombstone comment" pattern this phase mirrors.

**In-file precedent for surgical retirement (the SIMPLIFY-01 tombstone pattern, lines 93-97 of llmExtractionPipeline.ts):**

```typescript
// Phase 30 D-04 (SIMPLIFY-01): the local `PARTIAL_KEY_ACTIVE` const was
// retired here when the periodic-flush callback (its sole reader) was
// deleted. The `events:llm:v3:partial` observability key is still written
// by the v3 extractor's writePartialCache — its retirement is owned by
// SIMPLIFY-02 / Phase 35.
```

**Apply the SAME shape for D-12 in llmEventExtractor.v3.ts:**

**BEFORE (lines 114-123):**

```typescript
const EVENTS_LLM_V3_KEY = 'events:llm:v3';
/**
 * Partial-progress cache for the v3 extractor — written per-batch from
 * writePartialCache. Holds LLMCachePayload<EnrichedEventV3> envelopes so
 * DevApiStatus / /llm-status can show in-flight progress without colliding
 * with the terminal ConflictEventEntity[] key above. Readers of the main
 * /api/events endpoint NEVER touch this key.
 */
const EVENTS_LLM_V3_PARTIAL_KEY = 'events:llm:v3:partial';
export { EVENTS_LLM_V3_KEY, EVENTS_LLM_V3_PARTIAL_KEY };
```

**AFTER (D-12, mirroring the in-file SIMPLIFY-01 tombstone style):**

```typescript
const EVENTS_LLM_V3_KEY = 'events:llm:v3';
// Phase 35 D-12 (SIMPLIFY-02): EVENTS_LLM_V3_PARTIAL_KEY const +
// writePartialCache writer retired. Hobby-era 300s-budget mitigation;
// Pro 800s makes terminal-key writes reliably finish, so the partial-key
// envelope carried no live signal. Production cleanup: natural TTL expiry
// within LLM_REDIS_TTL_SEC (2.5h) of deploy. See ADR-0010 Phase 35 sub-block.
export { EVENTS_LLM_V3_KEY };
```

**Remove the writer (lines 446-480) AND its callsite at `:619`.**

**JSDoc one-liner audit (D-09) — existing-good example to preserve as the bar** (from `llmExtractionPipeline.ts:196-201`):

```typescript
/**
 * Kick off a new LLM extraction run if the cooldown / cold-cache / busy /
 * configured / raw-events guards permit. The actual work runs as a
 * fire-and-forget IIFE; this function returns synchronously after the
 * dispatch decision is made.
 */
export async function runRefreshExtraction(opts: RunRefreshOpts): Promise<RunRefreshResult> {
```

**D-09 rule (per CONTEXT D-10):** read each existing JSDoc line aloud against the function body — if it cites a now-deleted code path or describes intent that no longer matches behavior, rewrite. Otherwise leave alone. Existing top-of-file `Phase 27.4.3 D-03` waymarkers stay untouched.

---

### `server/lib/llmExtractionPipeline.ts` (code edit — D-12 supporting comment cleanup + D-09 JSDoc)

**Analog:** self (lines 93-97 are the SIMPLIFY-01 tombstone written in the exact style D-12 should mirror).

**Lines 95, 134 reference the partial-key in supporting comments.** The line 95 comment ALREADY mentions the partial-key is retired by Phase 35; just delete the redundant lines once D-12 lands. Line 134 mentions the writer; rewrite to drop the partial-key reference:

**Line 134 BEFORE:**

```typescript
 * Single-purpose: end-of-run terminal write of `ConflictEventEntity[]` to
 * the active LLM cache key (`events:llm:v3`). Two-key discipline preserved
 * (D-04 / D-11): writes entities to LLM_EVENTS_KEY_ACTIVE; the
 * LLMCachePayload envelope continues to land on `events:llm:v3:partial`
 * via writePartialCache (UNCHANGED — observability key, written by the v3
 * extractor only).
```

**Line 134 AFTER (D-12):**

```typescript
 * Single-purpose: end-of-run terminal write of `ConflictEventEntity[]` to
 * the active LLM cache key (`events:llm:v3`). Sole writer of the terminal
 * key (Phase 35 D-12 / SIMPLIFY-02 retired the partial-key observability
 * envelope; the previous two-key discipline collapses to one-key discipline).
```

---

### `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` (test edit — drop partial-key assertions)

**In-file split point identified at lines 320-361.**

**KEEP (terminal-key assertion, lines 321-345):**

```typescript
it('two-key discipline: events:llm:v3 holds ConflictEventEntity[] (NOT LLMCachePayload envelope)', async () => {
  await driveRun(12);
  const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
  expect(terminalCalls.length).toBe(1);
  for (const [, data] of terminalCalls) {
    expect(Array.isArray(data)).toBe(true);
    // ... ConflictEventEntity[] shape assertions stay verbatim ...
    expect(first).not.toHaveProperty('progress');
    expect(first).not.toHaveProperty('complete');
    expect(first).not.toHaveProperty('generatedAt');
  }
});
```

**DROP (partial-key assertion, lines 347-361):**

```typescript
it('two-key discipline: events:llm:v3:partial holds LLMCachePayload envelope', async () => {
  // ... entire it() body deletes ...
});
```

**Rename describe block (line 320)** from `'D-04/D-11 two-key discipline + Pitfall 8'` to `'Phase 35 D-12 one-key discipline + Pitfall 8'` — small narrative breadcrumb so future readers see the retirement in the test name.

**Also strip the `processEventGroupsMock` partial-key writes at lines 156-168, 174-184** (the in-test simulation of the deleted writer):

```typescript
// DELETE: the lines 156-168 + 174-184 cacheSetSpy partial-key calls
// inside processEventGroupsMock — the production writer is gone, the
// mock should not simulate it either.
```

**Sibling files (`incrementalWrite.test.ts`, `crossBoundary.test.ts`) follow the same shape** — drop the partial-key `cacheSetSpy.mock.calls.filter` assertions; keep every terminal-key assertion verbatim.

---

### `server/__tests__/cache/redis-prefix.test.ts` (test edit — D-12 fixture line)

**Analog:** self (lines 120-125 — single-literal removal).

**Lines 120-125 BEFORE (3-key delete fixture):**

```typescript
await redis.del('events:llm:v3', 'events:llm:v3:partial', 'events:llm-pipeline-audit');
expect(calls[0].args).toEqual([
  'dev:events:llm:v3',
  'dev:events:llm:v3:partial',
  'dev:events:llm-pipeline-audit',
]);
```

**Lines 120-125 AFTER (drop partial-key from variadic-del fixture):**

```typescript
await redis.del('events:llm:v3', 'events:llm-pipeline-audit');
expect(calls[0].args).toEqual(['dev:events:llm:v3', 'dev:events:llm-pipeline-audit']);
```

Test still exercises the variadic-key prefix code path with ≥2 args; the partial-key removal does not weaken the test's behavioral contract.

---

### `server/lib/llmResolver.ts` (JSDoc-only edit — D-09, D-10)

**Existing style (lines 1-11)** is the bar — preserved as-is:

```typescript
/**
 * Phase 27.4 Layered Geocoding Resolver (D-22).
 *
 * Six paths in strict priority order (D-22):
 *   1. own-site-snapshot
 *   2. poi-amenity-nominatim       - Plan 05 (D-03): forwardGeocodeConstrained({amenity}) + country filter + cache
 *   ...
 *   6. gdelt-actiongeo-fallback
 */
```

**Per-export JSDoc one-liner pattern** (existing-good lines 52-59):

```typescript
/**
 * Test-only: reset the module-level throttle timestamp so tests don't
 * accumulate wait time between invocations. Safe to call from test setup;
 * no-op in production.
 */
export function __resetThrottleForTests(): void {
```

**D-09 audit method:** Walk every `export function` / `export const` / `export interface` / `export type` in the file. For each, ensure a `/** ... */` block exists immediately above. If missing OR cites a deleted code path, add/rewrite to a single true-today line.

---

### `server/lib/llmCircuitBreaker.ts`, `llmDLQ.ts`, `llmTokenBudget.ts`, `llmExtractorWatchdog.ts` (JSDoc-only edits — D-09)

**These four modules already have well-written JSDoc — most of the audit is "verify true today, leave alone."**

**Existing-good pattern from `llmExtractorWatchdog.ts:54-67`** (verbatim):

```typescript
/**
 * Wrap a batch promise with a hard-timeout + late-resolve guard.
 *
 * Contract:
 *   - Returns T when batchFn resolves before timeoutMs.
 *   - Returns null when batchFn is killed by the hard-timeout (onTimeout
 *     has been awaited by the time this returns).
 *   - Rethrows when batchFn rejects before the hard-timeout (behaviorally
 *     identical to calling batchFn() directly — the caller's try/catch sees
 *     the same error path as pre-watchdog code).
 *   - A batch promise that resolves or rejects AFTER the timeout fires is
 *     silently discarded — onTimeout is NOT invoked again and no return
 *     value clobbers the null the caller has already received (D-05).
 */
export async function withBatchWatchdog<T>(...)
```

**Existing-good pattern from `llmDLQ.ts:1-9` + `llmCircuitBreaker.ts:1-11`** (top-of-file blocks — UNTOUCHED per D-09 scope).

**Module-level export JSDoc — small one-liner shape** (apply where missing):

```typescript
/** Daily token ceilings per provider (free tier). */
export const DAILY_LIMITS: Record<Provider, number> = { ... };

/** Compute today's UTC date-stamped key for the per-provider token counter. */
export function todayKey(provider: Provider): string { ... }

/** Atomically increment the daily token counter and refresh the 48h TTL. */
export async function incrDailyTokens(provider: Provider, n: number): Promise<number> { ... }
```

---

### `server/lib/freeClaudeRouter.ts` (doc-comment edit — D-15, D-16 callers block)

**Analog:** self (lines 1-16 — existing vendored-from block to PREPEND above, NOT replace, per Claude's-Discretion-4 + CONTEXT D-15).

**Existing lines 1-16 (PRESERVED below the new callers block):**

```typescript
/**
 * Vendored from https://github.com/Alishahryar1/free-claude-code
 * Pinned commit SHA: 40951c145ad29d6dfe450e83fd2b91fc19b9a27f
 * License: MIT (upstream LICENSE applies; see LICENSE-VENDORED.md if added)
 *
 * Phase 27.4.3 (D-01, D-02). This file ports four concepts from upstream:
 *   1. Per-provider client config (NVIDIA NIM, OpenRouter)
 *   2. Rolling-window rate limiter (40 req/min for NVIDIA NIM)
 *   3. Reactive 429 exponential backoff with jitter
 *   4. <think>-block stripper / reasoning_content parser (D-11)
 *
 * NOT ported (D-02 vendoring scope):
 *   - FastAPI / uvicorn server
 *   - Anthropic <-> OpenAI message-shape translator (we use OpenAI SDK natively)
 *   - Discord bot, Telegram bot, claude-pick CLI
 */
```

**PREPEND THIS** (verbatim from CONTEXT D-16 + RESEARCH Common Operation 4, file:line refs confirmed by RESEARCH grep audit):

```typescript
/**
 * Free Claude Router — multi-provider cascade for LLM-backed extraction + geocoding.
 *
 * Live production callers (verified Phase 35 / 2026-05-MM):
 *   - server/lib/llmEventExtractor.v3.ts:40 — sole runtime extractor; calls
 *     callLLM for each event-group batch.
 *   - server/lib/llmResolver.ts:15 — 6-path geocode resolver; calls callLLM
 *     for the nominatim-verified-2pass reranker only.
 *   - server/adapters/llm-provider.ts:23 — bridge wrapper; re-exports callLLM
 *     for legacy import paths (Phase 27.4.3 D-03 cascade replacement).
 *
 * Active cascade shape (Phase 34 close): NIM primary (qwen-235b instruct);
 * OpenRouter dormant (skipOpenRouter: true at extractor sites per Phase 30.1);
 * Cerebras + Groq deferred (Phase 34 close — see ADR-0010 Phase 34 sub-block).
 *
 * Test callers (NOT live production — listed for completeness):
 *   - server/__tests__/lib/freeClaudeRouter.test.ts (canonical contract)
 *   - server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts
 *   - server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts
 *   - server/__tests__/lib/llmLineage-prefilter.test.ts
 *   - server/__tests__/lib/llmResolver.test.ts
 *   - server/__tests__/adapters/llm-provider.test.ts
 */
```

---

### `CLAUDE.md` §Serverless Cache subsection (D-14, D-12, D-23 markdown surgical edits)

**Analog:** self (lines 116-140 — existing 1-line-per-key shape preserved; surgical 4-add / 1-remove / 2-refine).

**Existing shape (line 116, the bar for new entries):**

```markdown
- **`events:llm:v3`** — active terminal LLM-enriched cache; cron writer (sole); `/api/events` reader. Only key written by the cascade.
```

**4 ADDITIONS per D-14** (use the same 1-line shape; source `file:line` refs from RESEARCH grep audit):

```markdown
- **`events:llm:v3:lineage:{eventId}` (Phase 27.4.3 D-13)** — HSET of per-event lineage record (prompt/response/parsed/coord/reasoningTrace/lineageHash); 7d TTL. Writer: `server/lib/llmLineage.ts:57` `appendLineage`. Reader: lineage drill-down (DevApiStatus) + `scripts/snapshot-v3-redis.ts`.
- **`events:llm:v3:lineage-keys` (Phase 27.4.3 D-13)** — ZADD sorted-set index of lineage entries; 7d TTL; capped 500 entries (`LINEAGE_MAX_ENTRIES`). Writer: `server/lib/llmLineage.ts:78`. LRU eviction via `ZREMRANGEBYRANK`.
- **`events:llm:v3:group-lineage:{hash}` (Phase 27.4.4 D-18)** — pre-filter cache for group-level lineage; 7d TTL. Reader: `server/lib/llmEventExtractor.v3.ts:529-587` (`processEventGroupsV3` pre-filter loop). Write side not yet implemented (Plan 02 Gate B follow-up — see `server/lib/llmLineage.ts:104` comment).
- **`events:llm-pipeline-audit` (Phase 27.4.3 D-15)** — LPUSH + LTRIM bounded list (200 cap); 90d TTL. Writer: `server/lib/pipelineAudit.ts:33-35` `appendPipelineAudit`. Reader: `:44` `listPipelineAudit`. Historical record of pipeline-version flips — no new writers expected post-Phase-29.
```

**1 REMOVAL per D-12** — delete line 117 entirely:

```markdown
- **`events:llm:v3:partial`** — observability-only incremental write during cron run; `LLMCachePayload` envelope; never served to clients.
```

**2 REFINEMENTS per D-23 + RESEARCH Pitfall 3-4:**

Line 129 — SPLIT `news:gdelt` + `news:feed`:

```markdown
- **`news:feed`** — clustered render-target cache (RSS + GDELT-DOC merged, Jaccard 0.8 dedup, 7-day window); 15-min TTL. Writer: `server/routes/news.ts:28`. Reader: same file + `healthSources.ts:40`.
- **`news:gdelt`** — raw GDELT-DOC LLM-input cache; 15-min TTL. Writer: GDELT-DOC adapter. Reader: `server/lib/llmEventExtractor.v3.ts:107` (NEWS BLOCK in prompt); `server/routes/events.ts:672` (fallback).
```

Line 130 — PARAMETRIZE `markets:yahoo` → `markets:yahoo:{range}`:

```markdown
- **`markets:yahoo:{range}`** — Yahoo Finance commodity prices, one key per `range ∈ {1d, 5d, 1mo, ytd}`; 60s TTL. Writer/reader: `server/routes/markets.ts:26` `cacheKey = \`markets:yahoo:${range}\``.
```

---

### `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (D-22 append — Phase 35 sub-block)

**Analog:** Phase 30 / 30.1 / 34 sub-blocks at lines 52-106 — three identical-shape precedents.

**Sub-block header pattern** (verbatim from lines 52, 82, 108):

```markdown
## Phase {N} Sub-block (appended YYYY-MM-DD)

{One-paragraph framing — what the phase did + how it relates to the v1.5 ADR's narrowing-and-deletion theme.}

- **D-{N} ({title}):** {decision recorded; load-bearing numbers cited from architecture-doc rather than inline}
- ...
```

**Phase 35-specific scope per CONTEXT D-22 — sub-block records:**

1. Upstash command-budget pre/post delta + primary drivers (D-21 attribution)
2. Bundle-size pre/post delta on `api/vercel-entry.js` (D-19 `wc -c` measurement)
3. Partial-key retirement rationale (SIMPLIFY-02 / D-12)
4. Registry drift gate rationale (D-01 — load-bearing primitive that prevents recurrence)
5. Phase 34 cerebras-groq-deferred carryover note (no Cerebras/Groq token-budget keys exist in registry)

**Header to use:**

```markdown
## Phase 35 Sub-block (appended 2026-MM-DD)

Phase 35 closed the v1.5 documentation-and-cleanup track deferred while LLM-RELI ran. Mechanical drift gate (D-01 vitest) is the load-bearing primitive — the hand-maintained CLAUDE.md registry rotted in expected ways during Phases 27-34 (4 missing keys, 1 retire-but-still-listed); the gate prevents recurrence. Partial-key retirement (D-12 / SIMPLIFY-02) was the only code deletion. Everything else is documentation authoring.

- **D-01 (drift gate):** ...
- **D-12 (SIMPLIFY-02):** ...
- **D-19 (bundle-size delta):** ...
- **D-20 (Upstash budget delta):** ...
- **D-22 (this sub-block):** ...
```

---

## Shared Patterns

### Pattern S1: Atomic per-decision commits (cross-phase invariant)

**Source:** Phase 30 D-08 / Phase 31 / Phase 32 / Phase 33 / Phase 34 D-25 (CLAUDE.md §Conventions).
**Apply to:** Every D-N in CONTEXT.md that touches code.
**Shape:**

```
feat(35): {one-line summary citing decision} (D-N)
test(35): {test edit summary citing decision} (D-N)
chore(35): {cleanup summary citing decision} (D-N)
docs(35): {doc edit summary citing decision} (D-N)

{Optional body — rationale, links, file:line refs.}
```

Per CONTEXT D-26: `feat(35):` / `chore(35):` / `docs(35):` / `test(35):` prefixes; body names the decision number.

### Pattern S2: Branch-per-phase from `main`

**Source:** CLAUDE.md §Conventions — `feature/XX-description` branches; never commit to main directly.
**Apply to:** Plan 35-01 execution start.
**Shape:** `git checkout main && git pull && git checkout -b feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu`

CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on the current branch as scaffold; everything else moves to the feature branch.

### Pattern S3: `logger.child({ module: '...' })` for any runtime code

**Source:** CLAUDE.md §Conventions — never `console.*`; use Pino structured logging.
**Apply to:** Any new runtime code (NONE expected in Phase 35; the vitest is test-tier, the inventory script is read-only).
**Shape (existing-good from `llmDLQ.ts:15` / `llmExtractorWatchdog.ts:28`):**

```typescript
import { logger } from './logger.js';
const log = logger.child({ module: 'llm-dlq' });
log.warn({ err, id: entry.id }, 'DLQ enqueue failed (redis unreachable)');
```

Phase 35 ships no new modules with this pattern, but the vitest at `src/__tests__/lib/redis-registry.test.ts` does NOT need it (test code uses `expect.fail` / `expect(...).toBe(...)` for failures, not log lines).

### Pattern S4: `// @vitest-environment node` for fs-heavy tests

**Source:** `server/__tests__/lib/urlLiveness.schema.test.ts:1` + 4+ other node-env tests in `server/__tests__/`.
**Apply to:** `src/__tests__/lib/redis-registry.test.ts` (the D-01 vitest reads `node:fs` and walks the codebase).
**Shape:** Line 1 of the new test file:

```typescript
// @vitest-environment node
```

Required because the project's vitest default is jsdom (`vite.config.ts:56`); fs-heavy tests opt into node via this comment-override.

### Pattern S5: Cron-only writer discipline (anti-pattern #17)

**Source:** ADR-0010 invariant; CLAUDE.md §LLM Event Pipeline.
**Apply to:** Negative constraint — Phase 35 ships NO new writers to `events:llm:v3` or any other production cache.
**Verification:** The D-01 vitest is read-only; the inventory artifact is hand-edited markdown; the partial-key retirement is a DELETION not a new writer; the JSDoc audit is comment-only; the CLAUDE.md edit is markdown-only; the ADR sub-block is markdown-only.

---

## No Analog Found

(None. Every Phase 35 deliverable has an in-tree precedent; this is a pure-cleanup phase with no greenfield architecture.)

---

## Metadata

**Analog search scope:**

- `src/__tests__/lib/` (3 templates: colorBridge, actorCatalog, urlLiveness)
- `server/__tests__/lib/` (urlLiveness schema, llmExtractionPipeline.terminalShape, sibling test files)
- `server/__tests__/cache/redis-prefix.test.ts` (fixture-edit analog)
- `server/lib/` (7 LLM-pipeline modules for JSDoc style + freeClaudeRouter for callers-block PREPEND)
- `docs/architecture/` (llm-pipeline-reliability.md for style template)
- `docs/adr/0010-*.md` (lines 52-106 — 3 prior sub-block precedents)
- `CLAUDE.md` lines 116-140 (§Serverless Cache subsection for surgical edit pattern)

**Files scanned:** ~15 (each Read once; no re-reads)
**Pattern extraction date:** 2026-05-26

**Cross-references for executor:**

- 35-CONTEXT.md decisions D-01..D-27 (the source-of-truth for what to ship)
- 35-RESEARCH.md Pattern 1 (vitest sketch), Common Operations 1-5, Pitfalls 1-6, Grep Audit
- CLAUDE.md §Conventions (branch + commit + logger discipline)
- CLAUDE.md §Serverless Cache (the surface being edited per D-14 / D-12 / D-23)
- ADR-0010 lines 52-106 (sub-block format precedent for D-22)
