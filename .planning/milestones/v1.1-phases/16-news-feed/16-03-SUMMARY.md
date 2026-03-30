---
phase: 16-news-feed
plan: 03
subsystem: api
tags: [gdelt, rss, news, sourceCountry, english-filter]

# Dependency graph
requires:
  - phase: 16-news-feed
    provides: "GDELT DOC adapter and RSS adapter from plans 01-02"
provides:
  - "NewsArticle.sourceCountry field populated for all article sources"
  - "GDELT DOC queries filtered to English-language articles only"
  - "RSS feeds tagged with known country of origin"
affects: [17-news-ui, 18-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GDELT inline query modifiers (sourcelang:english) for language filtering"
    - "Per-feed country mapping in RSS_FEEDS config for source attribution"

key-files:
  created: []
  modified:
    - server/types.ts
    - server/adapters/gdelt-doc.ts
    - server/adapters/rss.ts
    - server/__tests__/adapters/gdelt-doc.test.ts
    - server/__tests__/adapters/rss.test.ts
    - server/__tests__/routes/news.test.ts

key-decisions:
  - "GDELT sourcelang:english appended to query string (inline modifier, not separate param)"
  - "RSS country mapping uses static config per feed (not runtime detection)"

patterns-established:
  - "GDELT query modifiers appended after parenthesized OR group"
  - "RSS_FEEDS config includes country field for source attribution"

requirements-completed: [NEWS-01, NEWS-02, NEWS-03]

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 16 Plan 03: Source Country & English Filter Summary

**NewsArticle sourceCountry field populated from GDELT metadata and RSS feed config, with GDELT queries filtered to English-language articles via sourcelang:english**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T19:48:49Z
- **Completed:** 2026-03-20T19:52:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `sourceCountry?: string` to NewsArticle interface for country-of-origin tracking
- GDELT DOC adapter now maps `sourcecountry` API field and filters to English-only via `sourcelang:english`
- RSS adapter tags each article with its feed's known country (BBC -> UK, Al Jazeera -> Qatar, etc.)
- All 25 news tests pass including 1 new test, full suite green at 618 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sourceCountry field and English-only GDELT filter** - `c5a4e57` (feat)
2. **Task 2: Update tests for sourceCountry and English filter** - `74785a7` (test)

## Files Created/Modified
- `server/types.ts` - Added `sourceCountry?: string` to NewsArticle interface
- `server/adapters/gdelt-doc.ts` - Added `sourcelang:english` query filter and `sourceCountry` mapping
- `server/adapters/rss.ts` - Added `country` to RSS_FEEDS config and `sourceCountry` to article mapping
- `server/__tests__/adapters/gdelt-doc.test.ts` - Assert sourceCountry mapping, sourcelang in URL, undefined when missing
- `server/__tests__/adapters/rss.test.ts` - Assert country field on feeds, sourceCountry on articles
- `server/__tests__/routes/news.test.ts` - Updated makeArticle helper and response shape assertions

## Decisions Made
- GDELT `sourcelang:english` appended as inline query modifier after the OR group (GDELT DOC API supports this natively)
- RSS country mapping uses static config rather than runtime detection (known feeds with fixed countries of origin)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT gap "titles should be translated to English and tagged with country of origin" is now closed
- All news articles carry sourceCountry metadata ready for UI display in Phase 17
- GDELT returns English-only articles, eliminating non-English title noise

## Self-Check: PASSED

All 6 modified files verified on disk. Both commit hashes (c5a4e57, 74785a7) confirmed in git log.

---
*Phase: 16-news-feed*
*Completed: 2026-03-20*
