---
phase: 13
slug: serverless-cache-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vite.config.ts` (test section, `// @vitest-environment node` per server test file) |
| **Quick run command** | `npx vitest run server/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | CACHE-01 | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | CACHE-02 | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | CACHE-03 | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-04 | 01 | 1 | CACHE-04 | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | FLIGHT-01 | unit | `npx vitest run server/__tests__/routes/flights.test.ts` | ✅ update | ⬜ pending |
| 13-02-02 | 02 | 2 | FLIGHT-02 | unit | `npx vitest run server/__tests__/routes/flights.test.ts` | ✅ update | ⬜ pending |
| 13-02-03 | 02 | 2 | FLIGHT-03 | unit | `npx vitest run server/__tests__/routes/flights.test.ts` | ✅ update | ⬜ pending |
| 13-03-01 | 03 | 2 | EVENTS-01 | unit | `npx vitest run server/__tests__/routes/events.test.ts` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 2 | EVENTS-02 | unit | `npx vitest run server/__tests__/routes/events.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 2 | SHIPS-01 | unit | `npx vitest run server/__tests__/routes/ships.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-02 | 04 | 2 | SHIPS-02 | unit | `npx vitest run server/__tests__/routes/ships.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-03 | 04 | 2 | SHIPS-03 | unit | `npx vitest run server/__tests__/routes/ships.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-04 | 04 | 2 | SHIPS-04 | unit | `npx vitest run server/__tests__/routes/ships.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-05 | 04 | 2 | AIS-01 | unit | `npx vitest run server/__tests__/adapters/aisstream.test.ts` | ✅ update | ⬜ pending |
| 13-04-06 | 04 | 2 | AIS-02 | unit | `npx vitest run server/__tests__/adapters/aisstream.test.ts` | ✅ update | ⬜ pending |
| 13-05-01 | 05 | 3 | STARTUP-01 | unit | `npx vitest run server/__tests__/server.test.ts` | ✅ update | ⬜ pending |
| 13-05-02 | 05 | 3 | STARTUP-02 | manual | `ls server/cache/entityCache.ts` should fail | N/A | ⬜ pending |
| 13-05-03 | 05 | 3 | API-01 | unit | `npx vitest run server/` | ✅ covered | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/redis-cache.test.ts` — stubs for CACHE-01 through CACHE-04
- [ ] `server/__tests__/routes/events.test.ts` — stubs for EVENTS-01, EVENTS-02
- [ ] `server/__tests__/routes/ships.test.ts` — stubs for SHIPS-01 through SHIPS-04

*Existing infrastructure covers: flights route tests, aisstream adapter tests, server startup tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EntityCache file deleted | STARTUP-02 | Filesystem check | `ls server/cache/entityCache.ts` should return "No such file" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
