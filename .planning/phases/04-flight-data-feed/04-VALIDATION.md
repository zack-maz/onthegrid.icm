---
phase: 4
slug: flight-data-feed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1 with jsdom (frontend) + node (server) |
| **Config file** | vite.config.ts (test section) |
| **Quick run command** | `npx vitest run src/__tests__/flightStore.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/flightStore.test.ts server/__tests__/adapters/opensky.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DATA-01a | unit | `npx vitest run server/__tests__/adapters/opensky.test.ts -x` | ✅ (needs new case) | ⬜ pending |
| 04-01-02 | 01 | 1 | DATA-01b | unit | `npx vitest run server/__tests__/adapters/opensky.test.ts -x` | ✅ (needs new case) | ⬜ pending |
| 04-01-03 | 01 | 1 | DATA-01c | unit | `npx vitest run server/__tests__/types.test.ts -x` | ✅ (needs update) | ⬜ pending |
| 04-01-04 | 01 | 1 | DATA-01d | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | DATA-01e | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | DATA-01f | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 1 | DATA-01g | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-08 | 01 | 1 | DATA-01h | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-09 | 01 | 1 | DATA-01i | unit | `npx vitest run src/__tests__/flightStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | DATA-01j | unit | `npx vitest run src/__tests__/useFlightPolling.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | DATA-01k | unit | `npx vitest run src/__tests__/useFlightPolling.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | DATA-01l | unit | `npx vitest run src/__tests__/useFlightPolling.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-10 | 01 | 1 | DATA-01m | unit | `npx vitest run server/__tests__/server.test.ts -x` | ✅ (needs new case) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/flightStore.test.ts` — stubs for DATA-01d through DATA-01i (store unit tests)
- [ ] `src/__tests__/useFlightPolling.test.ts` — stubs for DATA-01j through DATA-01l (polling hook tests)
- [ ] New test cases in `server/__tests__/adapters/opensky.test.ts` for onGround filter and unidentified flag
- [ ] New test case in `server/__tests__/server.test.ts` for cache-first behavior

*Existing infrastructure covers test framework setup — only new test files/cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab visibility pause/resume | DATA-01k/l | Requires real browser tab switching | 1. Open app, 2. Switch tab for 10s, 3. Switch back, 4. Verify immediate fetch in network tab |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
