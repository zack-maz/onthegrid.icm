# Deferred Items - Phase 23.2

## Pre-existing Server Test Failures

Server-side tests (news, ships, sources, events, markets, sites, flights) fail due to `geocodeRouter` referenced in `server/index.ts:74` from commit `684f519` (23.2-02 plan executed before 23.2-01). The rate limiter entry `rateLimiters.geocode` or the router import is undefined/broken, causing `TypeError: argument handler must be a function` in all server test files that instantiate the Express app via `createApp()`.

**Not caused by this plan's changes.** All 662 client-side tests pass cleanly.
