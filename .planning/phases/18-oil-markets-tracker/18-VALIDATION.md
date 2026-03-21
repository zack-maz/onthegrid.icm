---
phase: 18
slug: oil-markets-tracker
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run server/__tests__/routes/markets.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run server/__tests__/ --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | MRKT-01 | unit | `npx vitest run server/__tests__/adapters/yahoo-finance.test.ts -x` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | MRKT-01 | integration | `npx vitest run server/__tests__/routes/markets.test.ts -x` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | MRKT-01 | unit | `npx vitest run src/__tests__/stores/marketStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | MRKT-02 | unit | `npx vitest run src/__tests__/components/markets/Sparkline.test.tsx -x` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | MRKT-02 | unit | `npx vitest run src/__tests__/components/markets/Sparkline.test.tsx -x` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | MRKT-03 | unit | `npx vitest run src/__tests__/components/markets/MarketRow.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/adapters/yahoo-finance.test.ts` — stubs for MRKT-01 (adapter normalization)
- [ ] `server/__tests__/routes/markets.test.ts` — stubs for MRKT-01 (cache-first route, cached/stale/error cases)
- [ ] `src/__tests__/stores/marketStore.test.ts` — stubs for MRKT-01 (store CacheResponse handling)
- [ ] `src/__tests__/components/markets/Sparkline.test.tsx` — stubs for MRKT-02 (SVG path, color coding)
- [ ] `src/__tests__/components/markets/MarketRow.test.tsx` — stubs for MRKT-03 (delta animation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Panel position below NotificationBell | MRKT-01 | Visual layout | Inspect top-right, verify panel renders below bell icon |
| Sparkline inline appearance (~60x16px) | MRKT-02 | Visual styling | Verify sparkline size and crispness in browser |
| Delta fade animation timing | MRKT-03 | CSS animation | Verify 3s green fade matches CounterRow pattern |
| Market closed label display | MRKT-01 | Time-dependent | Check during market close hours for "MARKET CLOSED" label |
| Accordion expand/collapse | MRKT-02 | Interaction | Click row, verify chart expands; click another, verify previous collapses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
