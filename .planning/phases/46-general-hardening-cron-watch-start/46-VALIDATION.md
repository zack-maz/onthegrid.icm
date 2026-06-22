---
phase: 46
slug: general-hardening-cron-watch-start
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-22
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property                | Value                                        |
| ----------------------- | -------------------------------------------- |
| **Framework**           | Vitest (jsdom for frontend, node for server) |
| **Config file**         | `vite.config.ts` (test.alias map-mocks)      |
| **Quick run command**   | `npx vitest run <changed test file>`         |
| **Full suite command**  | `npx vitest run`                             |
| **Server-only command** | `npx vitest run server/`                     |
| **Estimated runtime**   | ~60–120 seconds (full); seconds (targeted)   |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file(s)>`
- **After every plan wave:** Run `npx vitest run server/` (server-heavy phase) + any touched `src/` suites
- **Before `/gsd-verify-work`:** Full `npx vitest run` must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Populated by the planner. Each task that adds/changes behavior MUST carry an `<automated>` verify command or a Wave 0 dependency. Degrade-open fault-injection tasks (HARD-03) verify via mocked-Redis-throw asserting no-throw / safe default.

| Task ID         | Plan | Wave | Requirement                      | Threat Ref | Secure Behavior | Test Type | Automated Command  | File Exists | Status     |
| --------------- | ---- | ---- | -------------------------------- | ---------- | --------------- | --------- | ------------------ | ----------- | ---------- |
| (planner fills) | —    | —    | HARD-01/02/CRON-WATCH-01/HARD-03 | —          | —               | unit      | `npx vitest run …` | —           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

> See RESEARCH.md §"Validation Architecture". Most degrade-open contracts for the Phase 39/40 surfaces are ALREADY covered (`llmCallHistory.test.ts`, `llmRunHistory.test.ts`, `llmTokenBudget.test.ts`, `BudgetBlock.test.tsx`). The genuine coverage gaps the planner must close:

- [ ] Rate-limiter 429-sidecar INCR degrade-open test (Redis-throw never converts 429→500) — new
- [ ] 999.1 Bearer-bypass coverage across all operator poll endpoints — extend `server/__tests__/rateLimitPublic.test.ts`
- [ ] Cron `missed`-state derivation test (schedule+grace) — new, against `server/lib/healthSources.ts` + `server/routes/health.ts`
- [ ] CRON-WATCH ring + WATCH-artifact capture test — new
- [ ] HARD-03 narrow gaps: call-history hydration-throw no-op, `tabMerge` sidecar-absent rendering, `trendHistory` throw (verify/backfill)

_Existing infrastructure (Vitest + map-mocks) covers all phase requirements — no framework install needed._

---

## Manual-Only Verifications

| Behavior                                           | Requirement   | Why Manual                                                 | Test Instructions                                                                                                               |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 7-day watch produces 7 daily auto-captured entries | CRON-WATCH-01 | Spans real wall-clock days; non-blocking async observation | Inspect the watch ring / WATCH artifact daily over 7 days; confirm non-gating; record early-close (if any) citing v1.5 Phase 31 |

_All other phase behaviors have automated verification._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
