---
phase: 16-news-feed
plan: 01
subsystem: api
tags: [gdelt-doc, rss, news-aggregation, jaccard-clustering, fast-xml-parser, express]

# Dependency graph
requires:
  - phase: 13-caching
    provides: Redis cacheGet/cacheSet pattern, CacheResponse type
  - phase: 14-deployment
    provides: Express server wiring pattern, error handler middleware
provides:
  - /api/news endpoint returning CacheResponse<NewsCluster[]>
  - NewsArticle and NewsCluster type definitions
  - GDELT DOC 2.0 ArtList adapter
  - RSS feed adapter with 5 Middle East news sources
  - Keyword whitelist conflict filter (60+ terms)
  - URL hash dedup + Jaccard title clustering within 24h window
affects: [16-02, 17-notifications]

# Tech tracking
tech-stack:
  added: [fast-xml-parser]
  patterns: [news-aggregation-pipeline, jaccard-title-clustering, keyword-whitelist-filtering]

key-files:
  created:
    - server/adapters/gdelt-doc.ts
    - server/adapters/rss.ts
    - server/lib/newsFilter.ts
    - server/lib/newsClustering.ts
    - server/routes/news.ts
    - server/__tests__/lib/newsFilter.test.ts
    - server/__tests__/lib/newsClustering.test.ts
    - server/__tests__/adapters/gdelt-doc.test.ts
    - server/__tests__/adapters/rss.test.ts
    - server/__tests__/routes/news.test.ts
  modified:
    - server/types.ts
    - server/constants.ts
    - server/index.ts
    - package.json

key-decisions:
  - "GDELT DOC 2.0 ArtList mode with 250 maxrecords and 24h timespan for article discovery"
  - "Jaccard similarity threshold 0.8 with 5-token minimum for fuzzy title clustering"
  - "Short titles (< 5 tokens) skip fuzzy matching to avoid false positive clusters"
  - "7-day sliding window for news retention, 15-min cache TTL matching GDELT update frequency"

patterns-established:
  - "News pipeline: fetch -> filter -> merge -> dedup/cluster -> prune -> cache"
  - "hashUrl: SHA-256 truncated to 16 hex chars for deterministic article IDs"
  - "server/lib/ directory for shared utility modules (filter, clustering)"

requirements-completed: [NEWS-01, NEWS-02, NEWS-03]

# Metrics
duration: 7min
completed: 2026-03-20
---

# Phase 16 Plan 01: News Aggregation Pipeline Summary

**Server-side news pipeline with GDELT DOC + 5 RSS feeds, keyword filtering, Jaccard title clustering, and cache-first /api/news endpoint**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T19:11:46Z
- **Completed:** 2026-03-20T19:19:06Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- NewsArticle/NewsCluster types and news constants added to server type system
- Keyword whitelist filter with 60+ conflict terms (military, diplomatic, geographic, organizational)
- URL hash deduplication + Jaccard title clustering within 24h window with configurable thresholds
- GDELT DOC 2.0 ArtList adapter with UTC seendate parsing and 250 maxrecords
- RSS adapter with fast-xml-parser for 5 feeds (BBC, Al Jazeera, Tehran Times, Times of Israel, Middle East Eye)
- Cache-first /api/news route with stale fallback, 7-day sliding window pruning
- 46 new tests (22 lib + 16 adapter + 8 route) -- all 199 server tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, constants, and core library modules** - `013c827` (feat)
2. **Task 2: GDELT DOC adapter + RSS adapter** - `5c44fe0` (feat)
3. **Task 3: Cache-first /api/news route + wire to server** - `bc36b77` (feat)

## Files Created/Modified
- `server/types.ts` - Added NewsArticle and NewsCluster interfaces
- `server/constants.ts` - Added news cache TTL, sliding window, Jaccard threshold constants
- `server/lib/newsFilter.ts` - Keyword whitelist conflict filter on title + summary
- `server/lib/newsClustering.ts` - URL hash dedup + Jaccard title clustering
- `server/adapters/gdelt-doc.ts` - GDELT DOC 2.0 ArtList API adapter
- `server/adapters/rss.ts` - Generic RSS feed parser with 5 configured feeds
- `server/routes/news.ts` - Cache-first /api/news route with merge/filter/cluster pipeline
- `server/index.ts` - Wired newsRouter at /api/news
- `server/__tests__/lib/newsFilter.test.ts` - 12 unit tests for keyword filter
- `server/__tests__/lib/newsClustering.test.ts` - 10 unit tests for dedup/clustering
- `server/__tests__/adapters/gdelt-doc.test.ts` - 7 tests for GDELT DOC adapter
- `server/__tests__/adapters/rss.test.ts` - 9 tests for RSS adapter
- `server/__tests__/routes/news.test.ts` - 8 integration tests for news route
- `package.json` - Added fast-xml-parser dependency

## Decisions Made
- Used GDELT DOC 2.0 ArtList mode (not timeline or tone) for article-level data with social images
- Jaccard similarity threshold at 0.8 with minimum 5 tokens -- prevents false positive clusters on short headlines
- 7-day sliding window for news retention (matching the expected news relevance window)
- RSS failures are silently skipped (best-effort); GDELT failure returns 500 or stale fallback
- Article IDs use SHA-256 hash of URL truncated to 16 hex chars for consistent dedup across sources

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RSS test mockResolvedValue body reuse**
- **Found during:** Task 2 (RSS adapter tests)
- **Issue:** `mockResolvedValue` with a single Response object caused "Body already read" errors when multiple feeds consumed the same response body
- **Fix:** Changed to `mockImplementation` returning a new Response per call
- **Files modified:** server/__tests__/adapters/rss.test.ts
- **Verification:** All 9 RSS tests pass
- **Committed in:** 5c44fe0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal -- test fixture issue only, no production code affected.

## Issues Encountered
None beyond the test fixture fix noted above.

## User Setup Required
None - no external service configuration required. GDELT DOC API is free and requires no authentication.

## Next Phase Readiness
- /api/news endpoint ready for frontend consumption in Plan 02
- NewsCluster[] response shape ready for newsStore and polling hook
- All server tests passing, typecheck clean
- fast-xml-parser dependency installed

## Self-Check: PASSED

All 12 created files verified present. All 3 task commits verified in git log.

---
*Phase: 16-news-feed*
*Completed: 2026-03-20*
