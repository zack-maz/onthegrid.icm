# Phase 31: Cron Stability Validation (7-day Watch) — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 11 (4 modified, 4 created, 3 read-only references)
**Analogs found:** 10 / 10 file-creation targets (one target — `watch-log.json` — has two complementary analogs)

---

## File Classification

| New/Modified File                                                          | Action                       | Role                       | Data Flow                                                                                                                                                                  | Closest Analog                                                                                                                                       | Match Quality                  |
| -------------------------------------------------------------------------- | ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `scripts/snapshot-cron-watch.ts`                                           | CREATE                       | operator script (CLI)      | reads Redis (`events:llm-summary:v3`, `events:llm-dlq`, `cron:lastTick:refresh-events`); reads `/api/health` (HTTP GET); writes JSON + markdown atomically; exits 0/1/2/99 | `scripts/analyze-llm-run.ts` (primary) + `scripts/probe-openrouter.ts` (atomic-write) + `scripts/refresh-water-facilities.ts` (sort+round)           | EXACT (role + data flow)       |
| `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json` | CREATE                       | observability artifact     | append-only (idempotent by `tickDate`); byte-stable JSON snapshot grown daily                                                                                              | `.planning/phases/30-.../run-1-throttle-snapshot.json` (shape) + `.planning/phases/30.1-.../30.1-or-pulse-snapshot.json` (sort+timestamp discipline) | EXACT (snapshot convention)    |
| `server/__tests__/lib/llmExtractionPipeline.test.ts`                       | CREATE                       | unit test                  | exercises `runRefreshExtraction` diff-filter; mocks Redis + LLM provider + eval harness                                                                                    | `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`                                                                                   | EXACT (same module under test) |
| `server/__tests__/scripts/snapshot-cron-watch.test.ts`                     | CREATE                       | contract test              | pins watch-log row schema + classification rules; pure unit (no I/O)                                                                                                       | `server/__tests__/schemas/waterFilterStats.test.ts` (schema-pin) + `server/__tests__/routes/cron-lasttick.test.ts` (taxonomy contract)               | role-match (schema pin)        |
| `server/lib/llmExtractionPipeline.ts`                                      | MODIFY (1 line at L277)      | library module (cron-only) | in-place fix to diff-filter set comparison; no shape change                                                                                                                | self (existing surrounding code at L260-294)                                                                                                         | n/a — minimal in-place edit    |
| `vercel.json`                                                              | MODIFY                       | deploy config              | adds `functions["api/vercel-entry.js"].includeFiles` to bundle eval fixtures                                                                                               | self (existing `functions` block at L15-19)                                                                                                          | n/a — config extension         |
| `scripts/analyze-llm-run.ts`                                               | MODIFY (≤5 LOC at file head) | operator script            | ≤5 LOC docstring + `--help` text addition; no behavior change                                                                                                              | self (existing JSDoc at L1-41)                                                                                                                       | n/a — docstring extension      |
| `docs/runbook.md`                                                          | MODIFY                       | operator docs              | appends one paragraph at end of file (or new `## 12` section)                                                                                                              | self (existing `## N. <topic>` sections L36-870)                                                                                                     | n/a — additive prose           |
| `docs/architecture/llm-pipeline-reliability.md`                            | MODIFY (daily during watch)  | architecture docs          | appends rows to "7-Day Watch (Phase 31, LLM-RELI-06)" section reserved at L144-146                                                                                         | self (existing placeholder at L144-146)                                                                                                              | n/a — pre-reserved slot        |
| `package.json`                                                             | MODIFY (≤2 LOC)              | runner config              | adds `"watch:snapshot"` entry to `scripts` block                                                                                                                           | self (existing entries at L22-28)                                                                                                                    | n/a — runner registration      |

---

## Pattern Assignments

### `scripts/snapshot-cron-watch.ts` (operator script, CLI)

**Primary analog:** `scripts/analyze-llm-run.ts` (Phase 30 D-01, 320 LOC)
**Secondary analog (atomic JSON write):** `scripts/probe-openrouter.ts` (Phase 30.1, 226 LOC)
**Tertiary analog (sort + ISO-Z + round):** `scripts/refresh-water-facilities.ts` (Phase 27.3.1 R-04, 185 LOC)
**Created by Phase:** 30 D-01 set the template; 30.1 D-03..D-06 added the byte-stable JSON discipline; this new file fuses both.

**Why these are the right analogs:** All three are read-mostly operator scripts invoked via `npm run <name>`, all use the canonical `node --env-file-if-exists=.env --import tsx/esm` runner, and each contributes one orthogonal pattern Phase 31's snapshot script needs: (1) `analyze-llm-run.ts` shows how to read `events:llm-summary:v3` via `cacheGetSafe` + the argv-helper + non-zero-exit discipline; (2) `probe-openrouter.ts` shows how to write a byte-stable JSON snapshot with atomic tempfile+rename + ISO-Z timestamp + sort; (3) `refresh-water-facilities.ts` shows the sort-and-round-coordinates discipline that keeps committed diffs reviewable. The new script is functionally a fusion: read summary like analyzer, write JSON like probe, sort+round like refresh-water.

**Imports pattern** (`scripts/analyze-llm-run.ts:42-48`):

```ts
import { readFileSync, writeFileSync } from 'node:fs';

import { cacheGetSafe } from '../server/cache/redis.js';
import { logger } from '../server/lib/logger.js';
import type { LLMRunSummary } from '../server/lib/llmProgress.js';

const log = logger.child({ module: 'analyze-llm-run' });
```

**Redis-read with permissive TTL** (`scripts/analyze-llm-run.ts:278-285`):

```ts
// Redis-mode (production) — read events:llm-summary:v3 with a long logical
// TTL so the analyzer never considers the summary "stale" (we want the
// most recent run regardless of age).
const cached = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
if (!cached?.data) {
  console.error('events:llm-summary:v3 missing or empty');
  process.exit(1);
}
summary = cached.data;
```

**Argv-parsing helper (no CLI library)** (`scripts/analyze-llm-run.ts:249-253`):

```ts
function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found?.split('=')[1];
}
```

**Atomic tempfile+rename JSON write** (`scripts/probe-openrouter.ts:37-39, 56-61, 201-203`):

```ts
import { writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../.planning/phases/31-cron-stability-validation-7-day-watch');
const OUT_PATH = resolve(OUT_DIR, 'watch-log.json');
const TMP_PATH = resolve(OUT_DIR, 'watch-log.json.tmp');

// ... after building `snapshot` object with sorted rows ...
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(TMP_PATH, JSON.stringify(snapshot, null, 2) + '\n');
renameSync(TMP_PATH, OUT_PATH);
```

**Tempfile cleanup on failure** (`scripts/probe-openrouter.ts:217-225`):

```ts
main().catch((err) => {
  console.error(err);
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch {
    /* swallow */
  }
  process.exit(1);
});
```

**Sort + ISO-Z + 2-space pretty + trailing newline** (`scripts/refresh-water-facilities.ts:93-96, 113-116`):

```ts
const generatedAt = new Date().toISOString();
const sortedFacilities: WaterFacility[] = [...raw]
  .map((f) => ({ ...f, lat: roundCoord(f.lat), lng: roundCoord(f.lng) }))
  .sort((a, b) => a.id.localeCompare(b.id));
// ...
const jsonStr = JSON.stringify(snapshot, null, 2) + '\n';
writeFileSync(TMP_PATH, jsonStr);
renameSync(TMP_PATH, OUT_PATH);
```

For Phase 31: rows in `watch-log.json` are sorted by `tickDate.localeCompare(...)` ascending (ISO `YYYY-MM-DD` strings are naturally lexicographic-sortable). `freshnessMs` is rounded to integer ms via `Math.round`. Exit code discipline mirrors analyzer but adds GAP=2 + script-error=99 (per CONTEXT D-10 + RESEARCH §"Exit codes").

**Logger discipline** (`scripts/probe-openrouter.ts:47`, mirrors CLAUDE.md):

```ts
const log = logger.child({ module: 'snapshotCronWatch' });
// ... inside main ...
log.info({ tickDate, healthStatus, dlqCount, result }, 'watch tick captured');
```

Operator-facing stdout is still `console.log` (banner + markdown table); structured fields go through `log.child(...)`. Per analyzer L300-301: _"intentional console.log per CLAUDE.md logger discipline — analyzer's stdout IS the doc-paste artifact for D-06"_ — same rationale here.

---

### `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json` (observability artifact)

**Primary analog (shape):** `.planning/phases/30-.../run-1-throttle-snapshot.json`
**Secondary analog (sort + ISO-Z + bucketed `summary`):** `.planning/phases/30.1-.../30.1-or-pulse-snapshot.json`
**Created by Phase:** 30 D-08 + 30.1 D-04 set the per-phase JSON snapshot convention; this new file inherits it but extends to an append-grown shape.

**Why these are the right analogs:** Both prior snapshots are byte-stable, pretty-printed JSON committed to `.planning/phases/<N>/` with trailing newlines, sorted internal arrays, and ISO-Z timestamps. The Phase 30 run-1 snapshot establishes the metric vocabulary (`batchCount`, `evalScore.{within5km, within20km, within100km, total}`, `watchdogTimeoutCount`) that the watch-log row reuses verbatim. The 30.1 OR-pulse snapshot establishes the multi-row-with-summary shape (`results: [...]` + `summary: {...}`) that watch-log mirrors with `rows: [...]` + `lastSnapshottedTickDate` at the top level.

**Existing shape — run-1-throttle-snapshot.json L1-23 (verbatim):**

```json
{
  "runTimestamp": 1778980781669,
  "durationMs": 122628,
  "batchCount": 213,
  "watchdogTimeoutCount": 0,
  "throttleWindowMs": {
    "path": "B",
    "median": 306,
    "p95": 306
  },
  "steadyStateRpm": 0,
  "recoveryIntervalMs": null,
  "perBatchLatency": {
    "p50": 21053,
    "p95": 33263
  },
  "evalScore": {
    "within5km": 0,
    "within20km": 0,
    "within100km": 0,
    "total": 0
  }
}
```

**Existing shape — 30.1-or-pulse-snapshot.json L1-12 (verbatim, top-level wrapper):**

```json
{
  "timestamp": "2026-05-17T19:44:40.161Z",
  "n": 30,
  "gapMs": 100,
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "results": [
    {
      "attempt": 1,
      "status": "rate_limit",
      "latencyMs": 34028,
      "errorMessage": "429 Provider returned error"
    },
```

**Phase 31 row shape (per CONTEXT D-08; pinned by contract test):**

```json
{
  "schemaVersion": "1.0",
  "lastSnapshottedTickDate": "2026-05-19",
  "rows": [
    {
      "tickDate": "2026-05-19",
      "snapshotAt": "2026-05-19T04:32:11Z",
      "natural": true,
      "healthStatus": "healthy",
      "freshnessMs": 1234567,
      "dlq": { "count": 0, "reasons": {} },
      "eval": { "at5km": 0.42, "at20km": 0.82, "at100km": 0.96 },
      "batchCount": 213,
      "breakerTrips": 0,
      "result": "PASS",
      "notes": ""
    }
  ]
}
```

The `schemaVersion` top-level field is researcher-recommended (Open Q1 in RESEARCH.md §"Open Questions for Planner") so the contract test can branch on schema-version for future evolution. The contract test pins this exact shape on day 1 — schema changes mid-watch are themselves a watch event (Risk 2 in RESEARCH.md).

---

### `server/__tests__/lib/llmExtractionPipeline.test.ts` (unit test, NEW FILE)

**Analog:** `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` (Phase 28.2.6 Plan 01 Task 2)
**Created by Phase:** 28.2.6 set this hoisted-mock pattern across all `llmExtractionPipeline` tests.

**Why this is the right analog:** Same module under test (`server/lib/llmExtractionPipeline.ts`), same set of dependency mocks required (`cache/redis`, `config`, `safeWaitUntil`, `logger`, `llm-provider`, `llmTokenBudget`, `devFileCache`, `sourceTiers`, `llmEvalHarness`, `eventGrouping`, `llmProgress`), same hoisted-env pattern. The new test only needs to drive `groupGdeltRows` to emit groups whose keys would (incorrectly, pre-fix) collide with the `llm-v3-` prefixed cached IDs — the rest of the harness is already proven.

**Imports + hoisted-env pattern** (`llmExtractionPipeline.terminalShape.test.ts:1-34`):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    NVIDIA_NIM_API_KEY: 'fake',
    OPENROUTER_API_KEY: '',
    LLM_BATCH_TIMEOUT_MS: 120_000,
    LLM_V3_CONCURRENCY: 1,
    V3_ADAPTIVE_BATCH: false,
    V3_LINEAGE_PREFILTER: false,
    V3_WATCHDOG_ROLLBACK_THRESHOLD: 2,
    LLM_BATCH_SIZE: 2,
    CRON_SECRET: '',
  },
}));
```

**Cache mock with map-backed store** (`llmExtractionPipeline.terminalShape.test.ts:36-55`):

```ts
const cacheStore = new Map<string, unknown>();
const cacheSetSpy = vi.fn(async (key: string, data: unknown, _ttl: number) => {
  cacheStore.set(key, data);
});
const cacheGetSpy = vi.fn(async (key: string, _maxAgeMs: number) =>
  cacheStore.has(key) ? { data: cacheStore.get(key), fetchedAt: Date.now() } : null,
);

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: cacheGetSpy,
  cacheSetSafe: cacheSetSpy,
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../config.js', () => ({ env: mockEnv }));
```

**Eval harness + grouping mocks (the only Phase 31-specific bit)** (`llmExtractionPipeline.terminalShape.test.ts:107-121`):

```ts
const runEvalSpy = vi.fn().mockResolvedValue({
  score: 0.85,
  withinKm5: 30,
  withinKm20: 35,
  withinKm100: 40,
  total: 50,
});
vi.mock('../../lib/llmEvalHarness.js', () => ({ runEval: runEvalSpy }));

const groupGdeltRowsMock = vi.fn();
vi.mock('../../lib/eventGrouping.js', () => ({
  groupGdeltRows: groupGdeltRowsMock,
}));
```

**Test scenario to add (Phase 31 D-01 prep #2):** Seed `cacheStore.set('events:llm:v3', [{ id: 'llm-v3-20513-19-18', ... }])`. Drive `groupGdeltRowsMock.mockReturnValue([{ key: '20513-19-18', rows: [...] }, { key: '99999-19-18', rows: [...] }])`. Assert that after `runRefreshExtraction()`, only ONE group reached the LLM provider (the `99999-19-18` one) — the cached `20513-19-18` was correctly filtered by the prefix-add fix at L277.

---

### `server/__tests__/scripts/snapshot-cron-watch.test.ts` (contract test, NEW FILE)

**Primary analog (schema-pinning shape):** `server/__tests__/schemas/waterFilterStats.test.ts` (Phase 27.3.1 R-08)
**Secondary analog (multi-case taxonomy contract):** `server/__tests__/routes/cron-lasttick.test.ts` (Phase 28.2.7 R1)
**Tertiary analog (DLQ enum coverage):** `server/__tests__/lib/llmDLQ.test.ts` (Phase 27.4.4 D-30)

**Why these are the right analogs:** The Phase 31 contract test has two jobs: (a) pin the `WatchRow` JSON schema so mid-watch schema drift is detected (Risk 2 in RESEARCH.md), and (b) prove the classification rules (PASS/FAIL/GAP per CONTEXT D-03/D-09/D-11). Job (a) mirrors `waterFilterStats.test.ts`'s `.strict()` schema-pin approach (a Zod-or-equivalent schema imported from the script + tested with negative cases). Job (b) mirrors `cron-lasttick.test.ts`'s "six cases that pin the taxonomy" structure — one case per classification outcome (healthy PASS, healthy + whitelisted-DLQ PASS, non-whitelisted-DLQ FAIL, health-not-healthy FAIL, GAP detection, unknown-reason-forward-compat FAIL). The DLQ-enum source-of-truth check borrows from `llmDLQ.test.ts`'s explicit `reason:` string assertions (lines 42-55).

**Strict schema-pin pattern** (`waterFilterStats.test.ts:1-19, 49-53`):

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { waterResponseSchema } from '../../schemas/cacheResponse.js';

describe('Phase 27.3.1 R-08 waterFilterStatsSchema extensions', () => {
  const base = { data: [], stale: false, lastFresh: Date.now() };
  const emptyStats = {
    /* ...required fields... */
  };

  it('accepts the empty-stats shape', () => {
    const r = waterResponseSchema.safeParse({ ...base, filterStats: emptyStats });
    expect(r.success).toBe(true);
  });
});
```

**Multi-case taxonomy contract pattern** (`cron-lasttick.test.ts:1-19`):

```ts
// @vitest-environment node
/**
 * Phase 28.2.7 R1 — contract tests for `cron:lastTick:<name>` writers
 * across all three Vercel cron handlers (cron-health, cron-warm,
 * refresh-events-cron).
 *
 * Six cases:
 *   1. cron-health writes cron:lastTick:health after body succeeds (D-03).
 *   2. cron-warm writes cron:lastTick:warm when both fetches succeed.
 *   3. cron-warm writes cron:lastTick:warm when one fulfills + one rejects (D-04).
 *   ...
 */
import { Router } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

**DLQ reason enum source-of-truth (for D-03 whitelist assertion)** (`server/lib/llmDLQ.ts:27-37`, copy verbatim into the contract test as the canonical fixture):

```ts
reason:
  | 'zod_fail'              // v1/v2 only — extractor modules deleted Phase 29
  | 'llm_null'              // v1/v2 only
  | 'retry_exhausted'       // v1/v2 only
  | 'timeout_watchdog'      // v1/v2 only (distinct from v3:timeout_watchdog)
  | 'v3:timeout_watchdog'   // ACTIVE — WHITELISTED
  | 'v3:malformed'          // ACTIVE — fail the day
  | 'v3:max_tokens_truncation' // ACTIVE — fail the day
  | 'v3:schema_fail'        // ACTIVE — fail the day
  | 'v3:rate_limit_exhaust' // legacy — fail the day if observed
  | 'v3:adaptive-retry-fail'; // ACTIVE — WHITELISTED
```

The contract test asserts: (1) `WATCH_DLQ_WHITELIST.length === 2`; (2) every string in `WATCH_DLQ_WHITELIST` is also in the union above; (3) the `classifyTick` function returns FAIL for any string NOT in the whitelist; (4) an unrecognized future enum value (e.g., `'v3:provider_error'`) returns FAIL — the forward-compat guard.

---

### `server/lib/llmExtractionPipeline.ts` (MODIFY — 1 line at L277, prep #2)

**Action:** in-place fix to the diff-filter set comparison. RESEARCH §"Vector 2" recommends prefix-add (lowest blast radius — does not touch upstream key construction at L471, does not require stripping cached IDs, single-character-level change).

**Existing code at L269-277:**

```ts
// Diff: only process groups whose key isn't already in the LLM cache.
const cachedLlmKeys = new Set<string>();
if (llmCachedRef?.data) {
  for (const e of llmCachedRef.data) {
    if (e.id) cachedLlmKeys.add(e.id);
  }
}
const newGroups = cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(g.key)) : groups;
```

**Fix to apply at L277 (single replacement):**

```ts
const newGroups =
  cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(`llm-v3-${g.key}`)) : groups;
```

**Why this is the right shape:** RESEARCH §"Vector 2" rationale table — strip-prefix would lose round-trip safety; upstream-rename would touch the JSDoc-load-bearing dev drill-down at L438-441. Prefix-add is one character-level edit and preserves both invariants.

---

### `vercel.json` (MODIFY — add `includeFiles` to functions block, prep #1)

**Existing file (verbatim, all 20 lines):**

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "crons": [
    { "path": "/api/cron/health", "schedule": "0 0 * * *" },
    { "path": "/api/cron/warm", "schedule": "0 12 * * *" },
    { "path": "/api/cron/refresh-events", "schedule": "0 4 * * *" },
  ],
  "rewrites": [
    { "source": "/api/cron/:path*", "destination": "/api/vercel-entry" },
    { "source": "/api/:path*", "destination": "/api/vercel-entry" },
    { "source": "/health", "destination": "/api/vercel-entry" },
    { "source": "/(.*)", "destination": "/index.html" },
  ],
  "functions": {
    "api/vercel-entry.js": {
      "maxDuration": 800,
    },
  },
}
```

**Fix to apply (add one line inside the function block):**

```jsonc
"functions": {
  "api/vercel-entry.js": {
    "maxDuration": 800,
    "includeFiles": ".planning/eval/*.json"
  }
}
```

**Why this is the right shape:** RESEARCH §"Vector 1" rationale table — build-time copy script requires ALSO editing `GROUND_TRUTH_PATH` (two changes), fixture relocation forces a doc cascade across ADR-0010 + REQUIREMENTS.md ACTOR-04, inline-import requires TS module-resolution acrobatics. `includeFiles` is the documented Vercel-native mechanism for `fs.readFileSync(__dirname-relative)` patterns. If the glob fails per Assumption A1, fall back to comma-separated explicit paths (`[".planning/eval/ground-truth-events.json", ".planning/eval/adversarial-injections.json"]`).

---

### `scripts/analyze-llm-run.ts` (MODIFY — ≤5 LOC docstring + --help text, prep #3)

**Existing JSDoc head (`scripts/analyze-llm-run.ts:1-41`):** lengthy block ending at line 41 with `Per RESEARCH gotcha at llmEventExtractor.v3.ts widening` paragraph.

**Existing argv parser at L249-253** (no `--help` handling — the prep adds one):

```ts
function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found?.split('=')[1];
}
```

**Prep #3 additions (≤5 LOC, two places):**

1. Add to the JSDoc head (after L40, before the closing `*/`):

```ts
 *
 * Env-var gotcha: `CACHE_KEY_PREFIX="dev: "` (trailing whitespace) is
 * stripped by `node --env-file-if-exists=`. Export manually before running
 * if your dev cache uses whitespace-suffixed prefixes — Phase 30.1 deferred.
```

2. Add to `main()` after the argv parsing (so `--help` short-circuits):

```ts
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npm run analyze:llm-run -- [--fixture=<path>] [--snapshot=<path>]');
  console.log('Env: CACHE_KEY_PREFIX must be exported manually if it has trailing whitespace.');
  process.exit(0);
}
```

**Why this is the right shape:** CONTEXT D-01 calls this "pure dev ergonomic; bundled here only because it's already named in 30.1's deferred list." No behavior change in the Redis-read path; the `--help` short-circuit exits 0 before any I/O.

---

### `docs/runbook.md` (MODIFY — append one paragraph, prep #4)

**Existing structure:** numbered `## N. <topic>` sections L36-870 (currently 11 sections ending at L774 with `## 11. LLM Pipeline Disabled / Keys Absent`).

**Prep #4 addition — one paragraph appended either to `## 11` or as a new `## 12. Quarterly LLM Health Probes` section:**

```markdown
## 12. Quarterly LLM Health Probes

Run `npm run probe:openrouter` once per quarter (or when the
`docs/architecture/llm-pipeline-reliability.md` Cascade Reality section
becomes >90 days old). Output is `.planning/phases/30.1-.../30.1-or-pulse-snapshot.json`
plus a stdout `Decision` line. If `decision !== 'nim-only'` (i.e.,
`rateLimitedPct < 90`), the OpenRouter free-tier may again be a viable
fallback — see [`docs/architecture/llm-pipeline-reliability.md`](architecture/llm-pipeline-reliability.md)
§"Path to Re-Enable" for the cascade-restore steps. The probe spends
~15% of the 200/day OpenRouter free-tier daily cap; safe to re-run
once per planning cycle.
```

**Why this is the right shape:** CONTEXT D-01 prep #4 says "One paragraph appended to `docs/runbook.md` flagging the probe as a recurring operational check." The existing architecture-doc `## Cascade Reality (Phase 30.1, 2026-05-17)` section at L105 + "Path to Re-Enable" sub-section at L138 are already linked here, so the runbook entry is the operator's entry-point pointer.

---

### `docs/architecture/llm-pipeline-reliability.md` (MODIFY — append rows to L144-146, daily during watch)

**Existing placeholder (L142-146, reserved by Phase 30 D-06):**

```markdown
---

## 7-Day Watch (Phase 31, LLM-RELI-06)

Phase 31 appends daily observations here. The 7-day watch validates Phase 30's tuned defaults under real production traffic across a full operational week before declaring v1.5 throttle work "done." The eval-harness fixture-bundling fix is a prerequisite for Phase 31 — without it, eval drift over the 7-day window is unobservable for the same reason Plan 06's correctness gate was INCONCLUSIVE.
```

**Daily-append shape (Phase 31 writes; one row per snapshot):**

```markdown
### Day-by-day watch (started YYYY-MM-DD)

| tickDate   | natural | health  | freshnessMs | DLQ | eval @5/20/100km   | batchCount | breakerTrips | result | notes                 |
| ---------- | ------- | ------- | ----------- | --- | ------------------ | ---------- | ------------ | ------ | --------------------- |
| 2026-05-19 | yes     | healthy | 1234567     | 0   | 0.42 / 0.82 / 0.96 | 213        | 0            | PASS   |                       |
| 2026-05-20 | yes     | healthy | 1300000     | 0   | 0.44 / 0.83 / 0.96 | 78         | 0            | PASS   | post-fix steady-state |
```

**Why this is the right shape:** Per RESEARCH Open Q5: regenerate-entire-table from JSON on each run (simpler, deterministic, and the markdown table is the doc-paste artifact — not the system-of-record). The snapshot script reads `watch-log.json`, projects each row's fields to the markdown column order above, and replaces the table content between two sentinel comments `<!-- watch-log:begin -->` / `<!-- watch-log:end -->` (planner picks the exact sentinel form).

---

### `package.json` (MODIFY — add `watch:snapshot` to scripts, D-07)

**Existing relevant entries (`package.json:22-28`):**

```json
"refresh:water": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/refresh-water-facilities.ts",
"refresh:sites": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/refresh-sites.ts",
"eval:replay": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/eval-replay.ts",
"probe:openrouter": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/probe-openrouter.ts",
"analyze:llm-run": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/analyze-llm-run.ts",
"snapshot:v3": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/snapshot-v3-redis.ts",
```

**Addition (insert alphabetically between `snapshot:v3` and the next entry):**

```json
"watch:snapshot": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/snapshot-cron-watch.ts",
```

**Why this is the right shape:** RESEARCH §"Pattern 4 — Runner invocation" — every operator script in `scripts/` uses this exact runner string verbatim. Name choice `watch:snapshot` (verb-first) avoids collision with the existing `snapshot:v3` entry (which targets a different Redis snapshot script).

---

## Shared Patterns

### Cross-cutting: `logger.child({ module })` (NO `console.*` for structured fields)

**Source:** CLAUDE.md "TypeScript pinned to ~5.9.3" + Phase 28.1 W7 logger discipline.
**Apply to:** All new TS files in this phase (`scripts/snapshot-cron-watch.ts`, both new tests).
**Excerpt** (`scripts/analyze-llm-run.ts:48`, `scripts/probe-openrouter.ts:47`):

```ts
import { logger } from '../server/lib/logger.js';
const log = logger.child({ module: '<script-name>' });
log.info({ tickDate, healthStatus }, 'watch tick captured');
```

Operator-facing stdout (banner, markdown table, JSON snapshot when no `--snapshot=<path>`) stays as `console.log` — per analyzer L300-301 the intentional convention. Structured key-value pairs MUST go through `log.child({ module })`.

### Cross-cutting: `node --env-file-if-exists=.env --import tsx/esm` runner (Phase 27.4.2 D-26)

**Source:** `package.json:22-28` — six existing operator scripts use this identical runner string.
**Apply to:** The new `watch:snapshot` entry only.
**Excerpt:**

```
node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/<file>.ts
```

The `--env-file-if-exists=` flag has the trailing-whitespace gotcha that prep #3 documents.

### Cross-cutting: atomic tempfile+rename JSON write (Phase 27.3.1 R-04 → Phase 30.1)

**Source:** `scripts/refresh-water-facilities.ts:113-116` (originator) → `scripts/probe-openrouter.ts:201-203` (current canonical).
**Apply to:** Every JSON file write in Phase 31 — `watch-log.json` updates, any debug snapshot the script may emit.
**Excerpt** (`scripts/refresh-water-facilities.ts:113-116`):

```ts
const jsonStr = JSON.stringify(snapshot, null, 2) + '\n';
writeFileSync(TMP_PATH, jsonStr);
renameSync(TMP_PATH, OUT_PATH);
```

Mid-write crashes leave the prior file intact instead of producing partial JSON. Always paired with a failure-path cleanup (`scripts/probe-openrouter.ts:217-225`).

### Cross-cutting: `@vitest-environment node` + hoisted-env mock (Phase 28.2.6)

**Source:** `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts:1-34`.
**Apply to:** Both new test files (`server/__tests__/lib/llmExtractionPipeline.test.ts`, `server/__tests__/scripts/snapshot-cron-watch.test.ts`).
**Excerpt:**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    /* required env shape */
  },
}));
vi.mock('../../config.js', () => ({ env: mockEnv }));
```

Hoisting is required because `vi.mock` calls execute before top-level imports — without `vi.hoisted`, the `env` mock reference would be undefined when the module-under-test loads.

### Cross-cutting: Redis-read with `cacheGetSafe<T>(key, 999_999_999)` (Phase 30 D-01)

**Source:** `scripts/analyze-llm-run.ts:279-285`.
**Apply to:** All Redis reads from the snapshot script (3 keys: `events:llm-summary:v3`, `events:llm-dlq` via `redis.smembers`, `cron:lastTick:refresh-events` via `cacheGetSafe`).
**Excerpt:**

```ts
const cached = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
if (!cached?.data) {
  console.error('events:llm-summary:v3 missing or empty');
  process.exit(1); // exit 99 for the watch script per RESEARCH §"Exit codes"
}
```

The `999_999_999` ms TTL is the "permissive read" idiom — the script reads the most recent run regardless of how old the cached summary is. The `cron:lastTick:*` read uses the same pattern; the DLQ read uses `redis.smembers(DLQ_KEY)` directly because it's a SADD set, not a CacheEntry.

---

## No Analog Found

None. Every Phase 31 deliverable maps to a strong existing analog.

---

## Metadata

**Analog search scope:**

- `scripts/` (24 files; analyze-llm-run, probe-openrouter, refresh-water-facilities, eval-replay verified as primary templates)
- `server/__tests__/lib/` (20 files; llmExtractionPipeline.terminalShape.test.ts, llmDLQ.test.ts as primary analogs)
- `server/__tests__/routes/` (19 files; cron-lasttick.test.ts as multi-case taxonomy analog)
- `server/__tests__/schemas/` (1 file; waterFilterStats.test.ts as strict-schema-pin analog)
- `.planning/phases/30-.../` + `.planning/phases/30.1-.../` (per-phase JSON snapshot conventions)
- `vercel.json`, `package.json`, `docs/runbook.md`, `docs/architecture/llm-pipeline-reliability.md` (modification-target self-references)

**Files scanned (Read tool):** 11 distinct files (full or scoped reads; no re-reads).
**Pattern extraction date:** 2026-05-17

## PATTERN MAPPING COMPLETE
