---
phase: 20
slug: layer-purpose-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x with jsdom |
| **Config file** | vite.config.ts (test section) |
| **Quick run command** | `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts src/__tests__/LayerToggles.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/uiStore.test.ts src/__tests__/entityLayers.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green + `npx tsc --noEmit`
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | layerStore | unit | `npx vitest run src/__tests__/layerStore.test.ts -x` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 0 | MapLegend | component | `npx vitest run src/__tests__/MapLegend.test.tsx -x` | ❌ W0 | ⬜ pending |
| 20-01-03 | 01 | 1 | uiStore cleanup | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | ✅ | ⬜ pending |
| 20-01-04 | 01 | 1 | entityLayers unconditional | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | ✅ | ⬜ pending |
| 20-01-05 | 01 | 1 | LayerToggles new UI | component | `npx vitest run src/__tests__/LayerToggles.test.tsx -x` | ✅ | ⬜ pending |
| 20-01-06 | 01 | 2 | counterData unconditional | unit | `npx vitest run src/__tests__/useCounterData.test.ts -x` | ✅ | ⬜ pending |
| 20-01-07 | 01 | 2 | TypeScript compiles | typecheck | `npx tsc --noEmit` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/layerStore.test.ts` — stubs for new visualization layer store
- [ ] `src/__tests__/MapLegend.test.tsx` — stubs for legend framework rendering

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Legend visual positioning | layout | CSS positioning in browser | Verify legend appears bottom-left, stacks upward |
| Toggle opacity transitions | UX | Visual animation timing | Toggle layers, confirm smooth 150ms transitions |
| Layer toggle keyboard nav | a11y | Browser focus behavior | Tab through toggles, confirm focus ring and space/enter activation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
