---
phase: 11
slug: smart-filters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 11 — Validation Strategy

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
| 11-01-01 | 01 | 1 | CTRL-03a | unit | `npx vitest run src/__tests__/filterStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | CTRL-03b | unit | `npx vitest run src/__tests__/filters.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | CTRL-03c | unit | `npx vitest run src/__tests__/geo.test.ts -x` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | CTRL-03d | unit | `npx vitest run src/__tests__/FilterPanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 11-02-02 | 02 | 2 | CTRL-03e | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | ✅ extend | ⬜ pending |
| 11-02-03 | 02 | 2 | CTRL-03f | unit | `npx vitest run src/__tests__/StatusPanel.test.tsx -x` | ✅ extend | ⬜ pending |
| 11-02-04 | 02 | 2 | CTRL-03g | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | ✅ verify | ⬜ pending |
| 11-02-05 | 02 | 2 | CTRL-03h | unit | `npx vitest run src/__tests__/FilterPanel.test.tsx -x` | ❌ W0 | ⬜ pending |
| 11-02-06 | 02 | 2 | CTRL-03i | unit | `npx vitest run src/__tests__/filterStore.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/filterStore.test.ts` — stubs for CTRL-03a, CTRL-03i (store defaults, actions, clearAll)
- [ ] `src/__tests__/filters.test.ts` — stubs for CTRL-03b (pure function cross-type logic)
- [ ] `src/__tests__/geo.test.ts` — stubs for CTRL-03c (haversine distance calculation)
- [ ] `src/__tests__/FilterPanel.test.tsx` — stubs for CTRL-03d, CTRL-03h (render, badge count)

*Existing infrastructure covers remaining requirements via extension of existing test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Proximity circle renders on map | CTRL-03 | Visual rendering on WebGL canvas | Place proximity pin, verify dashed blue circle appears at correct radius |
| Filter panel collapse/expand animation | CTRL-03 | CSS transition visual verification | Toggle filter panel, verify smooth collapse/expand |
| Dual-thumb slider interaction | CTRL-03 | Touch/mouse drag behavior | Drag slider thumbs, verify min/max update correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
