---
phase: 24
slug: political-boundaries-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + jsdom |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/PoliticalOverlay.test.tsx src/__tests__/factions.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/PoliticalOverlay.test.tsx src/__tests__/factions.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | Data prep | unit | `npx vitest run src/__tests__/factions.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | GeoJSON integrity | unit | `npx vitest run src/__tests__/PoliticalOverlay.test.tsx` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | Overlay render gate | unit | `npx vitest run src/__tests__/PoliticalOverlay.test.tsx` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | Disputed territory hatching | unit | `npx vitest run src/__tests__/PoliticalOverlay.test.tsx` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | Faction assignments complete | unit | `npx vitest run src/__tests__/factions.test.ts` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | Legend renders discrete swatches | unit | `npx vitest run src/__tests__/MapLegend.test.tsx` | ✅ (update) | ⬜ pending |
| 24-02-02 | 02 | 1 | Toggle removes comingSoon | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx` | ✅ (update) | ⬜ pending |
| 24-02-03 | 02 | 1 | Disputed hover label | unit | `npx vitest run src/__tests__/PoliticalOverlay.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/PoliticalOverlay.test.tsx` — stubs for overlay render, data integrity, hatching, hover
- [ ] `src/__tests__/factions.test.ts` — stubs for faction assignment completeness, ISO A3 coverage
- [ ] Update `src/__tests__/LayerToggles.test.tsx` — political no longer comingSoon
- [ ] Update `src/__tests__/MapLegend.test.tsx` — political legend discrete swatch assertion

*Existing infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fill opacity looks correct on dark base map | Visual presentation | Subjective visual assessment | Toggle political layer, verify ~15% tinted wash visible but not overwhelming |
| Layer stacking below other layers | Z-ordering | Visual layer interaction | Enable political + geographic + threat layers, verify political is behind all |
| Disputed territory hatching visible | Canvas pattern rendering | WebGL/canvas rendering | Toggle political layer, zoom to Golan Heights, verify diagonal yellow lines |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
