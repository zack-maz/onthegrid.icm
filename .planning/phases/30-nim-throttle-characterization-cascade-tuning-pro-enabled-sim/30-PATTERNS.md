# Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications — Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 14 (4 CREATE, 10 MODIFY/EXTEND/DELETE-FROM, plus 2 snapshot deliverables verified by file presence)
**Analogs found:** 14 / 14

## File Classification

| New/Modified File                                                                       | Role                                                                                     | Data Flow                                                                        | Closest Analog                                                                                                                                            | Match Quality                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/analyze-llm-run.ts`                                                            | build/dev tooling (operator-facing diagnostic CLI)                                       | Redis read → JSON/Markdown emit                                                  | `scripts/eval-replay.ts`                                                                                                                                  | exact (same tier, same shape, zero token spend)                                                                                                       |
| `docs/architecture/llm-pipeline-reliability.md`                                         | architecture doc (measurement record)                                                    | static doc                                                                       | `docs/architecture/data-flows.md`                                                                                                                         | exact (same docset, same style)                                                                                                                       |
| `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts`                            | unit test (node env)                                                                     | mocked OpenAI client → assert on `callHistory` row                               | `server/__tests__/lib/freeClaudeRouter.test.ts`                                                                                                           | exact (same module-under-test, same hoisted-mock pattern)                                                                                             |
| `tests/fixtures/run-with-retry-after.json` + `run-without-retry-after.json`             | test fixture (smoke input for analyzer)                                                  | static JSON                                                                      | none in repo (no `tests/fixtures/` exists today)                                                                                                          | absent — green-field; use shape from `LLMRunSummary` at `server/lib/llmProgress.ts:265-394`                                                           |
| `.planning/phases/30-.../run-1-throttle-snapshot.json` + `run-2-throttle-snapshot.json` | snapshot deliverable (committed audit artifact)                                          | static JSON output of `analyze-llm-run.ts`                                       | `.planning/phases/27.4.4-.../snapshot-*.json` (per `scripts/snapshot-v3-redis.ts:42-45`)                                                                  | role-match (different schema, same lifecycle: produced by a script, committed alongside the run commit)                                               |
| `server/lib/freeClaudeRouter.ts`                                                        | API/backend (LLM call surface; per-attempt instrumentation)                              | OpenAI SDK call → 429 catch → `updateProgress({callHistory:[...]})`              | self (the soft-warn synthetic entry at `llmEventExtractor.v3.ts:661-683` is the closest in-codebase analog for "append a new field to a callHistory row") | exact (single insertion site at lines 448-477)                                                                                                        |
| `server/lib/llmEventExtractor.v3.ts`                                                    | API/backend (batch loop + 2 watchdog callsites + `BATCH_SIZE` const)                     | per-batch `withBatchWatchdog(...)` wrap                                          | self (the two callsites at lines 633 and 956 are byte-identical except for the `label` field)                                                             | exact (mechanical 2-line argument drops + 1-const reassignment)                                                                                       |
| `server/lib/llmExtractionPipeline.ts`                                                   | API/backend (`runRefreshExtraction` orchestrator)                                        | `processEventGroups(..., onBatchComplete)` → cron-only writer of `events:llm:v3` | self (the terminal call at line 477 stays; the periodic-flush block at 354-419 is the deletion target — same helper, single callsite remains)             | exact (deletion only — collapses 3 callsites to 1)                                                                                                    |
| `server/lib/llmExtractorWatchdog.ts`                                                    | API/backend (pure timing primitive; AbortController-free Promise.race + soft-warn timer) | wrap `batchFn` in race vs timeout                                                | self (the soft-warn tier at 36-58 + 97-109 + 135 is the deletion target; hard-kill + late-resolve guard stays)                                            | exact (deletion only — 3 contiguous blocks)                                                                                                           |
| `server/config.ts`                                                                      | API/backend (Zod env-schema entry)                                                       | parse at module load → throw on bad config                                       | `LLM_V3_CONCURRENCY` block at lines 58-72 + `LLM_BATCH_TIMEOUT_MS` at 51-56                                                                               | exact (same `z.coerce.number().int().positive().default(N)` shape; mirror for new `LLM_BATCH_SIZE` and delete `LLM_FLUSH_EVERY_N_BATCHES` at line 81) |
| `.env.example`                                                                          | env documentation                                                                        | static .env-style file                                                           | `LLM_V3_CONCURRENCY` block at lines 124-135                                                                                                               | exact (same tuning-knob commentary shape; mirror for `LLM_BATCH_SIZE`; delete `LLM_FLUSH_EVERY_N_BATCHES` block at 137-141)                           |
| `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`                      | integration test (node env, IIFE-driven)                                                 | runs full `runRefreshExtraction` against mocked deps                             | self (existing `runEval called exactly once` assertion at lines 359-365)                                                                                  | exact (extend with byte-identical mirror assertion for `mergeAndPersistLlmEntities`)                                                                  |
| `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`                   | integration test (node env)                                                              | same harness; varies `LLM_FLUSH_EVERY_N_BATCHES` to drive cadence                | self (test file is being inverted — old assertion "fires every N" → new assertion "never fires from cb"; also adds `LLM_BATCH_SIZE` consumer test)        | exact (existing hoisted `mockEnv` pattern at lines 29-41 already proves the env-mock pipeline)                                                        |
| `server/__tests__/lib/llmExtractorWatchdog.test.ts`                                     | unit test (node env, fake timers)                                                        | drives watchdog with `vi.advanceTimersByTimeAsync`                               | self (4 test cases at lines 27-165; soft-warn case at 96-130 is the deletion target; hard-timeout + late-resolve guard cases stay)                        | exact (deletion only)                                                                                                                                 |
| `server/__tests__/config.test.ts`                                                       | unit test (node env, no mocks)                                                           | sets `process.env`, dynamic-imports `../config.js`                               | existing test at lines 76-83 (`EVENT_CONFIDENCE_THRESHOLD` numeric parse)                                                                                 | exact (mirror for `LLM_BATCH_SIZE` — set env, import, assert numeric type)                                                                            |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                             | ADR (decision record append)                                                             | static markdown                                                                  | self (the `<expand_at_36>` marker at line 52 is the insertion site)                                                                                       | exact (append-only edit)                                                                                                                              |
| `CLAUDE.md`                                                                             | project instruction doc (token-budgeted shape)                                           | static markdown                                                                  | the "LLM Event Pipeline" section already in CLAUDE.md (lines 91-104 per RESEARCH §Sources)                                                                | partial — add 1 line pointer; no existing architecture-doc pointer to mirror exactly                                                                  |

## Pattern Assignments

### `scripts/analyze-llm-run.ts` (build/dev tooling, Redis-read → JSON/Markdown emit)

**Analog:** `scripts/eval-replay.ts`

**Header docblock + invocation contract** (eval-replay.ts:1-21):

```typescript
#!/usr/bin/env node
/**
 * Phase 27.4.2 P6 — manual ground-truth eval replay (resolver-only).
 *
 * Runs runEval() against the 50-event ground-truth corpus and prints the
 * per-distance counts (5km / 20km / 100km / total) plus the D-25 deploy
 * gate ratio. Used as the inner-loop signal during Wave 2 tuning per D-12.
 *
 * Usage:
 *   npm run eval:replay                                  # default baseline key
 *   npm run eval:replay -- --model=moonshotai/kimi-k2.5  # per-model bake-off baseline
 *
 * ...
 *
 * Cost: ~50s on cold Nominatim cache (50 events × 1 req/s throttle), instant
 * on warm cache. Resolver-only per A6 / Pitfall 8 — does NOT call the LLM
 * extractor, so it does not consume Cerebras/Groq token budget.
 */
```

**Pattern to copy:** shebang + multi-line docblock that names the phase, purpose, usage, and **cost** (token spend / Redis-only). Phase 30's analyzer is **zero token spend, Redis-read only** — call this out explicitly.

**Main + error-exit pattern** (eval-replay.ts:25-46):

```typescript
import { runEval } from '../server/lib/llmEvalHarness.js';

async function main(): Promise<void> {
  const modelArg = process.argv.find((a) => a.startsWith('--model='));
  const model = modelArg?.split('=')[1];

  const score = await runEval(model ? { model } : {});
  console.log(JSON.stringify(score, null, 2));
  const ratio = score.total > 0 ? (score.within20km / score.total).toFixed(3) : 'n/a';
  console.log(`within20km/total = ${ratio} (D-25 deploy gate: >= 0.890)`);
  // ...
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Pattern to copy:** `--flag=value` argv parsing via `find(a => a.startsWith('--flag='))?.split('=')[1]` (NOT a CLI lib); `async function main(): Promise<void>` + `.catch(err => { console.error(err); process.exit(1); })`. Phase 30 analyzer needs `--snapshot=path/to.json` (per CONTEXT D-08 Commit 2: writes to `.planning/phases/30-.../run-N-throttle-snapshot.json`).

**Package.json script entry** (package.json:24, mirror exactly):

```json
"analyze:llm-run": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/analyze-llm-run.ts"
```

**Anti-pattern (gotcha):** RESEARCH HANDOFF anti-pattern #8 — `.env.local` swap discipline. Operators sometimes swap `.env.local` to PROD Upstash URL+token for eval baseline reads; the analyzer script must NOT assume `.env.local` is dev. The `--env-file-if-exists` order means `.env.local` overrides `.env`, which is the operator-expected layering.

**Redis-read pattern** (existing wrapper at `server/cache/redis.ts`):

```typescript
import { cacheGetSafe } from '../server/cache/redis.js';
import type { LLMRunSummary } from '../server/lib/llmProgress.js';

const summary = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
if (!summary?.data) {
  console.error('events:llm-summary:v3 missing or empty');
  process.exit(1);
}
// summary.data.callHistory[*].retryAfterMs is the D-01 field this script reads
```

**Anti-pattern (gotcha):** the `LLMRunSummary` shape (`server/lib/llmProgress.ts:265-394` per RESEARCH §"`LLMRunSummary` consumed by analyzer") is 90d-TTL backwards-compatible via `events:llm-summary:v3`. Adding `retryAfterMs?: number | null` to `callHistory[]` rows is **additive** (existing readers ignore unknown fields), but DO NOT rename or repurpose any existing field — `skipReason: 'watchdog-soft-warn'` enum value will become unreachable post-D-05 but RESEARCH recommends removing it atomically in Commit 4 alongside the watchdog soft-warn deletion.

**Logger convention** (CLAUDE.md "logger.child" rule + every server file):

```typescript
import { logger } from '../server/lib/logger.js';
const log = logger.child({ module: 'analyze-llm-run' });
log.info({ throttleWindowMs, steadyStateRpm }, 'analyzer summary');
```

**Anti-pattern (gotcha):** never `console.log` for structured signal — use `logger.child({ module: 'analyze-llm-run' })`. Two `console.log`s in `eval-replay.ts:31-38` are tolerated only because they're the script's stdout contract; the analyzer's stdout is the Markdown table (intentional `console.log`), and any per-record diagnostics go through the structured logger.

---

### `docs/architecture/llm-pipeline-reliability.md` (architecture doc, measurement record)

**Analog:** `docs/architecture/data-flows.md` (header + section structure)

**Header pattern** (data-flows.md:1-19):

```markdown
# Data Flows

One Mermaid `sequenceDiagram` per upstream data source, showing the full
round-trip from the browser to the cache to the upstream provider and back.

Every section names its adapter file, route file, Redis cache key, logical
TTL, and polling cadence so you can jump straight into the code. The
cross-cutting concerns section at the bottom covers fallback, rate limiting,
tracing, and CDN cache headers that apply uniformly across sources.
```

**Pattern to copy:** terse 2-paragraph intro that (1) names the doc's purpose in one sentence, (2) explains its structure / how to navigate. No marketing prose. Match the `docs/architecture/README.md` style (lines 1-9): "Start with the project README for a quick-start... come here when you want to understand how the system is wired."

**README.md insertion** (docs/architecture/README.md:11-20):

```markdown
## System-level diagrams

- [`system-context.md`](./system-context.md) — High-level topology...
- [`data-flows.md`](./data-flows.md) — One sequence diagram per data source...
- [`frontend.md`](./frontend.md) — React component layout...
- [`deployment.md`](./deployment.md) — Vercel functions, cron jobs...
```

**Pattern to copy:** Add a new bullet to this list pointing to `llm-pipeline-reliability.md` with a one-line description (e.g., "Throttle window characterization, tuned defaults, retired-mechanisms"). Don't reorganize the existing bullets.

**Anti-pattern (gotcha):** RESEARCH §"Don't Hand-Roll" key insight — "Phase 30 is a deletion phase. The standing instinct to 'build a new diagnostics surface' must be resisted." This doc IS one new artifact; keep it lean (throttle-window table + tuned-defaults block + retired-mechanisms block, per D-06). Phase 31 appends a "7-day Watch" section LATER; don't pre-create empty placeholder headers.

**Structure (from CONTEXT D-06):**

```markdown
# LLM Pipeline Reliability

(2-paragraph intro: what this measures, why it exists post-Pro-upgrade)

## Throttle Characterization (Phase 30, 2026-05-16)

| Metric                        | Run 1 (current defaults) | Run 2 (tuned defaults) |
| ----------------------------- | ------------------------ | ---------------------- |
| Throttle window (Path A or B) | ...                      | ...                    |
| Steady-state RPM ceiling      | ...                      | ...                    |
| Recovery interval             | ...                      | ...                    |
| Per-batch latency p50 / p95   | ...                      | ...                    |
| Watchdog hard-kill count      | ...                      | ...                    |
| Eval @ 5/20/100km             | ...                      | ...                    |

## Tuned Defaults (Phase 30 commit-locked)

| Knob                 | Pre-Phase-30         | Post-Phase-30               |
| -------------------- | -------------------- | --------------------------- |
| LLM_V3_CONCURRENCY   | 12                   | <Run-2-value>               |
| LLM_BATCH_SIZE       | 2 (hard-coded const) | <Run-2-value> (env-tunable) |
| LLM_BATCH_TIMEOUT_MS | 90000                | <Run-2-value>               |
| BACKOFF_MS           | [1000, 4000]         | <Run-2-value array>         |
| JITTER_MS            | 250                  | <Run-2-value>               |
| RETRY_ATTEMPTS       | 2                    | <Run-2-value>               |

## Retired Mechanisms

- **Incremental flush (`mergeAndPersistLlmEntities` in `onBatchComplete`)** — retired by SIMPLIFY-01 / Phase 30 D-04. Rationale: Pro 800s ceiling makes the crash window negligible; single end-of-run write is the canonical shape.
- **Watchdog soft-warn tier (`softWarnMs` / `onSoftWarn`)** — retired by SIMPLIFY-03 / Phase 30 D-05. Rationale: 60s soft-warn at p50 ~27s batch latency was mostly noise; Cerebras-running-slow signal is gone post-Phase-29.

## Phase 31 Observations (appended later)

_To be written after Phase 31's 7-day watch (LLM-RELI-06)._
```

---

### `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` (unit test, node env)

**Analog:** `server/__tests__/lib/freeClaudeRouter.test.ts`

**File preamble + hoisted mocks** (freeClaudeRouter.test.ts:1-49):

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: (...args: unknown[]) => createMock(...args) } };
    constructor(_opts: unknown) {}
  }
  return { default: MockOpenAI };
});

vi.mock('../../config.js', () => ({
  env: { NVIDIA_NIM_API_KEY: 'test-nvapi', OPENROUTER_API_KEY: 'test-or' },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

const incrMock = vi.fn().mockResolvedValue(1);
const getMock = vi.fn().mockResolvedValue(0);
const expireMock = vi.fn().mockResolvedValue(1);
vi.mock('../../cache/redis.js', () => ({
  redis: { incr: incrMock, get: getMock, expire: expireMock },
}));

const isAvailableMock = vi.fn().mockReturnValue(true);
const recordMock = vi.fn();
vi.mock('../../lib/llmCircuitBreaker.js', () => ({
  isAvailable: (...args: unknown[]) => isAvailableMock(...args),
  record: (...args: unknown[]) => recordMock(...args),
}));

const { callLLM, stripReasoningBlocks, classifyError, __internal } =
  await import('../../lib/freeClaudeRouter.js');
```

**Pattern to copy verbatim:** `// @vitest-environment node` directive at line 1; hoisted `vi.mock('openai', ...)` via a `MockOpenAI` class (the `class` pattern is required for `new OpenAI(...)` interop under ESM, per the comment at lines 11-14); hoisted mocks of `../../config.js`, `../../lib/logger.js`, `../../cache/redis.js`, `../../lib/llmCircuitBreaker.js`; dynamic `await import('../../lib/freeClaudeRouter.js')` AFTER mocks are registered. Phase 30 D-01 test follows this exactly — only the test assertions differ.

**Test case shape — 429 retry path** (freeClaudeRouter.test.ts:96-103, the closest analog):

```typescript
it('B1: 429 triggers retry — succeeds on attempt 2', async () => {
  createMock
    .mockRejectedValueOnce(new Error('429 rate limit'))
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"ok":true}' } }] });
  const { content, routing } = await callLLM([{ role: 'user', content: 'hi' }], '{}');
  expect(content).toBe('{"ok":true}');
  expect(routing[0]?.provider).toBe('nvidia_nim');
});
```

**Pattern to extend for D-01:** mock `createMock` to reject with an error that has a `headers` property containing `'retry-after': '1.5'` (Path A) or `headers: {}` (Path B). The 429 catch block at `freeClaudeRouter.ts:448-477` (per RESEARCH §"`retryAfterMs` capture (D-01)" proposed insertion site) reads `error.headers['retry-after']`. Mock shape:

```typescript
class MockAPIError extends Error {
  headers: Record<string, string>;
  constructor(msg: string, headers: Record<string, string>) {
    super(msg);
    this.headers = headers;
  }
}
createMock
  .mockRejectedValueOnce(new MockAPIError('429 rate limit', { 'retry-after': '1.5' }))
  .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });
```

**Assertion target:** `llmProgress.callHistory[0]?.retryAfterMs` should equal `1500` (Path A) or `null` (Path B). Existing pattern at `llmEventExtractor.v3.ts:661-683` (the soft-warn synthetic callHistory entry) shows how `updateProgress({ callHistory: [...] })` mutates the singleton; the test reads from the same `llmProgress` import.

**Anti-pattern (gotcha):** Mocking `openai` with a plain `vi.fn().mockImplementation(...)` does NOT work under Node's `new` operator with all transpile pipelines (per the comment at lines 11-14). Use the `class MockOpenAI` pattern verbatim.

---

### `tests/fixtures/run-with-retry-after.json` + `run-without-retry-after.json` (test fixture)

**Analog:** none in repo today — Wave 0 green-field. Shape derives from `LLMRunSummary` at `server/lib/llmProgress.ts:265-394`.

**Pattern to seed from** (RESEARCH §"`LLMRunSummary` consumed by analyzer"):

```json
{
  "lastRun": 1715812800000,
  "groupCount": 196,
  "batchCount": 98,
  "durationMs": 600000,
  "error": null,
  "schemaVersion": "v3",
  "watchdogTimeoutCount": 0,
  "evalScore": { "within5km": 28, "within20km": 35, "within100km": 42, "total": 50 },
  "callHistory": [
    {
      "provider": "nvidia_nim",
      "model": "qwen/qwen3.5-397b-a17b",
      "tokensIn": 1200,
      "tokensOut": 380,
      "durationMs": 27000,
      "ok": false,
      "batchSize": 2,
      "timestamp": 1715812830000,
      "retryAfterMs": 1500
    }
  ],
  "latencyHistogram": {
    "nvidia_nim": { "p50": 27000, "p95": 30000, "p99": 45000, "sparkline": [], "samples": [] }
  },
  "errorTaxonomy": {
    "nvidia_nim": {
      "rate_limit": 12,
      "timeout": 0,
      "malformed_json": 0,
      "schema_fail": 0,
      "network": 0,
      "upstream_500": 0,
      "other": 0
    }
  }
}
```

**Two-file split:** `run-with-retry-after.json` has `retryAfterMs: <number>` on every 429 row (Path A); `run-without-retry-after.json` has `retryAfterMs: null` on every 429 row (Path B — analyzer infers from timestamp gaps).

**Anti-pattern (gotcha):** Don't invent extra fields. `LLMRunSummary` is the contract; the analyzer must read fields that exist in the schema. Adding fixture-only fields couples the test to the fixture and not to the production payload shape.

---

### `.planning/phases/30-.../run-1-throttle-snapshot.json` + `run-2-throttle-snapshot.json` (snapshot deliverable)

**Analog:** `scripts/snapshot-v3-redis.ts` writes to `.planning/phases/27.4.4-.../<label>.json` (lines 42-45). Same lifecycle pattern — produced by a script, committed alongside the run commit.

**Pattern to copy:** the snapshot's path is hard-coded in the script (snapshot-v3-redis.ts:42-45):

```typescript
const PHASE_DIR = resolve(
  __dirname,
  '../.planning/phases/27.4.4-v3-latency-remediation-and-cutover',
);
```

**For Phase 30:** Either hard-code `'../.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim'` in `analyze-llm-run.ts`, OR accept `--snapshot=<path>` arg (more flexible; CONTEXT D-01 + D-08 imply per-run paths). Recommendation: accept `--snapshot=<path>` arg so the same script writes to `run-1-throttle-snapshot.json` and `run-2-throttle-snapshot.json`.

**Required shape (per RESEARCH §"Snapshot Deliverables"):**

```json
{
  "runTimestamp": 1715812800000,
  "durationMs": 600000,
  "batchCount": 98,
  "watchdogTimeoutCount": 0,
  "throttleWindowMs": { "path": "A", "median": 1500, "p95": 3000 },
  "steadyStateRpm": 26,
  "recoveryIntervalMs": 1800,
  "perBatchLatency": { "p50": 27000, "p95": 30000 },
  "evalScore": { "within5km": 28, "within20km": 35, "within100km": 42, "total": 50 }
}
```

**Deploy-gate (Run 2 only):** `jq '.evalScore.withinNkm / .evalScore.total'` must be within ±0.03 of the corresponding ratio in Redis key `events:llm-eval-baseline:v3` at 5km, 20km, 100km (RESEARCH §"Snapshot Deliverables").

**Anti-pattern (gotcha):** Don't `git add` the snapshot before the run actually completes. Pitfall 4 (Run 1 exceeds 800s) means the run might fail to write `events:llm-summary:v3.completedAt`; if so, the analyzer's `runTimestamp` field would be wrong and the snapshot is misleading. Commit 2's task acceptance criteria must include "snapshot is committed only if the run actually completed."

---

### `server/lib/freeClaudeRouter.ts` (API/backend, LLM call surface)

**Analog:** self — the existing soft-warn synthetic callHistory entry at `server/lib/llmEventExtractor.v3.ts:661-683` is the closest pattern for "append a new field to a callHistory row."

**Insertion site (D-01 retryAfterMs capture)** — inside the existing catch block (`freeClaudeRouter.ts:448-477`):

```typescript
} catch (err) {
  const latencyMs = Date.now() - t0;
  recordLatency(p.name, latencyMs);
  const bucket = classifyError(err);
  recordErrorBucket(p.name, bucket);
  log.warn(
    {
      provider: p.name,
      attempt,
      bucket,
      latencyMs,
      err: err instanceof Error ? err.message : String(err),
    },
    'router attempt failed',
  );
  if (bucket === 'rate_limit' && attempt < RETRY_ATTEMPTS - 1) {
    const base: number = BACKOFF_MS[attempt] ?? BACKOFF_MS[0] ?? 1000;
    await sleepWithJitter(base);
    continue;
  }
  callFailed = true;
  break;
}
```

**Pattern to add (RESEARCH §"`retryAfterMs` capture"):**

```typescript
// NEW (D-01): capture Retry-After from 429s when the provider supplies it.
// OpenAI SDK surfaces response headers on APIError.headers; NIM-specific
// header presence verified by Run 1 telemetry.
let retryAfterMs: number | null = null;
if (bucket === 'rate_limit' && err instanceof Error && 'headers' in err) {
  const headers = (err as { headers?: Record<string, string> }).headers;
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (raw) {
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) retryAfterMs = parsed * 1000;
  }
}
// Append to callHistory via updateProgress (existing pattern; mirrors
// soft-warn synthetic entry at llmEventExtractor.v3.ts:662-682).
const history = llmProgress.callHistory ?? [];
updateProgress({
  callHistory: [
    {
      provider: p.name,
      model: p.model,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: latencyMs,
      ok: false,
      batchSize: opts.batchSize ?? 0,
      timestamp: Date.now(),
      retryAfterMs, // NEW field
    },
    ...history,
  ].slice(0, 20),
});
```

**D-02 tuning targets** (freeClaudeRouter.ts:63-66):

```typescript
const LLM_TIMEOUT_MS = 120_000;
const RETRY_ATTEMPTS = 2;
const BACKOFF_MS = [1000, 4000] as const;
const JITTER_MS = 250;
```

**Pattern to replace (post-Run-2 values from D-02):** keep the constant names (operators know them per CONTEXT `<specifics>`); only mutate the array contents. If `RETRY_ATTEMPTS = 3` lands, the `BACKOFF_MS` array grows to 3 elements. Per CONTEXT `<specifics>`: "rename to `BACKOFF_BASE_MS` only if RESEARCH or PLAN reveals an ambiguity."

**Anti-pattern (gotcha 1):** the `callHistory[]` schema lives at `server/lib/llmProgress.ts:79-100` AND in `LLMRunSummary` at `:265-394`. Both must be widened atomically in the same commit (Commit 1) to include `retryAfterMs?: number | null` — otherwise TS will fail in either the writer or the reader. The 20-row `.slice(0, 20)` cap is invariant.

**Anti-pattern (gotcha 2):** `record(p.name as Provider, 'err')` is recorded ONCE per call (line 479), NOT per attempt. Adding `retryAfterMs` capture inside the catch block must NOT introduce a duplicate `record('err')` call — the breaker-window semantics depend on this (see comment at lines 391-400: "Counting every retry attempt as a breaker-window failure was tripping the breaker on rate-limit storms even when the SAME call eventually succeeded on retry").

---

### `server/lib/llmEventExtractor.v3.ts` (API/backend, batch loop + watchdog callsites)

**Analog:** self — both `withBatchWatchdog` callers at lines 632-684 and 954-963 share the same option-bag shape.

**Existing pattern — first callsite** (llmEventExtractor.v3.ts:631-684):

```typescript
{
  timeoutMs: env.LLM_BATCH_TIMEOUT_MS,
  softWarnMs: 60_000, // D-02 hard-coded — only hard cap is env-tunable    ← DELETE per D-05
  batchIndex,
  label: 'v3',
  onTimeout: async () => {
    // ... DLQ enqueue + watchdogTimeoutCount increment
  },
  onSoftWarn: (elapsedMs) => {                                              ← DELETE per D-05
    const history = llmProgress.callHistory ?? [];
    updateProgress({
      callHistory: [
        {
          provider: 'nvidia_nim' as const,
          model: 'watchdog-soft-warn',
          tokensIn: 0,
          tokensOut: 0,
          durationMs: elapsedMs,
          ok: true,
          batchSize: batch.length,
          timestamp: Date.now(),
          skipReason: 'watchdog-soft-warn' as const,
        },
        ...history,
      ].slice(0, 20),
    });
  },
}
```

**Pattern to delete (D-05):** drop the `softWarnMs:` line AND the entire `onSoftWarn: (elapsedMs) => { ... }` arrow function (lines 661-683 — 23 lines). Same pattern at the second callsite (lines 954-963): drop `softWarnMs: 60_000,` only — that callsite has no `onSoftWarn` to delete.

**D-07 promotion target** (llmEventExtractor.v3.ts:80-83):

```typescript
/** D-10 — BATCH_SIZE reduced from v1's 8 to 2 because each group now carries
 *  far more context (news + Bellingcat + temporal) and fits more comfortably
 *  into the provider's attention budget when batched narrowly. */
const BATCH_SIZE = 2;
```

**Pattern to replace (D-07 / LLM-RELI-03):**

```typescript
import { env } from '../config.js'; // ← already imported at line 28 per RESEARCH §"Pattern 2"
// ...
const BATCH_SIZE = env.LLM_BATCH_SIZE; // ← env-tunable; default sized against Run 2 data
```

The docblock comment about "context budget" stays; the `= 2` constant becomes `= env.LLM_BATCH_SIZE`.

**Anti-pattern (gotcha 1):** the synthetic soft-warn callHistory entry (lines 661-683) writes `skipReason: 'watchdog-soft-warn'` which is part of the `callHistory[].skipReason` enum at `llmProgress.ts:99`. Deleting this writer without removing the enum value leaves orphan code surface. RESEARCH §"`LLMRunSummary` consumed by analyzer" recommends removing the enum value atomically in Commit 4 (the same commit as the soft-warn deletion).

**Anti-pattern (gotcha 2):** the `callHistory[]` schema at `llmProgress.ts:79-100` AND `LLMRunSummary` at `:265-394` both encode the enum — backwards compat through `events:llm-summary:v3` (90d TTL) means existing rows with `skipReason: 'watchdog-soft-warn'` will be live in Redis for ~90d after deletion. The TS enum can drop the value, but the analyzer script (D-01) must tolerate seeing it in old summaries (treat as "ignore" — don't crash on unknown enum).

---

### `server/lib/llmExtractionPipeline.ts` (API/backend, `runRefreshExtraction` orchestrator)

**Analog:** self — the terminal call at line 477 is the canonical shape; the periodic-flush block at 354-419 is the deletion target.

**Existing pattern — `FLUSH_EVERY_N_BATCHES_DEFAULT` + `getFlushEveryNBatches` helper** (llmExtractionPipeline.ts:88-106):

```typescript
// Phase 28.2.6 Plan 01 — incremental terminal-key write helpers.
// ...
const FLUSH_EVERY_N_BATCHES_DEFAULT = 10;
function getFlushEveryNBatches(): number {
  const parsed = env.LLM_FLUSH_EVERY_N_BATCHES;
  if (!Number.isFinite(parsed) || parsed < 1) return FLUSH_EVERY_N_BATCHES_DEFAULT;
  return parsed;
}
```

**Pattern to delete (D-04):** both the constant AND the helper function. No replacement.

**Existing pattern — `mergeAndPersistLlmEntities` helper** (llmExtractionPipeline.ts:130-148):

```typescript
async function mergeAndPersistLlmEntities(
  newlyEnriched: ConflictEventEntity[],
  llmCachedRef: { data: ConflictEventEntity[] } | null,
  key: string,
): Promise<{ writtenCount: number; total: number }> {
  // ... merge-by-id Map + cacheSetSafe + saveDevLLMCacheV2 + log.info
}
```

**Pattern to preserve (D-04):** the helper stays; only the periodic-flush callsite (line 404) is deleted. The terminal call at line 477 is kept.

**Existing pattern — periodic-flush block** (llmExtractionPipeline.ts:354-419, 66 lines):

```typescript
const flushEvery = getFlushEveryNBatches();
let batchesSinceLastFlush = 0;
let lastFlushedEventCount = 0;

const extractResult = await processEventGroups(prioritizedGroups, async (completed, total) => {
  updateProgress({ completedBatches: completed, totalBatches: total });

  batchesSinceLastFlush++;
  if (batchesSinceLastFlush < flushEvery) return;
  batchesSinceLastFlush = 0;

  // Periodic flush — geocode the just-completed window and persist
  // ... 50+ lines of partial-cache read, slice, geocode, adapt, merge-and-persist
});
```

**Pattern to replace (D-04):** collapse the entire periodic-flush block to just the progress-update line:

```typescript
const extractResult = await processEventGroups(prioritizedGroups, async (completed, total) => {
  updateProgress({ completedBatches: completed, totalBatches: total });
  // Phase 30 D-04: incremental flush retired (SIMPLIFY-01). Terminal write at line 477 is canonical.
  // Partial-cache observability write stays in the v3 extractor's writePartialCache (SIMPLIFY-02 / Phase 34).
});
```

**Anti-pattern (gotcha 1):** the `lastFlushedEventCount` + `batchesSinceLastFlush` closures (lines 355-356) are deletion-target; the callback signature stays `async (completed, total) => void` so the test harness's mock at `incrementalWrite.test.ts:167-171` still drives it.

**Anti-pattern (gotcha 2):** the partial-cache write at `writePartialCache` (called inside the v3 extractor itself, NOT in this pipeline) STAYS untouched. SIMPLIFY-02 retires the partial key in Phase 34; Phase 30 only retires the periodic-flush mechanism. The test mocks at `terminalShape.test.ts:154-181` simulate this — that test passes (Phase 28.2.6 invariant) before and after D-04.

**Anti-pattern (gotcha 3):** the comment block at lines 87-89 still references "Phase 28.2.6 Plan 01" — clean up to reflect Phase 30 D-04 deletion. The `mergeAndPersistLlmEntities` helper's docblock at 108-129 references "periodic flush hook (every N batches inside the IIFE)" — remove the "periodic flush hook" mention; the helper is now single-purpose.

---

### `server/lib/llmExtractorWatchdog.ts` (API/backend, timing primitive)

**Analog:** self — pure deletion targets.

**Existing pattern — `BatchWatchdogOptions` interface** (llmExtractorWatchdog.ts:36-58):

```typescript
export interface BatchWatchdogOptions {
  /** Hard kill threshold in ms — D-01 default 90_000. */
  timeoutMs: number;
  /** Soft-warn threshold in ms — D-02 default 60_000. Must be < timeoutMs. */     ← DELETE
  softWarnMs: number;                                                              ← DELETE
  /** Zero-based batch index, for error messages and log correlation. */
  batchIndex: number;
  /** Pipeline label (e.g. 'v1' | 'v2') — appears in the timeout error msg. */
  label: string;
  onTimeout: () => Promise<void>;
  /**                                                                              ← DELETE
   * Invoked once when the soft-warn threshold elapses mid-flight. Receives        ← DELETE
   * the elapsed ms at the moment of firing (equal to softWarnMs). Optional.       ← DELETE
   */                                                                              ← DELETE
  onSoftWarn?: (elapsedMs: number) => void;                                        ← DELETE
}
```

**Pattern to delete (D-05):** drop both `softWarnMs` and `onSoftWarn` fields plus their docblocks. Keep `timeoutMs`, `batchIndex`, `label`, `onTimeout`.

**Existing pattern — soft-warn timer setup** (llmExtractorWatchdog.ts:97-109):

```typescript
const softWarnTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
  if (!timedOut) {
    try {
      opts.onSoftWarn?.(opts.softWarnMs);
      log.info(
        { batchIndex: opts.batchIndex, label: opts.label, softWarnMs: opts.softWarnMs },
        'batch crossed soft-warn threshold (still running)',
      );
    } catch (err) {
      log.warn({ err }, 'onSoftWarn handler threw — suppressed');
    }
  }
}, opts.softWarnMs);
```

**Pattern to delete (D-05):** entire 13-line block.

**Existing pattern — cleanup in finally** (llmExtractorWatchdog.ts:134-137):

```typescript
} finally {
  if (softWarnTimer) clearTimeout(softWarnTimer);   ← DELETE this line
  if (hardTimer) clearTimeout(hardTimer);
}
```

**Pattern to delete (D-05):** the `if (softWarnTimer) clearTimeout(softWarnTimer);` line only; `hardTimer` cleanup stays.

**Anti-pattern (gotcha 1):** the header docblock at lines 1-19 references "Soft-warn threshold (D-02, default 60s) — log only, non-terminating." — update to reflect single-tier: "Hard-timeout (D-01) — `Promise.race` rejection." Don't leave stale documentation that references a deleted tier.

**Anti-pattern (gotcha 2):** the header docblock also references "v1 and v2 extractors (Wave 2) will wrap their `callLLM()` invocations with" — v1/v2 are gone (Phase 29 D-02). Update to "the v3 extractor wraps its `callLLM()` invocations with" — same atomic-commit-discipline cleanup.

---

### `server/config.ts` (API/backend, Zod env-schema entry)

**Analog:** `LLM_V3_CONCURRENCY` block at lines 58-72; `LLM_BATCH_TIMEOUT_MS` at 51-56.

**Existing pattern — `LLM_V3_CONCURRENCY`** (config.ts:58-72):

```typescript
// Phase 27.4.4 Plan 02 — v3 batch concurrency. Sequential processing was
// ~2 batches/min against a NIM ceiling of 40 req/min, leaving ~95% of the
// rate budget unused. With ~27s/batch latency, default concurrency = 12
// lands roughly 26 req/min steady-state — well under the 40 cap, with
// enough headroom to absorb cold-start spikes and per-batch latency
// variance. Drives 197-batch dev runs from ~95 min → ~10 min.
//
// Tuning knob:
//   - LLM_V3_CONCURRENCY=1 reverts to fully sequential (rollback path)
//   - LLM_V3_CONCURRENCY=20 saturates NIM but risks 429s mid-run
//   - default=12 balances throughput against rate-limit safety
//
// The setting only affects the per-batch fan-out; resolver geocoding is
// still serialized at 1 req/s for Nominatim regardless of this value.
LLM_V3_CONCURRENCY: z.coerce.number().int().positive().default(12),
```

**Pattern to mirror for `LLM_BATCH_SIZE`** (D-07; insert just after `LLM_V3_CONCURRENCY` near line 72):

```typescript
// Phase 30 D-07 — promoted from hard-coded `const BATCH_SIZE = 2` at
// server/lib/llmEventExtractor.v3.ts:83. Sized against measured NIM throttle
// (Run 2 data, see docs/architecture/llm-pipeline-reliability.md).
//
// Tuning knob:
//   - LLM_BATCH_SIZE=2  prior v1.4 default (sized for Hobby 300s ceiling)
//   - LLM_BATCH_SIZE=4-8  candidate v1.5 default (Run-2-determined)
// Higher batch sizes carry more groups per LLM call but risk context-window
// pressure on qwen-235b for verbose groups; the D-03 eval gate (±3pp at
// 5/20/100km) bounds the upper end.
LLM_BATCH_SIZE: z.coerce.number().int().positive().default(<RUN_2_VALUE>),
```

**Pattern to delete (D-04 / SIMPLIFY-01)** — `LLM_FLUSH_EVERY_N_BATCHES` at lines 74-81:

```typescript
// Phase 28.2.6 D-03 — cadence for incremental terminal-key writes during
// LLM extraction. ...
LLM_FLUSH_EVERY_N_BATCHES: z.coerce.number().int().positive().default(10),
```

**Pattern to delete:** entire 8-line block (comment + Zod entry).

**Anti-pattern (gotcha 1):** the comment at `config.ts:43-49` notes Phase 29 D-02's pruning of `LLM_PIPELINE_V2 / LLM_PIPELINE_V3` env entries (operator must prune the Vercel env vars themselves when v1.5 closes). Mirror this discipline: D-04's deletion of `LLM_FLUSH_EVERY_N_BATCHES` from the schema does NOT remove the operator's existing Vercel env-var setting. The operator must delete it post-Commit-3 (RESEARCH §"Runtime State Inventory" notes this is harmless if left set — Zod just no longer parses it once removed from the schema).

**Anti-pattern (gotcha 2):** `LLM_BATCH_SIZE` introduction must be `z.coerce.number().int().positive().default(N)` — same shape as `LLM_V3_CONCURRENCY` and `LLM_BATCH_TIMEOUT_MS`. Don't use `z.number()` (rejects string env-var values) or `z.number().min(1)` (allows non-integer). The `int().positive()` pair is the established idiom.

---

### `.env.example` (env documentation)

**Analog:** `LLM_V3_CONCURRENCY` block at lines 124-135.

**Existing pattern — `LLM_V3_CONCURRENCY`** (.env.example:124-135):

```
# Phase 27.4.4 Plan 02: parallel v3 batch processing.
# Sequential `await` per batch was running ~2 req/min against a NIM ceiling
# of 40 req/min — leaving ~95% of the rate budget unused. Default 12 lands
# ~26 req/min steady-state with ~27s/batch latency (well under cap, with
# headroom for cold-start + per-batch variance). Drives 197-batch dev runs
# from ~95 min → ~10 min.
#
# Tuning knob:
#   - LLM_V3_CONCURRENCY=1   reverts to fully sequential (rollback path)
#   - LLM_V3_CONCURRENCY=12  default; safe under NIM 40/min cap
#   - LLM_V3_CONCURRENCY=20  saturates NIM but risks 429s mid-run
LLM_V3_CONCURRENCY=12
```

**Pattern to mirror for `LLM_BATCH_SIZE`** (D-07; insert near line 135 after `LLM_V3_CONCURRENCY=12`):

```
# Phase 30 D-07: LLM batch size — promoted from hard-coded constant.
# Sized against measured NIM throttle (Run 2 data, see
# docs/architecture/llm-pipeline-reliability.md). Larger batches reduce
# total batch count and raw call surface; smaller batches improve schema
# adherence on verbose qwen-235b groups.
#
# Tuning knob:
#   - LLM_BATCH_SIZE=2   prior v1.4 default (sized for Hobby 300s)
#   - LLM_BATCH_SIZE=4-8 v1.5 candidates (D-03 eval gate ±3pp bounds upper end)
LLM_BATCH_SIZE=<RUN_2_VALUE>
```

**Pattern to delete (D-04)** — `LLM_FLUSH_EVERY_N_BATCHES` at lines 137-141:

```
# Phase 28.2.6 D-03 — cadence for incremental terminal-key writes during LLM extraction.
# Lower = more cross-tick durability + more Redis writes; higher = fewer writes + larger
# loss window on Vercel function-kill. Default 10. N=1 would clobber Redis under
# concurrency=12; N=10 is the rationale-locked cadence. Operator-tunable.
LLM_FLUSH_EVERY_N_BATCHES=10
```

**Pattern to delete:** entire 5-line block (4-line comment + var line). CONTEXT D-04 explicitly notes: "deletion of `LLM_FLUSH_EVERY_N_BATCHES` block also removes its commentary; nothing left behind."

**Anti-pattern (gotcha):** `npm run check:env` (`scripts/check-env-example.ts`, package.json:20) validates `.env.example` against `server/config.ts` Zod schema. If the .env.example block is deleted but the Zod entry is not (or vice versa), this script fails. The Commit 3 (SIMPLIFY-01) commit must atomically delete BOTH sites; the Commit 5 (D-07) commit must atomically add BOTH sites.

---

### `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` (integration test extension)

**Analog:** self — extend with byte-identical mirror of the existing `runEval called exactly once` assertion.

**Existing pattern — `runEval` exactly-once assertion** (terminalShape.test.ts:359-365):

```typescript
it('intermediate flushes do NOT call runEval() (Pitfall 8)', async () => {
  await driveRun(12);
  // runEval is called once after the FINAL geocode — never per intermediate
  // flush. If a regression makes the periodic-flush helper call runEval(),
  // daily LLM token spend triples.
  expect(runEvalSpy).toHaveBeenCalledTimes(1);
});
```

**Pattern to mirror for D-04 mergeAndPersistLlmEntities exactly-once assertion:**

```typescript
it('mergeAndPersistLlmEntities is called exactly once per successful run (D-04 / SIMPLIFY-01)', async () => {
  await driveRun(12);
  // mergeAndPersistLlmEntities is the writer of events:llm:v3. Pre-Phase-30
  // it fired every N batches (incremental flush); Phase 30 D-04 retires that
  // tier and the helper is now invoked exactly once at end-of-pipeline.
  const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
  expect(terminalCalls.length).toBe(1);
});
```

**Pattern to extend:** Add this `it()` block alongside the existing 3 `it()` blocks in the `describe('runRefreshExtraction — D-04/D-11 two-key discipline + Pitfall 8', ...)` suite at line 319.

**Anti-pattern (gotcha 1):** Pitfall 7 in RESEARCH — "The actual contract is 'exactly once per **successful** invocation'; on the no-new-groups early-return path (lines 289-302) and the soft-cap-paused path (lines 306-320), the helper is intentionally NOT called." This `driveRun(12)` test is in the happy-path branch (groups present, soft-cap mocked false). If you add additional tests for empty-groups or soft-cap-paused paths, they should assert `expect(terminalCalls.length).toBe(0)` — NOT `.toBe(1)`.

**Anti-pattern (gotcha 2):** The existing test at line 320 already asserts `terminalCalls.length).toBeGreaterThanOrEqual(2)` for the 12-batch happy path (pre-Phase-30 behavior: 1 intermediate flush at batch 10 + 1 final = 2). This assertion changes post-D-04 to `.toBe(1)`. The Commit 3 task must update BOTH this assertion (line 325) AND the new mirror assertion atomically.

---

### `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` (integration test replace + extend)

**Analog:** self — flip the cadence assertions.

**Existing pattern — every-N flush asserts (incrementalWrite.test.ts:371-391):**

```typescript
describe('runRefreshExtraction — D-03 incremental terminal-key cadence', () => {
  it("cadence: cacheSetSafe('events:llm:v3', ...) is called every 10 batches", async () => {
    await driveRun(12);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("no premature flush: under 10 batches there is exactly ONE cacheSetSafe('events:llm:v3', ...) call (final-only)", async () => {
    await driveRun(5);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });

  it('configurable: LLM_FLUSH_EVERY_N_BATCHES=3 fires intermediate at batch 3 and 6', async () => {
    mockEnv.LLM_FLUSH_EVERY_N_BATCHES = 3;
    await driveRun(7);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(3);
  });
});
```

**Pattern to replace (D-04):** the first and third `it()` blocks become wrong post-D-04 (no incremental flush, so 12 batches = 1 terminal call, not 2; `LLM_FLUSH_EVERY_N_BATCHES` is deleted from the schema). The second `it()` block ("no premature flush") is **already correct** for post-D-04 — keep it. Replace the first + third blocks with:

```typescript
describe('runRefreshExtraction — no incremental flush (D-04 / SIMPLIFY-01)', () => {
  it("12-batch happy path: exactly ONE cacheSetSafe('events:llm:v3', ...) call (terminal only)", async () => {
    await driveRun(12);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });

  it("5-batch happy path: exactly ONE cacheSetSafe('events:llm:v3', ...) call (terminal only)", async () => {
    await driveRun(5);
    const terminalCalls = cacheSetSpy.mock.calls.filter(([k]) => k === 'events:llm:v3');
    expect(terminalCalls.length).toBe(1);
  });
});
```

**Pattern to add (D-07 / LLM-RELI-03 `LLM_BATCH_SIZE` consumer):**

```typescript
it('LLM_BATCH_SIZE env-tunable: extractor reads env.LLM_BATCH_SIZE not hard-coded 2', async () => {
  mockEnv.LLM_BATCH_SIZE = 4;
  await driveRun(8);
  // Assertion: processEventGroups was driven with batches of size 4
  // (mock's totalBatchesForRun = 8 events / 4 batchSize = 2 batches).
  // Existing mock at line 168-220 already accepts the batchSize impl — proves
  // the env-mock pipeline works.
  expect(processEventGroupsMock).toHaveBeenCalled();
});
```

**Anti-pattern (gotcha 1):** the existing `mockEnv` at line 29-41 already declares `LLM_FLUSH_EVERY_N_BATCHES: 10` — D-04 must delete this property atomically with the schema deletion (RESEARCH §"Validation Architecture" / Wave 0 Gaps). The hoisted-mock pattern means an orphaned property here is silently ignored, but leaving it accumulates code rot.

**Anti-pattern (gotcha 2):** RESEARCH notes "Existing test already passes `LLM_BATCH_SIZE` via hoisted mockEnv — pattern proven." Actually the file currently has NO `LLM_BATCH_SIZE` key (because it's not in the schema yet). Add it to `mockEnv` at line 29-41 atomically with the Zod schema add (Commit 5).

---

### `server/__tests__/lib/llmExtractorWatchdog.test.ts` (soft-warn test cases delete)

**Analog:** self — delete cases 3 and 4.

**Existing pattern — soft-warn test cases** (llmExtractorWatchdog.test.ts:96-130 case 3, 132-165 case 4):

```typescript
it('soft-warn path: invokes onSoftWarn when threshold crossed, then succeeds without calling onTimeout', async () => {
  // ... 35 lines including expect(onSoftWarn).toHaveBeenCalledTimes(1)
});

it('late-resolve clobber-prevention: after hard-timeout, batch resolving later does not flip onTimeout invocation count', async () => {
  // ... 34 lines, references softWarnMs: 20 at line 145
});
```

**Pattern to delete (D-05):** case 3 entirely (35 lines, refs `onSoftWarn` 5+ times). Case 4 stays in concept (it tests late-resolve clobber prevention, which is the surviving hard-kill tier's late-resolve guard at `llmExtractorWatchdog.ts:113-130`), but the `softWarnMs: 20` argument in its `withBatchWatchdog(...)` call at line 145 must be removed.

**Pattern to surgically edit (D-05) — case 4 at lines 132-165:**

```typescript
it('late-resolve clobber-prevention: after hard-timeout, batch resolving later does not flip onTimeout invocation count', async () => {
  const onTimeout = vi.fn().mockResolvedValue(undefined);
  let lateResolver: ((v: string) => void) | undefined;
  const batchFn = vi.fn<() => Promise<string>>(
    () =>
      new Promise<string>((resolve) => {
        lateResolver = resolve;
      }),
  );

  const pending = withBatchWatchdog(batchFn, {
    timeoutMs: 30,
    softWarnMs: 20, // ← REMOVE this line (and entire field from interface)
    batchIndex: 1,
    label: 'v2',
    onTimeout,
  });
  // ... rest of case stays unchanged
});
```

**Pattern to also edit — case 1 + 2 at lines 27-94:** both reference `softWarnMs` and `onSoftWarn` in their options arg (case 1 at lines 39-44; case 2 at lines 73-77). These must be edited to drop `softWarnMs` and `onSoftWarn` references atomically.

**Anti-pattern (gotcha):** RESEARCH §Pitfall 5 — "Deleting the soft-warn tier without updating the test file leaves orange CI." Commit 4 (D-05) must edit the watchdog code AND the test file atomically. The TS compiler will catch missed callsites (RESEARCH §"Validation Architecture": "the dropped argument produces TS error if a caller is missed").

---

### `server/__tests__/config.test.ts` (extend with LLM_BATCH_SIZE case)

**Analog:** existing test at lines 76-83 — numeric env-var parse.

**Existing pattern — `EVENT_CONFIDENCE_THRESHOLD` numeric parse test** (config.test.ts:76-83):

```typescript
it('falls back to defaults for invalid numeric env vars', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
  process.env.EVENT_CONFIDENCE_THRESHOLD = '0.5';

  const { env } = await import('../config.js');
  expect(env.EVENT_CONFIDENCE_THRESHOLD).toBe(0.5);
});
```

**Pattern to mirror for `LLM_BATCH_SIZE`** (D-07; add new `it()` in the `describe('server/config.ts', ...)` suite):

```typescript
it('LLM_BATCH_SIZE env-tunable: parses positive integer from env (D-07 / LLM-RELI-03)', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
  process.env.LLM_BATCH_SIZE = '4';

  const { env } = await import('../config.js');
  expect(env.LLM_BATCH_SIZE).toBe(4);
  expect(typeof env.LLM_BATCH_SIZE).toBe('number');
});

it('LLM_BATCH_SIZE: falls back to default when unset', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
  delete process.env.LLM_BATCH_SIZE;

  const { env } = await import('../config.js');
  expect(env.LLM_BATCH_SIZE).toBeTypeOf('number');
  expect(env.LLM_BATCH_SIZE).toBeGreaterThan(0);
});
```

**Pattern to extend, NOT replace:** the `vi.resetModules()` + `process.env = { ...originalEnv }` discipline at lines 7-15 isolates each test; mirror the existing test's structure exactly.

**Anti-pattern (gotcha):** the existing test file at lines 1-116 has no `LLM_*` test cases at all — this is the first one. The `vi.resetModules()` discipline at line 9 is load-bearing (each test gets a fresh `parseEnv()` from config.ts module load); without it, the second `LLM_BATCH_SIZE` test would see the cached module state from the first. Don't optimize this away.

---

### `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (append to `<expand_at_36>`)

**Analog:** self — the `<expand_at_36>` marker at line 52.

**Existing pattern — insertion site** (0010-...md:46-79):

```markdown
4. **Vercel Pro upgrade landed in the same phase** so subsequent v1.5
   phases (30, 31) tune against the 800s maxDuration ceiling. The cron
   triad (`/api/cron/health`, `/api/cron/warm`, `/api/cron/refresh-events`)
   no longer sits at the 60s Hobby-tier wall, removing the cascade-timeout
   class of failure from the cron-warm and refresh-events runs.

<expand_at_36>

## Consequences

### Positive

...
```

**Pattern to append (Commit 7) — insert between the `<expand_at_36>` marker and the `## Consequences` heading:**

```markdown
<expand_at_36>

## Phase 30 measurements + tuned defaults (appended 2026-05-XX)

Phase 30 characterized the NIM throttle empirically against the new Pro 800s
ceiling and tuned the cascade against measured data.

| Knob                   | Pre-Phase-30   | Post-Phase-30               | Rationale                                                    |
| ---------------------- | -------------- | --------------------------- | ------------------------------------------------------------ |
| `LLM_V3_CONCURRENCY`   | 12             | <Run-2-value>               | <fill from Run 2 analyzer output>                            |
| `LLM_BATCH_SIZE`       | 2 (hard-coded) | <Run-2-value> (env-tunable) | promoted to env-tunable per LLM-RELI-03                      |
| `LLM_BATCH_TIMEOUT_MS` | 90000          | <Run-2-value>               | sized as `max(2 × p95_batch_latency, throttle_window + 30s)` |
| `BACKOFF_MS`           | [1000, 4000]   | <Run-2-array>               | base = `observed_throttle_window / 2`                        |
| `JITTER_MS`            | 250            | <Run-2-value>               | preserved ±25% jitter ratio                                  |
| `RETRY_ATTEMPTS`       | 2              | <Run-2-value>               | 800s budget allows 3 without watchdog conflict               |

Retired mechanisms:

- **`mergeAndPersistLlmEntities` periodic flush** (SIMPLIFY-01 / D-04) — single end-of-run terminal write is canonical. Redis SET-call count for `events:llm:v3` drops from ~20/run to 1/run.
- **Watchdog soft-warn tier** (SIMPLIFY-03 / D-05) — single hard-kill tier. 60s soft-warn at observed p50 ~27s was mostly noise.

Measurement source: `docs/architecture/llm-pipeline-reliability.md` (Phase 30 D-06).

## Consequences

...
```

**Anti-pattern (gotcha):** the `<expand_at_36>` marker is a literal HTML-style comment hint, NOT a placeholder to delete. RESEARCH §Open Questions notes "Full ADR closes at Phase 36" — keep the marker in place so Phase 36 can find it and append the milestone closeout.

---

### `CLAUDE.md` (add one pointer line under "LLM Event Pipeline")

**Analog:** no existing architecture-doc pointer in CLAUDE.md — Phase 30 adds the first one.

**Pattern context (CLAUDE.md "LLM Event Pipeline" section, per RESEARCH §Sources lines 91-104):**

```markdown
## LLM Event Pipeline

- **Active providers (Phase 29 D-01)** — NVIDIA NIM (primary, qwen-235b instruct model) + OpenRouter (fallback). Prior providers retired Phase 29 — see ADR-0010 for the narrowed-cascade rationale.
- **Single extractor module** — `server/lib/llmEventExtractor.v3.ts`. Cron-only writer; cache at `events:llm:v3`. v1/v2 modules + runtime toggle deleted Phase 29 (Plans 04-06).
  ...
```

**Pattern to add (Commit 7) — insert as the LAST bullet under "LLM Event Pipeline":**

```markdown
- **Throttle characterization + tuned defaults** — see [`docs/architecture/llm-pipeline-reliability.md`](docs/architecture/llm-pipeline-reliability.md) for measured NIM throttle window, RPM ceiling, recovery interval, and the Phase 30 tuned defaults (LLM_V3_CONCURRENCY, LLM_BATCH_SIZE, LLM_BATCH_TIMEOUT_MS, BACKOFF_MS, JITTER_MS, RETRY_ATTEMPTS).
```

**Anti-pattern (gotcha 1):** CONTEXT D-06 is explicit: "CLAUDE.md gets **one** new line... No reliability prose lands in CLAUDE.md itself — preserves Phase 29 D-06's 'current-state invariants only' shape and the 5018-token budget." Don't expand the bullet beyond one line; don't paste the throttle numbers into CLAUDE.md (they live in the doc).

**Anti-pattern (gotcha 2):** CLAUDE.md's section ordering matters. The "LLM Event Pipeline" section is bounded by `## LLM Event Pipeline` and the next `##` heading. Don't move existing bullets; only append.

---

## Shared Patterns

### `// @vitest-environment node` directive (all server-side test files)

**Source:** every file in `server/__tests__/` starts with `// @vitest-environment node` on line 1.
**Apply to:** `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` (NEW in Commit 1).

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

**Why:** server modules import `@vercel/functions`, `pino`, and Node-only built-ins. The default jsdom env (used for frontend tests) breaks these imports.

### Hoisted `vi.mock` BEFORE dynamic-import of module-under-test

**Source:** `server/__tests__/lib/freeClaudeRouter.test.ts:8-49`, `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts:20-138`, `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts:29-243`.
**Apply to:** every new test in Phase 30 (D-01 freeClaudeRouter test, D-07 LLM_BATCH_SIZE test).
**Pattern:**

```typescript
// 1) Hoist mocks via vi.mock(...) at module top-level
const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class {
    /* ... */
  },
}));
vi.mock('../../config.js', () => ({ env: mockEnv }));
vi.mock('../../lib/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('../../cache/redis.js', () => ({
  /* spied wrappers */
}));

// 2) Dynamic import AFTER mocks are registered
const { callLLM } = await import('../../lib/freeClaudeRouter.js');
```

**Why:** Vitest's hoisting is module-static, not lexical. `vi.mock(...)` at file top-level is hoisted ABOVE imports by Vitest's transformer; `import { callLLM }` at the top would resolve before the mock applies. The `await import(...)` pattern defers binding until the mock chain is wired.

### `logger.child({ module: '...' })` for structured logs

**Source:** every server file (e.g., `freeClaudeRouter.ts:28 + 303`, `llmExtractionPipeline.ts:53`, `llmExtractorWatchdog.ts:23`).
**Apply to:** `scripts/analyze-llm-run.ts` (NEW in Commit 1).

```typescript
import { logger } from '../server/lib/logger.js';
const log = logger.child({ module: 'analyze-llm-run' });
log.info({ throttleWindowMs, steadyStateRpm }, 'analyzer summary');
```

**Why:** CLAUDE.md "logger.child" rule. Never `console.log` for structured signal; the analyzer's stdout Markdown table is the one exception (intentional `console.log` for the script's output contract).

### Env-var override with hard-coded fallback (Phase 28.1+ idiom)

**Source:** `server/config.ts:51-72`, `.env.example:124-141`.
**Apply to:** `LLM_BATCH_SIZE` env var introduction (D-07 / Commit 5).

```typescript
// server/config.ts
LLM_BATCH_SIZE: z.coerce.number().int().positive().default(<RUN_2_VALUE>),

// server/lib/llmEventExtractor.v3.ts:83
const BATCH_SIZE = env.LLM_BATCH_SIZE;  // ← `env` import at line 28 already present

// .env.example
LLM_BATCH_SIZE=<RUN_2_VALUE>
```

**Why:** CONTEXT D-07: "Tuned defaults stay env-tunable... so an operator can override mid-incident if Phase 31's 7-day watch flags drift." Rollback recipe: `LLM_V3_CONCURRENCY=12 LLM_BATCH_SIZE=2 LLM_BATCH_TIMEOUT_MS=90000` reverts to v1.4 behavior modulo the soft-warn deletion (which is code-only and requires `git revert`).

### `npm run check:env` byte-identity gate

**Source:** `package.json:20`, `scripts/check-env-example.ts`.
**Apply to:** every commit that touches `server/config.ts` Zod schema OR `.env.example`.
**Why:** the script validates that every Zod schema key has a corresponding `.env.example` line and vice versa. Phase 30 commits 3 (delete `LLM_FLUSH_EVERY_N_BATCHES`) and 5 (add `LLM_BATCH_SIZE`) must update BOTH files atomically; the `check:env` script is the typecheck-style gate that catches drift.

### Atomic-per-decision commit discipline (Phase 29 D-N → Phase 30 D-08)

**Source:** CONTEXT D-08 commit ladder.
**Apply to:** all 7 Phase 30 commits.
**Pattern (commit message):**

```
feat(30): <one-line summary> (D-NN / [LLM-RELI-NN | SIMPLIFY-NN])

<rationale block citing the requirement + measured number when applicable>

Co-Authored-By: ...
```

**Why:** Atomic commits keep `git revert` surgical. CONTEXT D-04: "the commit message includes the pre/post Redis SET-call count for `events:llm:v3` per cron run, captured from Run 2's analyzer output." This means measurement commits (Commits 2 and 6) embed the data, not just code.

### Anti-pattern #17 — `/api/events` is cache-only

**Source:** CLAUDE.md line 100; comment at `server/routes/events.ts:671`; RESEARCH §Pitfall 4.
**Apply to:** Run 1 + Run 2 must use `GET /api/cron/refresh-events?force=true`, NOT `/api/events`. The Pitfall 1 cache bridge (lines 518-585 of `server/routes/events.ts` — CORRECTED from CONTEXT.md's `701-731`) is READ-ONLY.
**Why:** re-introducing fire-and-forget extraction in `/api/events` was the Phase 28.2.6 anti-pattern that motivated the cron-only architecture. Phase 30 must not regress this.

---

## No Analog Found

No files in this phase lack an analog. Every file (CREATE, MODIFY, EXTEND, DELETE-FROM) maps to a concrete existing analog in the codebase or to a near-identical sibling section in the same file.

**Edge case:** `tests/fixtures/run-with-retry-after.json` + `run-without-retry-after.json` have no in-repo analog (no `tests/fixtures/` directory exists today). The shape is fully derivable from `LLMRunSummary` at `server/lib/llmProgress.ts:265-394`, so this is "green-field with a code contract" rather than "no analog." The fixture files are short (~30 lines each) and self-evident from the JSON shape inlined in the pattern assignment above.

## Metadata

**Analog search scope:**

- `scripts/` (22 files scanned; `eval-replay.ts` + `snapshot-v3-redis.ts` selected)
- `server/lib/` (focused: `freeClaudeRouter.ts`, `llmEventExtractor.v3.ts`, `llmExtractionPipeline.ts`, `llmExtractorWatchdog.ts`, `llmProgress.ts`)
- `server/__tests__/` and `server/__tests__/lib/` (38 test files; 5 directly relevant analogs read)
- `server/config.ts` (1 file; entire Zod schema reviewed)
- `.env.example` (1 file; relevant block at lines 100-175 reviewed)
- `docs/architecture/` (6 files listed; `README.md` + `data-flows.md` read for style)
- `docs/adr/` (12 files listed; `0010-v1-5-llm-pipeline-narrowing-and-deletion.md` read for `<expand_at_36>` insertion site)
- `package.json` (script-entry pattern at lines 22-27)

**Files scanned:** ~50 (of which 14 read in detail for excerpt extraction)

**Pattern extraction date:** 2026-05-16
