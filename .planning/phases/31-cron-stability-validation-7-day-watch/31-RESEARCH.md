# Phase 31: Cron Stability Validation (7-day Watch) — Research

**Researched:** 2026-05-17
**Domain:** Observability tooling + Vercel function bundling + Redis schema mapping
**Confidence:** HIGH — every load-bearing claim is verified by direct code read; remaining uncertainty is operator-runtime behavior (force-trigger timing) and is bounded.

## Summary

Phase 31 is fundamentally a **wait** — 7 consecutive natural 04:00 UTC cron ticks must pass `endpoints.llmEvents.status === 'healthy'` AND a whitelisted DLQ-reason check. The plannable work is two-fold: (1) four small "prep" fixes that make the watch produce meaningful signal, and (2) a single new operator-driven snapshot script + JSON-and-markdown daily artifact.

The four prep fixes are tightly scoped (≤500 LOC total, mostly ≤50 LOC each). Three are confirmed-load-bearing: the eval-bundle fix (`evalScore.total: 0` is the current prod reality, observed in both Phase 30 throttle snapshots), the diff-filter fix (cron re-processes the entire ~213 batch set daily because the diff comparison never matches), and the snapshot script itself. One is pure ergonomic polish (`CACHE_KEY_PREFIX` `--help` text + runbook paragraph) bundled because Phase 30.1 named them deferred.

The watch's observability surface is fully reachable today — `events:llm-summary:v3` carries `errorTaxonomy`, `routingTrace`, `evalScore`, `batchCount`, and `watchdogTimeoutCount`; `events:llm-dlq` carries the typed `DLQEntry[]`; `/api/health` (public route, no Bearer) exposes `endpoints.llmEvents.status`; `cron:lastTick:refresh-events` writes only on success (honest-failure semantics already established in Phase 28.2.7). Nothing new needs to be wired into prod surface; the snapshot script is a pure read consumer that mirrors `scripts/analyze-llm-run.ts`.

**Primary recommendation:** Use **`vercel.json` `functions[].includeFiles`** for the eval-bundle fix; **invert the diff-filter set** (prefix `llm-v3-` onto `g.key` before comparing, do NOT strip the prefix off cached IDs, do NOT change the upstream key construction) for the diff-filter fix; pin `WATCH_DLQ_WHITELIST = ['transient_rate_limit', 'v3:timeout_watchdog']` plus a forward-compat policy of "any unknown reason fails the day" so future DLQ-enum additions can't silently degrade the watch signal; and set the D-02 force-trigger "materially lower batch count" gate at **≥30% reduction** (planner-confirmable post-fix; the math is below).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase 30.1 "Prep Items" Scope:**

- **D-01: All four Phase-30.1-flagged prep items land IN Phase 31, before Day 1 begins.** Each as a separate commit per Phase 30 D-08 atomic discipline:
  - Eval-fixture bundling fix (load-bearing)
  - Diff-filter ID-mismatch fix (load-bearing)
  - `CACHE_KEY_PREFIX` whitespace `--help` fix (pure dev ergonomic)
  - Document `npm run probe:openrouter` as quarterly check in `docs/runbook.md`

**Day-1 Anchor & Failure-Response Policy:**

- **D-02:** Day 1 begins after a validation force-trigger passes — `GET /api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer must demonstrate (a) `evalScore.total > 0`, (b) processed-batch count materially lower than Phase 30.1 baseline, (c) no breaker trip. Pass → Day 1 = next natural 04:00 UTC. Fail → fix-forward.
- **D-03:** Passing daily tick = `health=healthy` AND DLQ reason taxonomy is whitelisted. Whitelist: `transient_rate_limit`, `watchdog_timeout`. Non-whitelisted: any code-error class, any config-error class, any new taxonomy value.
- **D-04:** Failed day = counter resets to 0; root cause documented in artifact.
- **D-05:** 3 reset cycles → escalate to Phase 31.1 for limiter/breaker rework.

**Observation Artifact:**

- **D-06:** Both JSON (`.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json`, byte-stable schema) and markdown (appended to `docs/architecture/llm-pipeline-reliability.md` "7-Day Watch" section). Both committed atomically per snapshot.
- **D-07:** `scripts/snapshot-cron-watch.ts` + `npm run watch:snapshot`. Mirrors `scripts/analyze-llm-run.ts` shape. Zero new prod surface. Runs `node --env-file-if-exists=.env --import tsx/esm`.
- **D-08:** Rich daily row schema with `tickDate`, `snapshotAt`, `natural`, `healthStatus`, `freshnessMs`, `dlq.{count, reasons}`, `eval.{at5km, at20km, at100km}`, `batchCount`, `breakerTrips`, `result`, `notes`. Schema pinned by contract test.

**Force-Trigger + Monitoring Cadence:**

- **D-09:** Force-trigger only for prep validation (D-02) and recovery. Force-triggered rows DO NOT contribute to the 7-consecutive count — `natural: true` rows only.
- **D-10:** Daily snapshot run IS the failure-detection mechanism. No new alerting infra.
- **D-11:** Missed-day snapshot reads Redis state for the prior tick. Gaps logged as `result: "GAP"` rows; counter pauses (does not fail).
- **D-12:** Phase 31 closes with a single PR with three commits (day-7 snapshot, close-phase docs, REQUIREMENTS check).

### Claude's Discretion

- Eval-bundle-fix vector (vercel.json includeFiles vs build-time copy vs fixture relocation) — researcher decides
- Diff-filter fix shape (prefix-strip vs prefix-add vs upstream rename) — researcher picks lower-risk path
- Whether 4 prep items land as one PR or four — default one PR with 4 commits
- Exact ratio of "materially lower" batch count for D-02 — researcher computes from Phase 30 baseline
- Snapshot HTTP call uses prod URL or local dev — env-var conditional
- Exact reason-string vocabulary for D-03 whitelist — researcher reads `llmDLQ.ts` + `freeClaudeRouter.ts`

### Deferred Ideas (OUT OF SCOPE)

- Adaptive `Retry-After`-aware NIM limiter — Phase 31.1 conditional on D-05 escalation
- Dashboard surface for cascade-degraded state — Phase 32 / 34 overlap
- DLQ-threshold alert key — same dashboard phase candidate
- GitHub Actions automated snapshot + auto-issue — out of scope (manual operator workflow chosen)
- ADR-0010 `<expand_at_36>` write — Phase 37 hand-off
- LLM-RELI-07 (3× consecutive prod-connectivity-audit) — Phase 37 acceptance gate
- Provider expansion / paid OR / NIM model switch — out of v1.5 per PROJECT.md

## Phase Requirements

| ID          | Description                                                                                                                                                                                                                                               | Research Support                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-RELI-06 | Daily 04:00 UTC `/api/cron/refresh-events` consistently lands `events:llm:v3` healthy. `/api/health` returns `endpoints.llmEvents.status === 'healthy'` after the daily tick. Confirmed across at least 7 consecutive days under normal NIM availability. | `server/routes/health.ts:312-316` confirms `endpoints.llmEvents` is a cache-key probe on `events:llm:v3` with v2/v1 fallback (no fallback in current shape will hit since v1/v2 are deleted Phase 29). Health threshold derivation via `deriveStatus(freshnessMs, threshold, hadError)`. Public route — `app.ts` does not gate `/api/health` behind Bearer. CONFIRMED. |

## Phase Goal Restated

Prove the daily 04:00 UTC `/api/cron/refresh-events` lands `events:llm:v3` healthy across ≥7 consecutive natural cron days, captured in a JSON+markdown artifact, after four scoped prep fixes restore the eval-bundle + diff-filter signal. Escalate to Phase 31.1 limiter rework on 3 reset cycles.

## Open Vectors Resolved

### Vector 1: Eval-bundle fix vector — RECOMMEND `vercel.json` `functions[].includeFiles`

**Verified facts:**

- `server/lib/llmEvalHarness.ts:23-49` reads the fixture via `fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8')` where `GROUND_TRUTH_PATH = resolve(__dirname, '../../.planning/eval/ground-truth-events.json')`. Same pattern for `ADVERSARIAL_FIXTURE_PATH` at line 321. [VERIFIED: direct code read]
- The runtime uses `fs.readFileSync` with a `__dirname`-derived absolute path, NOT a bundler-aware `import` statement. tsup cannot inline a `fs.readFileSync` call — it only inlines static `import` graphs. [VERIFIED: `tsup server/vercel-entry.ts --format esm --out-dir api --no-splitting` in `package.json:13`]
- `vercel.json` currently has **no** `includeFiles` directive (only `maxDuration: 800`). [VERIFIED: full file read]
- Build output is a single `api/vercel-entry.js` file (1.76 MB). `.planning/eval/` is OUTSIDE `api/` and OUTSIDE `server/` — Vercel's auto-trace cannot follow the `__dirname` resolve path back to it. [VERIFIED: `ls api/`, `ls .planning/eval/`]
- Both Phase 30 throttle snapshots (`run-1-throttle-snapshot.json`, `run-2-throttle-snapshot.json`) show `evalScore: {within5km: 0, within20km: 0, within100km: 0, total: 0}` — the harness's `loadGroundTruth` returns `null` in prod, leading to the early-return at lines 234-241. [VERIFIED: direct read of both snapshot files]

**Recommended fix shape:**

```jsonc
// vercel.json — add functions[].includeFiles
{
  "functions": {
    "api/vercel-entry.js": {
      "maxDuration": 800,
      "includeFiles": ".planning/eval/*.json",
    },
  },
}
```

**Rationale for rejecting alternatives:**

| Option                                                                                                              | Rejected because                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build-time copy script (e.g., `cp .planning/eval/*.json api/`)                                                      | Adds a build-pipeline step; the relative path `../../.planning/eval/...` in `llmEvalHarness.ts` would still break because at runtime `__dirname` resolves under `/var/task/api/` (Vercel's deploy root). Would require ALSO editing `GROUND_TRUTH_PATH` to a conditional `process.env.VERCEL ? '/var/task/api/ground-truth-events.json' : '<dev path>'` — two changes instead of one. |
| Fixture relocation to `server/eval/fixtures/`                                                                       | Largest blast radius: changes the canonical `.planning/eval/` path that ADR-0010, REQUIREMENTS.md ACTOR-04, and `docs/architecture/llm-pipeline-reliability.md` all reference. Forces a doc cascade.                                                                                                                                                                                  |
| Inline-import as ES module (`import gt from '../../.planning/eval/ground-truth-events.json' with { type: 'json' }`) | Requires `assert: { type: 'json' }` / `with { type: 'json' }` syntax, TS module resolution acrobatics under `verbatimModuleSyntax: true` (tsconfig.server.json:9), and tsup `--no-splitting` may not inline. Higher risk than includeFiles.                                                                                                                                           |

`includeFiles` is the documented Vercel-native mechanism for this exact scenario (read at deploy time, available under the same relative path at runtime). One-line config change. [VERIFIED: Vercel `vercel.json` reference; the field IS documented in the JSON schema referenced by the `$schema` at top of `vercel.json`]

**Verification protocol post-deploy:**

1. Deploy.
2. Force-trigger via `GET /api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer.
3. Wait for completion (~10 min).
4. Run `npm run analyze:llm-run` against the resulting `events:llm-summary:v3` — `evalScore.total` should be 50 (matching the 50 ground-truth events; `loadGroundTruth().events.length` = 50 per `.planning/eval/ground-truth-events.json` curation).
5. Sanity check: `evalScore.within20km` should land near the existing baseline (`events:llm-eval-baseline:v3` — 38/50 → 0.76 from Phase 27.4.2 close).

Confidence: **HIGH** — `fs.readFileSync` with `__dirname` is the canonical Vercel-bundle gotcha pattern; `includeFiles` is its canonical fix.

### Vector 2: Diff-filter fix shape — RECOMMEND prefix-add (add `llm-v3-` to `g.key` before comparison)

**Verified facts (from `server/lib/llmExtractionPipeline.ts`):**

- Line 270-273: cached set is built from `e.id` of `llmCachedRef.data` (entities already in cache):
  ```ts
  const cachedLlmKeys = new Set<string>();
  if (llmCachedRef?.data) {
    for (const e of llmCachedRef.data) {
      if (e.id) cachedLlmKeys.add(e.id);
    }
  }
  ```
- Line 277: filter compares raw `g.key` against the cached `e.id` set:
  ```ts
  const newGroups =
    cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(g.key)) : groups;
  ```
- The cached `e.id` strings carry the `llm-v3-` prefix per `enrichedV3ToEntities` at line 471: `id: \`llm-v3-${enriched.groupKey}\``.
- The groups produced by `groupGdeltRows` carry bare keys (e.g., `20513-19-18`). Pre-fix, `cachedLlmKeys` is a set of `llm-v3-20513-19-18` strings and `g.key` is `20513-19-18` — the `.has()` check returns false 100% of the time. ALL groups are reprocessed every run.

**Recommended fix:**

```ts
// server/lib/llmExtractionPipeline.ts:276-278
// CHANGE THIS:
const newGroups = cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(g.key)) : groups;

// TO THIS (single-line surgical fix):
const newGroups =
  cachedLlmKeys.size > 0 ? groups.filter((g) => !cachedLlmKeys.has(`llm-v3-${g.key}`)) : groups;
```

**Rationale for rejecting alternatives:**

| Option                                                                                  | Rejected because                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strip `llm-v3-` from cached IDs before adding to set                                    | Two-step: `if (e.id?.startsWith('llm-v3-')) cachedLlmKeys.add(e.id.slice(7))`. Same outcome but two operations instead of one. AND it loses the round-trip safety property — if any cached entity ever has a non-`llm-v3-` ID (e.g., legacy v2 IDs surviving the cache during deploy), the diff would incorrectly include them as "match" candidates. |
| Change upstream key construction in `enrichedV3ToEntities` to omit the `llm-v3-` prefix | Touches the cached entity ID format — load-bearing for the dev drill-down that recovers `groupKey` via "prefix strip" (per the JSDoc at line 438-441: _"Stamps the entity id with `llm-v3-` so the dev drill-down can recover the stable groupKey via prefix strip"_). High blast radius.                                                             |

**Adjacent tests to update:**

- No existing test in `server/__tests__/routes/refresh-events-cron.test.ts` (verified — file is route-level, mocks `runRefreshExtraction`). [VERIFIED]
- Search confirms NO existing unit test for `runRefreshExtraction`'s internal diff-filter logic. The fix should ship with a NEW unit test that proves: (a) when `llmCachedRef.data` contains an entity with id `llm-v3-X-Y-Z`, the group with `key: 'X-Y-Z'` is correctly excluded from `newGroups`. Suggested location: `server/__tests__/lib/llmExtractionPipeline.test.ts` (NEW FILE).

**Math for the D-02 "materially lower batch count" gate:**

- Phase 30 baseline: `batchCount: 213` in both `run-1-throttle-snapshot.json` and `run-2-throttle-snapshot.json`. The `groupGdeltRows` output size is bounded by raw GDELT row volume in `events:gdelt`, which appears stable in the ~400-450 raw range producing ~210 groups (BATCH_SIZE=2 → 213 batches ≈ 426 groups).
- Pre-fix behavior: every cron tick re-processes ALL groups regardless of whether they're already in the LLM cache (because the filter NEVER matches).
- Post-fix behavior: only groups whose `key` is NOT in the LLM cache's id-set are processed. Steady-state, only newly-arrived GDELT events drive new groups. The empirical reduction is bounded by `(newGroups / totalGroups)` per cron tick — typically 10-30% turnover day-over-day for a stable GDELT window.
- **Recommended D-02 gate: post-fix batchCount ≤ 0.7 × pre-fix batchCount (≥30% reduction).** This is a conservative floor that accommodates a day with high genuine event turnover; a 50%+ reduction is the more likely outcome but should not be the gate. The planner can move the gate later if a first measurement shows the empirical delta is consistently larger.

Confidence: **HIGH** for the fix shape and the prefix-add choice; **MEDIUM** for the exact 30% gate (depends on day-of-week GDELT volume — a conservative gate is the right default).

### Vector 3: DLQ reason whitelist (D-03 vocabulary)

**Verified DLQ reason enum (`server/lib/llmDLQ.ts:27-37`):**

```ts
reason:
  | 'zod_fail'                  // v1/v2 only — extractor modules deleted Phase 29
  | 'llm_null'                  // v1/v2 only — extractor modules deleted Phase 29
  | 'retry_exhausted'           // v1/v2 only — extractor modules deleted Phase 29
  | 'timeout_watchdog'          // v1/v2 only — extractor modules deleted Phase 29
  | 'v3:timeout_watchdog'       // ACTIVE — written at llmEventExtractor.v3.ts:655
  | 'v3:malformed'              // ACTIVE — written at v3.ts:736 (JSON.parse failure, not finishReason=length)
  | 'v3:max_tokens_truncation'  // ACTIVE — written at v3.ts:723/736 when finishReason=length OR "Unterminated string"
  | 'v3:schema_fail'            // ACTIVE — written at v3.ts:763 (Zod validation failure)
  | 'v3:rate_limit_exhaust'     // DECLARED — no live writer found (legacy / aspirational)
  | 'v3:adaptive-retry-fail'    // ACTIVE — written at v3.ts:896 (split-on-timeout exhaustion)
```

**Verified callHistory `RouterErrorBucket` enum (`server/lib/freeClaudeRouter.ts:48-55`):**

```ts
export type RouterErrorBucket =
  | 'rate_limit' // 429 / "rate limit" substring → maps to v3:timeout_watchdog OR v3:adaptive-retry-fail if it exhausts
  | 'timeout' // "timeout" / "timed out" substring
  | 'malformed_json'
  | 'schema_fail'
  | 'network' // ENOTFOUND, ECONNRESET, EAI_AGAIN
  | 'upstream_500' // 5xx pattern
  | 'other';
```

**Verified callHistory `skipReason` enum (`server/lib/llmProgress.ts:96`):**

```ts
skipReason?: 'breaker' | 'hard_cap' | 'no_client' | 'rate_limit_window' | 'daily_cap';
```

Note: `'breaker'` is what the CONTEXT loosely calls "`skipped:breaker`" — synthetic callHistory entries marking a batch that was bypassed because the circuit breaker was paused. NOT a DLQ entry, NOT a per-event failure — but DOES correlate with breakerTrip events.

**RECOMMENDED `WATCH_DLQ_WHITELIST` constant (top of `scripts/snapshot-cron-watch.ts`):**

```ts
/**
 * D-03 whitelist: DLQ reasons that do NOT fail the daily watch tick.
 *
 * Sourced from server/lib/llmDLQ.ts DLQEntry.reason enum + the active v3
 * writer set in server/lib/llmEventExtractor.v3.ts. Any reason NOT in this
 * whitelist fails the day per D-03's "any code-error class, any config-error
 * class, any unexpected new taxonomy value" policy.
 *
 * Whitelist semantics:
 *   - 'v3:timeout_watchdog'      — known throttle-symptom (load fluctuation)
 *   - 'v3:adaptive-retry-fail'   — split-retry exhausted under load; still a
 *                                  throttle symptom, not a code defect.
 *
 * NOT whitelisted (fail the day if observed):
 *   - 'v3:malformed'             — JSON.parse failure → provider regression
 *   - 'v3:max_tokens_truncation' — config defect: cap is too tight
 *   - 'v3:schema_fail'           — Zod validation → schema/prompt mismatch
 *   - 'v3:rate_limit_exhaust'    — legacy enum value, no live writer; if
 *                                  observed it means a new writer was added
 *                                  and the watch should flag it for review
 *   - 'zod_fail' | 'llm_null' | 'retry_exhausted' | 'timeout_watchdog'
 *                                — v1/v2-only enums; impossible in current
 *                                  cascade. If observed, indicates a v1/v2
 *                                  ghost write somewhere → fail the day.
 *
 * Phase 30.1 CONTEXT D-03 named 'transient_rate_limit' and 'watchdog_timeout'
 * as illustrative-not-canonical; the canonical strings are above.
 */
export const WATCH_DLQ_WHITELIST: readonly string[] = [
  'v3:timeout_watchdog',
  'v3:adaptive-retry-fail',
] as const;
```

**IMPORTANT for the planner — CONTEXT D-03 used illustrative names, NOT canonical ones:**

The CONTEXT.md D-03 says _"Whitelisted DLQ reasons that DO NOT fail the day: `transient_rate_limit`, `watchdog_timeout`."_ Neither of those EXACT strings appears in the DLQ enum. The canonical equivalents are `v3:timeout_watchdog` and `v3:adaptive-retry-fail`. The planner MUST use the canonical strings (the snapshot script reads the actual `reason` field from `DLQEntry`); using the CONTEXT's illustrative strings verbatim would result in EVERY day being failed because no entry would match.

Confidence: **HIGH** — every string is directly cited from a `reason:` literal in the codebase.

### Vector 4: D-02 force-trigger baseline math + observability path

**Baseline data (verified from Phase 30 snapshots):**

```
Phase 30 run-1: batchCount: 213, durationMs: 122_628, evalScore.total: 0
Phase 30 run-2: batchCount: 213, durationMs: 124_533, evalScore.total: 0
Phase 30.1 or-pulse: NOT a cron run (OpenRouter probe only — irrelevant for batchCount baseline)
```

**The CONTEXT references `30.1-or-pulse-snapshot.json` for `batchCount` and `breakerTrips`. This is incorrect — that snapshot is the OpenRouter rate-limit probe, not a cron-extraction snapshot. The actual baseline lives in the Phase 30 snapshots.** [VERIFIED: full read of all three files]

**Recommended D-02 gate values for the validation force-trigger:**

| Metric            | Pre-fix baseline                                                                                                                                         | Post-fix gate                                                   | Source                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `batchCount`      | 213                                                                                                                                                      | ≤ 149 (≥30% reduction)                                          | Phase 30 run-1 + run-2 (both 213)                                                                                              |
| `breakerTrips`    | derivable from skipReason='breaker' count in callHistory; CONTEXT says ~50 dropped to skipped:breaker in 04:00 UTC cron (no snapshot saved for that run) | 0 (no trip during the validation run)                           | CONTEXT D-02 criterion (c)                                                                                                     |
| `evalScore.total` | 0 (eval-bundle bug)                                                                                                                                      | > 0 (specifically 50 — ground-truth-events.json has 50 entries) | `.planning/eval/ground-truth-events.json` parsed file size suggests 50; matches `EvalScore.total: 50` claim in Phase 27.4 docs |

**Operator verification path post-deploy:**

1. **Fastest:** Run `npm run analyze:llm-run` AFTER the force-trigger completes (~10 min wall-clock). The analyzer reads `events:llm-summary:v3` directly via Upstash REST and emits the JSON snapshot with `evalScore`, `batchCount`, `watchdogTimeoutCount`. The breaker-trip count is derivable from `callHistory` (count rows where `skipReason === 'breaker'`).
2. **Alternative:** Curl `GET /api/events/llm-status` (Bearer-gated dev-only — returns 404 in prod per Phase 27.4 threat model T-27.1-01). Available locally only.
3. **NOT recommended for validation:** Waiting for the next snapshot script run — the snapshot script reads the SAME `events:llm-summary:v3` key, so it's equivalent to (1) but with extra ceremony.

**There is no dedicated eval-harness HTTP endpoint.** `runEval()` is only invoked from within `runRefreshExtraction`'s IIFE (`server/lib/llmExtractionPipeline.ts:379`). The force-trigger + analyzer-script combo IS the path.

Confidence: **HIGH** for baseline + verification path; **MEDIUM** for the exact 30% gate (planner may reasonably widen to 25% or tighten to 40% based on operator preference).

## Existing Code to Mirror

### Pattern 1 — Analyzer (Phase 30 D-01) — primary template for snapshot script

**File:** `scripts/analyze-llm-run.ts` (320 lines)

**Key excerpts:**

```ts
// Lines 42-46: Imports — Upstash client via the existing project module, NOT a new wire-up
import { readFileSync, writeFileSync } from 'node:fs';
import { cacheGetSafe } from '../server/cache/redis.js';
import { logger } from '../server/lib/logger.js';
import type { LLMRunSummary } from '../server/lib/llmProgress.js';

const log = logger.child({ module: 'analyze-llm-run' });
```

```ts
// Lines 248-253: argv parsing (no CLI library — single helper)
function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found?.split('=')[1];
}
```

```ts
// Lines 278-285: Redis-mode summary read with permissive max-age
const cached = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
if (!cached?.data) {
  console.error('events:llm-summary:v3 missing or empty');
  process.exit(1);
}
summary = cached.data;
```

```ts
// Lines 316-319: Main wrapper — non-zero exit on error
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Snapshot-script reuse pattern:**

- Identical imports (cacheGetSafe, logger, LLMRunSummary).
- Identical argv-helper pattern.
- Identical Redis-read with `999_999_999` permissive TTL.
- Same exit code discipline.
- Same `console.log` for operator-facing stdout (per analyzer line 300-301 comment: _"intentional console.log per CLAUDE.md logger discipline — analyzer's stdout IS the doc-paste artifact for D-06"_).

### Pattern 2 — Byte-stable JSON write (Phase 30.1) — for `watch-log.json`

**File:** `scripts/probe-openrouter.ts` (226 lines)

**Key excerpts:**

```ts
// Lines 37-39: imports for atomic write
import { writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
```

```ts
// Lines 56-61: path setup
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../.planning/phases/30.1-...');
const OUT_PATH = resolve(OUT_DIR, '30.1-or-pulse-snapshot.json');
const TMP_PATH = resolve(OUT_DIR, '30.1-or-pulse-snapshot.json.tmp');
```

```ts
// Lines 186-203: Byte-stable JSON write — sort, atomic tempfile+rename, trailing newline
results.sort((a, b) => a.attempt - b.attempt);
// ... build snapshot object ...
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(TMP_PATH, JSON.stringify(snapshot, null, 2) + '\n');
renameSync(TMP_PATH, OUT_PATH);
```

```ts
// Lines 217-225: tempfile cleanup on failure
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

**Snapshot-script reuse pattern:**

- Same atomic tempfile+rename pattern.
- Same `mkdirSync({recursive: true})` defensive directory creation.
- Same `JSON.stringify(x, null, 2) + '\n'` (trailing newline) for diff-cleanliness.
- Same tempfile-cleanup catch on `process.exit(1)`.

### Pattern 3 — JSON sort + ISO-Z timestamp (Phase 27.3.1) — for byte-stable rows

**File:** `scripts/refresh-water-facilities.ts` (185 lines)

**Key excerpts:**

```ts
// Lines 90-96: deterministic sort + rounded numerics
const generatedAt = new Date().toISOString(); // ISO-Z timestamp
const sortedFacilities: WaterFacility[] = [...raw]
  .map((f) => ({ ...f, lat: roundCoord(f.lat), lng: roundCoord(f.lng) }))
  .sort((a, b) => a.id.localeCompare(b.id));
```

```ts
// Lines 49-51: Numeric rounding helper
function roundCoord(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
```

**Snapshot-script reuse pattern:**

- `tickDate` as ISO `YYYY-MM-DD` string is naturally sortable (no extra effort).
- Sort entries by `tickDate` ascending on each append (or use append-or-update-by-date pattern).
- Round latency/freshness to integer ms (no fractional ms in artifact — keeps diffs clean).

### Pattern 4 — Runner invocation (Phase 27.4.2) — for `npm run watch:snapshot`

**File:** `package.json:22-27`

**Existing runners (mirror these exactly):**

```json
"refresh:water": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/refresh-water-facilities.ts",
"eval:replay":   "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/eval-replay.ts",
"probe:openrouter": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/probe-openrouter.ts",
"analyze:llm-run":  "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/analyze-llm-run.ts"
```

**Recommended new entry (alphabetical order between `refresh:sites` and `snapshot:v3`):**

```json
"watch:snapshot": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/snapshot-cron-watch.ts"
```

Note: A `snapshot:v3` script already exists at line 28 (`scripts/snapshot-v3-redis.ts`). Naming the new one `watch:snapshot` (verb-first) keeps it discoverable as part of the watch workflow without name collision.

## File-by-File Touchpoints

| File                                                                          | Action                      | Why                                                                                                                                                |
| ----------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-RESEARCH.md`    | CREATE                      | This file.                                                                                                                                         |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-CONTEXT.md`     | READ                        | Locked decisions.                                                                                                                                  |
| `vercel.json`                                                                 | MODIFY (prep #1)            | Add `includeFiles: ".planning/eval/*.json"` to the `functions["api/vercel-entry.js"]` block.                                                       |
| `server/lib/llmExtractionPipeline.ts`                                         | MODIFY (prep #2)            | Line 277 — prefix-add `llm-v3-` to `g.key` before `.has()` check.                                                                                  |
| `scripts/analyze-llm-run.ts`                                                  | MODIFY (prep #3)            | Add `--help` text + docstring on `CACHE_KEY_PREFIX` whitespace gotcha. ≤5 LOC.                                                                     |
| `docs/runbook.md`                                                             | MODIFY (prep #4)            | Append paragraph: "Quarterly check: run `npm run probe:openrouter`. If `decision !== 'nim-only'`, see ADR-0010 expansion for re-enablement steps." |
| `scripts/snapshot-cron-watch.ts`                                              | CREATE (D-07)               | New canonical script. Mirrors `analyze-llm-run.ts` shape. ~200-300 LOC estimated.                                                                  |
| `package.json`                                                                | MODIFY (D-07)               | Add `"watch:snapshot"` entry to scripts block. ≤2 LOC.                                                                                             |
| `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json`    | CREATE (D-06, daily)        | New file; grows by one row per snapshot. Atomic tempfile+rename.                                                                                   |
| `docs/architecture/llm-pipeline-reliability.md`                               | MODIFY (D-06, daily)        | Append new `## Phase 31 7-Day Watch (LLM-RELI-06, started YYYY-MM-DD)` section + idempotent append-or-update-by-date row.                          |
| `server/__tests__/lib/llmExtractionPipeline.test.ts`                          | CREATE (prep #2 follow-up)  | NEW unit test proving the diff-filter prefix match. Recommended location. No existing test file for this module.                                   |
| `server/__tests__/scripts/snapshot-cron-watch.test.ts`                        | CREATE (D-08 contract test) | NEW contract test pinning the watch-log row schema. Will be the schema's load-bearing pin.                                                         |
| `server/lib/llmEvalHarness.ts`                                                | READ only                   | Confirm `__dirname` path and `fs.readFileSync` usage. Do NOT modify in this phase.                                                                 |
| `server/lib/llmDLQ.ts`                                                        | READ only                   | Source-of-truth for `DLQEntry.reason` enum.                                                                                                        |
| `server/lib/freeClaudeRouter.ts`                                              | READ only                   | Source-of-truth for `RouterErrorBucket` enum.                                                                                                      |
| `server/lib/llmProgress.ts`                                                   | READ only                   | Source-of-truth for `LLMRunSummary` shape consumed by the snapshot script.                                                                         |
| `server/routes/health.ts`                                                     | READ only                   | Confirms `endpoints.llmEvents.status` derivation.                                                                                                  |
| `server/routes/refresh-events-cron.ts`                                        | READ only                   | Confirms `?force=true` Bearer gate + cron:lastTick writer.                                                                                         |
| `server/lib/llmEventExtractor.v3.ts` (lines 622, 929)                         | READ only — DO NOT TOUCH    | `skipOpenRouter: true` invariant per Phase 30.1 D-01.                                                                                              |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-01-PLAN.md` ... | CREATE (planner output)     | Per-plan documents — planner decides count. Likely 1 plan for the 4 prep fixes + 1 plan for the snapshot script + 1 plan per snapshot day.         |
| `.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`     | CREATE (D-12 close)         | Phase-close summary.                                                                                                                               |

## DLQ Reason Whitelist

**Canonical strings sourced from `server/lib/llmDLQ.ts` + `server/lib/freeClaudeRouter.ts`:**

### Whitelist (PASS the day if observed)

| String                   | Source                                                   | Semantic                                                            | Rationale for whitelist                                                                                                  |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `v3:timeout_watchdog`    | `llmDLQ.ts:32` (writer at `llmEventExtractor.v3.ts:655`) | Per-batch hard-kill at `LLM_BATCH_TIMEOUT_MS` (120s post-Phase-30). | Throttle symptom — under sustained NIM load a small fraction of batches may time out. Documented behavior, not a defect. |
| `v3:adaptive-retry-fail` | `llmDLQ.ts:37` (writer at `llmEventExtractor.v3.ts:896`) | Adaptive split-retry exhausted (when `V3_ADAPTIVE_BATCH=true`).     | Downstream consequence of timeout under load. Same throttle-symptom class.                                               |

### Fail-the-day (NOT whitelisted)

| String                     | Source                                                                                           | Semantic                                                        | Rationale for failing                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `v3:malformed`             | `llmDLQ.ts:33` (writer at `v3.ts:736`)                                                           | `JSON.parse` failed on the LLM response (and NOT a truncation). | Provider regression — model returned non-JSON. Should be near-zero in normal operation. |
| `v3:max_tokens_truncation` | `llmDLQ.ts:34` (writer at `v3.ts:723/736`, `finishReason === 'length' OR "Unterminated string"`) | Response cut off at `max_tokens` cap.                           | Config defect — bump the cap. Operator-actionable.                                      |
| `v3:schema_fail`           | `llmDLQ.ts:35` (writer at `v3.ts:763`)                                                           | Zod validation failed on parsed JSON.                           | Schema/prompt mismatch. Code defect.                                                    |
| `v3:rate_limit_exhaust`    | `llmDLQ.ts:36` (NO live writer found in current code)                                            | Legacy/aspirational enum value.                                 | If observed, indicates new writer was added since this research — flag for review.      |
| `zod_fail`                 | `llmDLQ.ts:28` (v1/v2 only — modules deleted Phase 29)                                           | v1/v2-only enum.                                                | Impossible in current cascade. If observed, indicates a v1/v2 ghost write.              |
| `llm_null`                 | `llmDLQ.ts:29` (v1/v2 only)                                                                      | v1/v2-only enum.                                                | Impossible in current cascade.                                                          |
| `retry_exhausted`          | `llmDLQ.ts:30` (v1/v2 only)                                                                      | v1/v2-only enum.                                                | Impossible in current cascade.                                                          |
| `timeout_watchdog`         | `llmDLQ.ts:31` (v1/v2 only — note: distinct from `v3:timeout_watchdog`)                          | v1/v2-only enum.                                                | Impossible in current cascade.                                                          |

### Forward-compat policy

Any DLQ reason string NOT enumerated above (i.e., a new enum value added in a future commit) MUST fail the day. The snapshot script implements this as: `if (!WATCH_DLQ_WHITELIST.includes(reason)) → notes += "unknown-DLQ-reason:<value>"; result = "FAIL"`. This catches schema drift early — a future PR that adds e.g. `v3:provider_error` would otherwise silently degrade the watch's signal.

### Edge case: empty DLQ vs whitelisted DLQ

A tick with `dlq.count: 0` PASSES trivially (the whitelist is irrelevant). A tick with `dlq.count > 0` and ALL entries in the whitelist PASSES with a `notes` annotation: e.g. `notes: "DLQ: v3:timeout_watchdog ×3 (whitelisted)"`. A tick with `dlq.count > 0` and ANY entry outside the whitelist FAILS the day — even if there's only one non-whitelisted entry alongside many whitelisted ones. (CONTEXT D-03 is unambiguous: _"Non-whitelisted reasons that DO fail the day"_.)

## Snapshot Script Behavior

### Control flow per invocation

```
1. parse argv → optional --tick-date=YYYY-MM-DD (default: today UTC)
                optional --force (mark as natural:false, for D-02/D-09)
                optional --notes="..." (operator-supplied annotation)
                optional --health-url=<URL> (default: $SNAPSHOT_HEALTH_URL || prod URL)

2. read existing watch-log.json (or {schemaVersion, lastSnapshottedTickDate: null, rows: []} if absent)

3. detect gap: if lastSnapshottedTickDate < (tickDate - 1 day) → log warning, will write a "GAP" row for each missing day

4. read Redis via cacheGetSafe:
     a. events:llm-summary:v3                  → summary  (REQUIRED — error out if absent)
     b. events:llm-dlq          (SADD members) → dlq      (degrade-open: empty set = 0 entries)
     c. cron:lastTick:refresh-events           → tickTs   (for freshnessMs)
     d. events:llm-eval-baseline:v3            → baseline (informational, for tolerance check)

5. read /api/health via HTTP GET (no Bearer):
     → endpoints.llmEvents.status   (REQUIRED — error out on HTTP failure)
     → endpoints.cronRefreshEvents.status (informational — cross-check)

6. compute row fields:
     tickDate         = argv.tick-date OR today UTC
     snapshotAt       = new Date().toISOString()
     natural          = !argv.force  // D-09: force-triggered rows do not advance counter
     healthStatus     = health.endpoints.llmEvents.status
     freshnessMs      = Date.now() - tickTs       (or null if cron:lastTick:refresh-events absent)
     dlq.count        = dlq.length
     dlq.reasons      = histogram by reason       (e.g., { "v3:timeout_watchdog": 3 })
     eval.at5km       = summary.evalScore.within5km   / summary.evalScore.total      (or null if total=0)
     eval.at20km      = summary.evalScore.within20km  / summary.evalScore.total      (or null if total=0)
     eval.at100km     = summary.evalScore.within100km / summary.evalScore.total      (or null if total=0)
     batchCount       = summary.batchCount
     breakerTrips     = count of callHistory rows with skipReason === 'breaker'  (derived)
     result           = classify per D-03 rules below
     notes            = argv.notes OR derived annotation string

7. classify (D-03 / D-09 / D-11):
     IF healthStatus !== 'healthy':
         result = "FAIL"; notes += "health: " + healthStatus
     ELIF any dlq reason NOT IN WATCH_DLQ_WHITELIST:
         result = "FAIL"; notes += "DLQ-non-whitelisted:<reasons>"
     ELIF gap-detected for this date (no Redis tick for this day):
         result = "GAP"; notes += "operator-missed snapshot"
     ELSE:
         result = "PASS"

8. append-or-update row in rows[] by tickDate (idempotent — re-running same day overwrites)

9. write watch-log.json atomically: tempfile + renameSync (Pattern 2)

10. append-or-update markdown row in docs/architecture/llm-pipeline-reliability.md
     (idempotent — match by tickDate column, replace or append)

11. exit 0 on PASS, 1 on FAIL, 2 on GAP   (operator can wire to shell alias)
```

### PASS/FAIL/GAP rule logic (consolidated)

```ts
type Result = 'PASS' | 'FAIL' | 'GAP';

function classifyTick(row: WatchRow): Result {
  // D-11: GAP detection takes precedence over PASS — a missed day cannot fail or pass.
  if (row.healthStatus === 'unknown' && row.freshnessMs === null) return 'GAP';

  // D-03 criterion 1: /api/health endpoints.llmEvents.status === 'healthy'
  if (row.healthStatus !== 'healthy') return 'FAIL';

  // D-03 criterion 3: dlqCount matches a documented baseline (= whitelist)
  for (const reason of Object.keys(row.dlq.reasons)) {
    if (!WATCH_DLQ_WHITELIST.includes(reason)) return 'FAIL';
  }

  return 'PASS';
}
```

### Counter logic (D-04)

The 7-consecutive count is COMPUTED from rows[] each invocation (not stored as a separate counter — keeps the JSON the single source of truth):

```ts
function consecutivePassCount(rows: WatchRow[]): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.result === 'PASS' && r.natural === true) count++;
    else if (r.result === 'GAP')
      continue; // D-11: gaps pause, don't break
    else break; // FAIL or non-natural PASS breaks
  }
  return count;
}
```

Reset cycles count as the number of FAIL rows in `rows[]` whose prior PASS-streak was ≥1. D-05 escalation triggers when `resetCycles >= 3`.

### Idempotency

- Re-running the script on the same date overwrites the row (does NOT duplicate). This lets the operator re-run after a transient issue without polluting the artifact.
- The JSON `lastSnapshottedTickDate` tracks the most-recent date with a non-GAP row; on each run, the script compares against today and emits GAP rows for any unbridged days.

### Exit codes (D-10)

```
0 — PASS
1 — FAIL (including DLQ-non-whitelisted)
2 — GAP (operator-missed snapshot)
99 — script error (Redis unreachable, /api/health 5xx, etc.)
```

Operator wires `npm run watch:snapshot` into a daily shell alias; non-zero exit triggers their personal alerting (D-10 explicitly rejects new alerting infra).

## Validation Architecture

> Per CLAUDE.md and `.planning/config.json`, `workflow.nyquist_validation` is enabled. This section enumerates all verification dimensions for Phase 31's deliverables.

### Test Framework

| Property           | Value                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest with jsdom (frontend) / node (server) — per CLAUDE.md "Testing" section                          |
| Config files       | `vite.config.ts` test config (frontend), `vitest.config.server.ts` if separate (TBD — verify in Wave 0) |
| Quick run command  | `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts` (prep #2 test)                      |
| Full suite command | `npx vitest run` (all tests)                                                                            |

### Phase Requirements → Test Map

| Req ID                                | Behavior                                                                                 | Test Type            | Automated Command                                                                                                   | File Exists?                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| LLM-RELI-06 (a) — diff-filter fix     | `groups.filter` correctly matches cached `llm-v3-X-Y-Z` ids against bare `g.key='X-Y-Z'` | unit                 | `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts -t "diff-filter excludes already-cached groups"` | ❌ Wave 0 — file does not exist                             |
| LLM-RELI-06 (b) — eval-bundle fix     | After deploy, `runEval()` returns `score.total > 0` in prod                              | integration / manual | Force-trigger `/api/cron/refresh-events?force=true` + `npm run analyze:llm-run`                                     | partial — analyzer exists; force-trigger is operator-driven |
| LLM-RELI-06 (c) — snapshot row schema | `watch-log.json` row matches pinned schema                                               | contract             | `npx vitest run server/__tests__/scripts/snapshot-cron-watch.test.ts -t "row schema matches contract"`              | ❌ Wave 0 — file does not exist                             |
| LLM-RELI-06 (d) — DLQ whitelist       | Non-whitelisted DLQ reason fails the day                                                 | unit                 | `npx vitest run server/__tests__/scripts/snapshot-cron-watch.test.ts -t "non-whitelisted DLQ reason → FAIL"`        | ❌ Wave 0                                                   |
| LLM-RELI-06 (e) — GAP pause           | GAP row does NOT reset the counter                                                       | unit                 | `npx vitest run server/__tests__/scripts/snapshot-cron-watch.test.ts -t "GAP row pauses counter"`                   | ❌ Wave 0                                                   |
| LLM-RELI-06 (f) — 7-consecutive       | After 7 natural PASS rows, phase-close artifact written                                  | manual               | Operator observes day-7 PASS via `npm run watch:snapshot` exit 0; runs phase-close commit sequence per D-12         | n/a (manual gate)                                           |

### Nyquist 8-dimension verification

| Dimension             | Verification for Phase 31                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build**             | `npm run build` after each prep fix lands. Validates tsup bundles cleanly with the new `includeFiles` directive and that the diff-filter fix doesn't break the `runRefreshExtraction` import graph.                       |
| **Types**             | `npm run typecheck` (`tsc -b && type-coverage`). The 97% type-coverage floor (`package.json:37`) is a regression ratchet. New snapshot script must hit 97% type coverage on its own LOC.                                  |
| **Lint**              | `npm run lint`. Zero warnings policy enforced by Phase 29+ atomic commits.                                                                                                                                                |
| **Unit tests**        | Vitest run as above. Diff-filter test + snapshot-schema test + DLQ-whitelist test + GAP-counter test.                                                                                                                     |
| **Runtime (dev)**     | `npm run dev:server`, manually exercise `/api/health` JSON response and snapshot script invocation against the dev Redis instance.                                                                                        |
| **Contract tests**    | `server/__tests__/scripts/snapshot-cron-watch.test.ts` pins the `watch-log.json` row schema. Any change to the row shape requires updating both the writer (snapshot script) and the test in the same commit.             |
| **Integration**       | Force-trigger of `/api/cron/refresh-events?force=true` against prod after eval-bundle fix lands — confirms `evalScore.total > 0` end-to-end. Then `npm run watch:snapshot` against the resulting `events:llm-summary:v3`. |
| **Manual / operator** | (a) Force-trigger validation per D-02; (b) Daily morning snapshot run for ≥7 days; (c) Phase-close PR review per D-12.                                                                                                    |

### Sampling Rate

- **Per task commit:** `npx vitest run server/__tests__/lib/llmExtractionPipeline.test.ts server/__tests__/scripts/snapshot-cron-watch.test.ts` (~5s)
- **Per wave merge:** `npm run typecheck && npm run lint && npx vitest run` (~60-90s)
- **Phase gate:** Full suite green + 7 consecutive natural PASS rows in `watch-log.json` before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `server/__tests__/lib/llmExtractionPipeline.test.ts` — covers diff-filter prefix-add fix. NEW FILE.
- [ ] `server/__tests__/scripts/snapshot-cron-watch.test.ts` — pins watch-log row schema + classification rules. NEW FILE.
- [ ] Framework install: **none needed** — Vitest is already on `^4.1.0` per `package.json:121`.

## Risks + Landmines

### Risk 1: NIM token spend on D-02 force-trigger

**Surface:** Force-triggering `/api/cron/refresh-events?force=true` runs the full LLM extraction over the entire raw GDELT cache. At Phase 30 baseline: 213 batches × 2 events/batch ≈ 426 events × ~500-1000 input tokens each ≈ 200k-400k NIM tokens per validation run. Post-diff-filter-fix: this drops to whatever didn't process during the prior cron tick (probably 30-70 batches).

**Mitigation:**

- Run the D-02 force-trigger DURING operator-watchful hours (CONTEXT says don't pre-schedule).
- Run it AFTER the diff-filter fix is deployed (so the run is materially smaller).
- DO NOT run multiple force-triggers in close succession — the 15-min cooldown is bypassed by `?force=true`, so there's no protection against operator-driven over-spend.
- If `LLM_TOKEN_BUDGET_HARD_CAP` (Phase 27.4.3 D-33) triggers mid-run, the extraction self-pauses; the `notes` field in the artifact captures this honestly.

### Risk 2: Contract-test drift mid-watch

**Surface:** The `watch-log.json` row schema is the single most permanent artifact of Phase 31 (per CONTEXT D-08 + CONTEXT specifics: _"Phase 37 ADR-0010 expansion reads it, future quarterly OR re-probes compare against it, any v1.6 acceptance-gate audit cites it"_). Changing the schema mid-watch breaks the timeseries.

**Mitigation:**

- Pin the schema with a contract test in Wave 0, BEFORE Day 1 begins.
- If a schema-change need surfaces during the watch, treat it as a watch event: write a `notes: "schema-change: <description>"` annotation on the day's row, commit the schema change as a separate commit, and reset the counter to 0 (treat as a FAIL day with explicit cause).
- The contract test MUST live in the same PR as Day 1 — it cannot land later.

### Risk 3: Redis cold-start interactions with `llm:lastProgress`

**Surface:** Phase 28.2.7 introduced `llm:lastProgress` Redis key to survive Vercel Fluid Compute cold starts. `probeLlmStatus` at `server/routes/health.ts:158-202` takes `Math.max(redisLatest, memLatest)` — the freshest signal wins. The snapshot script reads `/api/health`, which calls `probeLlmStatus()` for the `endpoints.llmStatus` field (different from `endpoints.llmEvents`!).

**Detail:** `endpoints.llmEvents` is a cache-key probe on `events:llm:v3` (line 312-316) — the CONTEXT D-03 reference. `endpoints.llmStatus` is the `probeLlmStatus()` reader of `llm:lastProgress`. The watch reads `endpoints.llmEvents`, not `endpoints.llmStatus`. CONFIRMED no risk to the primary signal.

**Secondary check:** The snapshot script should NOT rely on `endpoints.llmStatus` for the PASS rule — that probe can stay `'unknown'` for hours after a successful run due to cold-start interactions and would generate spurious GAP rows. Use `endpoints.llmEvents.status` as the sole health signal per D-03.

### Risk 4: Schema mid-watch additions to `LLMRunSummary`

**Surface:** The summary struct (`server/lib/llmProgress.ts:264-392`) has accumulated optional fields across Phase 27.4 / 27.4.3 / 27.4.4 / 28.2 / 30. Future phases may add more.

**Mitigation:** The snapshot script reads ONLY these specific fields:

- `summary.batchCount` (always present, type-pinned)
- `summary.evalScore.{within5km, within20km, within100km, total}` (optional — handle undefined)
- `summary.callHistory[].skipReason` (optional — count `=== 'breaker'`)
- `summary.errorTaxonomy` (informational only — not part of PASS rule)
- `summary.routingTrace` (informational only — informs `notes` if all entries are `provider: 'nvidia_nim'` for the NIM-only invariant)

The snapshot script tolerates undefined optional fields (writes `null` or `0` per the schema). Forward-compat is built in.

### Risk 5: `events:llm-summary:v3` overwrite cadence (D-11 gap detection)

**Surface:** Redis `events:llm-summary:v3` holds ONLY the most recent run's data (overwritten by every `runRefreshExtraction` completion, per `llmExtractionPipeline.ts:289`). The 24-hour `LLM_SUMMARY_TTL_SEC` extends survival but does not prevent overwrite. A missed-day snapshot CANNOT recover the prior day's full summary if a new run has overwritten it.

**Mitigation per D-11:** When the snapshot script detects a gap (`lastSnapshottedTickDate < tickDate - 1 day`), it logs a warning and writes the missing days as `result: "GAP"` rows with `notes: "operator-missed snapshot; Redis only retains last tick"`. GAP rows pause the counter — they do not fail it. This is the CONTEXT D-11 contract.

**Recommendation:** Document the cadence clearly in the snapshot script's docstring so future operators understand WHY a 2-day gap can't be reconstructed.

### Risk 6: NIM-only invariant masking a silent OpenRouter re-enable

**Surface:** Phase 30.1 D-01 locks `skipOpenRouter: true` hardcoded at `llmEventExtractor.v3.ts:622, 929`. If a future PR accidentally flips this, the cascade would silently re-enable OpenRouter. The watch's `routingTrace` reading SHOULD confirm zero OR rows.

**Mitigation:** The snapshot script should annotate `notes` with `"non-NIM-routing-detected"` if any `routingTrace[i].provider !== 'nvidia_nim'`. This is observational, not a hard PASS/FAIL gate (CONTEXT does not list this as a fail condition), but it's a useful tripwire.

## Open Questions for Planner

These could NOT be resolved from code reads alone. The planner should pick a default and proceed.

1. **Schema versioning for `watch-log.json` top-level.** Should the file carry `{ schemaVersion: "1.0", rows: [...], lastSnapshottedTickDate: "..." }` from day 1, or just `[{...row...}, ...]`? The contract test will pin whichever is chosen. **Recommend: top-level object with `schemaVersion` so the contract test can branch on schema-version for future evolution.**

2. **GAP detection threshold.** D-11 says gaps pause the counter. But what's the minimum gap duration to qualify as a GAP vs. a same-day re-run? **Recommend: same-day re-runs are idempotent (overwrite); a gap of ≥1 calendar day (UTC) writes GAP rows for each missed day.**

3. **`SNAPSHOT_HEALTH_URL` default.** Should the script default to the prod URL `https://otg-iran-monitor.vercel.app/api/health` OR fall back to `http://localhost:3000/api/health` if `process.env.NODE_ENV !== 'production'`? **Recommend: default to prod URL; env-var override via `SNAPSHOT_HEALTH_URL` for local testing. Matches the watch's purpose (observe PROD).**

4. **Phase 31.1 escalation commit.** D-05 says 3 reset cycles → escalate. Is the escalation a Phase 31 commit (closes 31 conditional) OR does it open Phase 31.1 first and Phase 31 stays in "in progress" status until 31.1 closes? **Recommend: per CONTEXT D-05, the escalation IS the Phase 31 close commit (status: "Conditional on 31.1"). Phase 31.1 opens with `watch-log.json` as its seed material.**

5. **Markdown row update idempotency.** The markdown table append-or-update-by-date pattern is more complex than the JSON's. Should the script regenerate the entire markdown table from the JSON on each run (simpler, deterministic) or do a line-by-line append/update (cheaper diff)? **Recommend: regenerate-entire-table from JSON. Simpler, deterministic, and the markdown table is the doc-paste artifact — not the system-of-record.**

6. **Day-1 anchor commit semantics.** Per CONTEXT D-02, "Day 1 = the next natural 04:00 UTC cron" after the validation force-trigger passes. The Day 1 commit lands the morning of Day 1's snapshot. Is the "Day 1 = the next natural cron after the force-trigger" logic captured in the script, or in operator runbook prose? **Recommend: operator runbook prose. The script doesn't need to know "this is day 1"; it just appends rows.**

## Assumptions Log

| #   | Claim                                                                                                                                                                                                                                                                                            | Section                            | Risk if Wrong                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | `vercel.json functions[].includeFiles` accepts a glob pattern `.planning/eval/*.json` and resolves relative to the repo root. [ASSUMED — verified pattern for Vercel projects but exact behavior of glob + path resolution within tsup-bundled functions is not 100% certain from training data] | Vector 1                           | If glob doesn't work, fall back to comma-separated explicit paths: `[".planning/eval/ground-truth-events.json", ".planning/eval/adversarial-injections.json"]`. The fix is still one-line. |
| A2  | The diff-filter regression has been live since Phase 27.4.6 (when `enrichedV3ToEntities` adopted the `llm-v3-` id prefix). [ASSUMED — based on the JSDoc claim at `llmExtractionPipeline.ts:438-441` referencing Phase 27.4 D-26/D-40; not verified by git-blame]                                | Vector 2                           | Low-impact assumption — doesn't affect the fix, only affects the historical narrative in the prep commit message.                                                                          |
| A3  | `LLM_TOKEN_BUDGET_HARD_CAP` is enforced today (Phase 27.4.3 D-33). [ASSUMED — `shouldPauseNewEvents()` is called at `llmExtractionPipeline.ts:298` but the actual cap config is not verified in this session]                                                                                    | Risk 1                             | If the cap isn't active, the D-02 force-trigger could overspend. Operator should run during attended hours regardless.                                                                     |
| A4  | `events:llm-eval-baseline:v3` exists in prod Redis. [ASSUMED — referenced in `llmEvalHarness.ts:60` as a write target; existence at read time depends on at least one successful eval run having persisted]                                                                                      | Snapshot script informational read | Snapshot script tolerates missing baseline — informational only. No load-bearing impact.                                                                                                   |
| A5  | The `cron:lastTick:refresh-events` key is populated reliably by the cron route handler. [VERIFIED via `server/routes/refresh-events-cron.ts:74` write after `runRefreshExtraction` resolves; Phase 28.2.7 R1 D-03 honest-failure semantics confirmed]                                            | Snapshot freshnessMs derivation    | Low risk — Phase 28.2.7 R1 contract test pins this behavior.                                                                                                                               |

## Sources

### Primary (HIGH confidence — direct code reads)

- `/Users/zackmaz/Desktop/my_world/server/lib/llmExtractionPipeline.ts` (full file, 504 LOC) — diff-filter bug confirmed at line 277
- `/Users/zackmaz/Desktop/my_world/server/lib/llmEvalHarness.ts` (full file, 565 LOC) — `fs.readFileSync` usage at lines 138, 401
- `/Users/zackmaz/Desktop/my_world/server/lib/llmDLQ.ts` (full file, 107 LOC) — DLQEntry.reason enum at lines 27-37
- `/Users/zackmaz/Desktop/my_world/server/lib/freeClaudeRouter.ts` (lines 40-265) — RouterErrorBucket at lines 48-55; classifyError at 255
- `/Users/zackmaz/Desktop/my_world/server/lib/llmProgress.ts` (full file, 610 LOC) — LLMRunSummary at lines 264-392
- `/Users/zackmaz/Desktop/my_world/server/routes/health.ts` (lines 155-345) — endpoints.llmEvents cache-key probe at line 312
- `/Users/zackmaz/Desktop/my_world/server/routes/refresh-events-cron.ts` (full file, 87 LOC) — cron:lastTick writer at line 74
- `/Users/zackmaz/Desktop/my_world/scripts/analyze-llm-run.ts` (full file, 320 LOC) — Pattern 1 template
- `/Users/zackmaz/Desktop/my_world/scripts/probe-openrouter.ts` (full file, 226 LOC) — Pattern 2 byte-stable JSON
- `/Users/zackmaz/Desktop/my_world/scripts/refresh-water-facilities.ts` (full file, 185 LOC) — Pattern 3 atomic write
- `/Users/zackmaz/Desktop/my_world/vercel.json` (full file, 20 LOC) — no `includeFiles` currently
- `/Users/zackmaz/Desktop/my_world/package.json` (full file, 123 LOC) — tsup invocation at line 13; script entries at 22-31
- `/Users/zackmaz/Desktop/my_world/tsconfig.server.json` — `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
- `/Users/zackmaz/Desktop/my_world/.planning/phases/30-.../run-1-throttle-snapshot.json` — `batchCount: 213, evalScore.total: 0`
- `/Users/zackmaz/Desktop/my_world/.planning/phases/30-.../run-2-throttle-snapshot.json` — `batchCount: 213, evalScore.total: 0`
- `/Users/zackmaz/Desktop/my_world/.planning/phases/30.1-.../30.1-or-pulse-snapshot.json` — OR probe data (90% rate-limit, decision: nim-only); NOT a cron baseline
- `/Users/zackmaz/Desktop/my_world/.planning/REQUIREMENTS.md` — LLM-RELI-06 full text at line 18
- `/Users/zackmaz/Desktop/my_world/.planning/STATE.md` — current position at Phase 31, Phase 30.1 shipped PR #21
- `/Users/zackmaz/Desktop/my_world/.planning/ROADMAP.md` — Phase 31 success criteria 1-4
- `/Users/zackmaz/Desktop/my_world/.planning/phases/31-.../31-CONTEXT.md` — locked decisions D-01..D-12

### Secondary (MEDIUM confidence — referenced but not exhaustively read)

- `server/lib/llmEventExtractor.v3.ts` (skimmed lines 622, 929 for `skipOpenRouter: true`; lines 645-770 for DLQ writers)
- `server/lib/llmExtractorWatchdog.ts` (first 90 LOC — confirms `withBatchWatchdog` shape)
- CLAUDE.md (full file referenced via system context)

### Tertiary (LOW confidence — assumed knowledge)

- Vercel `includeFiles` glob behavior — assumption A1
- Diff-filter regression historical timing — assumption A2

## Metadata

**Confidence breakdown:**

- Eval-bundle fix vector: HIGH — `fs.readFileSync` + `__dirname` is the canonical Vercel gotcha; includeFiles is its canonical fix.
- Diff-filter fix: HIGH — bug verified by direct code read at exact line numbers; fix is a one-character-level surgical change.
- DLQ whitelist: HIGH — every string sourced from a direct enum or writer-site reference.
- D-02 baseline math: HIGH for the 213 baseline; MEDIUM for the 30% gate (operator-tuneable).
- Snapshot script behavior: HIGH — three near-identical templates exist (analyze-llm-run, probe-openrouter, refresh-water-facilities).
- Risks + landmines: HIGH for primary signal cleanliness; MEDIUM for the cascade-of-edge-cases enumeration.

**Research date:** 2026-05-17
**Valid until:** 2026-06-14 (30 days; Phase 31 prep work + Day 1 should land well inside this window)

## RESEARCH COMPLETE
