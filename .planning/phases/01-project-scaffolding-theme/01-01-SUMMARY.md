---
phase: 01-project-scaffolding-theme
plan: 01
subsystem: infra
tags: [react, vite, typescript, tailwindcss-v4, zustand, vitest]

# Dependency graph
requires: []
provides:
  - Vite 6 + React 19 + TypeScript 5.9 project scaffold with ESM
  - Tailwind CSS v4 dark theme with @theme semantic color tokens
  - AppShell layout with full-viewport dark shell and z-indexed overlay regions
  - Zustand UI store with panel visibility toggles
  - OverlayPanel reusable component
  - Vitest test infrastructure with jsdom and testing-library
affects: [base-map, api-proxy, entity-rendering, layer-controls, detail-panel, smart-filters, analytics-dashboard]

# Tech tracking
tech-stack:
  added: [react@19, react-dom@19, vite@6, typescript@5.9.3, tailwindcss@4, "@tailwindcss/vite@4", zustand@5, vitest@4, "@testing-library/react@16", "@testing-library/jest-dom@6", jsdom]
  patterns: [css-first-tailwind-v4-theme, zustand-curried-create, overlay-panel-glass-morphism, z-index-scale-css-variables, path-alias-at-prefix]

key-files:
  created:
    - src/styles/app.css
    - src/components/layout/AppShell.tsx
    - src/components/layout/TitleSlot.tsx
    - src/components/layout/CountersSlot.tsx
    - src/components/layout/LayerTogglesSlot.tsx
    - src/components/layout/FiltersSlot.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - src/components/ui/OverlayPanel.tsx
    - src/stores/uiStore.ts
    - src/types/ui.ts
    - vite.config.ts
    - tsconfig.app.json
  modified:
    - src/App.tsx
    - src/main.tsx
    - package.json
    - index.html

key-decisions:
  - "Used Tailwind CSS v4 CSS-first @theme configuration (no tailwind.config.js)"
  - "Pinned TypeScript to ~5.9.3 to avoid TS 6.0 breaking changes"
  - "Zustand store uses curried create<UIState>()() pattern for type inference"
  - "Z-index scale defined as CSS custom properties for consistent overlay layering"

patterns-established:
  - "Tailwind v4 @theme for all design tokens: @import tailwindcss then @theme block with --color-* and --z-* variables"
  - "OverlayPanel component: rounded-lg border border-border bg-surface-overlay backdrop-blur-sm for all floating UI"
  - "Layout slots with data-testid attributes for testability"
  - "@ path alias configured in both vite.config.ts and tsconfig.app.json"

requirements-completed: [INFRA-02]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 1 Plan 01: Project Scaffolding & Theme Summary

**Vite 6 + React 19 dark intelligence dashboard shell with Tailwind v4 CSS-first theme, Zustand UI store, and full-viewport overlay layout with 21 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T09:35:05Z
- **Completed:** 2026-03-14T09:40:05Z
- **Tasks:** 3
- **Files modified:** 28

## Accomplishments

- Scaffolded Vite 6 + React 19 + TypeScript 5.9 project with ESM, strict mode, and @ path aliases
- Built dark CSS-first theme using Tailwind v4 @theme with semantic color tokens (accent-blue/red/green/yellow, surface palette, text palette, borders, z-index scale)
- Created AppShell layout with full-viewport dark background and 6 floating overlay regions (map-container, title-slot, counters-slot, layer-toggles-slot, filters-slot, detail-panel-slot)
- Implemented Zustand UI store with panel visibility toggles (detail panel open/close, counters collapse, filters expand)
- Set up Vitest test infrastructure with 21 passing tests covering store logic, theme tokens, layout regions, and app smoke test

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite project, install dependencies, configure build tools** - `3924679` (chore)
2. **Task 2: Create test stubs, theme CSS, types, and Zustand store** - `af9df7c` (test)
3. **Task 3: Implement layout components and wire AppShell** - `11ce1bf` (feat)

## Files Created/Modified

- `vite.config.ts` - Vite config with React, Tailwind v4, and @ path alias plugins
- `tsconfig.app.json` - TypeScript strict config with path aliases and vitest globals
- `src/styles/app.css` - Dark theme with Tailwind v4 @theme tokens (accents, surfaces, text, borders, z-index, layout)
- `src/types/ui.ts` - UIState interface for panel visibility toggles
- `src/stores/uiStore.ts` - Zustand store with curried create pattern and all toggle actions
- `src/components/layout/AppShell.tsx` - Full-viewport shell with z-indexed overlay regions
- `src/components/layout/TitleSlot.tsx` - "IRAN CONFLICT MONITOR" title in overlay panel
- `src/components/layout/CountersSlot.tsx` - Collapsible counters card with Zustand toggle
- `src/components/layout/LayerTogglesSlot.tsx` - Layer toggles placeholder panel
- `src/components/layout/FiltersSlot.tsx` - Expandable filters panel with Zustand toggle
- `src/components/layout/DetailPanelSlot.tsx` - Slide-in detail panel with transform transition
- `src/components/ui/OverlayPanel.tsx` - Reusable semi-transparent overlay panel component
- `src/App.tsx` - Root component rendering AppShell
- `src/main.tsx` - Entry point importing global CSS
- `src/__tests__/uiStore.test.ts` - 5 tests for Zustand store actions
- `src/__tests__/theme.test.ts` - 8 tests for CSS theme token presence
- `src/__tests__/AppShell.test.tsx` - 6 tests for layout region presence
- `src/__tests__/App.test.tsx` - 2 smoke tests for app rendering
- `src/test/setup.ts` - jest-dom matcher setup for testing-library
- `package.json` - Project manifest with all dependencies
- `index.html` - Entry HTML with Iran Conflict Monitor title

## Decisions Made

- Used Tailwind CSS v4 CSS-first @theme configuration instead of tailwind.config.js -- v4 standard approach
- Pinned TypeScript to ~5.9.3 to avoid TS 6.0 breaking changes releasing March 17
- Used Zustand curried create<UIState>()() pattern for proper TypeScript inference
- Defined z-index scale as CSS custom properties (--z-map: 0 through --z-modal: 40)
- Used system-ui font stack instead of bundling Inter font

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- AppShell's map-container region (data-testid="map-container") is ready to receive a Deck.gl + MapLibre map component in Phase 2
- All overlay regions are positioned with z-index layering to float above the map
- Detail panel slide-in animation is wired to Zustand store and ready for entity detail content
- Zustand store pattern established for additional state slices in future phases

## Self-Check: PASSED

All 11 key files verified present. All 3 task commits verified in git log.

---
*Phase: 01-project-scaffolding-theme*
*Completed: 2026-03-14*
