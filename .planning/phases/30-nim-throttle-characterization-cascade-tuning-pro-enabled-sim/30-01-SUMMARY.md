---
phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim
plan: 01
subsystem: api
tags: [llm, throttle, observability, nim, retry-after, analyzer, telemetry]

# Dependency graph
requires:
  - phase: 29-llm-provider-chain-narrowing-llm-optional-architecture-verce
    provides:
      - Active cascade narrowed to NIM + OpenRouter (D-01)
      - Vercel Pro 800s maxDuration ceiling (D-08) — Phase 30 tunes against this
      - LLMPipelineProgress / LLMRunSummary callHistory shape (writer surface for D-01)
      - events:llm-summary:v3 90d-TTL key (reader surface for analyzer)
provides:
  - retryAfterMs?: number | null on callHistory rows in BOTH LLMPipelineProgress and LLMRunSummary
  - freeClaudeRouter NIM 429 catch block populates retryAfterMs from response headers (case-insensitive, parseFloat NaN guard)
  - scripts/analyze-llm-run.ts — operator-facing post-run analyzer (Redis-read or fixture-mode)
  - npm run analyze:llm-run wired mirroring eval:replay invocation
  - tests/fixtures/{run-with-retry-after,run-without-retry-after}.json LLMRunSummary smoke fixtures
  - Wave-0 unit test guarding Path A + Path B + breaker-idempotency invariants
affects: [30-02, 30-03, 30-04, 30-05, 30-06, 30-07, 31, 36]

# Tech tracking
tech-stack:
  added: [] # no new packages; pure refactor + new script + new test
  patterns:
    - "Phase 30 Pattern: analyzer scripts mirror scripts/eval-replay.ts (shebang + multi-line docblock + async main + .catch + argv parsing via find(a => a.startsWith('--flag=')))"
    - 'Phase 30 Pattern: telemetry fields are appended to existing observability surfaces (callHistory row schema) rather than spinning up new Redis sidecar keys'
    - 'Phase 30 Pattern: Path A / Path B branching for undocumented upstream behavior — pre-build both code paths so the production run reveals which is real'

key-files:
  created:
    - 'scripts/analyze-llm-run.ts (319 lines)'
    - 'server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts (199 lines)'
    - 'tests/fixtures/run-with-retry-after.json (Path A smoke fixture)'
    - 'tests/fixtures/run-without-retry-after.json (Path B smoke fixture)'
  modified:
    - 'server/lib/llmProgress.ts (+4 lines — retryAfterMs?: number | null on both callHistory writer + summary mirror)'
    - 'server/lib/freeClaudeRouter.ts (+45 lines — retryAfterMs capture + per-attempt failed-row write to callHistory)'
    - 'package.json (+1 line — analyze:llm-run script entry)'

key-decisions:
  - 'retryAfterMs field shape: number | null (milliseconds, matching latencyMs convention) — additive optional; existing callHistory readers ignore unknown fields'
  - 'Capture site lives in the same updateProgress({callHistory: [...]}) write pattern used by the existing soft-warn synthetic entry (llmEventExtractor.v3.ts:662-682) — preserves the .slice(0, 20) cap invariant'
  - "Case-insensitive header lookup ('retry-after' ?? 'Retry-After') with parseFloat NaN guard (Number.isFinite && parsed > 0) — rejects malformed values to null safely (T-30-01a mitigation)"
  - "Capture is gated by bucket === 'rate_limit' so non-429 errors (network, timeout, 5xx) emit retryAfterMs:null regardless of incidental headers"
  - "Per-attempt failed-row write was added inside the catch block (previously absent) — provides per-attempt telemetry rows for the analyzer to walk in Path B; breaker-record idempotency preserved (single record('err') still fires once at line 480, not per attempt — RESEARCH gotcha 2 honored)"
  - 'Analyzer accepts --fixture=<path> (smoke-mode, no Redis) AND --snapshot=<path> (writes JSON to disk vs stdout) — neither arg present = Redis read + stdout JSON adjacent to Markdown'
  - "Analyzer tolerates skipReason: 'watchdog-soft-warn' in old summaries (Plan 04 retires the enum value but 90d-TTL key serves rows with it for ~90d post-retirement)"

patterns-established:
  - 'Pattern: optional-field widening on observability rows — same pattern Plans 03-05 will use for env-var promotion and watchdog field deletion (atomic both-sites edit in llmProgress.ts; writer schema and summary-mirror schema both touched in one commit)'
  - 'Pattern: TDD with smoke-fixture driver — fixtures committed alongside the new script serve as both regression baseline and operator example for `npm run analyze:llm-run -- --fixture=...` invocation'

requirements-completed: [LLM-RELI-02]

# Metrics
duration: ~30min
completed: 2026-05-17
---

# Phase 30 Plan 01: Wave-0 Telemetry + Analyzer Infrastructure Summary

**Adds retryAfterMs field to NIM 429 callHistory rows and ships the operator-facing post-run analyzer (Path A / Path B branching) so Run 1 (Plan 02) can produce actionable throttle telemetry instead of guesses.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-17T00:57:13Z (worktree branch reset to phase-29-clean base)
- **Completed:** 2026-05-17T01:02:48Z
- **Tasks:** 2 / 2
- **Files modified:** 3 (llmProgress.ts, freeClaudeRouter.ts, package.json)
- **Files created:** 4 (analyzer script, retryAfterMs test, two LLMRunSummary fixtures)

## Accomplishments

- callHistory row schema widened atomically at both writer site (`LLMPipelineProgress.callHistory`) and summary mirror site (`LLMRunSummary.callHistory`) with the optional `retryAfterMs?: number | null` field. Backwards-compatible — existing readers ignore the new key.
- NIM 429 catch path in `freeClaudeRouter.ts` now extracts `Retry-After` from response headers (case-insensitive, parseFloat NaN guard) and prepends a per-attempt failed row to callHistory with the captured value. Breaker-window single-record-per-call semantics preserved (RESEARCH gotcha 2).
- `scripts/analyze-llm-run.ts` ships with both Path A (header present → median+p95 of retryAfterMs) and Path B (header absent → median+p95 of 429→200 timestamp-gap inference) so Run 1 can characterize NIM regardless of which path NIM actually serves.
- Analyzer accepts `--fixture=<path>` for smoke-mode (zero Redis, zero token spend) and `--snapshot=<path>` for snapshot-writing. Markdown table to stdout is the doc-paste artifact for Plan 07's `docs/architecture/llm-pipeline-reliability.md` (D-06).
- Smoke runs against both fixtures: Path A fixture (4 × 429 rows with retryAfterMs ∈ {1500, 1800, 2000, 3000}) → median 1900ms / p95 3000ms. Path B fixture (same rows with retryAfterMs:null, 429→200 timestamp gaps) → median 1850ms / p95 2100ms.

## Task Commits

1. **Task 1: Widen callHistory schema + capture retryAfterMs in freeClaudeRouter 429 catch block** — `88f70ba` (feat, TDD: RED 6 failing tests → GREEN all passing)
2. **Task 2: Create scripts/analyze-llm-run.ts + fixtures + npm script wire-up** — `388ed8b` (feat, smoke-test-fixture-driven)

_Note: Task 1 followed full RED → GREEN TDD discipline. Task 2's verification surface is the two fixture-driven smoke runs (no separate vitest file — fixtures + analyzer constitute the test pair)._

## Files Created/Modified

### Created

- `scripts/analyze-llm-run.ts` (319 lines) — operator-facing post-run analyzer; Redis-read or fixture-mode; Path A + Path B branching; JSON snapshot + Markdown table output
- `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` (199 lines) — 6 unit tests covering Path A (1.5/2.0), Path B (empty/malformed), non-rate-limit null, breaker idempotency
- `tests/fixtures/run-with-retry-after.json` — LLMRunSummary Path A fixture (4 × 429 rows with retryAfterMs values)
- `tests/fixtures/run-without-retry-after.json` — LLMRunSummary Path B fixture (4 × 429 rows with retryAfterMs:null, recoverable 429→200 timestamp gaps)

### Modified

- `server/lib/llmProgress.ts` (+4 lines) — appended `retryAfterMs?: number | null` to both `LLMPipelineProgress.callHistory` row (lines 100-101) and `LLMRunSummary.callHistory` row (lines 337-338); single-line comment "D-01 (Phase 30): NIM Retry-After header capture, milliseconds. Null when header absent (Path B)."
- `server/lib/freeClaudeRouter.ts` (+45 lines) — inside catch block at lines 448-477: (a) computed retryAfterMs from `(err as { headers?: Record<string,string> }).headers['retry-after'] ?? headers['Retry-After']` gated on `bucket === 'rate_limit'`, (b) prepended new failed-row to callHistory via updateProgress with the same `.slice(0, 20)` cap pattern as the soft-warn synthetic entry, (c) added retryAfterMs to the existing log.warn payload
- `package.json` (+1 line) — `"analyze:llm-run": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/analyze-llm-run.ts"` mirroring the eval:replay invocation pattern verbatim

## Exact retryAfterMs Field Comment Text

Both type sites carry this exact single-line comment (so Plans 02 + 07 can quote it):

```typescript
// D-01 (Phase 30): NIM Retry-After header capture, milliseconds. Null when header absent (Path B).
retryAfterMs?: number | null;
```

## --fixture and --snapshot Arg Shapes

Both confirmed working:

- `npm run analyze:llm-run -- --fixture=tests/fixtures/run-with-retry-after.json` → exit 0, Markdown contains "Throttle window (Path A)", JSON to stdout
- `npm run analyze:llm-run -- --fixture=tests/fixtures/run-without-retry-after.json` → exit 0, Markdown contains "Throttle window (Path B)", JSON to stdout
- `npm run analyze:llm-run -- --fixture=<path> --snapshot=<out>` → exit 0, Markdown to stdout, JSON file written to `<out>` (validated via `jq -e '.throttleWindowMs.path' "$out"`)
- `npm run analyze:llm-run` (no args) → Redis read; missing key produces stderr "events:llm-summary:v3 missing or empty" + exit 1

## Verification (Final Gate)

```
$ npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)  # regression — existing tests unaffected

$ npx tsc --noEmit
[clean — no output]

$ grep -c retryAfterMs server/lib/freeClaudeRouter.ts
6
$ grep -c retryAfterMs server/lib/llmProgress.ts
2  # both LLMPipelineProgress.callHistory AND LLMRunSummary.callHistory row types widened

$ grep -c "record(p.name as Provider, 'err')" server/lib/freeClaudeRouter.ts
1  # breaker-record idempotency preserved — single 'err' per call, not per attempt (RESEARCH gotcha 2)
```

## Surprises / Deviations from PATTERNS.md

- **Line-number drift (minor):** RESEARCH cited the catch block at lines 448-477 and the soft-warn callHistory analog at llmEventExtractor.v3.ts:662-682; both ranges held without shift. No corrections needed.
- **Auto-fix (Rule 2 — Type compatibility):** The plan's RESEARCH §"`retryAfterMs` capture" code example showed an `updateProgress({ callHistory: [...] })` write inserted inside the catch block. The pre-Plan-01 catch block had NO callHistory write at all — only a log.warn + retry/continue. Adding the write was required to make the test assertions (which expect `llmProgress.callHistory[0]` to be the freshly prepended 429 row) pass; this is a Rule 2 fill-in rather than a deviation. Documented inline with a comment naming RESEARCH gotcha 2 so future readers know why this catch block now writes a row when none was written before.
- **Test mock requires `cacheSetSafe`:** Adding the callHistory write triggered `updateProgress` to call through to `cacheSetSafe` (Phase 28.2.7 R2 write-through). The hoisted `vi.mock('../../cache/redis.js', ...)` needed to export `cacheSetSafe: vi.fn().mockResolvedValue(undefined)` in addition to the existing `redis` mock. Mirrors the standard test-mock-completeness discipline.
- **Steady-state RPM in fixtures reads 0:** The fixtures contain only 4 successful NIM calls over 600000ms (= 0.4 RPM, rounds to 0). This is fixture-design pragmatism (8-row fixture demonstrates Path A/B branching cleanly) and does NOT indicate an analyzer bug. Production summaries from Run 1 will have ~96 successful rows over 600s → ~10 RPM, well within the analyzer's `Math.round(successful / minutes)` output range.

## Threat Surface Scan

- **T-30-01 (Information Disclosure — accept):** retryAfterMs is a parsed numeric from a public HTTP response header. No PII, no auth material, no response body content. Bounded structured log already capped at 20 rows via existing `.slice(0, 20)`. Severity LOW; no mitigation needed.
- **T-30-01a (Tampering — mitigate):** Header parsing uses `Number.isFinite(parsed) && parsed > 0` to reject NaN / negative / non-numeric values → retryAfterMs = null (safe default). Test B2 (malformed `retry-after: 'not-a-number'`) proves the guard.
- **T-30-08 (DoS — accept):** Analyzer's `cacheGetSafe` wraps the Redis call with the established 2000ms `withTimeout` from `server/cache/redis.ts:REDIS_OP_TIMEOUT_MS`. Hung Redis cannot block the script beyond that ceiling.

No new security-relevant surface introduced beyond what the threat register already accepted/mitigated.

## Self-Check: PASSED

- [x] `scripts/analyze-llm-run.ts` exists — FOUND
- [x] `tests/fixtures/run-with-retry-after.json` exists — FOUND
- [x] `tests/fixtures/run-without-retry-after.json` exists — FOUND
- [x] `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` exists — FOUND
- [x] Commit `88f70ba` exists — FOUND
- [x] Commit `388ed8b` exists — FOUND
- [x] retryAfterMs appears 6× in freeClaudeRouter.ts — VERIFIED
- [x] retryAfterMs appears 2× in llmProgress.ts (both callHistory types widened) — VERIFIED
- [x] npx tsc --noEmit clean — VERIFIED
- [x] 6 / 6 vitest tests passing — VERIFIED
- [x] 18 / 18 existing freeClaudeRouter.test.ts tests still passing (regression) — VERIFIED
- [x] `npm run analyze:llm-run -- --fixture=tests/fixtures/run-with-retry-after.json` prints "Path A" + exits 0 — VERIFIED
- [x] `npm run analyze:llm-run -- --fixture=tests/fixtures/run-without-retry-after.json` prints "Path B" + exits 0 — VERIFIED
- [x] `--snapshot=<path>` writes JSON to disk verified via `jq -e '.throttleWindowMs.path'` — VERIFIED
- [x] `record(p.name as Provider, 'err')` appears exactly once (breaker idempotency preserved) — VERIFIED
