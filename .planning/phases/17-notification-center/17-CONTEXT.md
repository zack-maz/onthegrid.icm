# Phase 17: Notification Center - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Users receive proactive, severity-ranked intelligence alerts about conflict events, proximity threats, and correlated news. Bell icon with badge in top-right, dropdown notification drawer with time-grouped event cards, proximity warning icons on the map near threatened sites, and a 24h default event window. Does NOT include configurable severity weights (v1.2+), desktop push notifications (v1.2+), or standalone news feed UI (out of scope).

</domain>

<decisions>
## Implementation Decisions

### Notification card content & layout
- Event-first card design: lead with conflict event type, location, and severity-derived sort position, then 1-3 matched news headlines below as supporting evidence
- Severity score is hidden from the card — used internally for sort order within time groups, not displayed as a visible number or color band
- Cards show: event type icon, event type label (uppercase), location name, relative timestamp, coordinates, then matched news headlines (source: truncated title) with "N sources reporting" summary
- Clicking a card: closes the dropdown, flies the map to the event location, selects the event, and opens the detail panel

### Notification grouping & ordering
- Time-grouped sections: Last Hour, Last Day, Last Week
- Within each time group, sorted by severity score descending (highest severity first)
- Badge count = total unread items across all groups

### Proximity alert behavior
- Only unidentified flights (data.unidentified flag) trigger proximity alerts — not identified flights, not ships
- 50km threshold from key sites (reuses haversine from attackStatus.ts)
- Proximity alerts appear as a persistent small icon on/near the threatened site on the map (NOT in the notification drawer)
- Icon is toggleable — click to expand and see which entity is approaching, distance, heading
- Icon persists as long as the entity is within 50km radius; disappears when entity exits
- Computed client-side from flightStore unidentified flights × siteStore sites on each poll cycle

### Drawer interaction & placement
- Bell icon in top-right corner with unread count badge
- Click opens a dropdown panel beneath the bell icon
- Dropdown does not compete with left panel stack or right detail panel
- Mark read on click — clicking a notification dims it and decrements badge count
- "Mark all read" link at top of dropdown — resets badge to 0, dims all items, items stay in list
- Clicking outside the dropdown or pressing Escape closes it

### 24h default event window (NOTF-05)
- Separate mechanism in filterStore — new `defaultEventWindow` concept (not auto-setting the date slider)
- When dateStart and dateEnd are both null (no custom range), events AND news are filtered to last 24h client-side
- Slider stays at full range — the 24h filter is invisible to the slider UI
- Moving the slider to set a custom range overrides and suppresses the 24h default
- Clearing the custom range (dateStart=null, dateEnd=null) restores the 24h default
- Subtle "Showing last 24h" label displayed near the date range area when default is active, disappears when custom range is set
- Scope: applies to conflict events and news clusters; flights, ships, and sites are unaffected

### Claude's Discretion
- Notification store shape and derived state implementation
- Severity scoring formula implementation (type weight × log mentions × log sources × recency decay)
- News-to-event matching algorithm (temporal + geographic/keyword proximity)
- Proximity alert icon design and expand/collapse animation
- Dropdown panel sizing, max-height, and scroll behavior
- Notification generation timing (on event poll, on news poll, or both)

</decisions>

<specifics>
## Specific Ideas

- Event-first card design aligns with "numbers over narratives" — the conflict event IS the notification, news headlines are supporting evidence
- Proximity alerts as map-native indicators (near the site) rather than drawer items — spatial awareness is key for a map tool
- Time grouping (Last Hour / Last Day / Last Week) provides temporal context without showing raw severity numbers
- 24h default as a separate mechanism preserves the existing slider behavior — no auto-setting on load, no confusion about whether the slider is "active"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/attackStatus.ts`: Haversine distance computation + coarse bbox pre-filter — reuse for 50km proximity checks
- `src/stores/newsStore.ts`: News clusters with articles[], tone, geo metadata — source for news-to-event matching
- `src/stores/eventStore.ts`: Conflict events with type, lat/lng, timestamp, numMentions, numSources — source for severity scoring
- `src/stores/siteStore.ts`: Key infrastructure sites — targets for proximity alerts
- `src/stores/flightStore.ts`: Flights with `data.unidentified` flag — entities for proximity alerts
- `src/components/ui/OverlayPanel.tsx`: Reusable panel wrapper — could be used for dropdown panel
- `src/components/counters/CounterRow.tsx`: Label + value with delta animation — pattern for notification count display
- `src/stores/filterStore.ts`: Date range filter state (dateStart, dateEnd) — extend with defaultEventWindow

### Established Patterns
- Zustand curried `create<T>()()` for new notificationStore
- ConnectionStatus type for store health tracking
- OverlayPanel for collapsible panels in the left stack
- localStorage persistence for UI state (toggles, filter preferences)
- useEntityLayers for layer visibility gating — extend with 24h default window logic

### Integration Points
- `src/components/layout/AppShell.tsx`: Add bell icon + dropdown in top-right area
- `src/stores/filterStore.ts`: Add `defaultEventWindow` field and logic
- `src/hooks/useEntityLayers.ts` or `useFilteredEntities.ts`: Apply 24h default when no custom range active
- `src/components/layout/FilterPanelSlot.tsx`: Add "Showing last 24h" label
- `src/components/map/BaseMap.tsx` or layers: Add proximity alert icon layer near threatened sites
- New: `src/stores/notificationStore.ts`, `src/hooks/useNotifications.ts`, `src/components/layout/NotificationBell.tsx`, `src/components/notifications/NotificationDropdown.tsx`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-notification-center*
*Context gathered: 2026-03-20*
