---
phase: 25
slug: ethnic-distribution-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + jsdom |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/EthnicOverlay.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/EthnicOverlay.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | Data extraction + config | unit | `npx vitest run src/__tests__/EthnicOverlay.test.tsx` | No W0 | pending |
| 25-01-02 | 01 | 1 | useEthnicLayers hook | unit | `npx vitest run src/__tests__/EthnicOverlay.test.tsx` | No W0 | pending |
| 25-01-03 | 01 | 1 | Legend registration | unit | `npx vitest run src/__tests__/EthnicOverlay.test.tsx` | No W0 | pending |
| 25-02-01 | 02 | 2 | BaseMap wiring | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx` | Existing (update) | pending |
| 25-02-02 | 02 | 2 | Toggle activation | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx` | Existing (update) | pending |
| 25-02-03 | 02 | 2 | Visual checkpoint | checkpoint | `npx vitest run` | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/EthnicOverlay.test.tsx` — stubs for data integrity, hook behavior, legend, config coverage
- [ ] Mock for `@deck.gl/extensions` if needed (or add to existing deck.gl mock aliases)
- [ ] Update `src/__tests__/LayerToggles.test.tsx` — ethnic no longer comingSoon

*Existing infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hatching patterns visible and distinct | Visual presentation | Subjective visual assessment | Toggle ethnic layer, verify diagonal hatching appears per zone |
| Zone labels readable at medium zoom | Label visibility | Zoom-dependent rendering | Zoom to ~7-8, verify zone names visible |
| Mixed hatching in overlap zones | Overlap rendering | Complex visual composite | Zoom to Kirkuk area, verify interleaved stripes |
| Ethnic + political layers stack correctly | Layer compositing | Visual layer interaction | Enable both layers, verify hatching renders on top of solid fills |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
