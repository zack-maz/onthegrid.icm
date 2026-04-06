# Deferred Items - Phase 26.3

## Route Integration Tests Need Config Mock Updates

**Found during:** Plan 02, Task 2
**Root cause:** Plan 01 config consolidation (Zod validation + constants merge into config.ts) changed route patterns with `validateQuery` middleware, but route test mocks weren't updated to export the new constants from config.js.
**Affected tests:**
- `server/__tests__/routes/flights.test.ts` (6 tests)
- `server/__tests__/routes/events.test.ts` (12 tests)
- `server/__tests__/routes/news.test.ts` (6 tests)
- `server/__tests__/routes/water.test.ts` (5 tests)
- `server/__tests__/routes/geocode.test.ts` (3 tests)
- `server/__tests__/server.test.ts` (1 test)
**Fix:** Update config.js mocks in each test file to export all constants (IRAN_BBOX, CACHE_TTL, WAR_START, etc.) alongside the config object.
**Priority:** Should be fixed before Plan 03 or as a standalone patch.

## Pre-existing Uncommitted Changes (out of scope for Plan 06)

**Found during:** Plan 06, Task 1 (during `git status` check)
**Root cause:** Working tree contained uncommitted modifications to several files from a prior in-progress session before Plan 06 began. None of these changes are related to test coverage / it.todo() removal.
**Affected files:**
- `src/components/layout/DetailPanelSlot.tsx`
- `src/components/map/BaseMap.tsx` (MapMouseEvent type, ETHNIC_GROUPS import removal)
- `src/components/map/layers/EthnicOverlay.tsx` (GeoJsonLayer type cast comment)
- `src/components/map/layers/PoliticalOverlay.tsx`
- `src/components/map/layers/WaterOverlay.tsx`
- `src/components/search/SearchModal.tsx`
- `src/components/search/SearchResultGroup.tsx`
- `src/components/search/SearchResultItem.tsx`
- `src/components/search/SyntaxOverlay.tsx`
- `src/components/search/TagChipRow.tsx`
- `src/hooks/useAutocomplete.ts`
- `src/hooks/useEntityLayers.ts`
- `src/lib/panelLabel.ts`
- `src/lib/queryEvaluator.ts`
- `src/lib/searchUtils.ts`

**Fix:** These changes were left untouched by Plan 06 to keep the commit scope clean. They should be either reviewed and committed (if intentional) or discarded (if cruft from an aborted attempt) as a standalone follow-up.
**Priority:** Low — they do not affect test pass/fail or build.
