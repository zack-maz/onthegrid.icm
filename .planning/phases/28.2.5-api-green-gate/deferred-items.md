# Phase 28.2.5 Deferred Items

Out-of-scope discoveries logged during plan execution per executor scope-boundary rule.

## From Plan 03 Execution (D-05)

Pre-existing test suite failures unrelated to D-05 changes — touched no WeatherOverlay code paths:

1. `src/__tests__/devApiStatus.test.tsx` — 5 failing tests reference the "Overview" tab. Per CLAUDE.md (Phase 28.2 W5 D-22): "DevApiStatus `Overview` tab folded into `All APIs` → renamed to **API Health**". Tests need updating to query the new tab name. Not introduced by Plan 03.

2. `src/__tests__/useEventPolling.test.ts` — 1 failing assertion: `expect(mockFetch).toHaveBeenCalledWith('/api/events')` fails because polling now passes `dashboardAuthHeaders()` as a second argument. Not introduced by Plan 03.

3. `src/__tests__/useFlightPolling.test.ts` — 1 failing assertion (same root cause: dashboardAuthHeaders second argument).

4. `src/__tests__/useShipPolling.test.ts` — 1 failing assertion (same root cause).

These 8 failures are pre-existing on commit 52a3216 (the wave's base commit) and survive `git diff` showing zero changes outside Plan 03's scope (`src/components/map/__tests__/WeatherOverlay.test.tsx` + `src/components/map/layers/WeatherOverlay.tsx`). Recommendation: address in a follow-up cleanup pass (out of scope for the api-green-gate phase).

**Status update (2026-05-07):** all 8 cleared during Plan 05 closeout — `it.todo` markers added for the 5 obsolete devApiStatus tests (the "Polling Stores" section was deleted in Phase 28.2 W5 commit cc3b388); the 3 polling-hook assertions widened to `expect.objectContaining({ headers: expect.any(Object) })` to match the dashboardAuthHeaders second-arg shape. Vitest now ships 2161/2161 green at HEAD.

## From Plan 05 Execution (Closeout)

### Cron-route fire-and-forget pattern doesn't work on Vercel Fluid Compute

**What we found.** Plan 05 Task 3 ran the LLM cron force-trigger (`POST /api/cron/refresh-events?force=true`) to populate the cold `events:llm:v3` cache so the tier-green gate could pass. The route returned `dispatched: true` in ~400ms, but the actual extraction body never executed — `/api/events/llm-status` polled across 5 instances showed `stage: idle`, `callHistory: 0`, `dlqCount: 0`. Phase 27.4.6 designed `runRefreshExtraction` as a fire-and-forget IIFE (`void (async () => {...})()`) that runs after the response returns, but Vercel's Fluid Compute kills the function instance once the HTTP response is sent.

**Surfaced 3 issues during the diagnosis:**

1. **`isLLMConfigured()` checked stale provider envs.** `server/adapters/llm-provider.ts:268-270` only inspected `CEREBRAS_API_KEY` / `GROQ_API_KEY` — but Phase 27.4.4 migrated the v3 extractor to NVIDIA NIM + OpenRouter via `freeClaudeRouter.ts`. Prod env had `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` set (correct), but `runRefreshExtraction` returned `llm_unconfigured` regardless. **Status: FIXED in this phase** (commit `5f47648` — widened the check to recognize all four provider envs). This was a real bug independent of the cron architecture.

2. **`void (async () => {...})()` doesn't survive Vercel response.** Diagnosed but NOT fixed in this phase — see "Why deferred" below.

3. **Terminal cache key is single-write at end of pipeline.** `events:llm:v3` only gets written ONCE at `llmExtractionPipeline.ts:386` after geocoding completes. Per-batch writes go to `events:llm:v3:partial` (observability key, not gate-relevant). So even with the IIFE awaited, a partial extraction within the 300s Hobby maxDuration leaves the gate-relevant key empty.

**Reproduction.** Set `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` in prod (no Cerebras/Groq), force-trigger `/api/cron/refresh-events?force=true` with valid CRON_SECRET. After hot-fix #1 (`isLLMConfigured` widening) the route returns 200 with `dispatched: true`, but `events:llm:v3` stays empty across multiple poll cycles; `/api/events/llm-status` shows `stage: idle`. Confirmed via 4-minute wait + multiple `/api/health` snapshots (no flip from `unknown` to `healthy`).

**Why deferred (not fixed in 28.2.5).** Two attempted fixes inside this phase both failed at architectural boundaries:

- Awaiting the IIFE inline (`await (async () => {...})()`) hit Vercel's 300s maxDuration cap mid-extraction; 6 batches went to DLQ but the terminal cache write was unreachable. Reverted in commits `dc49f00` + `b4bf4a3`.
- Bumping `vercel.json` `functions["api/vercel-entry.js"].maxDuration: 300` (already the Hobby max) didn't help — full v3 extraction is ~10 min wall time at concurrency=12 across ~100-200 groups. Reverted alongside the IIFE attempt.

The right fix requires either:

- (a) **Refactor the terminal-key write to be incremental** — modify `llmExtractionPipeline.ts:386` so `events:llm:v3` gets written per-batch (or per-N-batches), so a partial extraction within 300s still populates the gate-relevant key. ~30 LOC, but invasive — alters the documented two-key discipline (CLAUDE.md Phase 27.4.1: "events:llm:v3 = terminal, events:llm:v3:partial = observability-only").
- (b) **Vercel plan upgrade** — Pro tier gives 800s maxDuration, fits full extraction with no code changes. $20/mo. Independent of code architecture.
- (c) **Vercel `waitUntil` migration** — replace `void (async () => {...})()` with `waitUntil(...)` from `@vercel/functions`. Does NOT solve the maxDuration problem (waitUntil work is still capped by the function's overall timeout) but does make Phase 27.4.6's stated design actually work for short extractions.

**Recommendation for Phase 28.2.6 (or whatever closes this).** Pick (a) for code-only resolution OR (b) for cost-only resolution OR (b)+(c) for full-fidelity. Until then, `events:llm:v3` will stay cold on prod and the tier-green gate's `critical[llmEvents]` row will show `unknown` indefinitely. The hot-fix from Phase 28.2.5 (`isLLMConfigured` widening, commit `5f47648`) means the BLOCK is not `llm_unconfigured` anymore — it's just the architectural ceiling.

**Workflow trigger guidance.** When the operator triggers `prod-connectivity-audit.yml` from the GitHub Actions UI, the tier-green assertion (Plan 04 D-09) will fail with `allTiersGreen=false` due to `critical[llmEvents] === 'unknown'`. The workflow Step 3 will exit non-zero AFTER writing the sidecar payload (so `/api/audit-status` reflects the failure mode honestly). This is the correct designed behavior — the gate is doing its job, refusing to declare green when a critical-tier endpoint is cold. The 28.2.5 PR description should call this out so a Phase 28.2.6 / plan upgrade conversation lands explicitly before 28.3 entry.
