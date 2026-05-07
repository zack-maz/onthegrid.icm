# Phase 28.2.5 Deferred Items

Out-of-scope discoveries logged during plan execution per executor scope-boundary rule.

## From Plan 03 Execution (D-05)

Pre-existing test suite failures unrelated to D-05 changes — touched no WeatherOverlay code paths:

1. `src/__tests__/devApiStatus.test.tsx` — 5 failing tests reference the "Overview" tab. Per CLAUDE.md (Phase 28.2 W5 D-22): "DevApiStatus `Overview` tab folded into `All APIs` → renamed to **API Health**". Tests need updating to query the new tab name. Not introduced by Plan 03.

2. `src/__tests__/useEventPolling.test.ts` — 1 failing assertion: `expect(mockFetch).toHaveBeenCalledWith('/api/events')` fails because polling now passes `dashboardAuthHeaders()` as a second argument. Not introduced by Plan 03.

3. `src/__tests__/useFlightPolling.test.ts` — 1 failing assertion (same root cause: dashboardAuthHeaders second argument).

4. `src/__tests__/useShipPolling.test.ts` — 1 failing assertion (same root cause).

These 8 failures are pre-existing on commit 52a3216 (the wave's base commit) and survive `git diff` showing zero changes outside Plan 03's scope (`src/components/map/__tests__/WeatherOverlay.test.tsx` + `src/components/map/layers/WeatherOverlay.tsx`). Recommendation: address in a follow-up cleanup pass (out of scope for the api-green-gate phase).
