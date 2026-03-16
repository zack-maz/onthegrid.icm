---
status: complete
phase: 07-adsb-lol-data-source
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md]
started: 2026-03-16T20:30:00Z
updated: 2026-03-16T20:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start fresh with `npm run dev`. Server boots without errors. Opening the app in the browser loads the map without console errors.
result: pass

### 2. SourceSelector Shows Three Options
expected: Open the app. Click the source selector dropdown. Three options visible: "OpenSky", "ADS-B Exchange", and "adsb.lol".
result: pass

### 3. Default Source Is adsb.lol
expected: Clear localStorage (DevTools > Application > Clear site data) and reload the page. The source selector should show "adsb.lol" as the selected/active source without any user action.
result: pass

### 4. Unconfigured Sources Appear Disabled
expected: If OpenSky or ADS-B Exchange API keys are NOT set in .env, those options in the dropdown should appear grayed out / disabled with an "(API key required)" hint text. adsb.lol should always be enabled.
result: pass

### 5. Selecting a Disabled Source Does Nothing
expected: Click on a grayed-out/disabled source option in the dropdown. Nothing should happen — the active source should NOT change, the dropdown should not close or switch.
result: pass

### 6. adsb.lol Polling at 30s Intervals
expected: With adsb.lol selected, open DevTools Network tab. After the initial fetch to /api/flights?source=adsblol, subsequent fetches should occur approximately every 30 seconds (not 5s like OpenSky or 260s like ADS-B Exchange).
result: pass

### 7. /api/sources Endpoint Returns Config Status
expected: Visit http://localhost:3001/api/sources in the browser. Response should be JSON with three keys (opensky, adsb, adsblol), each with a `configured` boolean. adsblol.configured should always be true.
result: pass

### 8. Source Switch Persists Across Reload
expected: Select a different source (e.g., switch from adsb.lol to OpenSky if configured). Reload the page. The previously selected source should still be active (persisted in localStorage).
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
