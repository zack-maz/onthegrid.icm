# Filter Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the filter panel with entity-scoped filters (Flights/Ships/Events sections), move it to the right side of the screen adjacent to the detail panel, and add ship-specific speed filtering.

**Architecture:** Split the flat filter store into entity-scoped fields (flight countries, event countries, flight speed, ship speed). Move FilterPanelSlot from the top-left overlay stack to absolute top-right positioning with CSS transition that shifts left when the detail panel opens. Restructure the panel UI into collapsible entity sections with proximity as a global top-level filter.

**Tech Stack:** React, Zustand, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-filter-panel-redesign-design.md`

---

### Task 1: Restructure filterStore with entity-scoped fields

**Files:**
- Modify: `src/stores/filterStore.ts`
- Modify: `src/__tests__/filterStore.test.ts`

- [ ] **Step 1: Update the test file for new field names and actions**

Replace the entire test file to match the new store shape. Key changes:
- `selectedCountries` → `flightCountries` / `eventCountries`
- `speedMin/speedMax` → `flightSpeedMin/flightSpeedMax`
- New: `shipSpeedMin/shipSpeedMax`
- `setCountries` → `setFlightCountries` / `setEventCountries`
- `addCountry` → `addFlightCountry` / `addEventCountry`
- `removeCountry` → `removeFlightCountry` / `removeEventCountry`
- `setSpeedRange` → `setFlightSpeedRange` / `setShipSpeedRange`
- `FilterKey` values: `'flightCountry' | 'eventCountry' | 'flightSpeed' | 'shipSpeed' | 'altitude' | 'proximity' | 'date'`
- `activeFilterCount` max = 7

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/filterStore.test.ts`
Expected: FAIL — old field names no longer match

- [ ] **Step 3: Update filterStore.ts with new fields and actions**

Changes to `src/stores/filterStore.ts`:
- Replace `FilterKey` type with: `'flightCountry' | 'eventCountry' | 'flightSpeed' | 'shipSpeed' | 'altitude' | 'proximity' | 'date'`
- Replace `selectedCountries: string[]` with `flightCountries: string[]` and `eventCountries: string[]`
- Replace `speedMin/speedMax` with `flightSpeedMin/flightSpeedMax`
- Add `shipSpeedMin: number | null` and `shipSpeedMax: number | null`
- Replace action `setCountries` with `setFlightCountries` and `setEventCountries`
- Replace `addCountry`/`removeCountry` with `addFlightCountry`/`removeFlightCountry` and `addEventCountry`/`removeEventCountry`
- Replace `setSpeedRange` with `setFlightSpeedRange` and `setShipSpeedRange`
- Update `clearFilter` switch to handle all 7 `FilterKey` values
- Update `clearAll` to reset all new fields
- Update `activeFilterCount` to count all 7 groups

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/filterStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/filterStore.ts src/__tests__/filterStore.test.ts
git commit -m "refactor: split filterStore into entity-scoped fields"
```

---

### Task 2: Update filter predicate for entity-scoped logic

**Files:**
- Modify: `src/lib/filters.ts`
- Modify: `src/__tests__/filters.test.ts`

- [ ] **Step 1: Update test file for entity-scoped filter behavior**

Update `makeDefaults()` to return the new `FilterState` shape:
- `flightCountries: []`, `eventCountries: []`
- `flightSpeedMin/flightSpeedMax: null`
- `shipSpeedMin/shipSpeedMax: null`
- All new action stubs (no-op functions)

Update all test cases:
- Country filter tests: use `flightCountries` for flight tests, `eventCountries` for event tests
- Speed filter tests: use `flightSpeedMin/flightSpeedMax` for flight tests
- Add new tests: ship speed uses `shipSpeedMin/shipSpeedMax`
- Add new tests: ships pass when `flightSpeedMin/flightSpeedMax` is set (flight speed doesn't affect ships)
- Add new tests: ships pass when `flightCountries` is set (flight country doesn't affect ships)
- Add new tests: events pass when `flightSpeedMin/flightSpeedMax` or `shipSpeedMin/shipSpeedMax` is set
- Combined filter tests: update field names

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/filters.test.ts`
Expected: FAIL — old field names

- [ ] **Step 3: Update entityPassesFilters in filters.ts**

Rewrite the predicate to use entity-scoped fields:

**Country filter section:**
- Flights: check against `filters.flightCountries` (case-insensitive match on `originCountry`)
- Events: check against `filters.eventCountries` (case-insensitive includes on `actor1`/`actor2`)
- Ships: always pass (no country data)

**Speed filter section — split into two blocks:**
- Flight speed: if `filters.flightSpeedMin !== null || filters.flightSpeedMax !== null`, only check `entity.type === 'flight'`. Convert `velocity` (m/s) to knots. Ships and events pass through.
- Ship speed: if `filters.shipSpeedMin !== null || filters.shipSpeedMax !== null`, only check `entity.type === 'ship'`. Use `speedOverGround` (already in knots). Flights and events pass through.

**Altitude filter:** unchanged (already only applies to flights)

**Proximity filter:** unchanged (applies to all)

**Date filter:** unchanged (already only applies to events)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/filters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/filters.ts src/__tests__/filters.test.ts
git commit -m "refactor: scope filter predicates by entity type"
```

---

### Task 3: Update useFilteredEntities hook, UI store, and dependent tests

**Files:**
- Modify: `src/hooks/useFilteredEntities.ts`
- Modify: `src/types/ui.ts`
- Modify: `src/stores/uiStore.ts`
- Modify: `src/__tests__/entityLayers.test.ts`
- Modify: `src/__tests__/StatusPanel.test.tsx`

- [ ] **Step 1: Update useFilteredEntities shallow selector**

In `src/hooks/useFilteredEntities.ts`, update the `useShallow` selector to pull:
```ts
flightCountries, eventCountries, flightSpeedMin, flightSpeedMax,
shipSpeedMin, shipSpeedMax, altitudeMin, altitudeMax,
proximityPin, proximityRadiusKm, dateStart, dateEnd
```

The rest of the hook (filter calls, return shape) stays the same — `entityPassesFilters` still takes full `FilterState`.

- [ ] **Step 2: Add filter section toggle state to UIState**

In `src/types/ui.ts`, add to `UIState` interface:
```ts
isFlightFiltersOpen: boolean;
isShipFiltersOpen: boolean;
isEventFiltersOpen: boolean;
toggleFlightFilters: () => void;
toggleShipFilters: () => void;
toggleEventFilters: () => void;
```

- [ ] **Step 3: Implement toggles in uiStore.ts**

Add defaults (all `true`) and toggle actions to the Zustand store:
```ts
isFlightFiltersOpen: true,
isShipFiltersOpen: true,
isEventFiltersOpen: true,
toggleFlightFilters: () => set((s) => ({ isFlightFiltersOpen: !s.isFlightFiltersOpen })),
toggleShipFilters: () => set((s) => ({ isShipFiltersOpen: !s.isShipFiltersOpen })),
toggleEventFilters: () => set((s) => ({ isEventFiltersOpen: !s.isEventFiltersOpen })),
```

- [ ] **Step 4: Update entityLayers.test.ts for new filter field names**

In `src/__tests__/entityLayers.test.ts`, find any `useFilterStore.setState(...)` calls that use old field names (`selectedCountries`, `speedMin`, `speedMax`) and update them to the new names (`flightCountries`, `flightSpeedMin`, `flightSpeedMax`, etc.).

- [ ] **Step 5: Update StatusPanel.test.tsx for new filter field names**

In `src/__tests__/StatusPanel.test.tsx`, find any `useFilterStore.setState(...)` calls that use old field names and update them to the new names.

- [ ] **Step 6: Run all tests to verify nothing breaks**

Run: `npx vitest run`
Expected: Failures only in `FilterPanel.test.tsx` (expected — that test uses old field names AND old panel structure, updated in Task 5). All other tests should pass.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useFilteredEntities.ts src/types/ui.ts src/stores/uiStore.ts src/__tests__/entityLayers.test.ts src/__tests__/StatusPanel.test.tsx
git commit -m "refactor: update useFilteredEntities selector, add filter section toggles, fix dependent tests"
```

---

### Task 4: Reposition FilterPanelSlot and restructure AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/FilterPanelSlot.tsx`
- Delete: `src/components/layout/FiltersSlot.tsx`

- [ ] **Step 1: Move FilterPanelSlot out of the top-left stack in AppShell**

In `src/components/layout/AppShell.tsx`:
- Remove `<FilterPanelSlot />` from the top-left flex column (line 33)
- Add `<FilterPanelSlot />` as a sibling to `<DetailPanelSlot />`, both absolutely positioned:

```tsx
{/* Right side: Filter panel + Detail panel */}
<FilterPanelSlot />
<DetailPanelSlot />
```

- [ ] **Step 2: Rewrite FilterPanelSlot with right-side positioning**

Replace the outer wrapper in `FilterPanelSlot` from `<div data-testid="filter-panel-slot">` to:
```tsx
<div
  data-testid="filter-panel-slot"
  className={`absolute top-4 z-[var(--z-controls)]
    transition-[right] duration-300 ease-in-out
    max-h-[calc(100vh-2rem)] overflow-y-auto
    ${isDetailPanelOpen ? 'right-[calc(var(--width-detail-panel)+1rem)]' : 'right-4'}`}
>
```

Read `isDetailPanelOpen` from uiStore:
```ts
const isDetailPanelOpen = useUIStore((s) => s.isDetailPanelOpen);
```

Keep `<OverlayPanel>` as the inner wrapper for visual styling.

- [ ] **Step 3: Delete the dead FiltersSlot.tsx**

```bash
rm src/components/layout/FiltersSlot.tsx
```

- [ ] **Step 4: Run dev server briefly to verify positioning**

Run: `npx vite --open` (manual check — filter panel appears top-right, shifts left when detail panel opens)

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/FilterPanelSlot.tsx
git rm src/components/layout/FiltersSlot.tsx
git commit -m "feat: reposition filter panel to right side with detail panel awareness"
```

---

### Task 5: Rebuild FilterPanelSlot internals with entity sections

**Files:**
- Modify: `src/components/layout/FilterPanelSlot.tsx`
- Modify: `src/__tests__/FilterPanel.test.tsx`

- [ ] **Step 1: Update FilterPanel.test.tsx for new panel structure**

Rewrite tests for:
- Collapsed state still shows "Filters" header
- Expanded state shows entity section headers: "Flights", "Ships", "Events"
- Proximity section appears at top level (outside entity sections)
- Badge count works with new `activeFilterCount` (max 7)
- "Clear all filters" still appears when filters active
- Entity sections are collapsible (click "Flights" collapses its contents)
- Update `beforeEach` to reset with new field names (`flightCountries`, `eventCountries`, etc.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/FilterPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Rewrite FilterPanelSlot internals**

Replace the flat filter list with structured sections. The component should:

1. Read all filter state from `useFilterStore` using new field names
2. Read section collapse state from `useUIStore` (`isFlightFiltersOpen`, etc.)
3. Derive `availableFlightCountries` from `useFlightStore` flights (`originCountry`)
4. Derive `availableEventCountries` from `useEventStore` events (`actor1`, `actor2`)
5. Render structure:
   - Header: "Filters (N)" with collapse toggle
   - When expanded:
     - **Proximity section** — `SectionHeader` + `ProximityFilter` (unchanged)
     - **Flights section** — clickable header to expand/collapse, contains:
       - Country: `CountryFilter` with `flightCountries` + `availableFlightCountries`
       - Speed: `RangeSlider` (0-700 kn) with `flightSpeedMin/flightSpeedMax`
       - Altitude: `RangeSlider` (0-60000 ft) with `altitudeMin/altitudeMax`
     - **Ships section** — clickable header to expand/collapse, contains:
       - Speed: `RangeSlider` (0-30 kn) with `shipSpeedMin/shipSpeedMax`
     - **Events section** — clickable header to expand/collapse, contains:
       - Country: `CountryFilter` with `eventCountries` + `availableEventCountries`
       - Date Range: `DateRangeFilter` with `dateStart/dateEnd`
     - "Clear all filters" button (when activeCount > 0)

Entity section headers: clickable `<button>` with chevron (right arrow when collapsed, down arrow when expanded) + label. Use `text-xs font-semibold uppercase tracking-wider text-text-secondary` to match existing style. No clear button on section headers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/FilterPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/FilterPanelSlot.tsx src/__tests__/FilterPanel.test.tsx
git commit -m "feat: restructure filter panel with entity-scoped sections"
```

---

### Task 6: Final verification and cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify no dead imports referencing old field names**

Search for old names that should be gone:
```
grep -rE "selectedCountries|[^a-zA-Z]speedMin|[^a-zA-Z]speedMax|setCountries|[^a-zA-Z]addCountry|[^a-zA-Z]removeCountry|[^a-zA-Z]setSpeedRange|clearFilter\('country'\)|clearFilter\('speed'\)" src/ --include="*.ts" --include="*.tsx"
```

Expected: No matches (all renamed to entity-scoped versions, old FilterKey literals replaced). If any remain, fix them.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: clean up remaining references to old filter field names"
```
