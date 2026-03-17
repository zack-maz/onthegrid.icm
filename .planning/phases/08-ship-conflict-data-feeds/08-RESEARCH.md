# Phase 8: Ship & Conflict Data Feeds - Research

**Researched:** 2026-03-16
**Domain:** Frontend data stores, polling hooks, entity layer wiring, HUD status panel
**Confidence:** HIGH

## Summary

Phase 8 is primarily a **frontend wiring phase** -- the server-side adapters (AISStream WebSocket for ships, ACLED REST for conflict events) and their Express routes (`/api/ships`, `/api/events`) are fully implemented and tested. The work involves creating two new Zustand stores (`shipStore`, `eventStore`), two new polling hooks (`useShipPolling`, `useEventPolling`), replacing the `SourceSelector` dropdown with a compact HUD status panel, wiring real store data into the existing stubbed entity layers in `useEntityLayers`, and expanding the ACLED query from Iran-only to the Greater Middle East region.

The existing `flightStore` and `useFlightPolling` provide exact templates for the new stores and hooks. All patterns (recursive setTimeout, tab visibility, stale thresholds, `CacheResponse<T>`, `ConnectionStatus`, curried Zustand `create<T>()()`) are established and battle-tested. The `useEntityLayers` hook already has ship/drone/missile IconLayers with correct icons, colors, and sizing -- they just have `data: []` that needs replacing with store selectors.

**Primary recommendation:** Follow the established patterns exactly -- clone `flightStore`/`useFlightPolling` structure for ships and events, with parameters adjusted per data source characteristics. The ACLED country expansion should use the pipe-separated `country` parameter (e.g., `country=Iran|Iraq|Syria|...`) rather than the `region` parameter, because ACLED's "Middle East" region (code 11) does not include all countries in the Greater Middle East bounding box.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Frontend polls `/api/ships` every 30 seconds (recursive setTimeout, same pattern as flights)
- Ships use full-replace on each poll -- server accumulates via WebSocket Map, frontend replaces atomically
- Stale threshold: 120 seconds (2x poll interval) -- if no fresh WebSocket messages for 4 polls, clear ships
- Tab visibility aware: pause polling on hidden, immediate fetch on visible (same as flights)
- Frontend polls `/api/events` every 5 minutes (matches 5-min server cache TTL)
- Events persist until next successful fetch -- no stale clearing (historical data doesn't "go stale")
- No special data-age indicator -- user understands ACLED is retrospective
- Tab visibility aware: same pause/resume pattern
- Expand ACLED query to Greater Middle East region (multiple countries, not just Iran) to match expanded flight coverage
- Remove SourceSelector dropdown entirely -- no source switching UI
- Backend keeps adsb.lol as default flight source, multi-source support preserved but not exposed
- Replace with clean HUD-style status panel in top-right: three lines showing colored dot + count + entity type
- Color-coded dots: green=connected, yellow=stale, red=error (per data feed)
- Loading state: gray pulsing dot + '--' instead of count (indicates loading without misleading 0)
- Format: `● 247 flights` / `● 42 ships` / `● 17 events`
- Separate Zustand stores: `shipStore.ts` + `eventStore.ts` alongside existing `flightStore.ts`
- Same curried `create<T>()()` pattern, each store owns its data, connectionStatus, count, lastFresh
- Separate polling hooks: `useShipPolling.ts` + `useEventPolling.ts` (same recursive setTimeout pattern)
- All three polling hooks called in AppShell (alongside existing useFlightPolling)
- Wire real store data into existing stubbed entity layers in useEntityLayers (replace `data: []` with store selectors)
- Static layers (ship/drone/missile) become dynamic -- need useMemo deps on store data

### Claude's Discretion
- EventStore interface details (whether to track separate connectionStatus or simplified version)
- How to expand ACLED query to multiple countries (country list, bbox filter, or region param)
- Status panel component implementation (new component vs refactor of SourceSelector)
- Whether to remove SourceSelector.tsx entirely or gut and repurpose it
- How to handle missing AISStream API key gracefully on frontend (show error status or hide ships line)
- FlightStore simplification (remove activeSource/setActiveSource if source switching UI is gone)

### Deferred Ideas (OUT OF SCOPE)
- Source switching UI -- may return in a future phase if users want to toggle between flight sources
- Ship type classification (cargo, tanker, military) -- would need additional AIS data fields
- Conflict event filtering by type (missiles vs drones) -- belongs in Phase 9 (layer controls)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-02 | Ship tracking via AIS data (~30-60s refresh) | ShipStore + useShipPolling (30s interval) polling `/api/ships`, wired into ship IconLayer in useEntityLayers. Server adapter (AISStream WebSocket) and route already complete. |
| DATA-03 | Conflict event data via ACLED API (1-5 min polling) | EventStore + useEventPolling (5min interval) polling `/api/events`, wired into drone/missile IconLayers in useEntityLayers. ACLED adapter needs country expansion; route already complete. |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.x | State management for ship/event stores | Already used for flightStore, uiStore, mapStore |
| React | 19.x | Hooks for polling (useEffect, useRef) | Already the project framework |
| Deck.gl | 9.x | IconLayer for entity rendering | Already used for flights layer |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | 4.x | Status panel styling | HUD panel layout and dot colors |
| Vitest | 3.x | Testing stores, hooks, components | All new code needs tests |
| @testing-library/react | 16.x | Component and hook testing | useShipPolling, useEventPolling, StatusPanel |

### No New Dependencies
This phase requires **zero new npm packages**. Everything needed is already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── stores/
│   ├── flightStore.ts     # existing -- no changes needed
│   ├── shipStore.ts        # NEW: ship data + connection status
│   └── eventStore.ts       # NEW: conflict event data + connection status
├── hooks/
│   ├── useFlightPolling.ts # existing -- no changes needed
│   ├── useShipPolling.ts   # NEW: 30s recursive setTimeout for /api/ships
│   ├── useEventPolling.ts  # NEW: 300s recursive setTimeout for /api/events
│   └── useEntityLayers.ts  # MODIFY: replace data:[] with store selectors
├── components/
│   ├── layout/
│   │   └── AppShell.tsx    # MODIFY: add useShipPolling + useEventPolling calls
│   └── ui/
│       ├── StatusPanel.tsx  # NEW: replaces SourceSelector
│       └── SourceSelector.tsx # DELETE
server/
├── adapters/
│   └── acled.ts            # MODIFY: expand country parameter
```

### Pattern 1: Zustand Store (Curried Create)
**What:** Each data feed owns its own store with identical shape
**When to use:** For shipStore and eventStore
**Example:**
```typescript
// Source: existing src/stores/flightStore.ts (template)
import { create } from 'zustand';
import type { ShipEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface ShipState {
  ships: ShipEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  lastFresh: number | null;
  shipCount: number;
  setShipData: (response: CacheResponse<ShipEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
  clearStaleData: () => void;
}

export const useShipStore = create<ShipState>()((set, get) => ({
  ships: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  lastFresh: null,
  shipCount: 0,
  setShipData: (response) =>
    set({
      ships: response.data,
      shipCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
    }),
  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
  clearStaleData: () =>
    set({ ships: [], shipCount: 0, connectionStatus: 'error' }),
}));
```

### Pattern 2: Polling Hook (Recursive setTimeout)
**What:** Behavior-only hook with tab visibility awareness
**When to use:** For useShipPolling and useEventPolling
**Example:**
```typescript
// Source: existing src/hooks/useFlightPolling.ts (template)
// Key differences per hook:
// - useShipPolling: URL=/api/ships, interval=30_000, staleThreshold=120_000
// - useEventPolling: URL=/api/events, interval=300_000, NO stale threshold (events don't go stale)
```

### Pattern 3: EventStore (Simplified -- No Stale Clearing)
**What:** ACLED events are historical, so they never "go stale"
**When to use:** eventStore specifically
**Recommendation:** Track full `ConnectionStatus` (connected/stale/error/loading) for the status panel dot color, but do NOT clear data on staleness. The `stale` status means "server cache was stale when fetched" -- this is informational, not a reason to clear events. No `clearStaleData` action needed. No stale threshold check in the polling hook.

### Pattern 4: Dynamic Entity Layers (Replace Static)
**What:** Ship/drone/missile layers switch from `data: []` to store selectors
**When to use:** In useEntityLayers refactor
**Key change:** The current `staticLayers` useMemo with `[]` deps must be split -- ship layer gets its own useMemo with `[ships]` dep, and drone/missile layers get `[events]` dep. Each needs separate data filtering (events split by `type === 'drone'` vs `type === 'missile'`).

```typescript
// Current (static):
const staticLayers = useMemo(() => { ... }, []);

// New (dynamic):
const ships = useShipStore((s) => s.ships);
const events = useEventStore((s) => s.events);

const drones = useMemo(() => events.filter(e => e.type === 'drone'), [events]);
const missiles = useMemo(() => events.filter(e => e.type === 'missile'), [events]);

// Each layer in its own useMemo with correct deps
const shipLayer = useMemo(() => new IconLayer<ShipEntity>({
  id: 'ships',
  data: ships,
  // ... rest same as current
}), [ships]);
```

### Anti-Patterns to Avoid
- **Single shared store for all data feeds:** Each feed has different staleness rules, polling intervals, and connection states. Separate stores prevent cross-contamination.
- **setInterval instead of recursive setTimeout:** Risk of overlapping async calls if a fetch takes longer than the interval.
- **Merging ship data by MMSI on frontend:** Server already accumulates via WebSocket Map -- frontend does full replace.
- **Clearing events on staleness:** ACLED data is historical. "Stale" cache just means the 5-min server cache expired, not that the events are invalid.
- **Keeping SourceSelector code around:** Delete it cleanly. The multi-source backend remains; only the frontend selector UI is removed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling with backoff | Custom retry logic | Same recursive setTimeout pattern | Proven pattern in useFlightPolling, no exponential backoff needed |
| Tab visibility management | Custom focus detection | `document.visibilitychange` event | Standard browser API, same as existing hooks |
| State management | React context or custom pub/sub | Zustand stores | Already the project standard, minimal boilerplate |
| Entity type filtering | Complex layer configuration | Simple `.filter()` on events array | ConflictEventEntity.type is already 'drone' or 'missile' |

**Key insight:** This phase is 95% pattern replication from existing code. The only genuinely new logic is the ACLED country expansion and the status panel component.

## Common Pitfalls

### Pitfall 1: ConnectionStatus Import Collision
**What goes wrong:** `ConnectionStatus` type is currently defined in `flightStore.ts`. Importing it in shipStore/eventStore creates a dependency on flightStore.
**Why it happens:** The type was defined inline in flightStore because it was the only store that needed it.
**How to avoid:** Either re-export from a shared types file (e.g., `src/types/entities.ts`) or define the type independently in each store. Given the project already re-exports server types, extracting to a shared location is cleaner.
**Warning signs:** Circular import errors or TypeScript compilation failures.

### Pitfall 2: Entity Layer useMemo Dependencies
**What goes wrong:** Ship/event layers don't update when store data changes because useMemo deps are wrong.
**Why it happens:** The current `staticLayers` useMemo has empty `[]` deps by design (data was always empty). When switching to real data, forgetting to add the data array as a dependency means the layer never re-renders.
**How to avoid:** Each layer that uses store data must include that data in its useMemo dependency array. Ship layer depends on `[ships]`, drone/missile layers depend on `[drones]`/`[missiles]` (filtered arrays).
**Warning signs:** Entity icons appearing once and never updating, or not appearing at all after data loads.

### Pitfall 3: Ship Layer Angle Calculation
**What goes wrong:** Ship icons point the wrong direction or show `NaN` rotation.
**Why it happens:** The existing ship layer uses `getAngle: (d) => -(d.data.courseOverGround ?? 0)` which is correct, but if the server sends `511` (AIS "not available" sentinel) for `courseOverGround`, the icon will spin to a nonsensical angle.
**How to avoid:** The AISStream adapter currently passes through raw `Cog` values. Verify that `511` is not a common value in the data. If it is, normalize to `0` or `null` in the adapter.
**Warning signs:** Ships appearing with wildly incorrect orientations.

### Pitfall 4: Stale Threshold Asymmetry
**What goes wrong:** Ships cleared too aggressively or not aggressively enough.
**Why it happens:** Ship staleness depends on the AISStream WebSocket connection, not just the polling interval. If the WebSocket disconnects, `lastFresh` from `/api/ships` returns `lastMessageTime` which will be old, making `stale: true` come back on every poll.
**How to avoid:** The stale threshold of 120s (2x the 30s poll interval) is correct. On the frontend, check `lastFresh` from the response -- if `Date.now() - lastFresh > 120_000`, clear ship data. This is analogous to the flight 60s threshold.
**Warning signs:** Ships disappearing immediately after WebSocket reconnects (threshold too tight) or stale ships persisting for minutes (threshold too loose).

### Pitfall 5: ACLED Country Parameter Escaping
**What goes wrong:** URLSearchParams double-encodes the pipe `|` character.
**Why it happens:** `URLSearchParams` encodes `|` as `%7C` which ACLED's API may or may not accept.
**How to avoid:** Test with `URLSearchParams` first -- ACLED's API typically handles URL-encoded pipes correctly. If not, construct the query string manually for the country parameter.
**Warning signs:** ACLED API returning empty results or 400 errors after adding pipe-separated countries.

### Pitfall 6: Three Hooks in AppShell Re-render Cascade
**What goes wrong:** AppShell re-renders excessively when any store updates.
**Why it happens:** Polling hooks use Zustand selectors internally. If the hooks themselves cause re-renders (they shouldn't -- they're behavior-only), it could cascade.
**How to avoid:** All three polling hooks should be behavior-only (no return value), writing directly to their respective stores via `getState()`. The hooks subscribe to selectors for store actions (setData, setError, etc.), which are stable references. Only `activeSource` in useFlightPolling triggers re-renders.
**Warning signs:** High React DevTools render count on AppShell, performance degradation with all three feeds active.

## Code Examples

### ShipStore Template
```typescript
// src/stores/shipStore.ts
// Clone flightStore structure, remove: activeSource, localStorage persistence, rateLimited
// Add: 120s stale threshold constant (used by polling hook)
import { create } from 'zustand';
import type { ShipEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface ShipState {
  ships: ShipEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  lastFresh: number | null;
  shipCount: number;
  setShipData: (response: CacheResponse<ShipEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
  clearStaleData: () => void;
}

export const useShipStore = create<ShipState>()((set, get) => ({
  ships: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  lastFresh: null,
  shipCount: 0,
  setShipData: (response) =>
    set({
      ships: response.data,
      shipCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
      lastFresh: response.stale ? get().lastFresh : Date.now(),
    }),
  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
  clearStaleData: () =>
    set({ ships: [], shipCount: 0, connectionStatus: 'error' }),
}));
```

### EventStore Template
```typescript
// src/stores/eventStore.ts
// Simplified: no stale clearing, no rateLimited, no activeSource
import { create } from 'zustand';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

export type ConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface EventState {
  events: ConflictEventEntity[];
  connectionStatus: ConnectionStatus;
  lastFetchAt: number | null;
  eventCount: number;
  setEventData: (response: CacheResponse<ConflictEventEntity[]>) => void;
  setError: () => void;
  setLoading: () => void;
}

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  connectionStatus: 'loading',
  lastFetchAt: null,
  eventCount: 0,
  setEventData: (response) =>
    set({
      events: response.data,
      eventCount: response.data.length,
      connectionStatus: response.stale ? 'stale' : 'connected',
      lastFetchAt: Date.now(),
    }),
  setError: () => set({ connectionStatus: 'error' }),
  setLoading: () => set({ connectionStatus: 'loading' }),
}));
```

### ACLED Country Expansion
```typescript
// server/adapters/acled.ts -- expand country parameter
// Current: country: 'Iran'
// New: pipe-separated list matching Greater Middle East bounding box coverage

const GREATER_MIDDLE_EAST_COUNTRIES = [
  'Iran',
  'Iraq',
  'Syria',
  'Turkey',
  'Saudi Arabia',
  'Yemen',
  'Oman',
  'United Arab Emirates',
  'Qatar',
  'Bahrain',
  'Kuwait',
  'Jordan',
  'Israel',
  'Lebanon',
  'Afghanistan',
  'Pakistan',
].join('|');

// In fetchEvents():
const params = new URLSearchParams({
  country: GREATER_MIDDLE_EAST_COUNTRIES,
  // ... rest same
});
```
**Rationale for pipe-separated countries over region code:**
- ACLED region 11 ("Middle East") does not include Pakistan, Afghanistan, or Turkey, which are within the IRAN_BBOX (south:15, north:42, west:30, east:70)
- Pipe-separated `country` parameter gives precise control over which countries to include
- Matches the Greater Middle East coverage area used for flight data

### Status Panel Component
```typescript
// src/components/ui/StatusPanel.tsx
// Three-line HUD readout with colored dots per data feed
// Reads from flightStore, shipStore, eventStore

// STATUS_DOT_CLASS map (reuse from SourceSelector pattern):
// connected -> 'bg-accent-green'
// stale -> 'bg-accent-yellow'
// error -> 'bg-accent-red'
// loading -> 'bg-text-muted animate-pulse'

// Each line: <dot> <count|dash> <label>
// Loading: gray pulsing dot + '--' instead of count
```

### useEntityLayers Refactor
```typescript
// Key changes in src/hooks/useEntityLayers.ts:
// 1. Import useShipStore, useEventStore
// 2. Add selectors: ships = useShipStore(s => s.ships), events = useEventStore(s => s.events)
// 3. Split events: drones = events.filter(e => e.type === 'drone'), missiles = filter 'missile'
// 4. Replace staticLayers useMemo with individual layer useMemos with correct deps
// 5. Ship layer: data: ships (deps: [ships])
// 6. Drone layer: data: drones (deps: [drones])
// 7. Missile layer: data: missiles (deps: [missiles])
```

## Discretion Recommendations

### EventStore ConnectionStatus: Use Full ConnectionStatus
**Recommendation:** Track full `ConnectionStatus` (connected/stale/error/loading) in eventStore. Even though events don't go stale conceptually, the `stale` boolean in the `CacheResponse` indicates whether the server cache was expired. This maps naturally to the status panel's yellow dot. The store interface stays consistent across all three stores.
**Confidence:** HIGH

### ACLED Country Expansion: Pipe-Separated Country List
**Recommendation:** Use pipe-separated `country` parameter with explicit country names, not `region=11`. The ACLED "Middle East" region (code 11) maps to a specific ACLED region definition that excludes countries like Pakistan, Afghanistan, and Turkey which are within the project's Greater Middle East bounding box. A pipe-separated country list provides exact control.
**Confidence:** HIGH -- verified against ACLED API documentation

### Status Panel: New Component (Delete SourceSelector)
**Recommendation:** Create a new `StatusPanel.tsx` component rather than refactoring `SourceSelector.tsx`. The SourceSelector is fundamentally a dropdown with click handlers, while the StatusPanel is a read-only display. There is almost no shared logic. Delete `SourceSelector.tsx` and its test file cleanly. The `OverlayPanel` wrapper component can be reused.
**Confidence:** HIGH

### Missing AISStream API Key: Show Error Status
**Recommendation:** Show the ships line in the status panel with a red error dot. The server route `/api/ships` already works without AISStream (returns `{ data: [], stale: true, lastFresh: 0 }`), so the frontend will naturally show `stale` or `error` status. No special frontend handling needed -- the existing staleness logic covers this case. If the user has no AISSTREAM_API_KEY, the ship count will show 0 with a yellow/red dot, which accurately communicates the state.
**Confidence:** HIGH

### FlightStore: Keep activeSource (Don't Simplify)
**Recommendation:** Do NOT remove `activeSource`/`setActiveSource` from flightStore. The backend still supports multi-source, and removing the store interface creates unnecessary churn. The only change is removing the SourceSelector UI component. If source switching returns in a future phase, the store is ready.
**Confidence:** HIGH

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static entity layers with `data: []` | Dynamic layers with store selectors | Phase 8 | Ship/event icons actually appear on map |
| SourceSelector dropdown (Phase 7) | HUD status panel (Phase 8) | Phase 8 | Cleaner UI, shows all three feeds simultaneously |
| ACLED Iran-only query | Greater Middle East multi-country query | Phase 8 | Matches expanded flight coverage from Phase 6 |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom (frontend) / node (server) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-02-a | ShipStore state management (setShipData, setError, clearStaleData) | unit | `npx vitest run src/__tests__/shipStore.test.ts -x` | Wave 0 |
| DATA-02-b | useShipPolling fetches /api/ships at 30s intervals | unit | `npx vitest run src/__tests__/useShipPolling.test.ts -x` | Wave 0 |
| DATA-02-c | useShipPolling pauses on hidden tab, resumes on visible | unit | `npx vitest run src/__tests__/useShipPolling.test.ts -x` | Wave 0 |
| DATA-02-d | useShipPolling clears ships after 120s stale threshold | unit | `npx vitest run src/__tests__/useShipPolling.test.ts -x` | Wave 0 |
| DATA-02-e | Ship layer in useEntityLayers receives real store data | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Exists (needs update) |
| DATA-03-a | EventStore state management (setEventData, setError, no clearStale) | unit | `npx vitest run src/__tests__/eventStore.test.ts -x` | Wave 0 |
| DATA-03-b | useEventPolling fetches /api/events at 300s intervals | unit | `npx vitest run src/__tests__/useEventPolling.test.ts -x` | Wave 0 |
| DATA-03-c | useEventPolling does NOT clear events on staleness | unit | `npx vitest run src/__tests__/useEventPolling.test.ts -x` | Wave 0 |
| DATA-03-d | Drone/missile layers in useEntityLayers receive filtered event data | unit | `npx vitest run src/__tests__/entityLayers.test.ts -x` | Exists (needs update) |
| DATA-03-e | ACLED adapter queries multiple countries | unit | `npx vitest run server/__tests__/adapters/acled.test.ts -x` | Exists (needs update) |
| UI-01 | StatusPanel shows flight/ship/event counts with colored dots | unit | `npx vitest run src/__tests__/StatusPanel.test.tsx -x` | Wave 0 |
| UI-02 | StatusPanel shows correct dot color per ConnectionStatus | unit | `npx vitest run src/__tests__/StatusPanel.test.tsx -x` | Wave 0 |
| UI-03 | StatusPanel shows pulsing gray dot + '--' for loading state | unit | `npx vitest run src/__tests__/StatusPanel.test.tsx -x` | Wave 0 |
| UI-04 | AppShell wires all three polling hooks | unit | `npx vitest run src/__tests__/AppShell.test.tsx -x` | Exists (needs update) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/shipStore.test.ts` -- covers DATA-02-a
- [ ] `src/__tests__/useShipPolling.test.ts` -- covers DATA-02-b, DATA-02-c, DATA-02-d
- [ ] `src/__tests__/eventStore.test.ts` -- covers DATA-03-a
- [ ] `src/__tests__/useEventPolling.test.ts` -- covers DATA-03-b, DATA-03-c
- [ ] `src/__tests__/StatusPanel.test.tsx` -- covers UI-01, UI-02, UI-03
- [ ] Update `src/__tests__/entityLayers.test.ts` -- update assertions for non-empty ship/event data
- [ ] Update `src/__tests__/AppShell.test.tsx` -- verify three polling hooks wired
- [ ] Update `server/__tests__/adapters/acled.test.ts` -- verify multi-country query

## Open Questions

1. **AISStream `courseOverGround` sentinel value (511)**
   - What we know: AIS protocol uses 511.0 to indicate "not available" for COG
   - What's unclear: Whether the AISStream adapter currently passes through 511 or normalizes it
   - Recommendation: Add a guard in the existing adapter normalization (`cog >= 360 ? null : cog`). This is a minor fix but prevents visual bugs. Low priority -- can be addressed if observed in testing.

2. **ACLED API pagination with expanded country set**
   - What we know: ACLED has a 5000-row bandwidth limit per call. Current Iran-only query likely returns well under this. Adding 15+ countries may exceed it.
   - What's unclear: How many events per week the Greater Middle East generates
   - Recommendation: Keep `limit: '500'` in the query for now (matches current code). The 7-day window plus the event_type focus should keep results manageable. If pagination is needed, it can be added later.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/stores/flightStore.ts`, `src/hooks/useFlightPolling.ts`, `src/hooks/useEntityLayers.ts` -- exact templates for new code
- Existing codebase: `server/adapters/aisstream.ts`, `server/adapters/acled.ts`, `server/routes/ships.ts`, `server/routes/events.ts` -- server side already complete
- Existing codebase: `src/components/ui/SourceSelector.tsx` -- component to replace
- ACLED API documentation: https://acleddata.com/api-documentation/elements-acleds-api -- pipe separator for multiple country values
- ACLED endpoint docs: https://acleddata.com/api-documentation/acled-endpoint -- region codes (Middle East = 11)

### Secondary (MEDIUM confidence)
- ACLED region definition scope (which countries are in region 11) -- verified via web search but exact boundary not confirmed against official ACLED region map

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all libraries already in use
- Architecture: HIGH -- directly cloning established patterns from existing codebase
- Pitfalls: HIGH -- identified from code review of actual implementation, not theoretical
- ACLED expansion: HIGH -- API syntax verified against official documentation
- Status panel: HIGH -- straightforward component, patterns from SourceSelector transferable

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable -- no external dependency changes expected)
