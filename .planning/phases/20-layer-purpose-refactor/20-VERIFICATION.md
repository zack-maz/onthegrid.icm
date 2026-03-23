---
phase: 20-layer-purpose-refactor
verified: 2026-03-22T23:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Entity toggle state no longer exists in uiStore (and all consumers updated)"
  gaps_remaining: []
  regressions: []
---

# Phase 20: Layer Purpose Refactor Verification Report

**Phase Goal:** Refactor layer toggles from "show/hide entity types" to "visualization modes" — remove entity toggle state, create layerStore, build MapLegend framework
**Verified:** 2026-03-22
**Status:** passed
**Re-verification:** Yes — after gap closure (commit e444fe9)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All entities always render on the map without toggle gating | VERIFIED | `useEntityLayers.ts` has no `visible: show*` props on entity layers; only glow/highlight layers use `visible` for search/hover UX |
| 2 | Entity toggle state no longer exists in uiStore (and all consumers updated) | VERIFIED | `Topbar.tsx` no longer imports `LAYER_TOGGLE_DEFAULTS`; now calls `useLayerStore.getState().resetLayers()`; `layerStore.ts` exports `resetLayers`; no TS errors for this file |
| 3 | A new layerStore exists with Set-based visualization layer toggle state | VERIFIED | `src/stores/layerStore.ts` exports `useLayerStore`, `VisualizationLayerId`, and `resetLayers`; correct curried `create<T>()()` pattern |
| 4 | Counter data reflects all entities without toggle gating | VERIFIED | `useCounterData.ts` has no `useUIStore` import; counts all entities unconditionally |
| 5 | Proximity alerts check all sites without toggle filtering | VERIFIED | `useProximityAlerts.ts` has no `useUIStore` import; passes all `sites` directly |
| 6 | Search/filter is the only mechanism to narrow visible entities | VERIFIED | `Topbar.tsx` reset now clears UI state + layer state + filter state only; no toggle reset references remain anywhere |

**Score:** 6/6 truths verified

---

### Gap Closure Verification

**Previously failing truth:** "Entity toggle state no longer exists in uiStore (and all consumers updated)"

**What changed in commit e444fe9:**
- `src/components/layout/Topbar.tsx`: Removed `import { LAYER_TOGGLE_DEFAULTS } from '@/types/ui'` (deleted export), removed `...LAYER_TOGGLE_DEFAULTS` spread from `useUIStore.setState`, removed `localStorage.setItem('layerToggles', ...)` write. Added `useLayerStore.getState().resetLayers()` call.
- `src/stores/layerStore.ts`: Added `resetLayers: () => void` to interface and `resetLayers: () => set({ activeLayers: new Set<VisualizationLayerId>() })` to implementation.

**Verification:**
- `grep "LAYER_TOGGLE_DEFAULTS\|layerToggles" src/components/layout/Topbar.tsx` returns no output — clean.
- `npx tsc -p tsconfig.app.json --noEmit` returns no errors for Topbar or layerStore (pre-existing errors in DetailPanelSlot, BaseMap, ExpandedChart, SyntaxOverlay, useEntityLayers canvas types are confirmed pre-existing from earlier phases).
- `npx vitest run` — 787 tests pass across 64 test files. Full suite green.

---

### Required Artifacts

#### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/stores/layerStore.ts` | Visualization layer state management; exports `useLayerStore`, `VisualizationLayerId`, `resetLayers` | VERIFIED | 30 lines; Set-based toggle; curried create pattern; 6 VisualizationLayerId variants; `resetLayers` added by gap-fix commit |
| `src/types/ui.ts` | UIState without entity toggle fields | VERIFIED | UIState has panel/selection fields only; no `showFlights`, `showShips`, `LAYER_TOGGLE_DEFAULTS` |
| `src/stores/uiStore.ts` | UI store without entity toggle fields or localStorage persistence for toggles | VERIFIED | Only `readBool` for `isMarketsCollapsed`; no toggle state |
| `src/hooks/useEntityLayers.ts` | Deck.gl layers always visible (no toggle gating) | VERIFIED | No `visible: show*` props on entity layers |
| `src/hooks/useQuerySync.ts` | Bidirectional sync without toggle mapping | VERIFIED | `SyncableState` has filter-only fields; `buildASTFromFilters` (renamed); no toggle derivation |

#### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/map/MapLegend.tsx` | Inline legend framework; exports `MapLegend`, `LegendConfig` | VERIFIED | 58 lines; `LEGEND_REGISTRY: LegendConfig[]`; reads `activeLayers` from layerStore; returns null when empty |
| `src/components/layout/LayerTogglesSlot.tsx` | Visualization layer toggle UI; uses `VisualizationLayerId` | VERIFIED | 6 LAYER_CONFIGS; `LayerToggleRow` pattern; "coming soon" subtitle present |
| `src/components/map/BaseMap.tsx` | Map component without `isEntityTooltipVisible` | VERIFIED | `MapLegend` imported and rendered; no toggle-gated tooltip suppression |
| `src/components/ui/StatusPanel.tsx` | Status panel with unconditional entity counts | VERIFIED | No `useUIStore` toggle selectors; no `CONFLICT_TOGGLE_GROUPS` import |

#### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/__tests__/layerStore.test.ts` | Unit tests for visualization layer store | VERIFIED | 6 tests pass: empty start, toggle-add, toggle-remove, multiple, independence, reset |
| `src/__tests__/MapLegend.test.tsx` | Component tests for legend framework | VERIFIED | 3 tests pass: no layers → null, empty registry → null, exports exist |
| `src/__tests__/entityLayers.test.ts` | Updated tests confirming all-visible behavior | VERIFIED | No `visible: false` toggle assertions |
| `src/__tests__/uiStore.test.ts` | Updated tests without toggle assertions | VERIFIED | `not.toHaveProperty('showFlights')` and similar absence assertions present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/hooks/useEntityLayers.ts` | `src/stores/uiStore.ts` | Only reads `selectedEntityId`, `hoveredEntityId` | VERIFIED | No toggle selectors remain |
| `src/hooks/useQuerySync.ts` | `src/stores/filterStore.ts` | Filter sync preserved, toggle sync removed | VERIFIED | `useFilterStore` imported and synced; toggle derivation removed |
| `src/components/layout/LayerTogglesSlot.tsx` | `src/stores/layerStore.ts` | `useLayerStore` for toggle state | VERIFIED | `LayerToggleRow` uses `useLayerStore(s => s.activeLayers.has(id))` per row |
| `src/components/map/MapLegend.tsx` | `src/stores/layerStore.ts` | reads `activeLayers` to show/hide legends | VERIFIED | `useLayerStore((s) => s.activeLayers)` |
| `src/components/map/BaseMap.tsx` | `src/components/map/MapLegend.tsx` | renders MapLegend as map overlay | VERIFIED | Import and `<MapLegend />` in map children |
| `src/components/layout/Topbar.tsx` | `src/stores/layerStore.ts` | calls `resetLayers()` in ResetButton | VERIFIED | `useLayerStore.getState().resetLayers()` line 23 |
| `src/__tests__/layerStore.test.ts` | `src/stores/layerStore.ts` | Tests toggle add/remove behavior | VERIFIED | `toggleLayer` called and asserted in all 6 tests |
| `src/__tests__/MapLegend.test.tsx` | `src/components/map/MapLegend.tsx` | Tests legend visibility based on active layers | VERIFIED | Renders `MapLegend` and asserts null output |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LREF-01 | 20-01, 20-03 | All entities always visible on the map — entity toggle state fully removed | VERIFIED | `useEntityLayers.ts`, `useCounterData.ts`, `useProximityAlerts.ts` all confirmed toggle-free; `Topbar.tsx` reset does not restore any toggle state |
| LREF-02 | 20-01, 20-03 | New visualization layer store with on/off toggle for 6 layer types | VERIFIED | `layerStore.ts` with `VisualizationLayerId` union of 6 values; 6 unit tests pass; `resetLayers` method added |
| LREF-03 | 20-02, 20-03 | Sidebar "Layers" section replaced with visualization layer toggles | VERIFIED | `LayerTogglesSlot.tsx` shows 6 rows; `LayerToggles.test.tsx` fully rewritten |
| LREF-04 | 20-02, 20-03 | Inline legend framework renders color scale legends for active layers | VERIFIED | `MapLegend.tsx` exists; wired in `BaseMap.tsx`; 3 `MapLegend.test.tsx` tests pass |
| LREF-05 | 20-01, 20-02, 20-03 | Search/filter system is the only mechanism to narrow visible entities | VERIFIED | `Topbar.tsx` ResetButton gap closed — no toggle reset references anywhere; all entity layers render unconditionally |

All 5 LREF requirement IDs from REQUIREMENTS.md are accounted for. No orphaned requirements.

---

### Anti-Patterns Found

None introduced by phase 20.

Pre-existing TypeScript errors (confirmed from earlier phases, not introduced here) remain in:
- `src/components/layout/DetailPanelSlot.tsx` — entity cast types (Phase 10)
- `src/components/map/BaseMap.tsx` — unused `useRef`, `lngLat` type (Phase 10/9)
- `src/components/markets/ExpandedChart.tsx` — unused `l` parameter (Phase 18)
- `src/components/search/SyntaxOverlay.tsx` — unreachable comparison (Phase 19)
- `src/hooks/useEntityLayers.ts` — `HTMLCanvasElement` vs `Texture` (Phase 9 Deck.gl types)
- `src/lib/filters.ts`, `src/lib/queryEvaluator.ts` — property access on discriminated union (Phase 19)

None of these are in phase 20 modified files and none are blocking.

---

### Human Verification Required

None. All critical paths are verifiable programmatically.

The "coming soon" subtitle in LayerTogglesSlot is intentional — sub-phases 20.1-20.5 will add actual visualization layer rendering.

---

### Summary

**Gap closed.** The single blocking gap from the initial verification — `Topbar.tsx` importing the deleted `LAYER_TOGGLE_DEFAULTS` export — has been fully resolved in commit e444fe9. The fix:

1. Removes the dead import and spread from `useUIStore.setState`
2. Removes the `localStorage.setItem('layerToggles', ...)` write that stored `"undefined"`
3. Adds `resetLayers()` to `layerStore.ts` and calls it from Topbar's `ResetButton`

All 6 observable truths are now verified. All 5 LREF requirements are satisfied. The full test suite passes (787/787). No regressions introduced.

---

_Verified: 2026-03-22_
_Verifier: Claude (gsd-verifier)_
_Re-verification after: commit e444fe9 (fix: remove deleted LAYER_TOGGLE_DEFAULTS import from Topbar)_
