---
phase: 19
slug: search-filter-ui-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 with jsdom |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | SRCH-03a | unit | `npx vitest run src/__tests__/Sidebar.test.tsx` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | SRCH-03b | unit | `npx vitest run src/__tests__/Topbar.test.tsx` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | SRCH-01a | unit | `npx vitest run src/__tests__/SearchModal.test.tsx` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 2 | SRCH-01b | unit | `npx vitest run src/__tests__/useSearchResults.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-03 | 02 | 2 | SRCH-01c | unit | `npx vitest run src/__tests__/SearchModal.test.tsx` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 3 | SRCH-02 | unit | `npx vitest run src/__tests__/searchStore.test.ts` | ❌ W0 | ⬜ pending |
| 19-04-01 | 04 | 4 | SRCH-03 | manual | Visual inspection | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/SearchModal.test.tsx` — stubs for SRCH-01a, SRCH-01c
- [ ] `src/__tests__/useSearchResults.test.ts` — stubs for SRCH-01b (cross-store fuzzy matching)
- [ ] `src/__tests__/searchStore.test.ts` — stubs for SRCH-02 (reset all clears search state)
- [ ] `src/__tests__/Sidebar.test.tsx` — stubs for SRCH-03a (sidebar sections render)
- [ ] `src/__tests__/Topbar.test.tsx` — stubs for SRCH-03b (topbar elements render)
- [ ] Update `src/__tests__/AppShell.test.tsx` — existing test must be updated for new layout structure

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Polish pass (font sizes, spacing, opacity) | SRCH-03 | Visual consistency requires human judgment | Review all panels at different zoom levels, verify consistent spacing/blur |
| Markets panel drag and position persistence | SRCH-03 | Pointer event interaction hard to unit test reliably | Drag markets panel, reload page, verify position restored |
| Ship color change | SRCH-03 | Visual rendering in DeckGL | Verify ships appear as soft purple (#a78bfa) on map |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
