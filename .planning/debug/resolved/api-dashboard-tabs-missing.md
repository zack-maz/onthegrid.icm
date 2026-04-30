---
status: resolved
trigger: 'not seeing events in API dashboard. water and events subtab should always be visible'
created: 2026-04-29T19:00:00Z
updated: 2026-04-29T19:55:00Z
resolution: 'Option A applied — Water + Events tabs always visible; Events body defaults to V3 when schemaVersion is unset. Tests + CLAUDE.md updated. 1929/1929 pass, tsc clean.'
---

## Current Focus

hypothesis: Both tabs are gated on dynamic state that is empty at cold start: Water tab on `useLayerStore.activeLayers.has('water')` (empty Set on load), Events tab on `llmStatus.schemaVersion === 'v2' | 'v3'` (undefined until pipeline reports back). Neither is the v2-only hardcode the orchestrator suspected — the v3 case is already covered. The visibility regression is the _empty-default_ state, not a v2/v3 mismatch.
test: read the gate logic in `src/components/ui/DevApiStatus.tsx` and verify the conditions against the source of truth for each piece of state.
expecting: confirm both gates evaluate `false` on a fresh load before any layer toggle / pipeline run.
next_action: present root cause + 2 fix options to the user.

## Symptoms

expected: Events and Water subtabs in DevApiStatus dashboard should always be visible
actual: Events subtab not visible (and possibly water too)
errors: (none reported — silent visibility issue)
reproduction: Open the app, click the dev API status trigger in the topbar, look for events/water subtabs — they're missing
started: (unknown — possibly after recent Phase 27.4.x changes)

## Evidence

- timestamp: 2026-04-29T19:15:00Z
  source: src/components/ui/DevApiStatus.tsx:739
  finding: |
  Water tab visibility gate:
  const showWaterTab = useLayerStore((s) => s.activeLayers.has('water'));
  The Water _visualization layer_ must be active for the tab to render.
  `activeLayers` is a `Set<VisualizationLayerId>` (src/stores/layerStore.ts:19) initialized empty.
  On a fresh page load nothing is in the Set ⇒ `showWaterTab === false` ⇒ tab hidden.

- timestamp: 2026-04-29T19:16:00Z
  source: src/components/ui/DevApiStatus.tsx:752-754
  finding: |
  Events tab visibility gate:
  const showEventsTab =
  (llmStatus?.schemaVersion === 'v2' || llmStatus?.schemaVersion === 'v3') &&
  shouldRenderDashboard();
  Two conjuncts. The first is the failure mode at runtime.

- timestamp: 2026-04-29T19:18:00Z
  source: src/hooks/useLLMStatusPolling.ts:314-355 + server/lib/llmProgress.ts:459
  finding: |
  `llmStatus` comes from `GET /api/events/llm-status`. The route reads
  `llmProgress.schemaVersion` from the server-side singleton (server/routes/events.ts:392).
  `INITIAL_PROGRESS.schemaVersion` is seeded `undefined` (llmProgress.ts:459) and is only
  populated inside `processEventGroupsV3` (and v2). On a serverless cold start with NO
  completed run, the in-memory singleton has `schemaVersion: undefined` AND the Redis
  summary fallback (`events:llm-summary:v2`) may not yet exist either.
  Result: `llmStatus.schemaVersion` is `undefined` ⇒ Events tab hidden.

  The same applies AFTER a deploy until the cron-triggered pipeline (Phase 27.4.6) lands
  its first run — between deploy and first run, the Events tab is hidden even when v3 is
  the active pipeline.

- timestamp: 2026-04-29T19:20:00Z
  source: src/lib/dashboardAuth.ts:60-62
  finding: |
  `shouldRenderDashboard()` returns `import.meta.env.DEV || hasDashboardKey()`.
  In prod the operator has stored the rotated DASHBOARD_PASSWORD (`hello`) in
  localStorage, so this conjunct is true. The dev/prod gate is NOT the blocker.

- timestamp: 2026-04-29T19:22:00Z
  source: src/components/ui/DevApiStatus.tsx:885-899
  finding: |
  The Events BODY is also re-gated:
  {activeTab === 'events' &&
  showEventsTab &&
  (llmStatus?.schemaVersion === 'v3' && shouldRenderDashboard() ? (
  <EventsFiltersSectionV3 llmStatus={llmStatus} />
  ) : llmStatus?.schemaVersion === 'v2' && shouldRenderDashboard() ? (
  <EventsFiltersSection llmStatus={llmStatus} />
  ) : null)}
  Even if the tab BUTTON is forced visible, the body still requires schemaVersion
  so it can pick which section component to mount. A single-conjunct fix on the
  button alone would render an empty body — both call sites need to be loosened
  in tandem.

- timestamp: 2026-04-29T19:25:00Z
  source: CLAUDE.md "Phase 27.4.4 / 27.4.6"
  finding: |
  The orchestrator's CLAUDE.md note "Gated on schemaVersion === 'v2' && import.meta.env.DEV"
  is STALE. Current code has been widened twice: 1. v2 OR v3 (so v3 doesn't get hidden on cutover). 2. import.meta.env.DEV → shouldRenderDashboard() (so prod with Bearer key works).
  What the user is actually hitting is the dynamic-state cold-start, not the
  static v2 hardcode.

## Eliminated

- Bearer auth / dev-vs-prod gate. `shouldRenderDashboard()` correctly returns true
  for both dev and prod-with-stored-token.
- v2 hardcode regression. Already widened to `'v2' || 'v3'` at both call sites.
- Tab body wiring. `setTab('events')` / `setTab('water')` are correctly defined in
  uiStore and wired via the TabButton onClick handlers.

## Resolution

root_cause: |
The Water and Events tab buttons are gated on dynamic state that is empty/unset
at cold start. - Water tab: `useLayerStore.activeLayers.has('water')` — empty Set on first load,
requires the user to first toggle the Water visualization layer ON before the
tab even appears. - Events tab: `llmStatus.schemaVersion === 'v2' | 'v3'` — undefined until the
LLM pipeline reports back at least once. On a fresh deploy or cold serverless
cold start before the cron fires, the field is undefined and the tab is hidden
even though v3 is the active pipeline.
The user's expectation is "always visible" for both. The fix is to drop both
dynamic gates (or replace them with a static "if this surface exists, show it"
check) at the tab-button site, and loosen the Events body switch so it can pick
v3 by default when schemaVersion is unset.

fix: (proposed — not yet applied; awaiting user choice)
Option A — minimal "always visible": 1. `showWaterTab = true` (delete the activeLayers gate at src/components/ui/DevApiStatus.tsx:739). 2. `showEventsTab = shouldRenderDashboard()` (drop the schemaVersion conjunct at line 752). 3. Default the Events body to V3 when schemaVersion is unknown:
{activeTab === 'events' && shouldRenderDashboard() &&
(llmStatus?.schemaVersion === 'v2' ? <EventsFiltersSection .../> : <EventsFiltersSectionV3 .../>)}
This makes V3 the default and V2 the explicit override — matches the actual rollout direction. 4. Remove the auto-snap-back effect entries for `water` and `events` at lines 775/777
since the tabs no longer disappear under the user's feet. 5. Update the test fixtures in src/**tests**/devApiStatusEventsSection.test.tsx
(R1 currently asserts the tab is HIDDEN when schemaVersion is unset — invert
under the new contract) and src/**tests**/DevApiStatusV3.test.tsx (any
schemaVersion=undefined empty-state assertion).

Option B — gate-decouple (more conservative):
Keep the activeLayers gate but EITHER seed `'water'` into `activeLayers` by default
OR add a separate `showWaterDashboardTab` flag that doesn't piggyback on the
visualization-layer toggle. Same for Events — keep the schemaVersion hint but
fall back to a "version unknown" placeholder in the body instead of hiding the
tab. Heavier code change; preserves the original intent that the tab reflects
the active layer.

Option A matches the user's verbatim request "should always be visible" and is
the smaller, safer change.

verification:

- Manual: open the dashboard with an empty `activeLayers` Set and a fresh
  `llmStatus = { stage: 'idle', lastRun: null }` — both tabs render. Click each,
  confirm the body mounts (Water shows WaterFiltersSection; Events shows
  EventsFiltersSectionV3 with v3 empty-state placeholders).
- Test: invert `R1: does NOT render the Events tab when schemaVersion is unset`
  in devApiStatusEventsSection.test.tsx; add a corresponding "renders Water tab
  when activeLayers is empty" case. Vitest dual-config: `npx vitest run` (web).

files_changed:

- src/components/ui/DevApiStatus.tsx (gates + body switch)
- src/**tests**/devApiStatusEventsSection.test.tsx (R1 inversion)
- src/**tests**/DevApiStatusV3.test.tsx (any schemaVersion=undefined assertions)
- CLAUDE.md (one-line update on the "Gated on …" note in the Phase 27.4 block)
