---
phase: 15
slug: key-sites-overlay
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | SITE-01 | unit | `npx vitest run server/__tests__/adapters/overpass.test.ts -x` | Wave 0 | pending |
| 15-01-02 | 01 | 1 | SITE-01 | unit | `npx vitest run server/__tests__/routes/sites.test.ts -x` | Wave 0 | pending |
| 15-01-03 | 01 | 1 | SITE-01 | unit | `npx vitest run src/__tests__/siteStore.test.ts -x` | Wave 0 | pending |
| 15-01-04 | 01 | 1 | SITE-01 | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Extend existing | pending |
| 15-02-01 | 02 | 1 | SITE-02 | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing | pending |
| 15-02-02 | 02 | 1 | SITE-02 | unit | `npx vitest run src/__tests__/LayerToggles.test.tsx -x` | Extend existing | pending |
| 15-02-03 | 02 | 1 | SITE-02 | unit | `npx vitest run src/__tests__/uiStore.test.ts -x` | Extend existing | pending |
| 15-03-01 | 03 | 2 | SITE-03 | unit | `npx vitest run src/__tests__/useSelectedEntity.test.ts -x` | Extend existing | pending |
| 15-03-02 | 03 | 2 | SITE-03 | unit | `npx vitest run src/__tests__/DetailPanel.test.tsx -x` | Extend existing | pending |
| 15-03-03 | 03 | 2 | SITE-03 | unit | `npx vitest run src/__tests__/attackStatus.test.ts -x` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/adapters/overpass.test.ts` — stubs for SITE-01 (Overpass adapter)
- [ ] `server/__tests__/routes/sites.test.ts` — stubs for SITE-01 (sites route)
- [ ] `src/__tests__/siteStore.test.ts` — stubs for SITE-01 (site store)
- [ ] `src/__tests__/attackStatus.test.ts` — stubs for SITE-03 (attack status computation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Site icons render visually distinct per type | SITE-01 | Canvas icon rendering requires visual confirmation | Load map, verify 6 distinct icon shapes visible |
| Hover tooltip shows site name + location | SITE-03 | DOM overlay positioning requires visual check | Hover each site type, verify tooltip content |
| Detail panel slide-out with full site info | SITE-03 | Layout and animation require visual check | Click site, verify detail panel opens with correct sections |
| Attack status color changes (green/orange) | SITE-03 | Color rendering requires visual check | Verify attacked sites show orange, healthy show green |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
