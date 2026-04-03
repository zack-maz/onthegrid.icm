---
phase: 26
slug: water-stress-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + jsdom (frontend) / node (server) |
| **Config file** | `vite.config.ts` (test section) |
| **Quick run command** | `npx vitest run src/__tests__/waterStore.test.ts src/__tests__/waterStress.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command for relevant test files
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | Data extraction scripts | unit | Wave 0 stubs | No W0 | pending |
| 26-01-02 | 01 | 1 | Overpass water query | unit | `npx vitest run server/` | No W0 | pending |
| 26-01-03 | 01 | 1 | Basin lookup + stress | unit | `npx vitest run server/` | No W0 | pending |
| 26-02-01 | 02 | 2 | waterStore + API route | unit | `npx vitest run src/__tests__/waterStore.test.ts server/` | No W0 | pending |
| 26-02-02 | 02 | 2 | Desalination migration | unit | `npx vitest run src/__tests__/entityLayers.test.ts` | Existing | pending |
| 26-03-01 | 03 | 3 | WaterOverlay component | unit | `npx vitest run src/__tests__/WaterOverlay.test.tsx` | No W0 | pending |
| 26-03-02 | 03 | 3 | Detail panel + wiring | unit | `npx vitest run` | Existing | pending |
| 26-03-03 | 03 | 3 | Visual checkpoint | checkpoint | `npx vitest run` | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/adapters/overpass-water.test.ts` — stubs for water facility query
- [ ] `server/__tests__/lib/basinLookup.test.ts` — stubs for WRI basin stress assignment
- [ ] `src/__tests__/waterStore.test.ts` — stubs for water facility state management
- [ ] `src/__tests__/waterStress.test.ts` — stubs for stress-to-color interpolation, composite health
- [ ] `server/__tests__/routes/water.test.ts` — stubs for /api/water endpoint
- [ ] `server/__tests__/adapters/open-meteo-precip.test.ts` — stubs for precipitation adapter

*Existing infrastructure covers framework installation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Facility markers visible with stress colors | Visual rendering | WebGL/terrain | Toggle Water layer, verify colored markers at dam/reservoir locations |
| River lines stress-colored by watershed | Visual rendering | Complex line coloring | Zoom to Tigris/Euphrates, verify color changes along river course |
| Desalination removed from Sites panel | UI migration | Toggle interaction | Open Sites section, verify no Desalination sub-toggle |
| Legend gradient black→light blue | Visual | Subjective | Check bottom-left legend when Water layer active |
| Precipitation in weather tooltip | Cross-layer | Both Climate+Water must be active | Enable both layers, hover weather grid point |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
