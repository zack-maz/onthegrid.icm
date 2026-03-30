---
status: diagnosed
phase: 13-serverless-cache-migration
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md]
started: 2026-03-20T00:30:00Z
updated: 2026-03-20T00:30:00Z
---

## Current Test

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env. Run `npm run dev`. Server boots without errors. No AISStream WebSocket connection attempted on startup.
result: pass

### 2. Flights API Returns Data via Redis
expected: With server running, open the dashboard or hit /api/flights directly. Flight data should load and appear on the map (yellow chevrons). No difference in behavior from before the migration.
result: pass

### 3. Ships API Returns Data via Redis
expected: Hit /api/ships or observe the dashboard. Ship data should appear (gray chevrons). The first request may take ~5s (AISStream collect window) but subsequent requests within 30s should return cached data instantly.
result: pass

### 4. Events API Returns Data via Redis
expected: Hit /api/events or observe the dashboard. Conflict events should appear on the map (red icons). Data accumulates across polls — refreshing after 15+ minutes should show more events, not replace them.
result: issue
reported: "The date range filter is no longer working"
severity: major

### 5. Dashboard Full Load
expected: Open the full dashboard in browser. All three data types render on the map: flights (yellow), ships (gray), conflict events (red). Status panel shows connection dots. Layer toggles work. Detail panel opens on click.
result: pass

### 6. Env Template Updated
expected: Check .env.example — it should contain UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, and AISSTREAM_COLLECT_MS entries.
result: pass
note: Entries present — AISSTREAM_COLLECT_MS commented as optional. False positive.

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Events API returns data filtered by date range when date range filter is active"
  status: failed
  reason: "User reported: The date range filter is no longer working"
  severity: major
  test: 4
  root_cause: "Phase 13 rewrite of events.ts removed backfillEvents() startup mechanism that populated historical event data. Date filtering is client-side and works correctly, but without historical data seeded, the event pool only contains the latest 15-minute GDELT window — nothing to filter by date range."
  artifacts:
    - path: "server/routes/events.ts"
      issue: "Missing backfillEvents import and startup backfill logic (removed in commit 386d140)"
    - path: "server/adapters/gdelt.ts"
      issue: "backfillEvents() function exists (lines 305-337) but is orphaned — no callers"
  missing:
    - "Re-introduce backfill mechanism adapted for Redis/serverless: Redis-backed 'last backfill timestamp' key, trigger backfill on first request when gap exceeds threshold"
  debug_session: ".planning/debug/date-range-filter-broken.md"
