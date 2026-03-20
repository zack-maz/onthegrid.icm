---
phase: 16-news-feed
plan: 02
subsystem: ui
tags: [zustand, polling, news-feed, tab-visibility, recursive-setTimeout]

# Dependency graph
requires:
  - phase: 16-news-feed
    provides: /api/news endpoint returning CacheResponse<NewsCluster[]>, NewsArticle and NewsCluster types
  - phase: 8-ship-events
    provides: eventStore + useEventPolling pattern (store shape, polling hook pattern)
provides:
  - newsStore holding NewsCluster[] with connection health tracking
  - useNewsPolling hook with 15-min recursive setTimeout and tab visibility awareness
  - NewsArticle and NewsCluster types re-exported for frontend via @/types/entities
affects: [17-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: [news-polling-15min, newsStore-connection-health]

key-files:
  created:
    - src/stores/newsStore.ts
    - src/hooks/useNewsPolling.ts
  modified:
    - src/types/entities.ts
    - src/components/layout/AppShell.tsx

key-decisions:
  - "newsStore ConnectionStatus defined locally (same type as eventStore) to avoid cross-store import coupling"
  - "articleCount derived field sums articles across all clusters for aggregate stats"
  - "15-min polling interval matches GDELT DOC update frequency and server cache TTL"

patterns-established:
  - "newsStore follows eventStore pattern: clusters[], connectionStatus, lastFetchAt, setNewsData/setError/setLoading"
  - "useNewsPolling follows useEventPolling pattern: recursive setTimeout, tab visibility, cancelled flag"

requirements-completed: [NEWS-01]

# Metrics
duration: 2min
completed: 2026-03-20
---

# Phase 16 Plan 02: Client News Infrastructure Summary

**Zustand newsStore with NewsCluster[] connection health and 15-min useNewsPolling hook wired into AppShell**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T19:21:40Z
- **Completed:** 2026-03-20T19:23:33Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- newsStore with clusters[], connectionStatus, clusterCount, articleCount, and setNewsData/setError/setLoading actions
- useNewsPolling hook with 15-min recursive setTimeout, tab visibility pause/resume, and cancelled flag cleanup
- NewsArticle and NewsCluster types re-exported from src/types/entities.ts for frontend consumption
- AppShell wires useNewsPolling alongside useFlightPolling, useShipPolling, useEventPolling, and useSiteFetch
- All 617 tests pass (50 test files), no new TypeScript errors introduced

## Task Commits

Each task was committed atomically:

1. **Task 1: newsStore + useNewsPolling + AppShell wiring** - `a1000ea` (feat)

## Files Created/Modified
- `src/stores/newsStore.ts` - Zustand store for news clusters with connection health tracking
- `src/hooks/useNewsPolling.ts` - 15-min recursive setTimeout polling hook with tab visibility awareness
- `src/types/entities.ts` - Added NewsArticle and NewsCluster to re-export list
- `src/components/layout/AppShell.tsx` - Wired useNewsPolling() after useSiteFetch()

## Decisions Made
- ConnectionStatus type defined locally in newsStore (same literal union as eventStore) rather than importing from eventStore -- avoids cross-store coupling
- articleCount computed as sum of articles across all clusters in setNewsData for aggregate statistics
- 15-min polling interval (NEWS_POLL_INTERVAL = 900_000) matches the GDELT DOC update frequency and server-side cache TTL

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- newsStore ready for Phase 17 notification center UI consumption
- useNewsPolling actively fetching from /api/news endpoint built in Plan 01
- All 5 polling hooks wired in AppShell (flights, ships, events, sites, news)

---
*Phase: 16-news-feed*
*Completed: 2026-03-20*
