---
phase: 40-dashboard-ui-ux-polish-subtab-consolidation
plan: 01
subsystem: ui
tags: [tailwind, css-tokens, zustand, color-bridge, dev-api-status]

# Dependency graph
requires:
  - phase: 28.1
    provides: D-13 single-source color pipeline (app.css @theme → colorBridge hex/RGBA re-export → byte-identity sentinel test)
provides:
  - 3 semantic status color tokens (--color-status-healthy/degraded/warning) through the full D-13 pipeline
  - 3 colorBridge hex re-exports (COLOR_STATUS_HEALTHY_HEX/DEGRADED_HEX/WARNING_HEX), hex-only (no deck.gl tuple)
  - 3 byte-identity sentinel assertions (#22c55e/#f97316/#eab308) + shape-test coverage
  - uiStore session-scoped devApiGroupCollapsed (default {}) + isOperatorDrawerOpen (default false) + 3 toggle/setter actions
  - UIState type declarations for the 5 new uiStore members
affects: [40-02 DevApiStatus restructure, 40-03 operator drawer/groups wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Status color namespace distinct from entity map palette, routed through the D-13 single-source pipeline'
    - 'Session-scoped Zustand view-state (no localStorage) mirroring the DevApiStatus modal slice, not the markets-collapsed persistence branch'

key-files:
  created: []
  modified:
    - src/styles/app.css
    - src/lib/colorBridge.ts
    - src/__tests__/lib/colorBridge.test.ts
    - src/stores/uiStore.ts
    - src/types/ui.ts

key-decisions:
  - "Status tokens hex (NOT OKLCH) so colorBridge's hex parser roundtrips; byte-identical to the map tokens they replace as status colors ⇒ zero-visual-change migration"
  - 'Hex-only colorBridge re-exports for status tokens — no readCssRGB tuple added (no deck.gl consumer per UI-SPEC)'
  - 'Collapse/drawer state session-scoped (no localStorage) — mirrors modal slice; drawer default closed (D-02a, destructive controls not screenshot-default-visible)'

patterns-established:
  - 'Operator-console status semantics live in their own --color-status-* namespace, decoupled from the entity --color-* palette'
  - 'toggleDevApiGroup uses the functional-updater spread shape set((s) => ({ devApiGroupCollapsed: { ...s.devApiGroupCollapsed, [slug]: !s.devApiGroupCollapsed[slug] } }))'

requirements-completed: [UI-POLISH-03]

# Metrics
duration: 6min
completed: 2026-06-04
---

# Phase 40 Plan 01: API Health Polish Foundation Summary

**3 semantic --color-status-\* tokens routed through the D-13 single-source pipeline (hex re-exports + byte-identity sentinels) plus session-scoped group-collapse + operator-drawer view-state added to uiStore — the unblocking foundation for the Plan 02/03 DevApiStatus restructure.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T17:09Z
- **Completed:** 2026-06-04T17:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Declared 3 operator-console status tokens (`--color-status-healthy` #22c55e, `--color-status-degraded` #f97316, `--color-status-warning` #eab308) in the app.css @theme block, byte-identical to the site/event/flight map tokens they replace as status colors (zero visual change).
- Re-exported the 3 tokens as hex constants in colorBridge.ts via `readCssHex` (hex only — no `readCssRGB` tuple, no deck.gl consumer), and extended the byte-identity sentinel test with shape-test coverage + 3 literal `#hex` assertions.
- Added session-scoped `devApiGroupCollapsed` (default `{}` ⇒ all groups expanded) + `isOperatorDrawerOpen` (default `false`) to uiStore with `toggleDevApiGroup`/`toggleOperatorDrawer`/`setOperatorDrawerOpen` actions, no localStorage, and declared all 5 members on the `UIState` type.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 3 status tokens through the D-13 single-source pipeline** - `3750880` (feat)
2. **Task 2: Add session-scoped group-collapse + operator-drawer state to uiStore + UIState type** - `2e0851d` (feat)

## Files Created/Modified

- `src/styles/app.css` - 3 new `--color-status-*` @theme tokens (operator-console status namespace)
- `src/lib/colorBridge.ts` - 3 hex re-exports `COLOR_STATUS_{HEALTHY,DEGRADED,WARNING}_HEX`
- `src/__tests__/lib/colorBridge.test.ts` - shape-test entries + 3 literal byte-identity sentinel assertions
- `src/stores/uiStore.ts` - `devApiGroupCollapsed` + `isOperatorDrawerOpen` state + 3 toggle/setter actions (session-scoped)
- `src/types/ui.ts` - 5 new `UIState` members declared adjacent to the DevApiStatus modal slice

## Decisions Made

- Status tokens declared as hex (not OKLCH) and byte-identical to the map tokens they replace, per the D-13 hex-roundtrip contract and the zero-visual-change migration goal.
- No `readCssRGB` tuple export for status tokens — there is no deck.gl consumer; they are HTML/CSS-only.
- Collapse/drawer state is session-scoped (no `localStorage`/`readBool`), mirroring the DevApiStatus modal slice rather than the `isMarketsCollapsed` persistence branch; drawer defaults closed (D-02a).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Status tokens + collapse/drawer view-state are declared and verified; Plans 02/03 can now consume them to migrate the DevApiStatus sparkline/tier-banner token names and wire the 4 collapsible groups + operator drawer.
- No DevApiStatus consumer was touched (Plan 02's file ownership), so the parallel-safe boundary holds.

## Verification

- `npx vitest run src/__tests__/lib/colorBridge.test.ts` → 91 passed (3 new byte-identity sentinels + shape coverage).
- `npx tsc --noEmit -p tsconfig.json` → exit 0 (uiStore satisfies `create<UIState>()`; 5 new members declared).
- `npx vitest run src/__tests__/devApiStatus.test.tsx` → 13 passed / 5 todo (no modal-render regression).
- grep confirmed no `localStorage`/`readBool` reference to `devApiGroupCollapsed` or `isOperatorDrawerOpen`.

## Self-Check: PASSED

- FOUND: src/styles/app.css (--color-status-healthy present)
- FOUND: src/lib/colorBridge.ts (3 COLOR*STATUS*\*\_HEX exports)
- FOUND: src/stores/uiStore.ts (devApiGroupCollapsed + isOperatorDrawerOpen + 3 actions)
- FOUND: src/types/ui.ts (5 new UIState members)
- FOUND commit: 3750880 (Task 1)
- FOUND commit: 2e0851d (Task 2)

---

_Phase: 40-dashboard-ui-ux-polish-subtab-consolidation_
_Completed: 2026-06-04_
