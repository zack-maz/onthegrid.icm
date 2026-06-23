---
phase: 46
slug: general-hardening-cron-watch-start
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-22
validated: 2026-06-22
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

> Every behavior-changing task carries an `<automated>` verify command. All rows below run **green** (verified 2026-06-22 — 148 server tests + 22 frontend tests passed across the 12 referenced files). The single non-automatable behavior (7-day watch ring accumulation) is routed to Manual-Only below.

| Task ID | Plan  | Wave | Requirement   | Secure Behavior                                                                                  | Test Type   | Automated Command                                                                                       | File Exists | Status   |
| ------- | ----- | ---- | ------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| 46-01-1 | 46-01 | 0    | HARD-01       | `incr429` degrade-open — rejecting INCR mock stays 429, never 500                                | unit/inject | `npx vitest run server/middleware/__tests__/rateLimit.test.ts`                                          | ✅          | ✅ green |
| 46-01-2 | 46-01 | 1    | HARD-01       | `rateLimiter` block null (route still 200) when Redis read throws                                | unit/inject | `npx vitest run server/routes/__tests__/operator-status.test.ts`                                        | ✅          | ✅ green |
| 46-01-3 | 46-01 | 1    | HARD-01       | Bearer bypasses limiter for public + all 11 per-endpoint tiers                                   | unit        | `npx vitest run server/__tests__/rateLimitPublic.test.ts`                                               | ✅          | ✅ green |
| 46-02-1 | 46-02 | 0    | HARD-02       | `deriveCronRunState` unknown/missed/healthy over schedule+grace                                  | unit        | `npx vitest run server/__tests__/lib/healthSources.test.ts`                                             | ✅          | ✅ green |
| 46-02-2 | 46-02 | 1    | HARD-02       | `missedRun` sibling field; `healthStatusEnum` stays 4-state (pin)                                | unit        | `npx vitest run server/__tests__/lib/healthSchema.test.ts server/__tests__/routes/health.test.ts`       | ✅          | ✅ green |
| 46-03-1 | 46-03 | 0    | CRON-WATCH-01 | `cronWatch` ring degrade-open — exec-reject no-op, bounded LPUSH                                 | unit/inject | `npx vitest run server/lib/__tests__/cronWatch.test.ts`                                                 | ✅          | ✅ green |
| 46-03-2 | 46-03 | 1    | CRON-WATCH-01 | Throwing `appendWatchSample` never degrades health response (200)                                | unit/inject | `npx vitest run server/__tests__/routes/cron-health.test.ts`                                            | ✅          | ✅ green |
| 46-04-2 | 46-04 | 1    | HARD-01/02    | Limiter + cron-freshness blocks render; MISSED reads sibling field                               | component   | `npx vitest run src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx`                             | ✅          | ✅ green |
| 46-04-3 | 46-04 | 1    | HARD-03       | Sidecar-absent (undefined+null) render → muted placeholder, no crash; frozen tablist byte-stable | component   | `npx vitest run src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx`                             | ✅          | ✅ green |
| 46-05-1 | 46-05 | 1    | HARD-03       | Hydration-throw no-op + flag-stays-set (no LRANGE retry loop)                                    | unit/inject | `npx vitest run server/lib/__tests__/llmCallHistory.test.ts server/lib/__tests__/llmRunHistory.test.ts` | ✅          | ✅ green |
| 46-05-2 | 46-05 | 1    | HARD-03       | `trendHistory` degrade-open — exec-reject no-op, `[]` on lrange throw                            | unit/inject | `npx vitest run server/lib/__tests__/trendHistory.test.ts`                                              | ✅          | ✅ green |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

> Doc/structural-only tasks (no behavior change, no automated verify required): 46-03-3 (46-WATCH.md artifact + CLAUDE.md key registration), 46-04-1 (`OperatorStatus.rateLimiter` interface type — exercised by 46-04-2/3 component tests).

---

## Wave 0 Requirements

> All Wave 0 coverage gaps the draft enumerated are CLOSED. Existing infrastructure (Vitest + map-mocks) covered every requirement — no framework install was needed.

- [x] Rate-limiter 429-sidecar INCR degrade-open test (Redis-throw never converts 429→500) — `rateLimit.test.ts` "DEGRADE-OPEN: a rejecting INCR mock STILL yields a 429"
- [x] 999.1 Bearer-bypass coverage across all operator poll endpoints — `rateLimitPublic.test.ts` data-driven 11-tier block
- [x] Cron `missed`-state derivation test (schedule+grace) — `healthSources.test.ts` table-driven + `health.test.ts` route cases
- [x] CRON-WATCH ring + WATCH-artifact capture test — `cronWatch.test.ts` (ring) + `cron-health.test.ts` (daily append + degrade-open)
- [x] HARD-03 narrow gaps — call/run-history hydration-throw no-op (`llmCallHistory.test.ts`, `llmRunHistory.test.ts`), `tabMerge` sidecar-absent render (`DevApiStatus.tabMerge.test.tsx`), `trendHistory` degrade-open (`trendHistory.test.ts`)

---

## Manual-Only Verifications

| Behavior                                           | Requirement   | Why Manual                                                                                                                         | Test Instructions                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7-day watch produces 7 daily auto-captured entries | CRON-WATCH-01 | Spans real wall-clock days; non-blocking async observation; live cron tick + live Redis cannot be substituted by mocked unit tests | Inspect `cron:watch:v2` ring / `46-WATCH.md` after natural `0 0 * * *` health-cron ticks; confirm one PASS `WatchSample` per tick (tickDate, cronAgeMs, eval scores, result); non-gating; record early-close (if any) citing v1.5 Phase 31 |

_The code path that writes the ring (`appendWatchSample` invocation + bounded pipeline) IS covered by `cronWatch.test.ts` + `cron-health.test.ts` (mocked Redis). Only the live production accumulation over 7 elapsed days is manual. All other phase behaviors have automated verification._

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-06-22

---

## Validation Audit 2026-06-22

| Metric                  | Count |
| ----------------------- | ----- |
| Gaps found              | 0     |
| Resolved                | 0     |
| Escalated (manual-only) | 1     |

The draft VALIDATION.md shipped with an unpopulated planner-template Per-Task map. This audit reconstructed the real coverage map from the 5 PLAN/SUMMARY pairs and the VERIFICATION.md, then confirmed every behavior-changing task is COVERED by a green automated test (170 tests passed across 12 files, run 2026-06-22). No MISSING gaps — the auditor subagent was not required. The lone Manual-Only item (7-day cron-watch ring accumulation) is a NON-BLOCKING async observation by explicit roadmap lock; its write path is already unit-covered, only the live multi-day accumulation is manual.
