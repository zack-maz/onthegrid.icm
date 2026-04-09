---
phase: 27-conflict-geolocation-improvement
plan: 02
subsystem: api
tags: [openai, cerebras, groq, llm, nominatim, zod, gdelt, event-grouping, geocoding]

# Dependency graph
requires:
  - phase: 27-01
    provides: CEREBRAS_API_KEY and GROQ_API_KEY env vars in server/config.ts
provides:
  - Multi-provider LLM adapter (Cerebras primary, Groq fallback)
  - GDELT event grouping algorithm (date + CAMEO root + 50km proximity)
  - LLM event extractor with Zod-validated batch processing
  - Nominatim forward geocoding with Redis cache and rate limiting
affects: [27-03, 27-04, 27-05, 27-06]

# Tech tracking
tech-stack:
  added: [openai npm SDK]
  patterns: [multi-provider LLM adapter via baseURL swap, Zod-validated LLM output, batch LLM processing, forward geocoding with rate limiting]

key-files:
  created:
    - server/adapters/llm-provider.ts
    - server/lib/eventGrouping.ts
    - server/lib/llmEventExtractor.ts
    - server/__tests__/adapters/llm-provider.test.ts
    - server/__tests__/lib/eventGrouping.test.ts
    - server/__tests__/lib/llmEventExtractor.test.ts
    - server/__tests__/adapters/nominatim-forward.test.ts
  modified:
    - server/adapters/nominatim.ts
    - server/config.ts
    - package.json

key-decisions:
  - "CEREBRAS_API_KEY and GROQ_API_KEY added to config.ts inline (Plan 01 parallel execution)"
  - "OpenAI SDK class mock uses ES6 class syntax for proper constructor behavior in tests"
  - "Batch user prompts include representative entity data (actor names, location, Goldstein scale) for LLM context"
  - "Geocode cache key uses lowercase trimmed place name for dedup"

patterns-established:
  - "Multi-provider LLM adapter: lazy client init, Cerebras primary, Groq fallback, null on total failure"
  - "Zod post-validation of LLM JSON output: parse JSON then safeParse with Zod schema"
  - "Batch LLM processing: chunk groups into BATCH_SIZE=8, process sequentially, skip failed batches"
  - "Forward geocoding: sequential 1s delays, Redis cache with 30-day TTL, fallback to GDELT ActionGeo coordinates"

requirements-completed: [D-01, D-02, D-04, D-05, D-11, D-12, D-14, D-15, D-17, D-18, D-19]

# Metrics
duration: 5min
completed: 2026-04-09
---

# Phase 27 Plan 02: Core Pipeline Modules Summary

**Multi-provider LLM adapter (Cerebras/Groq), GDELT event grouping by proximity, Zod-validated batch extractor, and Nominatim forward geocoding with 30-day Redis cache**

## Performance

- **Duration:** 5 min 26s
- **Started:** 2026-04-09T19:35:09Z
- **Completed:** 2026-04-09T19:40:35Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Multi-provider LLM adapter using OpenAI SDK baseURL swap pattern (Cerebras primary at gpt-oss-120b, Groq fallback at openai/gpt-oss-120b, null on total failure)
- Event grouping algorithm clusters GDELT ConflictEventEntity rows by same day + same CAMEO root code + within 50km haversine distance
- LLM event extractor with system prompt, JSON Schema enforcement, Zod validation, and batch processing (8 groups per LLM call)
- Nominatim forward geocoding added alongside existing reverse geocode, with Redis cache (30-day TTL) and 1s rate limiting
- geocodeEnrichedEvents falls back to GDELT ActionGeo coordinates when Nominatim fails
- 20 passing tests across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-provider LLM adapter + event grouping algorithm** - `0291152` (feat)
2. **Task 2: LLM event extractor + Nominatim forward geocoding** - `79bd93e` (feat)

## Files Created/Modified
- `server/adapters/llm-provider.ts` - Multi-provider LLM adapter (Cerebras + Groq with OpenAI SDK)
- `server/lib/eventGrouping.ts` - GDELT row grouping by date + CAMEO root + geographic proximity
- `server/lib/llmEventExtractor.ts` - LLM prompt construction, Zod validation, batch processing, geocoding pipeline
- `server/adapters/nominatim.ts` - Added forwardGeocode alongside existing reverseGeocode
- `server/config.ts` - Added CEREBRAS_API_KEY and GROQ_API_KEY env vars
- `package.json` - Added openai npm dependency
- `server/__tests__/adapters/llm-provider.test.ts` - 4 tests: success, fallback, both-fail, model IDs
- `server/__tests__/lib/eventGrouping.test.ts` - 5 tests: merge, date split, distance split, centroid, sums
- `server/__tests__/lib/llmEventExtractor.test.ts` - 5 tests: enriched output, null degradation, Zod rejection, batching, precision enum
- `server/__tests__/adapters/nominatim-forward.test.ts` - 6 tests: success, failure, countryCode, rate limit, empty results, network error

## Decisions Made
- Added CEREBRAS_API_KEY and GROQ_API_KEY to server/config.ts directly (deviation Rule 3) since Plan 01 executes in parallel and config changes were blocking
- Used ES6 class syntax for OpenAI mock in tests (vi.fn().mockImplementation creates a function, not a class constructor)
- Batch user prompts include representative entity data for richer LLM context (actor names, location, Goldstein scale, source URLs)
- Geocode cache key uses lowercase trimmed place name (`geocode:fwd:baghdad`) for consistent dedup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added CEREBRAS_API_KEY and GROQ_API_KEY to server/config.ts**
- **Found during:** Task 1 (LLM adapter implementation)
- **Issue:** Plan states these come from Plan 01, but Plan 01 executes in parallel (wave 1). The config entries were required for the LLM adapter to import env vars.
- **Fix:** Added both keys as optional z.string().default('') entries in envSchema, following existing API key pattern
- **Files modified:** server/config.ts
- **Verification:** Tests pass, adapter reads keys from env correctly
- **Committed in:** 0291152 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for parallel execution. No scope creep. If Plan 01 also adds these keys, the later merge will detect the duplicate and one copy will be kept.

## Issues Encountered
None - plan executed cleanly after the config deviation.

## User Setup Required
None - no external service configuration required. LLM API keys are optional (graceful degradation to raw GDELT when unconfigured).

## Next Phase Readiness
- All 4 modules ready for Plan 03 to wire into the events route
- callLLM, groupGdeltRows, processEventGroups, geocodeEnrichedEvents, forwardGeocode all exported and tested
- EventGroup and EnrichedEvent types available for downstream consumers

## Self-Check: PASSED

- All 9 created/modified source files verified on disk
- Both task commits verified in git log (0291152, 79bd93e)
- All 20 tests pass across 4 test files

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
