---
slug: llmstatus-unknown-prod
status: root_cause_found
trigger: "llmStatus is still UNKNOWn — llmPipeline isn't engaging or working"
created: 2026-05-07T23:10:00Z
updated: 2026-05-07T23:55:00Z
---

## Symptoms

<!-- DATA_START -->

- **Surface:** DevApiStatus dashboard (API Health tab → "Events (LLM)" row)
- **Environment:** Prod (`otg-iran-monitor.vercel.app`)
- **State:** llmStatus shows UNKNOWN
- **Description (operator-supplied, treat as data):** "llmPipeline isn't engaging or working"
- **Cron status:** unknown — operator unsure whether `/api/cron/refresh-events` has run since 28.2.6 work landed
- **Timeline:** Pre-existing AND still present after Phase 28.2.6 — the architectural fix (safeWaitUntil + incremental-flush) was meant to address budget overruns, but UNKNOWN was the state BEFORE 28.2.6 too
<!-- DATA_END -->

## Phase 28.2.6 context (just-completed work, may or may not be relevant)

- Phase 28.2.6 just merged 2 plans on branch `feature/28.2.6-cron-architecture-fix`. NOT YET merged to `main` — Vercel prod is built from `main`.
- Plan 01: incremental terminal-key write every N=10 batches (mergeAndPersistLlmEntities helper)
- Plan 02: `safeWaitUntil` shim wrapping the IIFE so function survives past `res.end()` on Vercel + `vercel.json maxDuration: 300`
- These fixes address the "events:llm:v3 doesn't populate within 300s budget" problem from 28.2.5 closeout.
- BUT user reports pipeline ISN'T ENGAGING — distinct from "engages then runs out of budget". So 28.2.6 may be a necessary-but-not-sufficient fix.

## Surface architecture (from CLAUDE.md, treat as authoritative for prod state)

- DevApiStatus "Events (LLM)" row reads `aggregateHealth.endpoints.llmEvents.status` from `/api/health` JSON (Phase 28.2.5 split — was a single Events row before).
- `/api/health` derives status from cache freshness probe of `events:llm:v3` Redis key:
  - Threshold = 26h (matches cron triad cadence)
  - Tier = `critical`
  - "unknown" status returned when probe cannot determine freshness (key missing, Redis error, parse fail, etc.)
- Cron schedule: `/api/cron/refresh-events` daily 0 4 \* \* \* UTC (Vercel Hobby plan, 3-cron cap)
- Force-trigger: `GET /api/cron/refresh-events?force=true` (Bearer required) — bypasses 15-min cooldown
- Cold-cache self-heal: probes `events:llm:v3` BEFORE cooldown check; if empty, bypasses cooldown automatically

## Pre-investigation hypothesis space

H1: **28.2.6 not deployed.** PR not merged → main + Vercel still running pre-28.2.6 code → IIFE killed by `res.end()` before completing batches → cache never populates. Highest prior given user said "pre-existing AND still present" and we just finished 28.2.6 today.

H2: **Cron has never run successfully against prod with valid LLM config.** Even pre-28.2.6, if cron started but `isLLMConfigured()` returned false (missing NVIDIA_NIM_API_KEY env var on Vercel project), pipeline aborts immediately and writes nothing to v3.

H3: **NIM throttle window perma-tripping breaker.** Phase 27.4.6 documents "accept-and-fallback" for NIM 24h throttle — if breaker keeps tripping, every cron run DLQs everything → v3 never populates.

H4: **Healthy aggregate misreporting.** `events:llm:v3` IS being populated but `/api/health` or the freshness probe is reading the wrong key / wrong shape / wrong threshold → row shows UNKNOWN despite working pipeline.

H5: **Bearer / auth issue at the dashboard layer.** Operator without Bearer sees UNKNOWN because `/api/health` short-circuits or DevApiStatus can't fetch. (Less likely if other rows in the same tab are GREEN.)

## Current Focus

hypothesis: H1 confirmed (28.2.6 unmerged → prod runs pre-fix code → fire-and-forget IIFE killed by Vercel Fluid Compute at res.end + terminal-key write only happens after full ~10-min extraction completes, which can't fit in the 300s Hobby ceiling either way)
test: Confirmed via git + bundled prod entry inspection.
expecting: Already confirmed.
next_action: Merge 28.2.6 → main, redeploy, force-trigger cron, verify cache populates.
reasoning_checkpoint: H1 confirmed by code-state inspection alone — no operator action required to disambiguate. H4/H5 ruled out at the route layer. H2 disproven (Phase 28.2.5 hot-fix `5f47648` already widened `isLLMConfigured()`). H3 still possible but secondary — if NIM is throttled at the moment of cron firing, the post-merge cron run would surface that as DLQ counts climbing, not as cache silently empty.

## Evidence

- timestamp: 2026-05-07T23:30:00Z
  what: `git log --oneline main..HEAD` shows 24 commits unmerged on `feature/28.2.6-cron-architecture-fix`
  where: cwd = /Users/zackmaz/Desktop/my_world
  meaning: Confirms H1 architectural premise — 28.2.6 work is not on `main`. Vercel prod (otg-iran-monitor.vercel.app) is built from `main`, so the fix is not deployed.

- timestamp: 2026-05-07T23:32:00Z
  what: `gh pr list --state all` returns no PR for `feature/28.2.6-cron-architecture-fix`
  where: GitHub repo zack-maz/onthegrid.icm
  meaning: Branch exists locally + on remote but no PR opened yet. Even if a PR were opened, it would still need merge + deploy to land on prod.

- timestamp: 2026-05-07T23:35:00Z
  what: `git show main:api/vercel-entry.js | grep "void async"` — bundled prod entry contains `void (async () => {...})()` IIFE pattern at the runRefreshExtraction implementation (around line 82975 of bundled output). NO `safeWaitUntil` reference, NO `@vercel/functions` import.
  where: api/vercel-entry.js on main, server/lib/llmExtractionPipeline.ts:226 (current file)
  meaning: Prod is running the documented-broken pattern. From .planning/phases/28.2.5-api-green-gate/deferred-items.md L24-46: "Vercel's Fluid Compute kills the function instance once the HTTP response is sent." Plan 05 of 28.2.5 explicitly diagnosed this and deferred to 28.2.6 (which is the unmerged branch).

- timestamp: 2026-05-07T23:38:00Z
  what: `git show main:vercel.json` has NO `functions["api/vercel-entry.js"].maxDuration` field. Current branch vercel.json has `"maxDuration": 300`.
  where: vercel.json on main vs HEAD
  meaning: Even if the IIFE survived `res.end()`, prod's Fluid Compute defaults the function to whatever Hobby's default is (~10s for sync, longer for async — unspecified-but-short). The maxDuration: 300 on the feature branch is required for the 28.2.6 incremental-flush strategy to have time to do at least 1 flush before being killed.

- timestamp: 2026-05-07T23:40:00Z
  what: `server/adapters/llm-provider.ts:279-286` `isLLMConfigured()` returns true if ANY of CEREBRAS_API_KEY / GROQ_API_KEY / NVIDIA_NIM_API_KEY / OPENROUTER_API_KEY is set. This widening landed in commit `5f47648` (Phase 28.2.5 hot-fix).
  where: server/adapters/llm-provider.ts:279-286
  meaning: H2 weakened — even if only NIM + OpenRouter are set on the Vercel project (not Cerebras/Groq), `runRefreshExtraction` no longer aborts on the `llm_unconfigured` gate. Provided at least one provider key is set on prod's Vercel env (the 28.2.5 PR description and prior reasoning establish NIM + OpenRouter ARE both set on prod), this gate passes. H2 essentially eliminated assuming the operator hasn't blanked all 4 keys.

- timestamp: 2026-05-07T23:42:00Z
  what: `server/routes/health.ts:91-119` `probeCacheKey` + `server/lib/healthSources.ts:128-138` `deriveStatus` — when `events:llm:v3` is empty, `cacheGetSafe` returns null → `probe.freshnessMs = null` → `deriveStatus` returns `'unknown'` (lines 134: `if (freshnessMs === null) return 'unknown'`).
  where: server/routes/health.ts + server/lib/healthSources.ts
  meaning: H4 eliminated. The `unknown` status the operator sees is the CORRECT signal for a cold cache, not a misreading of a populated key. The cache is genuinely empty.

- timestamp: 2026-05-07T23:45:00Z
  what: deferred-items.md L23-50 from Phase 28.2.5 closeout explicitly documents this exact failure mode: "the route returned `dispatched: true` in ~400ms, but the actual extraction body never executed — `/api/events/llm-status` polled across 5 instances showed `stage: idle`, `callHistory: 0`, `dlqCount: 0`. Phase 27.4.6 designed `runRefreshExtraction` as a fire-and-forget IIFE (`void (async () => {...})()`) that runs after the response returns, but Vercel's Fluid Compute kills the function instance once the HTTP response is sent."
  where: .planning/phases/28.2.5-api-green-gate/deferred-items.md
  meaning: H1 root cause is pre-documented and the recommended fix is exactly what the 28.2.6 unmerged branch implements (option (a) incremental terminal write + option (c) waitUntil migration). Operator has not yet merged + deployed this work.

## Eliminated

- **H4 (healthy aggregate misreporting)** — `deriveStatus` correctly returns `'unknown'` when freshness is null; this is the contract, not a bug. The cache is genuinely empty.
- **H2 (isLLMConfigured returns false)** — Phase 28.2.5 hot-fix `5f47648` widened the check to all 4 provider envs. Assuming any of CEREBRAS/GROQ/NIM/OPENROUTER is set on prod (the 28.2.5 PR established NIM + OpenRouter ARE both set), this gate passes.
- **H5 (Bearer / auth issue)** — `/api/health` is unauthenticated (Phase 28.2 W6 D-29 audit-status path is the unauthed read-only sidecar; `/api/health` itself has no Bearer gate per `server/routes/health.ts`). DevApiStatus does include `dashboardAuthHeaders()` on its fetch but the route itself doesn't gate. Other tier rows being GREEN on the same dashboard would be impossible if this were the cause.

## Possibly secondary (not the root cause but may compound after fix)

- **H3 (NIM throttle perma-tripping)** — possible but DEPENDENT ON H1 being fixed first. Once 28.2.6 ships and the cron actually runs to completion on prod, if `events:llm:v3` STILL stays empty AND `llmProgress.dlqCount` climbs, H3 lights up. Right now we cannot distinguish "cron never ran" from "cron ran and was throttled" because the IIFE was killed before producing any telemetry on either path.

## Resolution

### Root cause

**Phase 28.2.6 (the architectural fix for this exact symptom) is unmerged to main.** Vercel prod is built from main and runs the pre-fix code. Two compounding architectural defects on main:

1. **`void (async () => {...})()` IIFE** at `server/lib/llmExtractionPipeline.ts:226` (bundled at api/vercel-entry.js:~82975 on main). Vercel Fluid Compute kills the function instance at `res.end()`, so the extraction body never runs. The cron route returns 200 with `{dispatched: true}` in ~400ms, but no LLM call ever happens.
2. **Single terminal-key write at end of ~10-minute pipeline.** Even if the IIFE were rescued via `waitUntil`, the Hobby plan's 300s `maxDuration` ceiling would kill the function before the single end-of-pipeline write to `events:llm:v3` could fire. Phase 28.2.6 Plan 01 adds incremental flushes every N=10 batches.

The unmerged branch `feature/28.2.6-cron-architecture-fix` (24 commits ahead of main) addresses both:

- Plan 02 (commit `4a7104b` + dep `07cff78`): wires `safeWaitUntil` shim around the IIFE in `runRefreshExtraction`. Adds `@vercel/functions` dep. Sets `vercel.json functions["api/vercel-entry.js"].maxDuration: 300` (commit `ea9e19e`).
- Plan 01 (commits `9f5441c` + `72e3da5`): extracts `mergeAndPersistLlmEntities` helper, calls it from `onBatchComplete` every `LLM_FLUSH_EVERY_N_BATCHES` (default 10) so partial extraction within the 300s ceiling still populates the gate-relevant `events:llm:v3` key.

### Fix (in-codebase, deploy gate)

**The fix is already written and committed locally.** This is purely a deployment gate, not a code bug to fix. Operator runbook:

1. **Open + merge PR** for `feature/28.2.6-cron-architecture-fix` → `main`:

   ```bash
   gh pr create --base main --head feature/28.2.6-cron-architecture-fix \
     --title "Phase 28.2.6: Cron architecture fix (waitUntil + incremental terminal-key writes)" \
     --body "Closes the 28.2.5 deferred-items.md item: events:llm:v3 stays cold on prod because (a) IIFE is killed at res.end() under Vercel Fluid Compute and (b) terminal-key write only happens once at the end of a ~10-min extraction that doesn't fit in the 300s Hobby ceiling. Plan 01 adds incremental flushes every N=10 batches; Plan 02 wires safeWaitUntil so the function instance survives res.end()."
   gh pr merge <PR_NUMBER> --squash  # or --merge per project convention
   ```

2. **Verify Vercel auto-deploy from main.** Default Vercel GitHub integration redeploys main on push.

3. **Confirm prod has NVIDIA_NIM_API_KEY set** (pre-flight, required for any extraction to fire):

   ```bash
   vercel env ls --scope <project-scope> | grep -i nvidia
   # Or visually via https://vercel.com/<team>/onthegrid-icm/settings/environment-variables
   ```

   If missing — set it via `vercel env add NVIDIA_NIM_API_KEY production` then re-deploy.

4. **Force-trigger the cron once main is deployed:**

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true"
   ```

   Expect `{ok: true, durationMs: <small>, dispatched: true, schemaVersion: "v3", coldCacheBypass: true}`.

5. **Verify within 5 minutes** (incremental flushes start firing after batch 10):

   ```bash
   curl -H "Authorization: Bearer $DASHBOARD_PASSWORD" \
     "https://otg-iran-monitor.vercel.app/api/health" | jq '.endpoints.llmEvents'
   ```

   Expect `status: "healthy"` (or at minimum non-`unknown`) once `events:llm:v3` has its first incremental write.

6. **Trigger `prod-connectivity-audit.yml`** GitHub Action to re-run the tier-green gate. Expect `allTiersGreen: true` after step 5 completes.

### Diagnostic backup paths if cache STILL stays empty after merge

If after step 5 `events:llm:v3` is still cold, hypotheses re-rank:

- **H3 (NIM throttle):** `curl /api/events/llm-status` → check `dlqCount` and `callHistory[]` — climbing DLQ + amber `⊘` skip-entries means NIM circuit breaker is engaged. Wait 24h or switch to OpenRouter via env override. Operator runbook in CLAUDE.md "Cron-Driven Pipeline Trigger (Phase 27.4.6)" section under "NIM-throttle accept-and-fallback (D-08)".
- **Provider keys not set on Vercel project despite expectation:** check `/api/sources` for which providers report configured.
- **Token soft-cap engaged:** `/api/events/llm-status` shows `paused` flag → daily 0.8 budget hit. Reset on day rollover.

### Specialist hint

typescript

### Why no further investigation needed

H1 is verified by code-state inspection alone — git diff main..HEAD shows the unmerged fix; bundled main entry contains the broken IIFE pattern; deferred-items.md from 28.2.5 closeout pre-documented the exact failure mode and named 28.2.6 as the resolution. All other hypotheses ruled out or ruled secondary at the code layer. No operator-side disambiguation needed before applying the fix.
