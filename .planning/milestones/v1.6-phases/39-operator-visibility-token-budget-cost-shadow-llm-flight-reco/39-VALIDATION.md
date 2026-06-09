---
phase: 39
slug: operator-visibility-token-budget-cost-shadow-llm-flight-reco
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-04
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `39-RESEARCH.md` §Validation Architecture. Per-task IDs are bound by the planner; rows below are requirement-level until plans assign task IDs.

---

## Test Infrastructure

| Property                      | Value                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Framework**                 | Vitest (jsdom for `src/`, node for `server/`)                                                              |
| **Config file**               | `vite.config.ts` `test` block (no standalone `vitest.config.*`)                                            |
| **Quick run command**         | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` (single new test file for the strand touched) |
| **Full suite command**        | `npx vitest run` (all) · `npx vitest run server/` (server only)                                            |
| **Server test env directive** | `// @vitest-environment node` at file top for `server/` tests                                              |
| **Estimated runtime**         | ~quick: <5s single file · full server: tens of seconds                                                     |

---

## Sampling Rate

- **After every task commit:** Run the single new test file for the strand touched (e.g. `npx vitest run server/lib/__tests__/llmRunHistory.test.ts`).
- **After every plan wave:** Run `npx vitest run server/` (server strand) then `npx vitest run` (full), including the registry drift gate.
- **Before `/gsd-verify-work`:** Full `npx vitest run` green AND `src/__tests__/lib/redis-registry.test.ts` green.
- **Max feedback latency:** ~5 seconds (single-file quick run).

---

## Per-Task Verification Map

> Requirement-level until the planner assigns task IDs. Each plan task that lands one of these requirements inherits the matching command + secure behavior.

| Requirement           | Behavior                                                                                                        | Threat Ref         | Secure Behavior                                                                     | Test Type        | Automated Command                                                                 | File Exists        | Status     |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------- | ------------------ | ---------- |
| BUDGET-03             | `tokenBudget` present; degrade-open `null` on Redis throw; route stays 200                                      | T-39 (Bearer gate) | Aggregator never 500s on Redis fail; no token data leaks to unauthenticated callers | unit (route)     | `npx vitest run server/routes/__tests__/operator-status.test.ts`                  | ✅ extend existing | ⬜ pending |
| BUDGET-04             | `tokenBudget` shape pinned via Zod `.strict()` (rejects extra keys)                                             | —                  | Contract regression fails build                                                     | contract         | `npx vitest run server/routes/__tests__/operator-status.test.ts`                  | ✅ extend          | ⬜ pending |
| BUDGET-01 / BUDGET-02 | BudgetBlock renders used/cap/state + cost today; hides when `tokenBudget === null`                              | —                  | No render when unauthenticated/degraded                                             | unit (component) | `npx vitest run src/components/ui/__tests__/BudgetBlock.test.tsx`                 | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-01         | `llm:calls:history` LPUSH+LTRIM 500/30d; entries carry `runId`+`batchIndex`; `parseEntry` handles string+object | —                  | Bounded set (no unbounded growth)                                                   | unit             | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts`                      | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-02         | run record opens `running` at start, closes terminal; re-LPUSH + dedupe-by-`runId` reader                       | —                  | Crashed run leaves an honest `running` trace                                        | unit             | `npx vitest run server/lib/__tests__/llmRunHistory.test.ts`                       | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-03         | `GET /api/events/llm-history` Bearer-gated (401 no Bearer, 200 with); `{runs,calls}`; `?runId`/`?limit` filter  | T-39 (Bearer gate) | 401 without valid Bearer; no history to anonymous                                   | unit (route)     | `npx vitest run server/routes/__tests__/llm-history.test.ts`                      | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-05         | every call in a run carries the run's `runId` (back-correlation)                                                | —                  | N/A                                                                                 | unit             | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` + integration assert | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-06         | cold-start hydration: empty singleton + populated Redis → first request hydrates; flag prevents re-LRANGE       | —                  | N/A                                                                                 | unit             | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts` (hydrate case)       | ❌ Wave 0          | ⬜ pending |
| OBS-FLIGHT-04         | FlightRecorderBlock run-list → expand → call → prompt; degrade-open hides on non-200                            | —                  | No render when unauthenticated/degraded                                             | UAT (manual)     | 27.4.5 verification checklist (below)                                             | manual             | ⬜ pending |
| (drift gate)          | both new keys documented in CLAUDE.md + redis-keys.md + referenced in code                                      | —                  | N/A                                                                                 | registry         | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                         | ✅ existing gate   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `server/lib/__tests__/llmCallHistory.test.ts` — stubs for OBS-FLIGHT-01, -05, -06 (LPUSH+LTRIM cap, runId carry, parseEntry string-or-object, cold-start hydrate)
- [ ] `server/lib/__tests__/llmRunHistory.test.ts` — stubs for OBS-FLIGHT-02 (open `running` → close terminal, re-LPUSH dedupe-by-runId)
- [ ] `server/routes/__tests__/llm-history.test.ts` — stubs for OBS-FLIGHT-03 (Bearer gate 401/200 + `?runId`/`?limit` filters)
- [ ] `src/components/ui/__tests__/BudgetBlock.test.tsx` — stubs for BUDGET-01/02 render + null-gate (optional if planner folds into manual UAT per GA-1 functional-baseline)
- [ ] Extend `server/routes/__tests__/operator-status.test.ts` — BUDGET-03/04 `tokenBudget` Zod `.strict()` pin
- [ ] CLAUDE.md + `docs/architecture/redis-keys.md` registration of `llm:calls:history` + `llm:runs:history` — **REQUIRED** for `redis-registry.test.ts` (hard gate, not optional)

---

## Manual-Only Verifications

| Behavior                        | Requirement         | Why Manual                                        | Test Instructions                                                                                                                                       |
| ------------------------------- | ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold-start partial run trace    | OBS-FLIGHT-06 / -02 | Requires real cold start / server restart mid-run | Restart server (or force cold start) mid-run → confirm a partial run shows in `/api/events/llm-history` with `outcome:'running'` (never-closed) on boot |
| Full run record + calls         | OBS-FLIGHT-01..03   | Requires a live cron extraction with Bearer       | Force `GET /api/cron/refresh-events?force=true` (Bearer) → confirm full run record + all calls present in `llm:runs:history` / `llm:calls:history`      |
| Run → calls → prompt drill-down | OBS-FLIGHT-04       | Visual interaction in DevApiStatus API Health tab | Click a run → see its calls filtered by `runId`; click a call → read prompt + response                                                                  |
| Call-count reconciliation       | OBS-FLIGHT-01       | Cross-run arithmetic against live data            | Compare `llm:calls:history` count to cumulative batch count across runs — should roughly match (modulo retries + skip entries)                          |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 new test files + 1 extension + redis registration)
- [ ] No watch-mode flags (all commands use `vitest run`)
- [ ] Feedback latency < 5s (single-file quick run)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner binds task IDs)

**Approval:** pending
