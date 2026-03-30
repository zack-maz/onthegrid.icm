# Phase 17: Notification Center - Research

**Researched:** 2026-03-20
**Domain:** Client-side notification system, severity scoring, proximity alerting, event-news correlation
**Confidence:** HIGH

## Summary

Phase 17 adds a notification center to the Iran Conflict Monitor with four distinct capabilities: (1) a bell icon with unread count badge and dropdown drawer showing severity-ranked conflict events, (2) news-to-event matching that surfaces 1-3 relevant headlines per notification card, (3) proximity alerts when unidentified flights approach key infrastructure sites, and (4) a 24-hour default event window when no custom date filter is active.

All four capabilities are purely client-side derived state -- no new server endpoints or server-side computation is needed. The notification store consumes existing eventStore, newsStore, flightStore, and siteStore data and derives notifications through scoring, matching, and proximity algorithms. The 24h default window is a filterStore extension that gates events and news client-side.

**Primary recommendation:** Build a notificationStore that derives scored notifications from eventStore events + newsStore clusters on each poll cycle, a useProximityAlerts hook that computes flight-to-site proximity from flightStore + siteStore on each flight poll, and extend filterStore with a `defaultEventWindow` concept that filters events/news to 24h when no custom range is active.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Event-first card design: lead with conflict event type, location, and severity-derived sort position, then 1-3 matched news headlines below as supporting evidence
- Severity score is hidden from the card -- used internally for sort order within time groups, not displayed as a visible number or color band
- Cards show: event type icon, event type label (uppercase), location name, relative timestamp, coordinates, then matched news headlines (source: truncated title) with "N sources reporting" summary
- Clicking a card: closes the dropdown, flies the map to the event location, selects the event, and opens the detail panel
- Time-grouped sections: Last Hour, Last Day, Last Week
- Within each time group, sorted by severity score descending (highest severity first)
- Badge count = total unread items across all groups
- Only unidentified flights (data.unidentified flag) trigger proximity alerts -- not identified flights, not ships
- 50km threshold from key sites (reuses haversine from attackStatus.ts)
- Proximity alerts appear as a persistent small icon on/near the threatened site on the map (NOT in the notification drawer)
- Icon is toggleable -- click to expand and see which entity is approaching, distance, heading
- Icon persists as long as the entity is within 50km radius; disappears when entity exits
- Computed client-side from flightStore unidentified flights x siteStore sites on each poll cycle
- Bell icon in top-right corner with unread count badge
- Click opens a dropdown panel beneath the bell icon
- Dropdown does not compete with left panel stack or right detail panel
- Mark read on click -- clicking a notification dims it and decrements badge count
- "Mark all read" link at top of dropdown -- resets badge to 0, dims all items, items stay in list
- Clicking outside the dropdown or pressing Escape closes it
- Separate mechanism in filterStore -- new `defaultEventWindow` concept (not auto-setting the date slider)
- When dateStart and dateEnd are both null (no custom range), events AND news are filtered to last 24h client-side
- Slider stays at full range -- the 24h filter is invisible to the slider UI
- Moving the slider to set a custom range overrides and suppresses the 24h default
- Clearing the custom range (dateStart=null, dateEnd=null) restores the 24h default
- Subtle "Showing last 24h" label displayed near the date range area when default is active, disappears when custom range is set
- Scope: applies to conflict events and news clusters; flights, ships, and sites are unaffected

### Claude's Discretion
- Notification store shape and derived state implementation
- Severity scoring formula implementation (type weight x log mentions x log sources x recency decay)
- News-to-event matching algorithm (temporal + geographic/keyword proximity)
- Proximity alert icon design and expand/collapse animation
- Dropdown panel sizing, max-height, and scroll behavior
- Notification generation timing (on event poll, on news poll, or both)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NOTF-01 | User can see a bell icon with unread count badge in the top-right corner | Bell component in AppShell top-right area; z-index --z-controls (30); OverlayPanel styling for dropdown |
| NOTF-02 | User can open a notification drawer showing severity-scored conflict events (type weight x log mentions x log sources x recency decay) | notificationStore derives scored notifications from eventStore + GDELT NumMentions/NumSources fields; ConflictEventEntity.data needs extension |
| NOTF-03 | User sees 1-3 matched news headlines on each notification card (temporal + geographic/keyword matching) | newsStore clusters have lat/lng, keywords, publishedAt; matching via temporal window + haversine distance + keyword overlap |
| NOTF-04 | User receives proximity alerts when tracked entities approach key sites within 50km | useProximityAlerts hook cross-references flightStore unidentified flights x siteStore sites using haversineKm from src/lib/geo.ts |
| NOTF-05 | Map shows only last 24h of conflict events by default when no custom date filter is set | filterStore extension with defaultEventWindow; useFilteredEntities applies 24h cutoff when dateStart===null && dateEnd===null |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | 5.x (already installed) | notificationStore state management | Project standard for all stores |
| React | 19.x (already installed) | UI components for bell, dropdown, cards, proximity icons | Project standard |
| @deck.gl/layers | 9.2.x (already installed) | Proximity alert icon layer on map | Already used for all entity layers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| src/lib/geo.ts | N/A (existing) | haversineKm for 50km proximity computation | Proximity alerts (NOTF-04) |
| src/lib/attackStatus.ts | N/A (existing) | haversineDistanceKm reference pattern (bbox pre-filter + haversine) | Pattern reference for proximity alerts |
| src/types/ui.ts | N/A (existing) | EVENT_TYPE_LABELS, CONFLICT_TOGGLE_GROUPS for card rendering | Notification card content |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Zustand derived state | React Context | Zustand is project standard; Context would add unnecessary complexity |
| Client-side scoring | Server-side scoring endpoint | No need -- all data already available client-side; avoids new API endpoint |
| deck.gl IconLayer for proximity | HTML overlay markers | IconLayer integrates with existing map layer system; HTML overlays would need separate z-index management |

**Installation:**
```bash
# No new packages needed -- all capabilities use existing dependencies
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  stores/
    notificationStore.ts        # Notification state + derived scored notifications
  hooks/
    useNotifications.ts          # Derives notifications from events + news on each poll cycle
    useProximityAlerts.ts        # Computes unidentified flight <-> site proximity
  components/
    layout/
      NotificationBell.tsx       # Bell icon + badge + dropdown container
    notifications/
      NotificationDropdown.tsx   # Dropdown panel with time-grouped cards
      NotificationCard.tsx       # Individual event card with matched news
    map/
      layers/
        proximityAlertLayer.ts   # deck.gl layer for proximity warning icons
  lib/
    severity.ts                  # Severity scoring formula (pure function)
    newsMatching.ts              # News-to-event matching algorithm (pure function)
```

### Pattern 1: Notification Store as Derived State
**What:** The notificationStore does NOT fetch data independently. It derives notifications from existing stores (eventStore, newsStore) by computing severity scores and matching news to events. The store holds read/unread state and the computed notification list.
**When to use:** Always -- notifications are a view transformation of existing data, not a new data source.
**Example:**
```typescript
// notificationStore.ts
import { create } from 'zustand';

interface Notification {
  id: string;                    // Same as event ID
  eventId: string;               // Reference to ConflictEventEntity
  score: number;                 // Severity score (internal, not displayed)
  matchedNews: MatchedHeadline[]; // 0-3 matched news headlines
  timestamp: number;             // Event timestamp
  isRead: boolean;
}

interface MatchedHeadline {
  source: string;
  title: string;
  url: string;
}

interface NotificationState {
  notifications: Notification[];
  isDropdownOpen: boolean;
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  toggleDropdown: () => void;
  closeDropdown: () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  isDropdownOpen: false,
  unreadCount: 0,
  // ... actions
}));
```

### Pattern 2: Severity Scoring as Pure Function
**What:** Severity score is computed as: `typeWeight * log2(1 + numMentions) * log2(1 + numSources) * recencyDecay`. This is a pure function that takes an event and returns a number.
**When to use:** Called during notification derivation, not stored on events.
**Example:**
```typescript
// src/lib/severity.ts
import type { ConflictEventEntity } from '@/types/entities';

const TYPE_WEIGHTS: Record<string, number> = {
  airstrike: 10,
  wmd: 10,
  mass_violence: 9,
  assassination: 8,
  bombing: 7,
  shelling: 7,
  ground_combat: 6,
  abduction: 5,
  ceasefire_violation: 4,
  assault: 3,
  blockade: 2,
};

export function computeSeverityScore(event: ConflictEventEntity): number {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = (event.data as Record<string, unknown>).numMentions as number ?? 1;
  const sources = (event.data as Record<string, unknown>).numSources as number ?? 1;
  const ageHours = (Date.now() - event.timestamp) / (1000 * 60 * 60);
  const recencyDecay = 1 / (1 + ageHours / 24); // Half-life of ~24h
  return typeWeight * Math.log2(1 + mentions) * Math.log2(1 + sources) * recencyDecay;
}
```

### Pattern 3: News-to-Event Matching
**What:** For each conflict event, find 0-3 news clusters that are temporally close (within 24h), geographically close (within 100km if geo available), or share keywords.
**When to use:** During notification derivation, after events are scored.
**Example:**
```typescript
// src/lib/newsMatching.ts
import type { ConflictEventEntity, NewsCluster } from '@/types/entities';
import { haversineKm } from '@/lib/geo';

const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const GEO_RADIUS_KM = 100;
const MAX_MATCHES = 3;

export function matchNewsToEvent(
  event: ConflictEventEntity,
  clusters: NewsCluster[],
): MatchedHeadline[] {
  // Score each cluster by relevance to the event
  const scored = clusters
    .map(cluster => ({
      cluster,
      relevance: computeRelevance(event, cluster),
    }))
    .filter(s => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_MATCHES);

  return scored.map(s => ({
    source: s.cluster.primaryArticle.source,
    title: s.cluster.primaryArticle.title,
    url: s.cluster.primaryArticle.url,
  }));
}

function computeRelevance(
  event: ConflictEventEntity,
  cluster: NewsCluster,
): number {
  let score = 0;

  // Temporal proximity (must be within window)
  const timeDiff = Math.abs(event.timestamp - cluster.lastUpdated);
  if (timeDiff > TEMPORAL_WINDOW_MS) return 0;
  score += 1 - (timeDiff / TEMPORAL_WINDOW_MS); // 0-1 temporal score

  // Geographic proximity (if news has location)
  const article = cluster.primaryArticle;
  if (article.lat != null && article.lng != null) {
    const dist = haversineKm(event.lat, event.lng, article.lat, article.lng);
    if (dist <= GEO_RADIUS_KM) {
      score += 2 * (1 - dist / GEO_RADIUS_KM); // Weighted higher for geo match
    }
  }

  // Keyword overlap
  const eventLocation = event.data.locationName.toLowerCase();
  const keywords = article.keywords;
  for (const kw of keywords) {
    if (eventLocation.includes(kw.toLowerCase())) {
      score += 0.5;
      break;
    }
  }

  return score;
}
```

### Pattern 4: Proximity Alert Computation
**What:** On each flight poll cycle, cross-reference unidentified flights with site positions using haversineKm. Alert when distance < 50km.
**When to use:** In a useProximityAlerts hook that runs as a useMemo dependent on flights and sites.
**Example:**
```typescript
// src/hooks/useProximityAlerts.ts
import { useMemo } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useSiteStore } from '@/stores/siteStore';
import { haversineKm } from '@/lib/geo';

const PROXIMITY_RADIUS_KM = 50;
const COARSE_DEG = 0.5; // ~50km coarse filter

export interface ProximityAlert {
  siteId: string;
  siteLat: number;
  siteLng: number;
  siteLabel: string;
  flightId: string;
  flightLabel: string;
  distanceKm: number;
  heading: number | null;
}

export function useProximityAlerts(): ProximityAlert[] {
  const flights = useFlightStore(s => s.flights);
  const sites = useSiteStore(s => s.sites);

  return useMemo(() => {
    const unidentified = flights.filter(f => f.data.unidentified);
    if (unidentified.length === 0 || sites.length === 0) return [];

    const alerts: ProximityAlert[] = [];
    for (const site of sites) {
      for (const flight of unidentified) {
        // Coarse bbox filter
        if (Math.abs(flight.lat - site.lat) > COARSE_DEG) continue;
        if (Math.abs(flight.lng - site.lng) > COARSE_DEG) continue;
        const dist = haversineKm(site.lat, site.lng, flight.lat, flight.lng);
        if (dist <= PROXIMITY_RADIUS_KM) {
          alerts.push({
            siteId: site.id,
            siteLat: site.lat,
            siteLng: site.lng,
            siteLabel: site.label,
            flightId: flight.id,
            flightLabel: flight.data.callsign || flight.data.icao24,
            distanceKm: Math.round(dist * 10) / 10,
            heading: flight.data.heading,
          });
        }
      }
    }
    return alerts;
  }, [flights, sites]);
}
```

### Pattern 5: 24h Default Event Window in filterStore
**What:** Extend filterStore with a concept of "default event window" that applies a 24h cutoff to events and news when no custom date range is active.
**When to use:** In useFilteredEntities and wherever news clusters are consumed.
**Example:**
```typescript
// Addition to filterStore
// The actual filter logic goes in useFilteredEntities / entityPassesFilters

// In useFilteredEntities, before applying existing filters:
const isDefaultWindowActive = dateStart === null && dateEnd === null;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

// For conflict events and news, apply 24h cutoff when default window active
if (isDefaultWindowActive) {
  const cutoff = Date.now() - DEFAULT_WINDOW_MS;
  // Filter events: entity.timestamp >= cutoff
  // Filter news: cluster.lastUpdated >= cutoff
}
```

### Anti-Patterns to Avoid
- **Storing notifications server-side:** This is a single-user tool. No need for persistence -- notifications are derived from existing data on each render cycle.
- **Polling for notifications separately:** Notifications derive from existing store data. Adding a separate poll would be wasteful and create synchronization issues.
- **Putting NumMentions/NumSources on the ConflictEventEntity.data type as required fields:** Use optional fields with fallback defaults (1) to maintain backward compatibility with cached/backfilled data.
- **Modifying the date range slider for 24h default:** The decision explicitly states the slider stays at full range and the 24h filter is a separate invisible mechanism.
- **Placing proximity alerts in the notification drawer:** The decision explicitly states they appear as map-native icons near threatened sites, not in the drawer.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Haversine distance | Custom haversine function | `haversineKm` from `src/lib/geo.ts` | Already implemented and tested |
| Event type labels | Hardcoded strings in notification cards | `EVENT_TYPE_LABELS` from `src/types/ui.ts` | Single source of truth used across tooltip, detail panel, etc. |
| Event type color mapping | New color constants | `ENTITY_DOT_COLORS` from `src/components/map/layers/constants.ts` | Consistent with detail panel and other UI |
| Outside-click detection | Manual document click listeners | Reuse the Escape handler pattern from `DetailPanelSlot.tsx` plus a click-outside ref | Established pattern in codebase |
| Time grouping | Manual time bucket computation | Simple threshold comparison: `Date.now() - timestamp` < 1h / 24h / 7d | Straightforward math, no library needed |
| Icon atlas for map layers | New icon atlas for proximity | Extend existing `getIconAtlas()` + `ICON_MAPPING` from `src/components/map/layers/icons.ts` | Consistent with all other map entities |

**Key insight:** This phase is almost entirely derived client-side state. The only server-side change is adding `numMentions` and `numSources` to the GDELT normalizer output. Everything else reuses existing stores, hooks, and patterns.

## Common Pitfalls

### Pitfall 1: NumMentions/NumSources Not in ConflictEventEntity Type
**What goes wrong:** The severity scoring formula requires `numMentions` and `numSources` from GDELT events, but these fields are NOT currently on the `ConflictEventEntity.data` type definition. The GDELT adapter parses them for dedup but does not include them in the normalized output.
**Why it happens:** The original Phase 8 design only needed these for deduplication (picking highest mention count), not for display.
**How to avoid:** Add `numMentions?: number` and `numSources?: number` as optional fields to `ConflictEventEntity.data` in `server/types.ts`, and populate them in the `normalizeGdeltEvent` function from GDELT column 31 (NumMentions) and column 32 (NumSources). Use optional fields so cached/backfilled data without these fields still works (default to 1 in scoring).
**Warning signs:** Severity scores are flat (all events score the same within a type) because mentions/sources are always 1.

### Pitfall 2: Dropdown Z-Index Conflicts
**What goes wrong:** The notification dropdown renders behind the detail panel, filter panel, or map controls.
**Why it happens:** The existing z-index scale is: map=0, overlay=10, panel=20, controls=30, modal=40. The bell icon is at z-controls (30), but the dropdown needs to be above other controls.
**How to avoid:** Use z-[var(--z-modal)] (40) for the dropdown panel itself, while the bell icon sits at z-[var(--z-controls)] (30). This ensures the dropdown floats above all other controls when open.
**Warning signs:** Dropdown is clipped or hidden behind other panels.

### Pitfall 3: Performance of O(flights x sites) Proximity Check
**What goes wrong:** Proximity alerting runs `unidentified.length * sites.length` haversine computations on every flight poll (every 5-30s depending on source).
**Why it happens:** Naive nested loop without early termination.
**How to avoid:** Use coarse bounding box pre-filter (same pattern as `attackStatus.ts`). With ~0.5 degree pre-filter for 50km radius, most flight-site pairs are eliminated before haversine. Also filter to only unidentified flights first (typically < 50 at any time). The cross product is manageable: ~50 flights x ~200 sites = ~10K comparisons, reduced to ~100 after bbox filter.
**Warning signs:** Frame drops or UI jank on flight poll update.

### Pitfall 4: Stale Notification Read State on Event Refresh
**What goes wrong:** User marks a notification as read, then a new event poll replaces the events array. The notification regeneration creates new notification objects, losing the read state.
**Why it happens:** Notifications are re-derived from scratch on each event update.
**How to avoid:** Maintain a `readIds: Set<string>` in notificationStore keyed by event ID. When regenerating notifications, apply read state from the set. Persist readIds to localStorage for session continuity.
**Warning signs:** Read badges reset to unread after every poll cycle.

### Pitfall 5: 24h Default Window Interacting with Custom Range Toggle Suppression
**What goes wrong:** The 24h default window accidentally triggers the custom range activation logic (which suppresses flight/ship toggles).
**Why it happens:** The existing `setDateRange` in filterStore auto-activates custom range mode when either dateStart or dateEnd becomes non-null. If the 24h window is implemented by setting dateStart, it would trigger toggle suppression.
**How to avoid:** The 24h default window MUST NOT touch dateStart/dateEnd. It is a separate client-side filter applied in `useFilteredEntities` or `entityPassesFilters` based on the condition `dateStart === null && dateEnd === null`. The filterStore may optionally have a boolean `isDefaultWindowActive` derived field, but it must not set the date range sliders.
**Warning signs:** Flight and ship layers disappear on initial load because toggle suppression fires.

### Pitfall 6: News Matching Produces Zero Matches
**What goes wrong:** Most notification cards show no news headlines because GDELT DOC articles lack lat/lng geo data and keyword overlap is sparse.
**Why it happens:** GDELT DOC articles in the NewsArticle type have optional `lat?` and `lng?` fields that are often undefined. Keyword matching depends on the keyword whitelist from the news filter.
**How to avoid:** Make temporal proximity the primary matching signal (within 24h). Use location name string matching as a secondary signal (event.data.locationName overlaps with article title). Geographic matching is a bonus when available, not required. This ensures most events get at least temporal matches.
**Warning signs:** All notification cards show "0 sources reporting".

## Code Examples

### Extending ConflictEventEntity.data for NumMentions/NumSources
```typescript
// server/types.ts -- add to ConflictEventEntity.data
export interface ConflictEventEntity extends MapEntityBase {
  type: ConflictEventType;
  data: {
    eventType: string;
    subEventType: string;
    fatalities: number;
    actor1: string;
    actor2: string;
    notes: string;
    source: string;
    goldsteinScale: number;
    locationName: string;
    cameoCode: string;
    numMentions?: number;  // NEW: GDELT NumMentions (column 31)
    numSources?: number;   // NEW: GDELT NumSources (column 32)
  };
}
```

### GDELT Adapter -- Populating NumMentions/NumSources
```typescript
// server/adapters/gdelt.ts -- add to COL and normalizeGdeltEvent
export const COL = {
  // ... existing columns
  NumMentions: 31,
  NumSources: 32,   // NEW
} as const;

// In normalizeGdeltEvent:
data: {
  // ... existing fields
  numMentions: parseInt(cols[COL.NumMentions], 10) || undefined,
  numSources: parseInt(cols[COL.NumSources], 10) || undefined,
},
```

### AppShell Integration -- Bell Icon Placement
```typescript
// src/components/layout/AppShell.tsx
export function AppShell() {
  // ... existing hooks
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-surface">
      <div data-testid="map-container" className="absolute inset-0 z-[var(--z-map)]">
        <BaseMap />
      </div>

      {/* Top-left: existing stack */}
      <div className="absolute top-4 left-4 z-[var(--z-controls)] flex flex-col items-start gap-2">
        <TitleSlot />
        <StatusPanel />
        <CountersSlot />
        <LayerTogglesSlot />
      </div>

      {/* Top-right: Bell icon (NEW) -- positioned to not compete with filter panel */}
      <NotificationBell />

      {/* Right side: existing panels */}
      <FilterPanelSlot />
      <DetailPanelSlot />
    </div>
  );
}
```

### Notification Bell Component
```typescript
// src/components/layout/NotificationBell.tsx
import { useRef, useEffect, useCallback } from 'react';
import { useNotificationStore } from '@/stores/notificationStore';
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown';

export function NotificationBell() {
  const isOpen = useNotificationStore(s => s.isDropdownOpen);
  const unreadCount = useNotificationStore(s => s.unreadCount);
  const toggleDropdown = useNotificationStore(s => s.toggleDropdown);
  const closeDropdown = useNotificationStore(s => s.closeDropdown);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDropdown();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeDropdown]);

  return (
    <div
      ref={containerRef}
      className="absolute top-4 right-4 z-[var(--z-controls)]"
      // Shifts right when filter panel is present (same pattern as FilterPanelSlot)
    >
      <button
        onClick={toggleDropdown}
        className="relative rounded-lg border border-border bg-surface-overlay p-2 shadow-lg backdrop-blur-sm"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {/* Bell SVG icon */}
        <svg className="h-5 w-5 text-text-secondary" /* bell icon */ />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && <NotificationDropdown />}
    </div>
  );
}
```

### Time Group Helper
```typescript
// src/lib/timeGroup.ts
export type TimeGroup = 'last_hour' | 'last_day' | 'last_week';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function getTimeGroup(timestamp: number): TimeGroup {
  const age = Date.now() - timestamp;
  if (age <= HOUR_MS) return 'last_hour';
  if (age <= DAY_MS) return 'last_day';
  return 'last_week';
}

export const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
  last_hour: 'Last Hour',
  last_day: 'Last Day',
  last_week: 'Last Week',
};

export const TIME_GROUP_ORDER: TimeGroup[] = ['last_hour', 'last_day', 'last_week'];
```

### 24h Default Window in useFilteredEntities
```typescript
// Extension to src/hooks/useFilteredEntities.ts
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Inside useFilteredEntities:
const isDefaultWindowActive = dateStart === null && dateEnd === null;

const events = useMemo(() => {
  let filtered = rawEvents.filter(e =>
    entityPassesFilters(e, filters as Parameters<typeof entityPassesFilters>[1])
  );
  // Apply 24h default window when no custom range
  if (isDefaultWindowActive) {
    const cutoff = Date.now() - DEFAULT_WINDOW_MS;
    filtered = filtered.filter(e => e.timestamp >= cutoff);
  }
  return filtered;
}, [rawEvents, filters, isDefaultWindowActive]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No event window | 24h default window (NOTF-05) | Phase 17 | Events filtered to last 24h by default; prevents map from showing all historical events |
| NumMentions used only for dedup | NumMentions + NumSources exposed on entity data | Phase 17 | Enables severity scoring with media impact weighting |
| No cross-referencing of stores | Notification system cross-references events + news | Phase 17 | First derived state that merges multiple data stores |
| Sites only for static display | Sites as proximity alert targets | Phase 17 | Sites become actively monitored against flight positions |

**Deprecated/outdated:**
- None specific to this phase

## Open Questions

1. **Bell icon position when filter panel is open**
   - What we know: FilterPanelSlot is positioned `absolute top-4 right-4` and shifts right when detail panel opens. Bell icon also needs top-right positioning.
   - What's unclear: Should bell be to the left of the filter panel, or above it?
   - Recommendation: Place bell at `absolute top-4` with right offset calculated from filter panel width. Bell should sit between the top-left stack and the filter panel. Simplest: bell at fixed position (e.g., `right-[calc(var(--filter-panel-width)+1.5rem)]`), or alternatively, add bell inside the AppShell top area as a flex item separate from the left stack.

2. **Proximity alert icon on the map -- deck.gl layer vs. HTML overlay**
   - What we know: The decision says "persistent small icon on/near the threatened site" that is "toggleable -- click to expand."
   - What's unclear: deck.gl IconLayer is pickable but expanding to show details on click is complex in deck.gl. HTML overlays would be easier for the expand/collapse behavior.
   - Recommendation: Use a hybrid approach: a deck.gl ScatterplotLayer for the warning circle/pulse around the site, and a small React component overlay (positioned with map.project) for the expandable info card. This follows the pattern of EntityTooltip which already renders React content based on map coordinates.

3. **Notification regeneration frequency**
   - What we know: Events poll every 15 minutes (GDELT), news also every 15 minutes.
   - What's unclear: Should notifications re-derive on every event poll, or only when data actually changes?
   - Recommendation: Re-derive on every event or news store update. Use Zustand subscriptions or useEffect on eventStore.events + newsStore.clusters to trigger regeneration. Since both update every 15 minutes, this is a very low-frequency operation. Reference equality check on the arrays avoids unnecessary work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x with jsdom (frontend), node (server) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTF-01 | Bell icon renders with unread count badge | unit | `npx vitest run src/__tests__/NotificationBell.test.tsx -x` | Wave 0 |
| NOTF-02 | Severity scoring formula produces correct ranking | unit | `npx vitest run src/__tests__/severity.test.ts -x` | Wave 0 |
| NOTF-02 | notificationStore derives scored notifications from events | unit | `npx vitest run src/__tests__/notificationStore.test.ts -x` | Wave 0 |
| NOTF-03 | News-to-event matching returns 0-3 headlines | unit | `npx vitest run src/__tests__/newsMatching.test.ts -x` | Wave 0 |
| NOTF-04 | Proximity alerts computed for unidentified flights near sites | unit | `npx vitest run src/__tests__/proximityAlerts.test.ts -x` | Wave 0 |
| NOTF-04 | Proximity alert icon renders on map for nearby unidentified flights | unit | `npx vitest run src/__tests__/proximityAlerts.test.ts -x` | Wave 0 |
| NOTF-05 | 24h default window filters events when no custom range active | unit | `npx vitest run src/__tests__/filterStore.test.ts -x` | Extend existing |
| NOTF-05 | "Showing last 24h" label visible when default window active | unit | `npx vitest run src/__tests__/FilterPanel.test.tsx -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/severity.test.ts` -- covers NOTF-02 scoring
- [ ] `src/__tests__/newsMatching.test.ts` -- covers NOTF-03 matching
- [ ] `src/__tests__/notificationStore.test.ts` -- covers NOTF-02 store
- [ ] `src/__tests__/NotificationBell.test.tsx` -- covers NOTF-01 rendering
- [ ] `src/__tests__/proximityAlerts.test.ts` -- covers NOTF-04 computation
- [ ] Extend `src/__tests__/filterStore.test.ts` -- covers NOTF-05 default window
- [ ] Extend `server/__tests__/gdelt.test.ts` -- covers numMentions/numSources normalization

## Sources

### Primary (HIGH confidence)
- Project codebase: `server/types.ts`, `server/adapters/gdelt.ts`, `src/stores/eventStore.ts`, `src/stores/newsStore.ts`, `src/stores/filterStore.ts`, `src/lib/attackStatus.ts`, `src/lib/geo.ts`, `src/hooks/useFilteredEntities.ts`, `src/hooks/useEntityLayers.ts`
- GDELT v2 Event Codebook: columns 31 (NumMentions), 32 (NumSources), 33 (NumArticles) confirmed via official documentation
- Context file: `.planning/phases/17-notification-center/17-CONTEXT.md` for locked decisions

### Secondary (MEDIUM confidence)
- GDELT v2 column positions cross-verified via [GDELT Event Codebook V2.0](http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf) and [gdelt2HeaderRows repository](https://github.com/linwoodc3/gdelt2HeaderRows)
- Severity formula weights are recommendations based on conflict type severity hierarchy (Claude's discretion area)

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use; no new dependencies
- Architecture: HIGH -- patterns derived directly from existing codebase (stores, hooks, layers)
- Pitfalls: HIGH -- identified from actual code review (missing type fields, z-index scale, performance, state synchronization)
- Severity scoring: MEDIUM -- formula weights are recommendations (Claude's discretion); the mathematical structure (log * decay) is well-established
- News matching: MEDIUM -- algorithm design is Claude's discretion; GDELT DOC articles may have sparse geo data

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- no external API changes expected)
