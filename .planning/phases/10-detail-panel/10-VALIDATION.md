---
phase: 10
slug: detail-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 with jsdom |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | CTRL-02a | unit | `npx vitest run src/__tests__/DetailPanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | CTRL-02b | unit | `npx vitest run src/__tests__/useSelectedEntity.test.ts -x` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | CTRL-02c | unit | `npx vitest run src/__tests__/DetailPanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 10-01-04 | 01 | 1 | CTRL-02d | unit | `npx vitest run src/__tests__/useSelectedEntity.test.ts -x` | ❌ W0 | ⬜ pending |
| 10-01-05 | 01 | 1 | CTRL-02e | unit | `npx vitest run src/__tests__/DetailValue.test.tsx -x` | ❌ W0 | ⬜ pending |
| 10-01-06 | 01 | 1 | CTRL-02f | unit | `npx vitest run src/__tests__/DetailPanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 10-01-07 | 01 | 1 | CTRL-02g | unit | `npx vitest run src/__tests__/AppShell.test.tsx -x` | ✅ needs update | ⬜ pending |
| 10-01-08 | 01 | 1 | CTRL-02h | unit | `npx vitest run src/__tests__/BaseMap.test.tsx -x` | ✅ needs update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/useSelectedEntity.test.ts` — stubs for CTRL-02b, CTRL-02d (cross-store lookup, lost contact)
- [ ] `src/__tests__/DetailPanel.test.tsx` — stubs for CTRL-02a, CTRL-02c, CTRL-02f (content rendering, dismiss, clipboard)
- [ ] `src/__tests__/DetailValue.test.tsx` — stubs for CTRL-02e (flash-on-change animation class)
- [ ] Update `src/__tests__/AppShell.test.tsx` — for CTRL-02g (left-side panel positioning)
- [ ] Update `src/__tests__/BaseMap.test.tsx` — for CTRL-02h (empty click behavior change)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Slide-in/out animation smoothness | CTRL-02 | CSS transition quality is visual | Open panel, verify 300ms slide transition |
| Flash-on-change visual feedback | CTRL-02e | Animation timing is visual | Watch panel values update during poll refresh |
| Panel does not obscure selected entity | CTRL-02 | Spatial layout on various viewports | Click entity near right edge, verify panel doesn't cover it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
