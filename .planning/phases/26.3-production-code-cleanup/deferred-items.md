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
