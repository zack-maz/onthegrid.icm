---
phase: 39-operator-visibility-token-budget-cost-shadow-llm-flight-reco
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - server/lib/llmProgress.ts
  - server/lib/llmCallHistory.ts
  - server/lib/llmRunHistory.ts
  - server/lib/freeClaudeRouter.ts
  - server/lib/llmEventExtractor.v3.ts
  - server/lib/llmExtractionPipeline.ts
  - server/lib/llmTokenBudget.ts
  - server/routes/operator-status.ts
  - server/routes/events.ts
  - src/components/ui/BudgetBlock.tsx
  - src/components/ui/FlightRecorderBlock.tsx
  - src/components/ui/DevApiStatus.tsx
  - server/lib/__tests__/llmCallHistory.test.ts
  - server/lib/__tests__/llmRunHistory.test.ts
  - server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts
  - server/routes/__tests__/operator-status.test.ts
  - server/routes/__tests__/llm-history.test.ts
  - src/components/ui/__tests__/BudgetBlock.test.tsx
findings:
  blocker: 0
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-06-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Phase 39 adds operator-visibility surfaces: two Redis-backed bounded-list flight-recorder modules (`llm:calls:history`, `llm:runs:history`), runId threading through `freeClaudeRouter`, a per-run lifecycle (open at start / close in `finally`), a Bearer-gated `/api/events/llm-history` read endpoint, a `tokenBudget` block on `/api/operator-status`, and two React render blocks (`BudgetBlock`, `FlightRecorderBlock`).

The security posture is sound: both read surfaces are correctly `dashboardAuth`-gated, degrade-open is implemented consistently (Redis throws → `[]`/`null`, route stays 200), the `?runId` filter is an in-memory predicate never concatenated into a key, and `?limit` is clamped to the LTRIM cap. The breaker double-record pitfall (Pitfall 4) is correctly avoided — `record(name,'err')` stays a single per-call write and the dual-write is fire-and-forget `void`.

However, there are several correctness/robustness defects worth fixing before this ships as an operator decision-support surface — most notably a **dishonest run-outcome classification** (`batchesFailed` is structurally near-always 0 and `dlqDelta` is hardcoded 0, so the FlightRecorder paints failed runs green), an **eval-score double-counting** quirk, a **`tokenSpend` mislabel** (it reports cost-shadow tokens, not real NIM spend), and a **negative-`limit` slice bug** in the history endpoint. No data-loss or injection risks were found.

## Warnings

### WR-01: Run outcome classification is dishonest — failed batches report as SUCCESS (green)

**File:** `server/lib/llmExtractionPipeline.ts:357`, `server/lib/llmEventExtractor.v3.ts:572-579`, `src/components/ui/FlightRecorderBlock.tsx:85-93`
**Issue:** `buildRunHistoryEntry` computes `batchesFailed: Math.max(0, totalBatches - completedBatches)`. But in the v3 extractor, `finishBatch()` (which increments `completedBatchesCounter`) is called in **every** terminal branch — watchdog timeout (`:721`), null content (`:763`), schema-fail (`:790`), and success (`:872`). So `completedBatches` counts batches that _finished_, not batches that _succeeded_. A run where every batch schema-fails still yields `completedBatches === totalBatches`, hence `batchesFailed === 0`.

`FlightRecorderBlock.outcomeBand()` then classifies a `completed` run as `'partial'` (yellow) only if `run.batchesFailed > 0 || run.dlqDelta > 0`. Since `batchesFailed` is structurally near-always 0 **and** `dlqDelta` is hardcoded to `0` (`llmExtractionPipeline.ts:360`), the "partial" band is effectively dead code. A run that enriched zero events (e.g. all batches DLQ'd) renders as SUCCESS / green. For an operator decision-support surface whose entire purpose is "what happened to last night's run?", this is a misleading signal.

**Fix:** Track real per-run failure/DLQ counts. Either thread a `batchesFailed`/`dlqDelta` counter out of `processEventGroupsV3` (it already routes failures to the DLQ and has `allFailed`), or at minimum derive a partial state from `enrichedCount === 0 && totalBatches > 0`:

```ts
// in buildRunHistoryEntry — honest failure signal
const enriched = llmProgress.enrichedCount ?? 0;
return {
  ...,
  batchesCompleted: completedBatches,
  batchesFailed: Math.max(0, completedBatches - /* batches that produced events */ ...),
  dlqDelta: /* real delta from listDLQ size at open vs close */ 0,
};
```

If a real count cannot be threaded this phase, change `outcomeBand` to also treat `completed && enrichedCount === 0` as `'partial'` so an empty run is not painted green.

### WR-02: `tokenSpend.nvidia_nim` reports cost-shadow tokens, not real provider spend

**File:** `server/lib/llmExtractionPipeline.ts:358`
**Issue:** `tokenSpend: { nvidia_nim: cost ? cost.tokensIn + cost.tokensOut : 0 }` derives "token spend" from `llmProgress.costShadow`. But `costShadow` is the **shadow** cost calculator — per its own docstring (`llmProgress.ts:263`) it is "what the run WOULD have cost on Anthropic Sonnet." The FlightRecorder renders this as `{run.tokenSpend.nvidia_nim} tok` (`FlightRecorderBlock.tsx:258`), implying real NIM token consumption. `costShadow` happens to accumulate the real `prompt_tokens`/`completion_tokens` from NIM completions (`freeClaudeRouter.ts:480-483`), so the _value_ is coincidentally the real token count — but the field is named/sourced from the shadow accumulator, so any future change to shadow-cost semantics (e.g. estimating tokens for a different model) silently corrupts the displayed "spend."

**Fix:** Source `tokenSpend` from a dedicated real-token accumulator rather than the shadow-cost struct, or rename the field/label to make the shadow-derived provenance explicit. At minimum add a comment pinning the coupling so a future shadow-cost refactor doesn't silently break this.

### WR-03: `?limit` clamp has no lower bound — negative values produce a malformed LRANGE slice

**File:** `server/routes/events.ts` (`/llm-history` handler), `server/lib/llmCallHistory.ts:65`, `server/lib/llmRunHistory.ts:102`
**Issue:** `const limit = Math.min(Number(req.query.limit) || 200, 500);` clamps the upper bound but not the lower. `?limit=-5` → `Number('-5') = -5`, `-5 || 200 = -5` (truthy), `Math.min(-5, 500) = -5`. That flows to `listCallHistory(-5)` → `redis.lrange(KEY, 0, -6)`. Redis interprets `-6` as "6th element from the end," so the call returns an unintended non-empty slice (everything except the last 5) instead of an empty/clamped result. `?limit=0` → falls back to 200 (the `|| 200` masks it), which is inconsistent with `-5`. Not a security issue (no key injection), but a correctness/robustness defect on a tampering-exposed query param.

**Fix:**

```ts
const limit = Math.min(Math.max(1, Math.trunc(Number(req.query.limit) || 200)), 500);
```

### WR-04: Cold-start eval-score is double-counted across runs in the run-history token/eval snapshot

**File:** `server/lib/llmExtractionPipeline.ts:359, 495-499`
**Issue:** `buildRunHistoryEntry` snapshots `evalScore: llmProgress.evalScore`. `runEval()` (`:495`) runs but its result is only logged — it is never written back onto `llmProgress.evalScore` in this pipeline. `resetProgress()` seeds `evalScore: undefined`, and no `updateProgress({ evalScore })` call exists in `runRefreshExtraction`. So the run-history `evalScore` will almost always be `undefined` (FlightRecorder then renders no eval pill). Meanwhile a separate cron path (`/api/cron/health` `runEval`) and stale Redis summaries may carry an eval — but those never reach this singleton field for this run. The result is an eval column that is silently always blank for cron-fired runs, defeating its purpose.

**Fix:** Capture the `runEval()` return and stamp it: `const evalScore = await runEval(); updateProgress({ evalScore });` so `buildRunHistoryEntry` snapshots the run's actual score. Confirm this is the score shape the FlightRecorder's `normalizeEvalScore` expects (it reads `.score`, but `evalScore` is `{within5km, within20km, within100km, total}` — see WR-05).

### WR-05: FlightRecorder `normalizeEvalScore` reads a `.score` field that the server eval shape does not have

**File:** `src/components/ui/FlightRecorderBlock.tsx:56, 130-135`
**Issue:** The client `RunHistoryEntry.evalScore` is typed `{ score?: number } | number | null`, and `normalizeEvalScore` returns `evalScore.score` when present. But the server `RunHistoryEntry.evalScore` reuses `LLMPipelineProgress['evalScore']`, whose shape is `{ within5km, within20km, within100km, total, actorMatchRate? }` (`llmProgress.ts:130-138`) — there is **no `.score` key**. So even if WR-04 is fixed and a real eval object is persisted, `normalizeEvalScore` returns `null` (object, not number, no `.score`) and the eval pill never renders. The client type is a fiction that doesn't match the wire contract.

**Fix:** Align the client type with the real shape and pick a representative metric, e.g.:

```ts
function normalizeEvalScore(e: RunHistoryEntry['evalScore']): number | null {
  if (e == null) return null;
  if (typeof e === 'number') return e;
  if (typeof e.within20km === 'number' && typeof e.total === 'number' && e.total > 0)
    return e.within20km / e.total;
  return null;
}
```

### WR-06: `recordHeadroom` / `recordErrorBucket` mutate the live singleton struct in place before `updateProgress`

**File:** `server/lib/freeClaudeRouter.ts:659-675, 677-690`
**Issue:** `recordHeadroom` does `const current = llmProgress.rateLimit ?? {...}; current.nvidia_nim = {...}; updateProgress({ rateLimit: current })`. When `llmProgress.rateLimit` already exists, `current` IS the singleton's object (same reference), so the `current.nvidia_nim = ...` assignment mutates `llmProgress.rateLimit` directly _before_ `updateProgress` runs. `recordLatency` and `recordErrorBucket` (`:685`) correctly build a fresh `{ ...current, [provider]: ... }` object; `recordHeadroom` does not (it mutates `current.nvidia_nim`/`current.openrouter` directly). This is inconsistent and means a reader that snapshotted `rateLimit` by reference (e.g. `buildSummary` → Redis serialize) could observe a torn intermediate. Under single-threaded JS the practical blast radius is small, but it violates the "all writes go through `updateProgress` immutably" invariant the surrounding comment (`:624-626`) claims to uphold.

**Fix:** Build a new object like the sibling helpers:

```ts
const next =
  provider === 'nvidia_nim'
    ? { ...current, nvidia_nim: { ...current.nvidia_nim, used: h.used, cap: h.cap } }
    : { ...current, openrouter: { ...current.openrouter, used: 0 } };
updateProgress({ rateLimit: next });
```

### WR-07: `appendCallHistory` LPUSH+LTRIM+EXPIRE is non-atomic under concurrency=12

**File:** `server/lib/llmCallHistory.ts:49-57`
**Issue:** `appendCallHistory` issues three separate awaited Redis calls (`lpush`, then `ltrim`, then `expire`). The v3 extractor runs batches at `LLM_V3_CONCURRENCY` (default 12) via `Promise.all`, and each batch's `callLLM` fires a `void appendCallHistory(...)` dual-write. Interleaving is therefore expected: two concurrent appends can both `lpush` before either `ltrim`s, transiently exceeding the 500 cap (self-corrected by the next `ltrim`), and an `expire` can land between another append's `lpush` and `ltrim`. The cap is eventually enforced and TTL is refreshed, so this is benign for correctness of the 500-cap ring — but it is a latent inconsistency the module's "native bounded ring" comment understates. The sibling `llmDLQ`/cost-shadow writers have the same shape, so this matches house style; flagging so it is a conscious accept, not an oversight. Consider a `multi()` pipeline (as `incrDailyTokens` uses) to make the three ops atomic.

**Fix (optional hardening):**

```ts
await redis
  .multi()
  .lpush(CALLS_KEY, JSON.stringify(entry))
  .ltrim(CALLS_KEY, 0, CALLS_MAX - 1)
  .expire(CALLS_KEY, CALLS_TTL_SEC)
  .exec();
```

## Info

### IN-01: `shouldPauseNewEvents` / `prioritizeBySeverity` still gate on retired `cerebras`/`groq` counters

**File:** `server/lib/llmTokenBudget.ts:167-175`
**Issue:** `shouldPauseNewEvents()` reads `getDailyTokens('cerebras')` and `getDailyTokens('groq')` — both retired from the runtime path (ADR-0010). The v3 cascade never increments these, so both resolve to 0 and the soft-cap gate is permanently no-op. The pipeline calls this gate (`llmExtractionPipeline.ts:410`) and the `budget_hit` run-outcome branch (`:413`) can therefore never fire in production. This is documented as a known interim state in the source comments, but it means the new `budget_hit` FlightRecorder outcome is unreachable. Worth a tracking note so the FlightRecorder's budget band isn't assumed live.
**Fix:** When per-provider v3 token counters are plumbed, point `shouldPauseNewEvents` at `nvidia_nim` (the active provider) so the soft-cap branch can actually trigger.

### IN-02: `tokenBudget` block reads the dormant `nvidia_nim` daily counter that is never written

**File:** `server/routes/operator-status.ts:542`, `server/lib/llmTokenBudget.ts:45`
**Issue:** `getDailyTokens('nvidia_nim')` reads `llm:tokens:nvidia_nim:{date}`, but the v3 path never calls `incrDailyTokens` (Pitfall 2, acknowledged in the source comment). So the BudgetBlock's `used` is always 0 and the proximity bar is permanently empty/green regardless of real consumption. The honest operator signal is `costShadow.usd`, which is wired. This is intentional and documented, but the "used/cap" bar is decorative until a provider writes the counter — an operator could misread "0/1000000 ok" as "no usage" when really NIM ran all night. Consider labeling the bar as "metered counter (dormant)" or hiding it until `used > 0`.

### IN-03: `hydrateRunHistoryIfCold` does an LRANGE whose result is discarded

**File:** `server/lib/llmRunHistory.ts:118-122`
**Issue:** `hydrateRunHistoryIfCold` calls `listRunHistory(RUNS_MAX)` purely to flip the hydrated flag and "prime nothing" (per its docstring) — there is no in-memory run singleton to populate. This is a real (bounded, ≤200-element) Redis round-trip on the first operator request whose result is thrown away. It is flag-guarded so it fires once per cold start, but it is wasted work. The `/llm-history` route already calls `listRunHistory(limit)` immediately after, so the hydrate LRANGE is fully redundant on that path.
**Fix:** Make `hydrateRunHistoryIfCold` a no-op flag-flip (no LRANGE) until there is an actual singleton to prime, or drop the call from `/llm-history` (the route fetches runs directly anyway).

### IN-04: `tokenSpend`/`evalScore`/`dlqDelta` snapshot is taken in `finally` after counters may have been reset

**File:** `server/lib/llmExtractionPipeline.ts:346-365, 554`
**Issue:** `buildRunHistoryEntry(runOutcome)` is evaluated inside the `finally` block, reading `llmProgress.totalBatches`, `completedBatches`, `costShadow`, etc. These are read at close time — correct as long as nothing resets the singleton between the terminal branch and the `finally`. Nothing does today (the next `resetProgress` only fires on the _next_ run's dispatch, guarded by `pipeline_busy`), so this is safe. Flagging only because the dependency on "no concurrent reset" is implicit; a future change that resets progress on error could silently zero the snapshot. A defensive snapshot of the needed scalars before the `try` would make it robust.

### IN-05: `FlightRecorderBlock` has no stale-response guard on its own 30s poll

**File:** `src/components/ui/FlightRecorderBlock.tsx:154-177`
**Issue:** `fetchHistory` is a fire-and-forget `setInterval` that calls `setData(json)` whenever a response resolves. If a slow request and a fast request overlap (possible on a 30s cadence with a slow Redis), an older response can land after a newer one and clobber fresher data. Low practical risk (responses are typically sub-second and the cadence is 30s), and the block is read-only/dev-tier, so impact is cosmetic flicker at worst. The drill-down state (`selectedRunId`/`selectedCall`) is held separately and survives a data refresh, so no functional break. Noting for completeness against the "stale-response guarding" review criterion.
**Fix (optional):** Track a request generation counter or an `AbortController` and ignore out-of-order resolutions.

### IN-06: `selectedCall` can render stale detail when the underlying run/call list refreshes

**File:** `src/components/ui/FlightRecorderBlock.tsx:151-152, 298, 351-353`
**Issue:** `selectedCall` stores a _copy_ of a `CallHistoryEntry` object captured at click time. If a poll refresh replaces `data`, the open `CallDetailModal` continues to show the captured snapshot, which may no longer match the (possibly evicted past the 500-cap) ring entry. Since call entries are immutable telemetry rows this is acceptable — the operator sees the row as it was when they opened it — but if the ring evicted that entry, the modal shows data no longer queryable. Cosmetic only; documented here so it is an explicit accept rather than an oversight.

---

_Reviewed: 2026-06-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
