# Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications — Research

**Researched:** 2026-05-16
**Domain:** LLM provider throttle characterization · post-Pro-upgrade simplification · empirical tuning
**Confidence:** HIGH (line-number verifications, package versions, existing test analogs) · MEDIUM (NIM Retry-After contract — see Assumptions Log)

## Summary

Phase 30 is a measurement phase wrapped in a deletion phase. CONTEXT.md has already locked the eight decisions (D-01 through D-08); this research's job is **not** to revisit them but to (a) prove the cited line numbers still match the live code so the planner can write accurate `acceptance_criteria`, (b) surface the closest existing analogs (scripts, tests, payload shapes) the planner will base new files on, (c) call out one MEDIUM-confidence assumption (NIM `Retry-After` header) so the analyzer script can handle both code paths, and (d) sanity-check the 800s Pro-ceiling math so Run 1 isn't scheduled into a hard-kill cliff.

All seven file paths and most line ranges in CONTEXT.md verified clean. **Two line-range corrections** for the planner: the `softWarnMs: 60_000` callsites are at lines 633 and 956 (not 632-633 / 955-956), and the Pitfall 1 cache bridge in `server/routes/events.ts` is at lines 518-585 (CONTEXT.md's `701-731` cite is wrong — that's well past `eventsRouter.get('/')`'s closing brace at line 702).

**Primary recommendation:** Execute the seven-commit ladder verbatim from D-08. The largest risk is **not** technical — it's premature execution of Run 1 before D-01's `retryAfterMs` field + analyzer script are in place. Commit 1 (D-01 instrumentation) must merge before Commit 2 (Run 1) is force-triggered. Schedule Run 1 + Run 2 in operator-watchful hours per CONTEXT.md `<specifics>`.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reuse existing `callHistory`; add `retryAfterMs?: number | null` optional field; write a post-run analyzer script `scripts/analyze-llm-run.ts` that reads `events:llm-summary:v3`. **No new Redis sidecar key.** Analyzer outputs JSON + Markdown table consumed by `docs/architecture/llm-pipeline-reliability.md` (D-06).
- **D-02:** Characterize → propose → validate (min 2 runs, max 3). Run 1 at current defaults (concurrency=12, BATCH_SIZE=2, BACKOFF_MS=[1000,4000], jitter=±250ms, hard-kill=90s). Run 2 at proposed defaults. Run 3 only if Run 2 fails the gate. **Hard requirement:** every run completes inside the Pro 800s ceiling.
- **D-03:** Eval regression tolerance = **±3pp absolute** at 5km / 20km / 100km, anchored to `events:llm-eval-baseline:v3` (Phase-29 anchor, 90d TTL). Adversarial eval observed but not gated.
- **D-04:** Delete `mergeAndPersistLlmEntities` from `onBatchComplete` hot path; delete `LLM_FLUSH_EVERY_N_BATCHES` env var. Keep the helper for the single end-of-run write. Regression test asserts the helper is called **exactly once** per `runRefreshExtraction()`.
- **D-05:** Eliminate watchdog **soft-warn tier entirely**. Hard-kill stays as the single tier; default raised per Run-2 proposal (likely 120-180s).
- **D-06:** New file `docs/architecture/llm-pipeline-reliability.md`. CLAUDE.md gets **one pointer line** under "LLM Event Pipeline". No reliability prose in CLAUDE.md.
- **D-07:** Tuned defaults stay env-tunable. **`LLM_BATCH_SIZE` newly introduced** as env var (currently hard-coded `const BATCH_SIZE = 2` at `server/lib/llmEventExtractor.v3.ts:83`). Old values quoted in commit message.
- **D-08:** One run = one commit. Seven atomic commits (D-04/D-05 may swap order).

### Claude's Discretion

- Exact analyzer script path/name (`scripts/analyze-llm-run.ts` recommended; mirror the `scripts/eval-replay.ts` invocation shape).
- Exact `retryAfterMs` shape on `callHistory` row (recommendation: `number | null` in **milliseconds** to match `latencyMs` convention).
- Whether D-04 regression test extends an existing file or is new (recommendation below in Validation Architecture).
- Whether `LLM_BATCH_SIZE` introduction lands in the same commit as the value change (Commit 5) or its own promotion commit.
- Exact wording of the CLAUDE.md one-liner.

### Deferred Ideas (OUT OF SCOPE)

- 7-day cron-stability watch (LLM-RELI-06) → Phase 31.
- Ghost event URL liveness / dashboard / prune (GHOST-01..05) → Phase 32.
- Actor metadata audit / canonical catalog / eval expansion (ACTOR-01..05) → Phase 33.
- `events:llm:v3:partial` retirement (SIMPLIFY-02), JSDoc audit (DOCS-INT-02), Redis registry verification (DOCS-INT-03), bundle-size delta (SIMPLIFY-07), `freeClaudeRouter.ts` orphan audit (SIMPLIFY-05) → Phase 35.
- Public docs sweep + OpenAPI additions → Phase 36.
- Full ADR-0010 closeout + acceptance gate → Phase 37 (LLM-RELI-07).
- Provider expansion or v4 router (operator-rejected at v1.5 start).
- Per-batch adaptive sizing — `V3_ADAPTIVE_BATCH=true` exists as opt-in but Phase 30 does NOT enable it by default. Defer to Phase 31 if data argues for it.
- Lineage-hash pre-filter (`V3_LINEAGE_PREFILTER`) — separate Phase 27.4.4 opt-in, out of scope.

## Phase Requirements

| ID          | Description                                                                                                                                                             | Research Support                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LLM-RELI-02 | NIM throttle behavior characterized — observed throttle window length, RPM ceiling, recovery signal pattern; written to `docs/architecture/llm-pipeline-reliability.md` | D-01 telemetry (callHistory + new `retryAfterMs`) + D-02 Run 1 + D-06 doc target verified                                                                                                                                                  |
| LLM-RELI-03 | `LLM_BATCH_SIZE` and `LLM_V3_CONCURRENCY` tuned against characterized throttle; tuned values committed; old values documented                                           | Verified: `LLM_BATCH_SIZE` ABSENT from `server/config.ts` Zod schema and `.env.example`; `BATCH_SIZE = 2` hard-coded at `server/lib/llmEventExtractor.v3.ts:83`; `LLM_V3_CONCURRENCY` already exists at `server/config.ts:72` (default 12) |
| LLM-RELI-04 | `callLLM` retry/backoff parameters tuned against measured data — retry budget, exponential-backoff base, jitter window all set from numbers, not guesses                | Verified: `RETRY_ATTEMPTS=2` at `server/lib/freeClaudeRouter.ts:64`, `BACKOFF_MS=[1000,4000]` at line 65, `JITTER_MS=250` at line 66. Tuning targets locked.                                                                               |
| SIMPLIFY-01 | Retire `mergeAndPersistLlmEntities` incremental flush + `LLM_FLUSH_EVERY_N_BATCHES` env var; single terminal-key write becomes canonical                                | Verified: helper at `server/lib/llmExtractionPipeline.ts:130-148`; two callsites at line 404 (delete) and line 477 (keep); env var at `server/config.ts:81` (delete) and `.env.example:141` (delete)                                       |
| SIMPLIFY-03 | Watchdog soft-warn tier eliminated (D-05 chose elimination over relaxation); hard-kill defaults sized against measured throttle                                         | Verified: `softWarnMs` field at `server/lib/llmExtractorWatchdog.ts:40`, soft-warn timer at lines 97-109, finally-block cleanup at line 135; 2 callsites in v3 extractor at lines 633 and 956                                              |

## Architectural Responsibility Map

| Capability                                                    | Primary Tier                                                                                             | Secondary Tier                                                 | Rationale                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-attempt LLM call instrumentation (`retryAfterMs` capture) | API / Backend (`server/lib/freeClaudeRouter.ts`)                                                         | —                                                              | The router is the only code path that sees the raw OpenAI SDK response (and thus the response headers). `llmProgress.callHistory` already lives at this tier. |
| Post-run throttle analysis (`scripts/analyze-llm-run.ts`)     | Build/dev tooling (scripts/)                                                                             | API / Backend (reads `events:llm-summary:v3` via redis)        | The script is operator-facing and stateless; same tier as `scripts/eval-replay.ts`. Zero token spend, Redis-read only.                                        |
| Incremental flush deletion (D-04)                             | API / Backend (`server/lib/llmExtractionPipeline.ts`)                                                    | —                                                              | Pipeline orchestration tier owns extraction lifecycle.                                                                                                        |
| Watchdog soft-warn deletion (D-05)                            | API / Backend (`server/lib/llmExtractorWatchdog.ts` + 2 callers in `server/lib/llmEventExtractor.v3.ts`) | —                                                              | Pure timing primitive, single tier.                                                                                                                           |
| `LLM_BATCH_SIZE` env-var introduction (D-07)                  | API / Backend (`server/config.ts` Zod schema)                                                            | API / Backend (`server/lib/llmEventExtractor.v3.ts:83` reader) | Env-var declaration at config tier; consumer at the v3 extractor.                                                                                             |
| Reliability documentation (D-06)                              | Docs (`docs/architecture/llm-pipeline-reliability.md`)                                                   | ADR (`docs/adr/0010-...md` `<expand_at_36>` block)             | Architecture docs tier owns measurement records; ADR tier owns _decision_ records — these are distinct artifacts per D-06.                                    |

## Standard Stack

### Core (already installed — phase introduces no new dependencies)

| Library          | Version                      | Purpose                                                                                                            | Why Standard                                                                                                                                       |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`         | `^6.34.0` (installed 6.38.0) | OpenAI SDK client used by `freeClaudeRouter.ts` against NIM (`integrate.api.nvidia.com/v1`) + OpenRouter base URLs | Already the v3 cascade's call surface; `Retry-After` header (if present) is accessible via `error.headers` on `APIError` per the SDK contract      |
| `@upstash/redis` | `^1.37.0`                    | Redis REST client; analyzer script reads `events:llm-summary:v3`                                                   | Established `cacheGetSafe<T>` / `cacheSetSafe<T>` wrappers at `server/cache/redis.ts`                                                              |
| `zod`            | `^3.25.76`                   | Env-var schema validation in `server/config.ts` `parseEnv()`                                                       | D-07 `LLM_BATCH_SIZE` schema entry follows the existing pattern at `server/config.ts:72` (`LLM_V3_CONCURRENCY`) and `:56` (`LLM_BATCH_TIMEOUT_MS`) |
| `vitest`         | `^4.1.0`                     | Test framework; node-env tests for server, jsdom for client                                                        | Existing analog tests for D-04 + D-05 regression coverage                                                                                          |
| `tsx`            | `^4.21.0`                    | TypeScript script runner via `--import tsx/esm`                                                                    | Established `node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/*.ts` pattern (5 scripts already use this)    |

**No new packages required.** Phase 30 is pure refactor + new script + new doc; the analyzer reads existing Redis state via existing wrappers.

### Version Verification

- `openai@6.38.0` confirmed via `npm view openai version` — exposes `APIError.headers` for response-header access on 429s. [VERIFIED: npm registry]
- Node engine `>=20` pinned in `package.json`; running 25.6.1 locally. [VERIFIED: `node -e`]
- TypeScript `~5.9.3` pinned per CLAUDE.md convention; D-04 / D-05 / D-07 / D-01 all stay on this. [VERIFIED: CLAUDE.md line 17]

### Alternatives Considered

| Instead of                                                   | Could Use                                                       | Tradeoff                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/analyze-llm-run.ts` reading `events:llm-summary:v3` | New Redis sidecar key `events:llm-throttle:v3`                  | **Rejected by D-01** — SIMPLIFY-02 is already arguing to retire `events:llm:v3:partial`; new sidecar would invite the same retirement debate in Phase 35. Keep observability surface flat.                                                                                              |
| Elim soft-warn entirely (D-05)                               | Relax soft-warn threshold from 60s to ~120s                     | **Rejected by D-05** — on Pro 800s ceiling, a 60s soft-warn at observed p50 batch latency ~27s is mostly noise; the historical signal it carried (Cerebras-running-slow) is gone with Cerebras (Phase 29 D-01). Soft-warn data is derivable post-run from analyzer's latency histogram. |
| `LLM_BATCH_SIZE` env var (D-07)                              | Keep `BATCH_SIZE = 2` hard-coded; bake new value into the const | **Rejected by D-07 / LLM-RELI-03 wording** — the requirement names the env var canonically; operator override mid-incident is the established pattern (`LLM_V3_CONCURRENCY`, `LLM_BATCH_TIMEOUT_MS` both env-tunable).                                                                  |

## Architecture Patterns

### System Architecture Diagram (Phase 30 measurement flow)

```
                         Phase 30 — Measurement + Tuning Flow
                         =====================================

  ┌─────────────────────────────┐
  │ Operator (Bearer-gated)     │
  └──────────────┬──────────────┘
                 │ GET /api/cron/refresh-events?force=true
                 │ Authorization: Bearer ${CRON_SECRET}
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ server/routes/refresh-events-cron.ts                            │
  │   - timingSafeEqual Bearer check (line 51)                      │
  │   - parse ?force=true (line 58)                                 │
  │   - runRefreshExtraction({triggeredBy:'cron', forceCooldown})   │
  │   - cron:lastTick:refresh-events write only AFTER success (74)  │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ server/lib/llmExtractionPipeline.ts :: runRefreshExtraction()   │
  │   - cold-cache probe → cooldown bypass when v3 empty            │
  │   - 15-min cooldown check                                       │
  │   - safeWaitUntil(IIFE) → Vercel function survives res.end()    │
  │   - INSIDE IIFE:                                                │
  │     · resetProgress() (D-01 writes llm:lastProgress)            │
  │     · processEventGroupsV3() → batches → callLLM (per batch)    │
  │     · onBatchComplete cb fires every batch                      │
  │       └─ D-04 DELETES: periodic flush via mergeAndPersistLlm   │
  │       └─ KEEPS: writePartialCache (observability)               │
  │     · geocodeEnrichedEvents()                                   │
  │     · runEval() ← D-03 deploy gate reads from this              │
  │     · mergeAndPersistLlmEntities (TERMINAL ONLY post-D-04)      │
  │     · cacheSetSafe('events:llm-summary:v3', buildSummary(),     │
  │                    LLM_SUMMARY_TTL_SEC = 86400s)                │
  └──────────────┬──────────────────────────────────────────────────┘
                 │  llmProgress.callHistory now has retryAfterMs (D-01)
                 ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Redis: events:llm-summary:v3 (24h TTL)                          │
  │   Shape: LLMRunSummary (server/lib/llmProgress.ts:265-394)      │
  │   Key fields read by analyzer:                                  │
  │     callHistory[].{durationMs, ok, skipReason,                  │
  │                    retryAfterMs ← NEW from D-01}                │
  │     watchdogTimeoutCount                                        │
  │     evalScore.{within5km, within20km, within100km, total}       │
  │     latencyHistogram.nvidia_nim.{p50, p95, p99, samples}        │
  │     errorTaxonomy.nvidia_nim.{rate_limit, timeout, ...}         │
  │     durationMs, lastRun                                         │
  └──────────────┬──────────────────────────────────────────────────┘
                 │
                 ▼  Operator runs:
                 │  npm run analyze:llm-run [--snapshot path/to.json]
                 │
  ┌─────────────────────────────────────────────────────────────────┐
  │ scripts/analyze-llm-run.ts (NEW — D-01)                         │
  │   Two code paths:                                               │
  │     A) retryAfterMs present in any callHistory row →            │
  │        compute throttle_window = median(retryAfterMs)           │
  │        + p95(retryAfterMs)                                      │
  │     B) retryAfterMs absent across all rows →                    │
  │        infer recovery_interval from gap between last 429        │
  │        timestamp and next 200 timestamp in callHistory          │
  │                                                                 │
  │   Computes:                                                     │
  │     - Observed throttle window length (Path A or B)             │
  │     - Steady-state RPM ceiling (200-status calls / elapsed-min) │
  │     - Recovery interval (last-429 → first-200 gap)              │
  │     - Per-batch latency p50 + p95 (already in latencyHistogram) │
  │     - Watchdog hard-kill count (sanity check)                   │
  │                                                                 │
  │   Output:                                                       │
  │     - JSON blob → .planning/phases/30-.../run-N-throttle-       │
  │                   snapshot.json                                 │
  │     - Markdown table → stdout (pasted into D-06 doc)            │
  └─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only — no new directories)

```
scripts/
├── analyze-llm-run.ts                 # NEW (D-01) — mirror of eval-replay.ts shape
└── eval-replay.ts                      # EXISTING — base the new script's runner pattern on this

server/lib/
├── freeClaudeRouter.ts                 # D-01 EDIT — line 64-66 (constants), 402-490 (retry loop), 79-100 callHistory shape gets retryAfterMs
├── llmEventExtractor.v3.ts             # D-05 EDIT line 633 + 956 (drop softWarnMs arg); D-07 EDIT line 83 (BATCH_SIZE → env-tunable)
├── llmExtractionPipeline.ts            # D-04 EDIT lines 88-148 (delete FLUSH_EVERY_N_BATCHES_DEFAULT + getFlushEveryNBatches), 354-419 (delete periodic-flush block); line 477 STAYS
└── llmExtractorWatchdog.ts             # D-05 EDIT line 40 (delete softWarnMs from interface), 53-57 (delete onSoftWarn), 97-109 + 135 (delete softWarnTimer)

server/config.ts                        # D-04 EDIT line 81 (delete LLM_FLUSH_EVERY_N_BATCHES); D-07 EDIT add LLM_BATCH_SIZE entry near line 72

server/__tests__/lib/
├── llmExtractionPipeline.incrementalWrite.test.ts   # D-04 — extend or REPLACE (current asserts every-N flush; new asserts called-exactly-once)
├── llmExtractionPipeline.terminalShape.test.ts      # D-04 — extend (already asserts "runEval called exactly once"; mirror that for mergeAndPersistLlmEntities)
└── llmExtractorWatchdog.test.ts                     # D-05 EDIT — delete soft-warn test cases; keep hard-timeout + late-resolve guard tests

.env.example                            # D-04 EDIT delete lines 137-141 (LLM_FLUSH_EVERY_N_BATCHES block); D-07 EDIT add LLM_BATCH_SIZE block

.planning/phases/30-.../
├── 30-CONTEXT.md                       # EXISTING (decisions locked)
├── 30-RESEARCH.md                      # THIS FILE
├── run-1-throttle-snapshot.json        # NEW — committed in Commit 2
└── run-2-throttle-snapshot.json        # NEW — committed in Commit 6

docs/architecture/
└── llm-pipeline-reliability.md         # NEW (D-06)

docs/adr/
└── 0010-v1-5-llm-pipeline-narrowing-and-deletion.md  # EDIT — append to `<expand_at_36>` (Commit 7)

CLAUDE.md                               # EDIT — one pointer line under "LLM Event Pipeline" (Commit 7)
```

### Pattern 1: Script invocation (D-01 analyzer script)

**What:** Standalone TypeScript script runnable via `npm run <script>`, reading Redis state via existing wrappers.
**When to use:** Operator-facing diagnostics that don't belong in a route handler.
**Example (mirror this exactly):**

```typescript
// scripts/analyze-llm-run.ts
// Based verbatim on scripts/eval-replay.ts shape.
// Invocation: npm run analyze:llm-run [-- --snapshot=path/to.json]

import { cacheGetSafe } from '../server/cache/redis.js';
import type { LLMRunSummary } from '../server/lib/llmProgress.js';

async function main(): Promise<void> {
  const summary = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
  if (!summary?.data) {
    console.error('events:llm-summary:v3 missing or empty');
    process.exit(1);
  }
  // ... compute throttle window, RPM ceiling, recovery interval, p50/p95
  // ... write JSON output + print Markdown table
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Package.json script entry (mirror `eval:replay` line 24):**

```json
"analyze:llm-run": "node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/analyze-llm-run.ts"
```

[VERIFIED: package.json:22-27 — all 5 existing script entries use the identical `--import tsx/esm` invocation pattern]

### Pattern 2: Env-var Zod schema entry (D-07 `LLM_BATCH_SIZE`)

**What:** Add a new env-tunable knob with hard-coded fallback constant.
**When to use:** D-07 promotion of `BATCH_SIZE = 2` from hard-coded to env-tunable.
**Example (mirror `LLM_V3_CONCURRENCY` at server/config.ts:62-72):**

```typescript
// server/config.ts — insert near LLM_V3_CONCURRENCY (line 72)
//
// LLM_BATCH_SIZE — Phase 30 D-07 promotion from hard-coded const.
// Default sized against measured NIM throttle (Run 2 data).
// Tuning knob:
//   - LLM_BATCH_SIZE=2   prior v1.4 default (sized for Hobby 300s ceiling)
//   - LLM_BATCH_SIZE=4-8 candidate v1.5 default (TBD by Run-2 eval)
LLM_BATCH_SIZE: z.coerce.number().int().positive().default(<RUN_2_VALUE>),
```

**Consumer (server/lib/llmEventExtractor.v3.ts:83):**

```typescript
// REPLACE:  const BATCH_SIZE = 2;
// WITH:     const BATCH_SIZE = env.LLM_BATCH_SIZE;
// (the `env` import is already present at line 28)
```

### Pattern 3: Atomic-per-decision commit discipline (D-08)

**What:** One decision = one commit. The commit message names the decision (D-NN) and the requirement (e.g., LLM-RELI-03) so `git revert` is surgical.
**Example commit messages (from D-08):**

```
feat(30): add retryAfterMs + scripts/analyze-llm-run.ts (D-01)
feat(30): characterize NIM throttle on Pro 800s ceiling (Run 1) (D-02)
feat(30): retire incremental flush mechanism (SIMPLIFY-01 / D-04)
feat(30): eliminate watchdog soft-warn tier (SIMPLIFY-03 / D-05)
feat(30): tune LLM_V3_CONCURRENCY / LLM_BATCH_SIZE / backoff against measured throttle (D-02 / LLM-RELI-03 / LLM-RELI-04)
feat(30): validate tuned defaults (Run 2) + commit numbers (D-02)
docs(30): write docs/architecture/llm-pipeline-reliability.md + ADR-0010 append (D-06)
```

### Anti-Patterns to Avoid

The codebase uses numbered anti-patterns. Phase 30 plans must NOT violate any of these:

- **Anti-pattern #14 — Hobby plan cron cap.** Vercel Hobby caps crons at 3 entries. Phase 30 is on Pro now (Phase 29 D-08) but the 3-cron schedule is invariant: `/api/cron/health`, `/api/cron/warm`, `/api/cron/refresh-events`. Don't add a 4th cron. [VERIFIED: vercel.json:4-7]
- **Anti-pattern #17 — Do NOT re-introduce fire-and-forget extraction in `/api/events`.** `/api/events` is cache-only; cache writes happen only in the cron path. Phase 30's Run 1 + Run 2 use `GET /api/cron/refresh-events?force=true`, NOT `/api/events`. The Pitfall 1 cache bridge (lines 518-585 of `server/routes/events.ts`) is read-only. [VERIFIED: CLAUDE.md:100; events.ts:671; health.ts:34; events.ts:764]
- **Anti-pattern #18 — Cooldown discipline / no parallel extractor runs.** `runRefreshExtraction` short-circuits on pipeline-busy (lines 234-240 of `llmExtractionPipeline.ts`). Run 2 must wait for Run 1 to fully complete before force-trigger. Also: do NOT build a pre-flight throttle probe or retry queue — `Phase 29 RESEARCH §Phase-30-relevant cleanup` notes these are explicitly proscribed.
- **HANDOFF anti-pattern #1 — Don't burn token budget for no decision signal.** Three runs max per D-02; Run 3 only if Run 2 fails gate. No silent grid-sweep.
- **HANDOFF anti-pattern #8 — `.env.local` swap discipline.** Operators sometimes swap `.env.local` to PROD Upstash URL+token for eval baseline reads; the analyzer script must not assume `.env.local` is dev.

## Don't Hand-Roll

| Problem                                        | Don't Build                                                                     | Use Instead                                                                                                                                                             | Why                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Per-attempt rate-limit instrumentation         | New `events:llm-throttle:v3` Redis sidecar key                                  | Add `retryAfterMs?` to existing `callHistory[]` rows (per D-01)                                                                                                         | Flat observability surface; no new retirement debate in Phase 35                                   |
| Pre-flight NIM probe                           | Synthetic 1-call NIM probe before Run 1 to "measure" throttle                   | The existing `prewarmIfCold()` at `freeClaudeRouter.ts:618-656` already fires a 1-token synthetic NIM call when idle > 60s. Run 1 is the measurement; don't preempt it. | Phase 29 RESEARCH explicitly proscribes pre-flight throttle probes in Phase 30.                    |
| Eval baseline re-computation                   | Re-run `runEval()` with fresh extraction tokens to "verify" the Phase-29 anchor | Read `events:llm-eval-baseline:v3` (90d TTL, written Phase 29 around 2026-05-12, still live for ~85 more days)                                                          | Phase 27.4.2 Plan 06 established resolver-only eval as the inner-loop ergonomic — zero token spend |
| Throttle-aware retry queue / token bucket      | Custom token-bucket scheduler that smooths NIM 40rpm cap                        | The existing `RollingWindow(40, 60_000)` at `freeClaudeRouter.ts:155` + per-provider `isAvailable` breaker at `llmCircuitBreaker.ts`                                    | Already implemented; D-02 just tunes the concurrency level that feeds these primitives             |
| New Redis sidecar to log Run 1/Run 2 snapshots | Per-run telemetry key in Redis                                                  | JSON file at `.planning/phases/30-.../run-N-throttle-snapshot.json` committed alongside the run commit                                                                  | D-08 specifies the snapshot is a checked-in file (Commit 2 artifact) — git is the audit trail      |

**Key insight:** Phase 30 is a deletion phase. The standing instinct to "build a new diagnostics surface" must be resisted; every new artifact is one more thing for Phase 35 to retire.

## Runtime State Inventory

Phase 30 is **NOT** a rename or migration phase. It's tuning + simplification. **Inventory still required** because deleting `LLM_FLUSH_EVERY_N_BATCHES` is a config deletion that touches operator-set state in Vercel.

| Category                             | Items Found                                                                                                                                                                                                                                                                                                           | Action Required                                                                                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data                          | `events:llm:v3` (terminal cache), `events:llm:v3:partial` (observability), `events:llm-summary:v3` (run summary), `events:llm-eval-baseline:v3` (eval anchor), `events:llm-dlq` — **none renamed**. `callHistory[]` rows gain optional `retryAfterMs` field (forward-compat; existing readers ignore unknown fields). | None — pure additive change to in-payload schema.                                                                                                                                                                    |
| Live service config                  | `LLM_FLUSH_EVERY_N_BATCHES` env var set in Vercel project env (likely set to `10` matching default)                                                                                                                                                                                                                   | Operator must DELETE `LLM_FLUSH_EVERY_N_BATCHES` from Vercel project env settings after Commit 3 ships. If left set, harmless (Zod just no longer parses it once removed from schema). Document in Commit 3 message. |
| OS-registered state                  | Vercel cron schedule unchanged (3 entries, all preserved). Cron task descriptions don't reference `LLM_FLUSH_EVERY_N_BATCHES`.                                                                                                                                                                                        | None.                                                                                                                                                                                                                |
| Secrets / env vars                   | `NVIDIA_NIM_API_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `DASHBOARD_PASSWORD` all unchanged. **New env var `LLM_BATCH_SIZE`** introduced per D-07 — operator should set this in Vercel env to the Run-2-determined value (Commit 5).                                                                                | Operator adds `LLM_BATCH_SIZE=<value>` to Vercel env BEFORE Commit 5 deploys, or accept the hard-coded fallback default.                                                                                             |
| Build artifacts / installed packages | `api/vercel-entry.js` (tsup bundle) regenerated by `npm run build` on every deploy. No stale artifact concern.                                                                                                                                                                                                        | None — verified at Phase 28.1+ (bundle is fresh per build).                                                                                                                                                          |

**Nothing found in OS-registered state category** — Phase 30 does not touch Vercel cron schedule, Tailscale ACLs, or any external service registration. Verified by inspecting `vercel.json` (unchanged) and confirming no cron entries embed `LLM_FLUSH_EVERY_N_BATCHES` in their descriptions.

## Common Pitfalls

### Pitfall 1: Running Run 1 before D-01 instrumentation is merged

**What goes wrong:** Operator force-triggers `/api/cron/refresh-events?force=true` to "see throttle behavior" before Commit 1 (D-01 + analyzer script) merges. The `callHistory[]` rows lack `retryAfterMs`; the analyzer script doesn't exist. The run completes but yields no actionable telemetry.
**Why it happens:** Phase 30's seven commits are tempting to reorder — Run 1 feels like the "interesting" part. D-08's order is non-negotiable.
**How to avoid:** Plans MUST flag Commit 2 (Run 1) as depending on Commit 1 (D-01). The Run 1 task's `acceptance_criteria` must include "Commit 1 deployed to prod before force-trigger fires."
**Warning signs:** Analyzer script absent from `scripts/`; `npm run analyze:llm-run` returns ENOENT; `events:llm-summary:v3` callHistory rows have no `retryAfterMs` field.

### Pitfall 2: NIM omits `Retry-After` header on 429s

**What goes wrong:** D-01 assumes NIM honors the OpenAI-compatible `Retry-After` HTTP response header on 429s. Forum evidence shows the documented 429 body is just `{"status":429,"title":"Too Many Requests"}` — no Retry-After header is documented or confirmed. If absent, `retryAfterMs` populates as `null` on every 429 row.
**Why it happens:** NIM is OpenAI-compatible at the API shape level but its rate-limit semantics are undocumented for the cloud-hosted catalog endpoint.
**How to avoid:** Analyzer script MUST handle both code paths:

- **Path A (header present):** `retryAfterMs = parseInt(error.headers['retry-after']) * 1000`. Throttle window = median(retryAfterMs across 429 rows).
- **Path B (header absent, all rows have `retryAfterMs: null`):** Infer recovery interval from `callHistory[]` timestamps: find every 429-then-200 transition and compute `next200.timestamp - last429.timestamp`. Throttle window ≈ median of these gaps.
  **Warning signs:** Path A would show `retryAfterMs` with values like 1000-60000ms; Path B all-null. Analyzer Markdown table should label which path was taken.

### Pitfall 3: Run 1 / Run 2 scheduled into operator-unwatched hours

**What goes wrong:** Force-trigger fires at 2am operator-local time. A watchdog hard-kill or cron-stuck condition is undiagnosable until morning. By then the partial-cache may have been clobbered or the breaker may have flapped.
**Why it happens:** It's tempting to align Run 1 with the daily 04:00 UTC cron tick — they're conceptually similar.
**How to avoid:** Plans must flag Run 1 + Run 2 tasks with `autonomous: false`. The CONTEXT.md `<specifics>` is explicit: "Schedule Run 1 + Run 2 during operator-watchful hours."
**Warning signs:** Plans that include "automatically force-trigger Run N" verbiage; no operator hand-off step before force-trigger fires.

### Pitfall 4: Run 1 exceeds 800s Pro ceiling

**What goes wrong:** At current defaults (concurrency=12, BATCH_SIZE=2), a Run 1 capture against ~196 batches (50 events × ground-truth diff after Phase-29 deletions — varies by actual day's GDELT volume) takes longer than expected. Function gets killed at 800s; `mergeAndPersistLlmEntities` at line 477 never fires; `cron:lastTick:refresh-events` never writes. Operator sees `dispatched: true` but no fresh `events:llm:v3` cache.
**Why it happens:** The 197-batch dev runs cited in `.env.example:128` ran ~10 min (600s) on Pro at concurrency=12 — within budget but not with comfortable headroom for cold-start variance + a slow NIM minute.
**How to avoid:** Math sanity check before Run 1:

- At concurrency=12, BATCH_SIZE=2, observed p95 batch latency ~30s (Phase 27.4.4 D-21 preflight number for qwen — `freeClaudeRouter.ts:72-75`)
- Theoretical floor for N batches: `ceil(N / 12) × 30s`
- For 196 batches: `ceil(196 / 12) × 30s = 17 × 30s = 510s` — well inside 800s.
- For 250 batches (a heavy day): `ceil(250 / 12) × 30s = 21 × 30s = 630s` — still inside but tighter.

**Run 1 is theoretically safe.** Run 2 with proposed LOWER concurrency (per D-02) means longer wall-clock — explicit budget check required in Commit 6 acceptance criteria.

**Warning signs:** `cron:lastTick:refresh-events` not advancing; `events:llm-summary:v3.completedAt` missing despite `startedAt` set; `events:llm-dlq` populated with `reason: 'timeout_watchdog'` entries.

### Pitfall 5: Soft-warn deletion (D-05) breaks observability tests

**What goes wrong:** `llmExtractorWatchdog.test.ts` has 4 active test cases including "soft-warn path: invokes onSoftWarn when threshold crossed". Deleting the soft-warn tier without updating the test file leaves orange CI.
**How to avoid:** D-05 commit MUST delete the soft-warn test cases (lines ~96-120 of `llmExtractorWatchdog.test.ts`) atomically with the watchdog code change. Keep: success-path test, hard-timeout test (with onTimeout invocation), late-resolve guard test.
**Warning signs:** Vitest red on soft-warn-path test after D-05 commit; `softWarnMs` parameter still appears in test fixtures.

### Pitfall 6: Run 2 eval regression masked by accidental adversarial gain

**What goes wrong:** D-03 gates on baseline eval at ±3pp. Adversarial eval is observed but NOT gated. If Run 2 tuning trades baseline accuracy (-2pp at 20km, "passes" gate) for adversarial robustness gain (+8pp), the plan considers it green — but the actual portfolio signal is regression.
**How to avoid:** Commit 6 message must report BOTH the baseline delta AND the adversarial delta side-by-side, even though only baseline gates. Operator review covers the implicit tradeoff.
**Warning signs:** Run 2's `events:llm-eval-baseline:v3` shows lower within-20km than Run 1; commit message omits adversarial number.

### Pitfall 7: `mergeAndPersistLlmEntities` regression test that's too strict

**What goes wrong:** The D-04 regression test asserts the helper is called "exactly once per `runRefreshExtraction()` invocation." The actual contract is "exactly once per **successful** invocation"; on the no-new-groups early-return path (lines 289-302) and the soft-cap-paused path (lines 306-320), the helper is intentionally NOT called. A naive `expect(spy).toHaveBeenCalledTimes(1)` against those paths would falsely fail.
**How to avoid:** Test scoping: only assert "exactly once" for the happy-path branch (groups present, soft-cap not active, extraction succeeds). Other branches assert "zero times." Mirror the existing `terminalShape.test.ts` discipline (asserts `runEval` called exactly once on the happy path, line 14-15 of that test file's header docblock).
**Warning signs:** Test fails when groups array is empty; test fails when soft-cap is mocked to true.

## Code Examples

Verified patterns from the live codebase:

### `retryAfterMs` capture (D-01) — proposed insertion site

```typescript
// server/lib/freeClaudeRouter.ts — inside the catch block at line 448
} catch (err) {
  const latencyMs = Date.now() - t0;
  recordLatency(p.name, latencyMs);
  const bucket = classifyError(err);
  recordErrorBucket(p.name, bucket);

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
        retryAfterMs,  // NEW field
      },
      ...history,
    ].slice(0, 20),
  });

  // ... existing log + retry/backoff path unchanged
}
```

**Source for this pattern:** existing soft-warn callHistory entry at `server/lib/llmEventExtractor.v3.ts:662-682`; the same `updateProgress` slicing-to-20 shape is preserved. The `callHistory[]` schema lives in `server/lib/llmProgress.ts:79-100` and MUST be widened atomically in the same commit to include `retryAfterMs?: number | null`.

### `LLMRunSummary` consumed by analyzer

```typescript
// server/lib/llmProgress.ts:265-394 — the shape `scripts/analyze-llm-run.ts` reads
export interface LLMRunSummary {
  lastRun: number;
  groupCount: number;
  batchCount: number;
  geocodeCount: number;
  enrichedCount: number;
  durationMs: number; // ← total run wall-clock
  error: string | null;
  source?: 'pipeline' | 'dev-file-cache';
  schemaVersion?: 'v1' | 'v2' | 'v3';
  dlqCount?: number;
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  watchdogTimeoutCount?: number;
  callHistory?: Array<{
    provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number; // ← per-attempt latency
    ok: boolean;
    batchSize: number;
    timestamp: number; // ← used for recovery-interval math
    routingReason?: 'primary' | string;
    skipReason?:
      | 'breaker'
      | 'hard_cap'
      | 'no_client'
      | 'rate_limit_window'
      | 'daily_cap'
      | 'watchdog-soft-warn';
    // retryAfterMs?: number | null;  ← ADDED BY D-01 to both LLMPipelineProgress and LLMRunSummary
  }>;
  latencyHistogram?: Record<
    'nvidia_nim' | 'openrouter',
    { p50: number; p95: number; p99: number; sparkline: number[]; samples: number[] }
  >;
  errorTaxonomy?: Record<
    'nvidia_nim' | 'openrouter',
    Record<
      | 'rate_limit'
      | 'timeout'
      | 'malformed_json'
      | 'schema_fail'
      | 'network'
      | 'upstream_500'
      | 'other',
      number
    >
  >;
  // ... (full shape at llmProgress.ts:265-394)
}
```

**Note for the planner:** The `skipReason` enum currently includes `'watchdog-soft-warn'` at lines 99 and 334. D-05 deletion of the soft-warn tier means this enum value becomes unreachable. The planner should decide whether to (a) remove it from the schema in Commit 4 (cleaner), or (b) leave it for Phase 35's broader cleanup sweep. Recommendation: remove it atomically in Commit 4 since Commit 4 is already touching the soft-warn surface.

### Force-trigger entry point (Run 1 + Run 2)

```bash
# Operator runs this from a watchful terminal during Run 1 / Run 2.
# CRON_SECRET resolved from Vercel env (matches the prod cron auth).
curl -s "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  | jq .
```

[VERIFIED: `server/routes/refresh-events-cron.ts:37-87` — `timingSafeEqual` Bearer check, `?force=true` parse, `runRefreshExtraction({triggeredBy: 'cron', forceCooldown})` call, `cron:lastTick:refresh-events` Redis write only on success]

## State of the Art

| Old Approach (v1.4 Hobby)                                                                    | Current Approach (v1.5 Pro, post-Phase-30)                                                            | When Changed                               | Impact                                                                                                         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Incremental flush every N=10 batches via `mergeAndPersistLlmEntities` in `onBatchComplete`   | Single end-of-run terminal write only                                                                 | Phase 30 D-04                              | -1 Redis SET-call per ~10 batches × ~196 batches ≈ -19 writes per cron run; commit-level Redis budget signal   |
| 90s hard-kill / 60s soft-warn watchdog (sized for 300s ceiling)                              | Single hard-kill tier, default raised to ~2× measured p95 (Run-2-determined)                          | Phase 30 D-05                              | Soft-warn skipReason entries drop to zero; less noise in `callHistory`; one fewer timer per batch              |
| `BATCH_SIZE = 2` hard-coded constant in `server/lib/llmEventExtractor.v3.ts:83`              | `LLM_BATCH_SIZE` env-tunable with hard-coded fallback default (Run-2-determined, likely 4-8)          | Phase 30 D-07                              | Operator can tune mid-incident without redeploy; default sized against measured throttle                       |
| `RETRY_ATTEMPTS = 2`, `BACKOFF_MS = [1000, 4000]`, `JITTER_MS = 250` (guessed, not measured) | Retry attempts, backoff base, jitter all derived from observed NIM throttle window (Run-2-determined) | Phase 30 D-02 + LLM-RELI-04                | Per-event retry budget now matches actual NIM recovery characteristics; less wasted call surface               |
| 300s Vercel Hobby `maxDuration`                                                              | 800s Vercel Pro `maxDuration`                                                                         | Phase 29 D-08 (already shipped 2026-05-11) | Phase 30 tunes against THIS ceiling; running tight on the prior 300s budget is no longer the design constraint |
| Cerebras + Groq + NIM + OpenRouter cascade                                                   | NIM + OpenRouter cascade only                                                                         | Phase 29 D-01 (already shipped)            | Throttle behavior is now a 2-provider concern, not 4                                                           |

**Deprecated/outdated:**

- `LLM_FLUSH_EVERY_N_BATCHES` env var: retired by D-04. Operator should remove from Vercel project env.
- `softWarnMs` parameter in `BatchWatchdogOptions`: retired by D-05.
- `onSoftWarn` callback in `BatchWatchdogOptions`: retired by D-05.
- `skipReason: 'watchdog-soft-warn'` enum value: retired by D-05 (downstream of soft-warn elimination).
- Phase 27.4 D-26/D-40 deep-rollback lock for v1/v2 extractors: superseded by Phase 29 D-02 (v1/v2 deleted).

## Assumptions Log

| #   | Claim                                                                                                          | Section                                                       | Risk if Wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | NIM provides `Retry-After` HTTP response header on 429 Too Many Requests responses                             | Pitfall 2, D-01 implementation                                | If wrong, `retryAfterMs` populates as `null` on every 429 row. Analyzer Path B (infer from timestamp gaps) handles this fallback. Run 1 reveals which path is real. **Confidence: MEDIUM** — OpenAI SDK exposes `error.headers` on `APIError`, NIM is OpenAI-compatible at the API-shape level, but the documented NIM 429 body example shows only `{"status":429,"title":"Too Many Requests"}` with no header documentation. Mitigation: analyzer handles both paths. [ASSUMED]                                   |
| A2  | NIM's 40 req/min ceiling on the free tier is still the active limit as of 2026-05-16                           | Pitfall 4 (Run 1 math sanity check), CONTEXT.md `<specifics>` | If NIM raised the limit (forum threads show users requesting 200rpm upgrades), measured RPM ceiling will be higher and current defaults are even more conservative than thought — better outcome, not worse. **Confidence: MEDIUM** — NVIDIA developer forums show 2026 discussions of operators requesting RPM increases; suggests 40rpm default still active. [ASSUMED]                                                                                                                                          |
| A3  | Observed p95 batch latency stays in the 27-30s range on the Pro 800s ceiling under the v1.5 narrowed cascade   | Pitfall 4 budget math                                         | If p95 has shifted (NIM model swap, OpenRouter degradation), Run 1 budget math is wrong. Mitigation: Run 1 IS the measurement — its analyzer output replaces this assumption with data. [ASSUMED — sourced from Phase 27.4.4 preflight data at `freeClaudeRouter.ts:72-75`]                                                                                                                                                                                                                                        |
| A4  | `events:llm-eval-baseline:v3` Redis key is still populated as of Phase 30 start                                | D-03 deploy gate                                              | The key has 90d TTL and was written by Phase 29 around 2026-05-12 — should still be live until ~2026-08-10. If accidentally evicted, Run 2 can re-populate by running `npm run eval:replay` once. **Confidence: HIGH** — TTL math is firm. [VERIFIED: CLAUDE.md:121 "90d TTL"]                                                                                                                                                                                                                                     |
| A5  | `mergeAndPersistLlmEntities` deletion from `onBatchComplete` causes no race condition with `writePartialCache` | D-04 implementation                                           | If the IIFE crashes mid-run after `writePartialCache` populates `events:llm:v3:partial` but before the terminal write at line 477, operators see partial-key with `complete: false` and no terminal-key update. Mitigation: this is the **pre-D-04 v1.4 behavior** that motivated Phase 28.2.6 Plan 01's incremental flush; the Pro 800s ceiling makes the crash window negligible. **Confidence: HIGH** — D-04 reverts to a known-tested shape. [VERIFIED: ADR-0010 Consequences section captures this trade-off] |

**If this table is empty:** N/A — table has 5 entries. A1 + A2 + A3 are the [ASSUMED] entries that drive the discuss-phase guard rails. A1 is the highest-value to confirm via Run 1.

## Open Questions

1. **Does NIM honor `Retry-After` on 429s?**
   - What we know: NIM is OpenAI-compatible at the API-shape level; OpenAI SDK exposes `error.headers` on `APIError`; documented NIM 429 body shows no header.
   - What's unclear: Whether `Retry-After` is present despite being undocumented.
   - Recommendation: Analyzer script implements both code paths. Run 1 reveals the answer; if absent, D-06 documentation states this as a finding ("NIM does not surface Retry-After; throttle window inferred from timestamp gaps").

2. **Will Run 1 yield enough 429s to compute a meaningful throttle window?**
   - What we know: At concurrency=12 the rolling-window limiter (`RollingWindow(40, 60_000)` at `freeClaudeRouter.ts:155`) gates submission to NIM at 40rpm. If the limiter works perfectly, NIM never sees 429s and the throttle window is unobservable.
   - What's unclear: Whether the rolling-window limiter is conservative (limits below NIM's actual ceiling) or aggressive (lets bursts through that trigger 429s). Run 1 reveals this.
   - Recommendation: If Run 1 yields zero 429s, the proposed defaults stay at current values (no tuning evidence). Run 2 is then a sanity-check run, not a re-tuning run. Document this branch in D-06.

3. **What's the right `LLM_BATCH_SIZE` ceiling before context-window risk?**
   - What we know: Current `BATCH_SIZE=2` was chosen Phase 27.4.3 D-10 because "each group now carries far more context (news + Bellingcat + temporal)". qwen-235b's context window is large but not unlimited.
   - What's unclear: Whether 4 or 8 batches/call degrades extraction accuracy (the D-03 eval gate catches this; planning should not pre-bake an upper bound).
   - Recommendation: Trust the eval gate. D-02's "BATCH_SIZE ≈ raised from 2 toward 4-8 depending on `runEval()` accuracy" is the right phrasing — let Run 2 data choose.

4. **What does the seven-commit ladder look like if Run 2 fails the gate?**
   - What we know: D-02 specifies Run 3 (bisection fallback) and D-08 specifies 7 commits.
   - What's unclear: Whether Run 3 results in Commit 6.5 (between 6 and 7) or a renamed Commit 6 (validate with bisected defaults).
   - Recommendation: Commit 6 wording stays "validate tuned defaults (Run 2 or Run 3) (D-02)" — same slot, the message body distinguishes the bisection outcome.

## Environment Availability

| Dependency                            | Required By                                                                                      | Available                                                                    | Version                | Fallback                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Node.js                               | Build, tests, scripts                                                                            | ✓                                                                            | 25.6.1 (engine `>=20`) | —                                                                                                          |
| `npm` / `node_modules`                | All                                                                                              | ✓ (assumed live)                                                             | —                      | —                                                                                                          |
| `tsx`                                 | All `scripts/*.ts` invocations                                                                   | ✓                                                                            | 4.21.0 (devDep)        | —                                                                                                          |
| `vitest`                              | D-04 regression test, D-05 watchdog test edits                                                   | ✓                                                                            | 4.1.0 (devDep)         | —                                                                                                          |
| Upstash Redis (prod)                  | Run 1/2 force-trigger, analyzer Redis read                                                       | ✓ (assumed; Phase 29 shipped)                                                | REST API               | If down, `cron:lastTick:refresh-events` won't update — operator notices via /api/health                    |
| NVIDIA NIM API (prod)                 | Run 1 + Run 2 force-trigger                                                                      | ✓ (assumed; key in Vercel env)                                               | 40rpm free tier        | If circuit-broken, Run 1 yields skipReason='breaker' rows — analyzer flags the run as inconclusive         |
| OpenRouter API                        | Fallback (currently `skipOpenRouter: true` in v3 — see `server/lib/llmEventExtractor.v3.ts:618`) | ✓ (key present but skipped)                                                  | 200/day free tier      | —                                                                                                          |
| `events:llm-eval-baseline:v3`         | D-03 deploy gate                                                                                 | ✓ (90d TTL, populated 2026-05-12 per Phase 29 D-04, lives until ~2026-08-10) | —                      | If missing, run `npm run eval:replay` once to re-populate                                                  |
| Vercel Pro plan (`maxDuration: 800`)  | Every force-trigger                                                                              | ✓ (shipped Phase 29 D-08)                                                    | —                      | If accidentally reverted to Hobby/300s, Pitfall 4 budget breaks immediately                                |
| `CRON_SECRET` env var (operator-side) | Force-trigger curl                                                                               | ✓ (operator-managed)                                                         | —                      | Empty value → auth check skipped per `refresh-events-cron.ts:46`; operator's local Vercel env must have it |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None active; all dependencies verified or self-healing via the noted fallbacks.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest 4.1.0                                                                                                                           |
| Config file        | `vite.config.ts` (root) — server tests run with `// @vitest-environment node` directive                                                |
| Quick run command  | `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts server/__tests__/lib/llmExtractorWatchdog.test.ts` |
| Full suite command | `npx vitest run`                                                                                                                       |
| Server-only filter | `npx vitest run server/`                                                                                                               |

### Phase Requirements → Test Map

| Req ID             | Behavior                                                                                                | Test Type                 | Automated Command                                                                                   | File Exists?                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-RELI-02 (D-01) | `retryAfterMs` populated from NIM 429 response header on 429 callHistory rows                           | unit                      | `npx vitest run server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts`                         | ❌ Wave 0 (new file; mock OpenAI APIError with `headers: {'retry-after': '1.5'}`; assert callHistory row has `retryAfterMs: 1500`)                                    |
| LLM-RELI-02 (D-01) | `retryAfterMs` is `null` when NIM 429 response omits header (Path B branch)                             | unit                      | (same file as above)                                                                                | ❌ Wave 0 (mock OpenAI APIError with `headers: {}`; assert row has `retryAfterMs: null`)                                                                              |
| LLM-RELI-02 (D-01) | Analyzer script computes throttle window from `retryAfterMs` median when present (Path A)               | script smoke              | `npm run analyze:llm-run -- --fixture=tests/fixtures/run-with-retry-after.json`                     | ❌ Wave 0 (smoke fixture; assert Markdown output contains "Throttle window (Path A): ...")                                                                            |
| LLM-RELI-02 (D-01) | Analyzer script infers recovery interval from timestamp gaps when `retryAfterMs` absent (Path B)        | script smoke              | (same fixture pair, --fixture=tests/fixtures/run-without-retry-after.json)                          | ❌ Wave 0                                                                                                                                                             |
| SIMPLIFY-01 (D-04) | `mergeAndPersistLlmEntities` called **exactly once** per successful `runRefreshExtraction()` invocation | integration               | `npx vitest run server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`                   | ✅ Extend existing file — already asserts `runEval` called exactly once (test header docblock §3, lines 14-15); add mirror assertion for `mergeAndPersistLlmEntities` |
| SIMPLIFY-01 (D-04) | `LLM_FLUSH_EVERY_N_BATCHES` schema entry absent from `server/config.ts` Zod schema                      | typecheck                 | `npx tsc --noEmit` (drift surfaces as type error; `env.LLM_FLUSH_EVERY_N_BATCHES` no longer exists) | ✅ Existing typecheck; also: `npm run check:env` checks `.env.example` against schema                                                                                 |
| SIMPLIFY-01 (D-04) | No periodic-flush callsite remains in `llmExtractionPipeline.ts`                                        | grep-style invariant test | `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`                | ✅ Replace existing "every-N flush fires" assertions with "no flush in cb" assertion                                                                                  |
| SIMPLIFY-03 (D-05) | `softWarnMs` removed from `BatchWatchdogOptions` interface                                              | typecheck                 | `npx tsc --noEmit` (mismatched callers produce TS error)                                            | ✅ Existing typecheck                                                                                                                                                 |
| SIMPLIFY-03 (D-05) | Hard-kill path still invokes `onTimeout` exactly once (regression guard)                                | unit                      | `npx vitest run server/__tests__/lib/llmExtractorWatchdog.test.ts`                                  | ✅ Existing test (hard-timeout case at line 56-94 stays; soft-warn case at line 96+ DELETED)                                                                          |
| SIMPLIFY-03 (D-05) | No `softWarnMs` references remain in `llmEventExtractor.v3.ts`                                          | grep / typecheck          | `npx tsc --noEmit` (the dropped argument produces TS error if a caller is missed)                   | ✅ Existing typecheck                                                                                                                                                 |
| LLM-RELI-03 (D-07) | `LLM_BATCH_SIZE` env var honored when set; falls back to constant default when unset                    | unit                      | `npx vitest run server/__tests__/config.test.ts`                                                    | ✅ Extend existing config test — add `LLM_BATCH_SIZE` case (mirror existing `LLM_V3_CONCURRENCY` test)                                                                |
| LLM-RELI-03 (D-07) | `BATCH_SIZE` consumer in `llmEventExtractor.v3.ts:83` now reads `env.LLM_BATCH_SIZE`                    | integration               | `npx vitest run server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts`                | ✅ Existing test already passes `LLM_BATCH_SIZE` via hoisted mockEnv — pattern proven                                                                                 |
| LLM-RELI-04 (D-02) | Tuned `BACKOFF_MS` array sized from measured throttle                                                   | manual / commit message   | `git log -1 --format=%B HEAD` (Commit 5 message documents old + new arrays)                         | n/a — operator-verified via commit-message contract                                                                                                                   |

### Sampling Rate

- **Per task commit:** `npx vitest run server/__tests__/lib/llmExt*.test.ts server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` (~15s)
- **Per wave merge:** `npx vitest run server/` (~60s)
- **Phase gate (Commit 6 before merge):** `npx vitest run` (full suite) + `npm run typecheck` + `npm run check:env` + `npm run eval:replay` (resolver-only against baseline)

### Wave 0 Gaps

The following test infrastructure must land in **Commit 1 (D-01)** before **Commit 2 (Run 1)** force-triggers:

- [ ] `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts` — NEW. Covers D-01 Path A + Path B retryAfterMs capture. Mock `openai.APIError` with and without `headers['retry-after']`. Assert callHistory row shape.
- [ ] `tests/fixtures/run-with-retry-after.json` + `tests/fixtures/run-without-retry-after.json` — NEW. LLMRunSummary fixtures for analyzer smoke tests.
- [ ] `scripts/analyze-llm-run.ts` smoke test (optional but recommended) — drive analyzer against the two fixtures, assert Markdown output contains expected headings + numeric ranges.

The following test infrastructure exists and must be **edited** (not created):

- [x] `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` — extend Commit 3.
- [x] `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` — replace per-N-flush assertions with no-flush assertions in Commit 3.
- [x] `server/__tests__/lib/llmExtractorWatchdog.test.ts` — delete soft-warn test cases in Commit 4.
- [x] `server/__tests__/config.test.ts` — extend with `LLM_BATCH_SIZE` case in Commit 5.

### Snapshot Deliverables (NOT unit tests — verified via file presence + shape)

- **Run 1 snapshot:** `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/run-1-throttle-snapshot.json`
  - Required fields: `{ runTimestamp, durationMs, batchCount, watchdogTimeoutCount, throttleWindowMs: { path: 'A'|'B', median, p95 }, steadyStateRpm, recoveryIntervalMs, perBatchLatency: { p50, p95 }, evalScore: { within5km, within20km, within100km, total } }`
  - Verification: file exists in Commit 2 working tree; `jq '.throttleWindowMs.path' run-1-throttle-snapshot.json` returns `"A"` or `"B"`; numeric fields non-null.
- **Run 2 snapshot:** `.planning/phases/30-.../run-2-throttle-snapshot.json` (same shape as Run 1).
  - Deploy-gate verification:
    - `jq '.evalScore.within5km / .evalScore.total' run-2-throttle-snapshot.json` returns value within ±0.03 of `events:llm-eval-baseline:v3` corresponding ratio.
    - `jq '.evalScore.within20km / .evalScore.total' run-2-throttle-snapshot.json` ditto.
    - `jq '.evalScore.within100km / .evalScore.total' run-2-throttle-snapshot.json` ditto.
    - `jq '.watchdogTimeoutCount' run-2-throttle-snapshot.json` ≤ Run 1's `watchdogTimeoutCount`.

## Sources

### Primary (HIGH confidence)

- `/Users/zackmaz/Desktop/my_world/.planning/phases/30-.../30-CONTEXT.md` — Phase 30 decisions D-01 through D-08 (locked input)
- `/Users/zackmaz/Desktop/my_world/.planning/REQUIREMENTS.md` lines 14-16 (LLM-RELI-02/03/04) + 54-56 (SIMPLIFY-01/03)
- `/Users/zackmaz/Desktop/my_world/.planning/ROADMAP.md` lines 134-148 — Phase 30 section + 6 success criteria
- `/Users/zackmaz/Desktop/my_world/CLAUDE.md` lines 91-104 — LLM Event Pipeline section (current-state invariants the tuned defaults amend); line 100 — anti-pattern #17 reference
- `/Users/zackmaz/Desktop/my_world/docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — Phase 29 ADR with `<expand_at_36>` marker at line 52
- `server/lib/freeClaudeRouter.ts` lines 61-66 (constants), 402-485 (retry loop), 448-477 (catch block — D-01 insertion site); package version `openai@^6.34.0` (installed 6.38.0)
- `server/lib/llmEventExtractor.v3.ts` lines 80-83 (BATCH_SIZE const — D-07 promotion target), 538 + 568-570 (BATCH_SIZE consumers), 602-685 (first watchdog caller, softWarnMs at 633), 938-963 (split-retry watchdog caller, softWarnMs at 956), 661-683 (synthetic soft-warn callHistory entry — deleted by D-05 atomically with watchdog)
- `server/lib/llmExtractionPipeline.ts` lines 88-148 (FLUSH_EVERY_N_BATCHES + mergeAndPersistLlmEntities helper), 354-419 (periodic-flush callback — D-04 deletion target), 477 (terminal call — D-04 keeps)
- `server/lib/llmExtractorWatchdog.ts` lines 36-58 (interface — `softWarnMs` at 40, `onSoftWarn` at 57), 97-109 (softWarnTimer), 135 (cleanup) — D-05 deletion targets
- `server/lib/llmProgress.ts` lines 79-100 (callHistory schema — D-01 widening target), 265-394 (LLMRunSummary — analyzer reader contract)
- `server/config.ts` lines 56 (LLM_BATCH_TIMEOUT_MS), 72 (LLM_V3_CONCURRENCY), 81 (LLM_FLUSH_EVERY_N_BATCHES — D-04 deletion target); `LLM_BATCH_SIZE` confirmed ABSENT
- `server/routes/events.ts` lines 518-585 (Pitfall 1 cache bridge — line-range correction vs CONTEXT.md), 671 (anti-pattern #17 inline comment), 764 (test comment)
- `server/routes/refresh-events-cron.ts` lines 37-87 (force-trigger entry point)
- `.env.example` lines 137-141 (LLM_FLUSH_EVERY_N_BATCHES block — D-04 deletion target), 124-135 (LLM_V3_CONCURRENCY block — D-07 mirror pattern)
- `scripts/eval-replay.ts` — analyzer script invocation analog (CLI runner pattern)
- `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` lines 1-100 — D-04 regression-test analog
- `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` lines 1-80 — D-04 "exactly once" assertion analog
- `server/__tests__/lib/llmExtractorWatchdog.test.ts` lines 1-120 — D-05 watchdog test (soft-warn cases to delete)
- `server/__tests__/routes/llm-optional.test.ts` lines 1-60 — Phase 29 D-04 integration-test pattern
- `package.json` lines 22-27 — `--import tsx/esm` script invocation pattern (5 existing scripts)
- `vercel.json` lines 4-7 (3-cron schedule, invariant) + line 17 (maxDuration: 800)

### Secondary (MEDIUM confidence)

- NVIDIA Developer Forums — multiple 2026 threads on NIM 40rpm limit + 429 handling: [API Rate Limit Increase Forum 366043](https://forums.developer.nvidia.com/t/api-rate-limit-increase-for-nvidia-nim/366043), [429 Too Many Requests Forum 335755](https://forums.developer.nvidia.com/t/getting-429-too-many-request-for-nim-cloud-api/335755). Confirms 40rpm free-tier ceiling AND shows 429 body shape `{"status":429,"title":"Too Many Requests"}` — **no Retry-After header documented** (basis for A1 ASSUMED tag).
- `git log --oneline -20` — recent commit history confirms Phase 29 shipped 2026-05-11; Phase 30 context committed 2026-05-16.
- `npm view openai version` — 6.38.0 current; SDK exposes `APIError.headers` per upstream contract (verified via SDK type defs).

### Tertiary (LOW confidence)

- Phase 27.4.4 D-21 preflight characterization numbers (p95 batch latency ~30s) — cited inline in `server/lib/freeClaudeRouter.ts:72-75` comments. Used for Pitfall 4 budget math; Run 1 IS the revalidation.

## Metadata

**Confidence breakdown:**

- Code line numbers: HIGH — every cited block read directly from live files; two corrections noted (softWarn callsites 633/956 not 632-633/955-956; Pitfall 1 bridge at 518-585 not 701-731).
- Existing test analogs: HIGH — `llmExtractionPipeline.terminalShape.test.ts` is a near-perfect fit for D-04's "exactly once" assertion; `llmExtractorWatchdog.test.ts` clearly shows which test cases D-05 deletes.
- Script invocation pattern: HIGH — 5 existing scripts use the identical pattern.
- NIM `Retry-After` header contract: MEDIUM — Path A/Path B branching handles both outcomes; Run 1 confirms which is real.
- 800s Pro ceiling budget math: MEDIUM — based on Phase 27.4.4 D-21 preflight numbers (~30s p95 batch latency); cold-start variance not yet measured on Pro.
- Eval baseline anchor freshness: HIGH — 90d TTL math is firm; baseline written 2026-05-12, alive until ~2026-08-10.

**Research date:** 2026-05-16
**Valid until:** 2026-06-15 (30 days — stable LLM pipeline shape; revisit if NIM raises RPM cap mid-phase or model swaps land)

---

_Phase: 30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim_
_Research: 2026-05-16_
