# Phase 19: Search, Filter & UI Cleanup - Research

**Researched:** 2026-03-22
**Domain:** React UI restructuring, fuzzy search, drag-and-drop, Zustand state management
**Confidence:** HIGH

## Summary

Phase 19 is a major UI restructure that replaces the current floating overlay panels with a sidebar + topbar layout, adds a Cmd+K command palette for global entity search, makes the markets panel draggable, and applies visual polish (ship color change, time relocation). This is entirely client-side work with no server changes.

The codebase already has strong foundations: all entity stores are Zustand-based with consistent patterns, `filterStore` already has `clearAll()` and `activeFilterCount()`, `OverlayPanel` provides reusable panel chrome, and the `FlyToHandler` pattern in `BaseMap.tsx` demonstrates how to trigger map animations from store state. The `useSelectedEntity` hook already does cross-store entity lookup by ID, which is the exact pattern search results need.

**Primary recommendation:** Structure this as four waves: (1) topbar + sidebar shell with component migration, (2) Cmd+K search modal with fuzzy matching, (3) search/filter unification + entity dimming, (4) draggable markets + ship color change + polish pass.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Left edge slide-out sidebar with thin icon strip always visible when collapsed
- Icon strip has one icon per section (counters, layers, filters) -- clicking opens sidebar scrolled to that section
- Expanded sidebar is ~280px, overlays the map (no map resize)
- Contains: Counters section, Layers section, Filters section -- each expandable/collapsible internally
- Coexists with right-side detail panel -- both can be open simultaneously
- Remove "Iranian flights" counter; keep all other counters (Flights, Unidentified, Airstrikes, Ground Combat, Targeted, Fatalities)
- Layers section stays at bottom of sidebar for now
- Full-width topbar spanning viewport, same backdrop-blur style as OverlayPanel
- Left: "Iran Conflict Monitor" title with status dropdown (connection health dots + total count per data source)
- Center: Cmd+K search hint (magnifying glass icon + "Cmd+K" badge) -- clicking also opens search modal
- Right: Notification bell button (moved from floating position)
- Current time moved OUT of status section, into bottom-left alongside zoom controls and coordinates
- Cmd+K opens a centered modal/palette (Spotlight-style), NOT an inline search bar
- Results displayed as grouped list by entity type (Flights, Ships, Events, Sites) with type headers
- Searchable by any tag/field of any entity
- Dual behavior: Enter on query = filter mode; Click specific result = fly-to + open detail
- Search and filters are two views of the same state
- Non-matching entities are grayed out + transparent + unhoverable but still clickable
- Active search/filter clearable via filter chip in sidebar OR Escape key / clear icon in search
- Escape priority: search filter first, then detail panel
- Markets panel remains floating, draggable to any position, free-float (no snapping)
- Default position: top-right, position persisted to localStorage, reset position button
- Ship color changed from gray (#9ca3af) to soft purple (#a78bfa / violet-400)
- Current time moved from StatusPanel to bottom-left corner
- Polish pass: consistent font sizes, spacing alignment, opacity/blur consistency

### Claude's Discretion
- Icon choices for sidebar strip (counters, layers, filter icons)
- Sidebar expand/collapse animation timing and easing
- Search modal dimensions and max result count
- Fuzzy matching algorithm implementation
- How filter chips display in sidebar when search-as-filter is active
- Escape key priority resolution
- Drag handle design for markets panel
- Polish pass specifics

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRCH-01 | User can search across all entity types via Cmd+K global search bar with fuzzy matching and fly-to-entity on selection | Cross-store search via all 4 entity stores, FlyToHandler pattern for map animation, client-side substring/token matching |
| SRCH-02 | User can reset all active filters with a single "Reset All" button | filterStore.clearAll() already exists; extend to also clear search query state |
| SRCH-03 | Filter panel has grouped sections with scrollable layer toggles and visual hierarchy | Sidebar container with collapsible sections, reusing existing CountersSlot/LayerTogglesSlot/FilterPanelSlot content |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.1.0 | UI components | Already in project |
| Zustand | ^5.0.11 | State management | Curried `create<T>()()` pattern throughout project |
| Tailwind CSS | ^4.2.1 | Styling | CSS-first @theme config, already used everywhere |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A (built-in) | -- | Fuzzy matching | Simple substring/token matching is sufficient for ~100-500 entities |
| N/A (CSS) | -- | Drag & drop | Pointer events API for draggable markets panel |
| N/A (CSS) | -- | Animations | CSS transitions for sidebar slide, modal fade |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom substring search | fuse.js | Overkill for <500 entities; adds 15KB bundle; simple includes() on entity fields is fast enough |
| Custom drag | @dnd-kit/core | Overkill for single draggable panel; pointer events API is simpler and zero-dependency |
| cmdk library | Custom modal | cmdk is great for larger apps, but this is a single search input + grouped results; custom keeps it lightweight |

**Installation:**
```bash
# No new dependencies needed. All UI work uses existing stack.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx          # Major restructure: Topbar + Sidebar + Map + DetailPanel
│   │   ├── Topbar.tsx            # NEW: full-width topbar
│   │   ├── Sidebar.tsx           # NEW: left sidebar with icon strip + expandable sections
│   │   ├── SidebarSection.tsx    # NEW: reusable collapsible section wrapper
│   │   ├── StatusDropdown.tsx    # NEW: topbar status dropdown (refactored from StatusPanel)
│   │   ├── CountersSlot.tsx      # MODIFY: extract content for sidebar embedding
│   │   ├── LayerTogglesSlot.tsx  # MODIFY: extract content for sidebar embedding
│   │   ├── FilterPanelSlot.tsx   # MODIFY: extract content for sidebar embedding
│   │   ├── MarketsSlot.tsx       # MODIFY: add drag behavior
│   │   └── DetailPanelSlot.tsx   # Minor: Escape key priority change
│   ├── search/
│   │   ├── SearchModal.tsx       # NEW: Cmd+K Spotlight-style modal
│   │   ├── SearchResultGroup.tsx # NEW: grouped results by entity type
│   │   └── SearchResultItem.tsx  # NEW: individual result row
│   └── ui/
│       ├── OverlayPanel.tsx      # Unchanged (reused for sidebar/topbar chrome)
│       └── FilterChip.tsx        # NEW: active search/filter indicator
├── stores/
│   ├── searchStore.ts            # NEW: search query + matched entity IDs + filter-mode state
│   └── uiStore.ts                # EXTEND: sidebar open/collapsed, search modal open
├── hooks/
│   └── useSearchResults.ts       # NEW: cross-store entity search with fuzzy matching
└── lib/
    └── searchUtils.ts            # NEW: pure search/matching functions
```

### Pattern 1: Search Store (new Zustand store)
**What:** Central store for search query, search-as-filter mode, and matched entity IDs
**When to use:** Any time search or filter state is read or written
**Example:**
```typescript
// src/stores/searchStore.ts
import { create } from 'zustand';

interface SearchState {
  query: string;
  isSearchModalOpen: boolean;
  isFilterMode: boolean; // true when Enter was pressed (filter mode vs single-result mode)
  matchedIds: Set<string>; // entity IDs matching current query

  setQuery: (query: string) => void;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  applyAsFilter: () => void;
  clearSearch: () => void;
  setMatchedIds: (ids: Set<string>) => void;
}
```

### Pattern 2: Cross-Store Entity Search
**What:** Hook that reads all 4 entity stores and searches across all fields
**When to use:** When populating search results
**Example:**
```typescript
// Reads from flightStore, shipStore, eventStore, siteStore
// Returns results grouped by type: { flights: [...], ships: [...], events: [...], sites: [...] }
// Each result includes: entity, matchField (which field matched), matchValue (the matched text)
```

### Pattern 3: Sidebar with Icon Strip (VS Code Activity Bar pattern)
**What:** Thin (~48px) always-visible icon strip on left edge; clicking icon expands full sidebar (~280px) scrolled to that section
**When to use:** Main navigation
**Example:**
```typescript
// Sidebar state in uiStore:
// isSidebarOpen: boolean
// activeSidebarSection: 'counters' | 'layers' | 'filters' | null
//
// Clicking icon when sidebar closed: open + scroll to section
// Clicking icon when sidebar open on different section: scroll to section
// Clicking icon when sidebar open on same section: close sidebar
```

### Pattern 4: Draggable Panel (Pointer Events)
**What:** Markets panel becomes draggable via pointer events
**When to use:** MarketsSlot component
**Example:**
```typescript
// Uses onPointerDown/onPointerMove/onPointerUp
// Stores { x, y } position in localStorage
// Constrains to viewport bounds
// Reset button returns to default top-right position
```

### Pattern 5: FlyTo from Search Results
**What:** Reuse existing `notificationStore.setFlyToTarget()` pattern
**When to use:** When user clicks a specific search result
**Example:**
```typescript
// On result click:
// 1. notificationStore.setFlyToTarget({ lng, lat, zoom: 10 })
// 2. uiStore.selectEntity(entity.id)
// 3. uiStore.openDetailPanel()
// 4. searchStore.closeSearchModal()
// FlyToHandler in BaseMap.tsx already watches and animates
```

### Pattern 6: Entity Dimming for Search/Filter Mode
**What:** When search-as-filter is active, non-matching entities render at low alpha and are not hoverable
**When to use:** When `searchStore.isFilterMode` is true and `matchedIds` is non-empty
**Example:**
```typescript
// In useEntityLayers:
// const isFilterActive = useSearchStore(s => s.isFilterMode && s.matchedIds.size > 0);
// const matchedIds = useSearchStore(s => s.matchedIds);
//
// getColor accessor checks: if isFilterActive && !matchedIds.has(d.id) => alpha = 15
// pickable per-entity: matched entities pickable, non-matched still clickable but not hoverable
```

### Anti-Patterns to Avoid
- **Don't resize the map for sidebar:** Per locked decision, sidebar overlays the map. Using absolute positioning with z-index, not flex layout that would reflow the map container.
- **Don't use a search library:** With <500 entities, `String.includes()` on concatenated entity fields is sub-millisecond. fuse.js adds complexity and bundle size for no benefit.
- **Don't couple search to filterStore:** Search-as-filter is a separate concept from the existing filter predicates (country, speed, altitude, proximity, date range). The search store should hold `matchedIds` and the layer rendering code should dim non-matches. Don't try to convert search queries into filterStore predicates.
- **Don't break existing Escape key behavior:** Must implement priority: search modal > search filter mode > notification dropdown > detail panel.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyboard shortcut detection | Custom keydown handler | Standard `useEffect` + `e.metaKey && e.key === 'k'` | Straightforward, covers Cmd+K and Ctrl+K |
| Panel dragging | Custom drag library | Pointer events API (`onPointerDown`/`Move`/`Up` with `setPointerCapture`) | Native browser API, handles edge cases (pointer capture prevents stuck drag state) |
| Scroll to section | IntersectionObserver tracking | `element.scrollIntoView({ behavior: 'smooth' })` | Built-in, works reliably for sidebar sections |
| Fly to entity | Custom map animation | `notificationStore.setFlyToTarget()` (already exists) | FlyToHandler in BaseMap.tsx already implements this |
| Filter reset | Custom per-filter clearing | `filterStore.clearAll()` (already exists) | Already handles savedToggles restoration |

**Key insight:** The codebase already has 90% of the infrastructure needed. The main new work is (1) the sidebar/topbar layout shell, (2) the search modal + matching logic, and (3) wiring search-as-filter into the layer rendering pipeline.

## Common Pitfalls

### Pitfall 1: Escape Key Conflicts
**What goes wrong:** Multiple components listen for Escape: DetailPanelSlot, NotificationBell dropdown, and now SearchModal + search filter mode.
**Why it happens:** Each component independently adds `keydown` event listeners.
**How to avoid:** Implement a priority stack: (1) search modal open -> closes modal, (2) search filter active -> clears filter, (3) notification dropdown open -> closes dropdown, (4) detail panel open -> closes panel. Use `e.stopPropagation()` or a centralized handler. Simplest approach: check states in order within a single global handler, or have higher-priority listeners call `e.stopImmediatePropagation()`.
**Warning signs:** Pressing Escape closes the wrong thing.

### Pitfall 2: Re-render Storms from Cross-Store Subscriptions
**What goes wrong:** Search hook subscribes to 4 entity stores + searchStore; every flight poll (5s) triggers re-search.
**Why it happens:** `useMemo` dependencies change on every poll cycle when entity arrays are replaced.
**How to avoid:** Only compute search results when `query` changes, not when entity data changes. Use `useRef` for entity data and only re-compute when query string changes. Or debounce the search computation. For filter-mode dimming, the `matchedIds` Set is stable between re-renders if query hasn't changed.
**Warning signs:** Typing in search feels laggy; React DevTools shows excessive renders.

### Pitfall 3: Sidebar Layout Collision with Detail Panel
**What goes wrong:** Both sidebar (left, 280px) and detail panel (right, 360px) can be open simultaneously on smaller screens, leaving very little map visible.
**Why it happens:** Both overlay the map with absolute positioning.
**How to avoid:** This is acceptable per user's locked decision (both can coexist). But ensure the sidebar z-index is below the detail panel z-index. The sidebar should use `--z-controls` (30) and the detail panel already uses `--z-panel` (20), so sidebar should be at `--z-controls`. Topbar should also be at `--z-controls`.
**Warning signs:** Panels overlap each other instead of coexisting.

### Pitfall 4: Stale Search Results After Entity Data Changes
**What goes wrong:** User searches "Iran", matches 5 flights. One minute later, flights refresh and the Iranian flights have new IDs. Filter mode still has old IDs in matchedIds.
**Why it happens:** matchedIds is a Set of entity IDs computed at search time, but entity IDs change on each poll.
**How to avoid:** Re-run the search query against current entities whenever entity data changes (but only if filter mode is active). Use `useMemo` with entity arrays as deps. This seems to contradict Pitfall 2, but the resolution is: for the modal results list, only recompute on query change (user types). For filter-mode matchedIds, recompute on entity data change (so dimming stays correct as data refreshes).
**Warning signs:** Entities that should be highlighted revert to dimmed state after a poll cycle.

### Pitfall 5: Markets Panel Dragging Breaks on Touch Devices
**What goes wrong:** Touch events don't fire pointer events correctly without `touch-action: none`.
**Why it happens:** Browser default touch behavior (scroll, pinch) interferes with drag.
**How to avoid:** Use `touch-action: none` CSS on the drag handle, and `setPointerCapture()` on pointer down. This ensures all move/up events go to the capturing element.
**Warning signs:** Dragging works with mouse but not on mobile.

### Pitfall 6: Search Modal Not Receiving Focus
**What goes wrong:** Cmd+K opens modal but input isn't focused, user has to click.
**Why it happens:** React renders the modal but focus isn't set.
**How to avoid:** Use `useEffect` with `inputRef.current?.focus()` when modal opens. Use `autoFocus` prop as backup.
**Warning signs:** User presses Cmd+K and starts typing but nothing appears in search input.

## Code Examples

Verified patterns from existing codebase:

### Zustand Store Pattern (project convention)
```typescript
// Source: src/stores/filterStore.ts (existing pattern)
import { create } from 'zustand';

interface SearchState {
  query: string;
  isSearchModalOpen: boolean;
  isFilterMode: boolean;
  matchedIds: Set<string>;
  // ... actions
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  isSearchModalOpen: false,
  isFilterMode: false,
  matchedIds: new Set<string>(),
  // ... action implementations
}));
```

### FlyTo Pattern (existing)
```typescript
// Source: src/components/map/BaseMap.tsx
// FlyToHandler watches notificationStore.flyToTarget and calls map.flyTo()
// Reuse this exact pattern for search result fly-to:
import { useNotificationStore } from '@/stores/notificationStore';

// In search result click handler:
useNotificationStore.getState().setFlyToTarget({
  lng: entity.lng,
  lat: entity.lat,
  zoom: 10,
});
useUIStore.getState().selectEntity(entity.id);
useUIStore.getState().openDetailPanel();
```

### Cross-Store Entity Lookup (existing)
```typescript
// Source: src/hooks/useSelectedEntity.ts
// Pattern: read from all 4 stores, find by ID
const found =
  flights.find((f) => f.id === selectedId) ??
  ships.find((s) => s.id === selectedId) ??
  events.find((e) => e.id === selectedId) ??
  sites.find((s) => s.id === selectedId) ??
  null;
```

### OverlayPanel Chrome (existing)
```typescript
// Source: src/components/ui/OverlayPanel.tsx
// Reuse for topbar and sidebar styling
<div className="rounded-lg border border-border bg-surface-overlay px-4 py-3 shadow-lg backdrop-blur-sm">
  {children}
</div>
```

### Entity Field Access for Search
```typescript
// Source: server/types.ts + src/components/layout/DetailPanelSlot.tsx
// Flight searchable fields: callsign, icao24, originCountry, label
// Ship searchable fields: shipName, mmsi, label
// Event searchable fields: eventType, actor1, actor2, locationName, cameoCode, label
// Site searchable fields: label, siteType, operator
```

### Pointer Events Drag Pattern
```typescript
// Standard browser pattern for drag
function useDraggable(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 260, e.clientX - dragStart.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragStart.current.y)),
    });
  };

  const onPointerUp = () => { dragStart.current = null; };

  return { pos, onPointerDown, onPointerMove, onPointerUp };
}
```

### Cmd+K Global Shortcut
```typescript
// Standard pattern for global keyboard shortcut
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearchModal();
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Floating overlay panels | Sidebar + topbar layout | Phase 19 | Major layout restructure |
| TitleSlot separate panel | Title in topbar | Phase 19 | Title moves from floating panel to topbar left |
| StatusPanel separate panel | Status dropdown in topbar | Phase 19 | Compact status into dropdown under title |
| CountersSlot floating | Counters section in sidebar | Phase 19 | Moves into sidebar |
| FilterPanelSlot floating right | Filters section in sidebar | Phase 19 | Moves from right side to left sidebar |
| No search | Cmd+K search modal | Phase 19 | New feature |
| Gray ships (#9ca3af) | Purple ships (#a78bfa) | Phase 19 | Visual change |

**Deprecated/outdated after Phase 19:**
- `TitleSlot.tsx` -- content absorbed into `Topbar.tsx`
- `StatusPanel.tsx` -- refactored into `StatusDropdown.tsx` in topbar
- Current `AppShell.tsx` layout -- completely restructured

## Open Questions

1. **Search result limit and performance**
   - What we know: Entity counts are typically <500 total across all types. Simple string matching is fast.
   - What's unclear: Whether to cap results at e.g. 50 per type in the modal display.
   - Recommendation: Cap at 10 results per entity type group (40 total max displayed). This keeps the modal compact and is plenty for visual scanning.

2. **Search query -> filter bidirectionality**
   - What we know: User decision says "search populates filters, filter settings populate search bar text."
   - What's unclear: How to represent complex filter state (e.g., speed range 200-400kn + country Iran) as a search bar text string.
   - Recommendation: For v1, unidirectional: search query populates filter (matchedIds). Existing filterStore filters remain independent. Show active search as a chip in the sidebar filters section. Full bidirectional would require a query language, which is overengineering for this phase.

3. **Entity ID stability during polls**
   - What we know: Flight IDs use icao24, ship IDs use MMSI, event IDs use date+code+coords hash, site IDs use OSM ID.
   - What's unclear: Whether flight/ship IDs are stable across polls (they should be, since they're derived from transponder IDs).
   - Recommendation: IDs are stable (icao24-based for flights, MMSI-based for ships). matchedIds will remain valid across polls for the same physical entity.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 with jsdom |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01a | Cmd+K opens search modal | unit (component) | `npx vitest run src/__tests__/SearchModal.test.tsx -x` | Wave 0 |
| SRCH-01b | Search matches entities across all stores | unit (hook) | `npx vitest run src/__tests__/useSearchResults.test.ts -x` | Wave 0 |
| SRCH-01c | Clicking result flies to entity + opens detail | unit (component) | `npx vitest run src/__tests__/SearchModal.test.tsx -x` | Wave 0 |
| SRCH-02 | Reset All clears search + filters | unit (store) | `npx vitest run src/__tests__/searchStore.test.ts -x` | Wave 0 |
| SRCH-03a | Sidebar renders with grouped sections | unit (component) | `npx vitest run src/__tests__/Sidebar.test.tsx -x` | Wave 0 |
| SRCH-03b | Topbar renders title + status + search hint + bell | unit (component) | `npx vitest run src/__tests__/Topbar.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/SearchModal.test.tsx` -- covers SRCH-01a, SRCH-01c
- [ ] `src/__tests__/useSearchResults.test.ts` -- covers SRCH-01b (cross-store fuzzy matching)
- [ ] `src/__tests__/searchStore.test.ts` -- covers SRCH-02 (reset all clears search state)
- [ ] `src/__tests__/Sidebar.test.tsx` -- covers SRCH-03a (sidebar sections render)
- [ ] `src/__tests__/Topbar.test.tsx` -- covers SRCH-03b (topbar elements render)
- [ ] Update `src/__tests__/AppShell.test.tsx` -- existing test must be updated for new layout structure

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/stores/filterStore.ts` -- existing clearAll(), activeFilterCount() patterns
- Codebase analysis: `src/stores/uiStore.ts` -- existing toggle/collapse state patterns
- Codebase analysis: `src/hooks/useSelectedEntity.ts` -- cross-store entity lookup pattern
- Codebase analysis: `src/hooks/useEntityLayers.ts` -- entity rendering with alpha dimming (DIM_ALPHA = 40)
- Codebase analysis: `src/components/map/BaseMap.tsx` -- FlyToHandler pattern for map animation
- Codebase analysis: `src/stores/notificationStore.ts` -- FlyToTarget interface and setFlyToTarget action
- Codebase analysis: `server/types.ts` -- complete entity type definitions with all searchable fields
- Codebase analysis: `src/styles/app.css` -- z-index scale (--z-map:0, --z-overlay:10, --z-panel:20, --z-controls:30, --z-modal:40)

### Secondary (MEDIUM confidence)
- MDN Web Docs: Pointer Events API for drag implementation
- MDN Web Docs: `Element.setPointerCapture()` for reliable drag handling
- MDN Web Docs: `Element.scrollIntoView()` for sidebar section scrolling

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries
- Architecture: HIGH -- patterns derived directly from existing codebase conventions
- Pitfalls: HIGH -- identified from code review of actual event listeners and store subscriptions
- Search implementation: HIGH -- entity counts are small (<500), simple matching is sufficient

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable -- no external dependencies changing)
