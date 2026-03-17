---
status: diagnosed
phase: 08-ship-conflict-data-feeds
source: [08-01-SUMMARY.md]
started: 2026-03-17T03:00:00Z
updated: 2026-03-17T03:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running servers. Run `npm run dev` from scratch. Both Vite (port 5173) and Express (port 3001) boot without errors. Visiting http://localhost:5173 loads the map. At least /api/flights returns data within 30 seconds.
result: pass

### 2. StatusPanel HUD Display
expected: Top-right of the map shows a compact panel with three lines. Each line has a small colored dot, a number (or dash if loading), and a label: "flights", "ships", "events". No dropdown selector visible.
result: pass

### 3. Flight Data Feed Active
expected: The flights line in the status panel shows a green dot and a non-zero count (e.g. "247 flights"). Green chevron aircraft icons appear on the map and update positions over time. Network tab shows /api/flights being polled every ~5 seconds.
result: pass

### 4. Ship Data Feed Active
expected: The ships line shows connection status. If AISSTREAM_API_KEY is not configured in .env, expect a red or yellow dot with "0 ships". If configured, expect a green dot with a count and blue diamond icons on the map. Network tab shows /api/ships being polled every ~30 seconds.
result: pass

### 5. Event Data Feed Active
expected: The events line shows connection status. If ACLED credentials are in .env, expect a green dot with a count and red starburst/X icons in the Greater Middle East region. If not configured, expect error state. Network tab shows /api/events being polled every ~300 seconds.
result: issue
reported: "No events. 0 pulling"
severity: major

### 6. Status Dot Colors
expected: Dot colors reflect connection health: green for connected (data flowing), yellow for stale (no fresh data recently), red for error (fetch failures). While data is initially loading, the dot should be gray and pulsing with a dash instead of a count number.
result: pass

### 7. SourceSelector Removed
expected: There is NO dropdown or combobox for switching flight data sources (OpenSky, ADS-B Exchange, adsb.lol). The old SourceSelector UI element is completely gone from the interface.
result: pass

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Events line shows connection status and /api/events is polled every ~300 seconds"
  status: failed
  reason: "User reported: No events. 0 pulling"
  severity: major
  test: 5
  root_cause: "/api/events returns HTTP 500 because ACLED OAuth2 credentials are invalid/expired. useEventPolling.ts has no res.ok check so the error is silently swallowed. 300s poll interval means only one failed request on load with no retry for 5 minutes."
  artifacts:
    - path: "src/hooks/useEventPolling.ts"
      issue: "Missing res.ok check before res.json() — silent failure on 500"
    - path: "server/routes/events.ts"
      issue: "No credential guard — attempts upstream ACLED call even with bad/missing credentials"
    - path: "src/stores/eventStore.ts"
      issue: "setEventData() assumes response.data exists, throws TypeError on error responses"
  missing:
    - "Add res.ok check in useEventPolling.ts (and useShipPolling.ts, useFlightPolling.ts for consistency)"
    - "Add credential guard in server/routes/events.ts (503 if ACLED_EMAIL/ACLED_PASSWORD missing)"
    - "User must verify ACLED credentials at acleddata.com"
  debug_session: ".planning/debug/event-feed-zero-events.md"
