---
status: pending
captured: 2026-04-22T02:55:00Z
source: Phase 27.4 close-out session
category: observability
priority: medium
blocking: false
target_phase: 27.4.5
---

# Phase 27.4.5 — LLM Pipeline Full History Observability

Dedicated phase for building out nested run + call history for the LLM
enrichment pipeline, beyond the last-20-in-memory `callHistory` that
Phase 27.4 landed.

## Goal

Turn the LLM pipeline from "you can see the last 20 calls" into a
flight-recorder you can scrub. Operators / dev / QA should be able to
answer: "what happened on last night's 3am run?", "how has our eval
score trended over the last 30 runs?", "which groups keep DLQ'ing across
runs?".

## In-scope work

### 1. Redis-backed call history ring buffer

Replace in-memory `callHistory` (cap 20, lost on restart) with a Redis
list:

- Key: `llm:calls:history`
- Structure: Redis LPUSH'd JSON entries, LTRIM to cap 500 entries
- TTL: 30 days (or whatever aligns with v2 cache TTL)
- Entry shape: existing `callHistory` fields + `runId` + `batchIndex`
- Hydrate `llmProgress.callHistory` from Redis on boot (first /llm-status
  request after cold start)

### 2. Per-run summary records

New Redis structure for per-run metadata:

- Key: `llm:runs:history` — Redis list, LPUSH'd, LTRIM to 200 runs
- Entry per run includes:
  - `runId` (UUID generated at run start)
  - `startedAt`, `completedAt` ISO timestamps
  - `outcome`: `'completed' | 'watchdog_aborted' | 'breaker_paused' | 'budget_hit' | 'error'`
  - `batchCount`, `batchesCompleted`, `batchesFailed`
  - `tokenSpend`: `{ cerebras: N, groq: N }`
  - `evalScore`: same shape as existing `llmProgress.evalScore`
  - `dlqDelta`: how many entries pushed to DLQ during this run
  - `watchdogTimeouts`: how many batches aborted by Phase 27.4.1 watchdog
  - `duration`: ms
  - `pipelineVersion`: `'v1' | 'v2'`
- Persist at the end of each run (or on crash via `process.on('exit')` /
  SIGTERM handler if feasible)

### 3. `GET /api/events/llm-history` endpoint

Dev-gated (same NODE_ENV check as `/llm-status`):

- Returns `{ runs: [...], calls: [...] }`
- Optional query params: `?runId=X` filters calls to that run, `?limit=N`
- Full paginated history via cursor/offset if needed (probably not needed
  at 500-call cap)

### 4. DevApiStatus UI — nested history panel

New Events tab block (9th block, extending the 8 in Phase 27.4):

- **Run list** — newest first, with colored outcome badge, batch progress
  bar, token spend bar, eval score
- **Expand run** — shows all calls in that run with timing, provenance
  distribution, DLQ'd groups, watchdog-timed-out batches
- **Filter controls** — outcome filter, date-range filter, pipelineVersion
  toggle (v1 / v2 / both)
- **Drill-down** — click a call to see its prompt (copy button), full
  response, model, token counts, duration

### 5. Run ID threading

Every LLM call during a single `processEventGroups` invocation tags its
`callHistory` entry with the run's `runId`. UI can then correlate which
calls belonged to which run.

## Out-of-scope (explicit)

- **Redis budget tuning** → Phase 28. Per 2026-04-22 decision, we store
  liberally now; cost optimization is Phase 28's explicit concern.
- **Cross-run analytics / aggregations** (eval score trends, token spend
  sparklines). Interesting but belongs in a potential future dashboard
  phase once we have the raw data in Redis for a few weeks.
- **Alerting on run outcomes** — similarly dashboard-phase work.

## Dependencies

- Phase 27.4.1 should land first — the watchdog introduces the
  `watchdogTimeouts` field that per-run summaries want to track, and the
  shared `llmExtractorWatchdog` helper is where we'd inject the runId
  threading.

## Effort estimate

- Redis ring buffer + hydrate on boot: ~1h
- Per-run summary records: ~1h
- `/llm-history` endpoint: ~30 min
- UI nested panel: ~2h
- Integration + testing: ~1h

Total: ~4-5h phase.

## Verification

- Restart server mid-run — confirm partial run shows up in history with
  outcome=`error` or similar on boot
- Complete a run — confirm full run record + all calls are in Redis
- DevApiStatus Events tab: click run → see calls; click call → see prompt
- Compare call count in `llm:calls:history` to cumulative batch count
  across runs — should roughly match (modulo retries and skip-entries)
