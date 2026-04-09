---
status: testing
phase: 27-conflict-geolocation-improvement
source:
  [
    27-01-SUMMARY.md,
    27-02-SUMMARY.md,
    27-03-SUMMARY.md,
    27-04-SUMMARY.md,
    27-05-SUMMARY.md,
    27-06-SUMMARY.md,
  ]
started: 2026-04-09T20:30:00Z
updated: 2026-04-09T20:40:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dev Server Starts

expected: `npm run dev` starts without errors. Page loads at http://localhost:5173 with the map visible. No ENOENT or plugin errors in the terminal.
result: pass

### 2. Test Suite Passes

expected: `npx vitest run` exits 0 with all 1331 tests passing across 106 test files. No failures or type errors.
result: pass
note: 1 pre-existing flaky failure in news.test.ts (CSRF token error, not Phase 27 related — last modified in Phase 26.4)

### 3. Event Layer Toggle Panel

expected: Layer toggle panel shows "Events" master toggle with 5 indented sub-toggles: Airstrikes, Ground Combat, Explosions, Targeted, Other. Each has a distinct red-shade color dot.
result: issue
reported: "There shouldn't be events toggles in the layers tab"
severity: major

### 4. Master Events Toggle

expected: Toggling master "Events" OFF hides all conflict event markers from the map. Toggling back ON shows them again.
result: issue
reported: "Not seeing any events at all"
severity: blocker

### 5. Sub-Toggle Filtering

expected: Each sub-toggle independently filters its event category. Turning off "Airstrikes" hides only airstrike markers. Other event types remain visible.
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 6. Event Colors

expected: Conflict events display in distinct shades of red on the map. They do NOT use yellow (flights), purple (ships), or green (sites) colors.
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 7. Event Detail Panel

expected: Clicking a conflict event on the map opens the detail panel showing the event type label from the new 5-type system (Airstrike, Ground Combat, Explosion, Targeted, or Other).
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 8. Graceful Degradation (No LLM Keys)

expected: Without CEREBRAS_API_KEY/GROQ_API_KEY set, conflict events still appear on the map using raw GDELT data with CAMEO-based classification. The map never goes blank.
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 9. Enriched Event Detail (With LLM Keys)

expected: With CEREBRAS_API_KEY or GROQ_API_KEY set in .env, clicking an event shows: summary paragraph, casualties (if available), precision indicator, "AI-enriched" badge, and source count.
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 10. Precision Radius Rings

expected: Events with non-exact precision show translucent red radius rings on the map: neighborhood=1km, city=5km, region=25km. Exact events show as point icons only.
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 11. Tooltip Precision Indicator

expected: Hovering over a conflict event shows a tooltip with precision indicator dots (showing the confidence level of the geolocation).
result: blocked
blocked_by: prior-phase
reason: "No events visible (blocked by Test 4 blocker)"

### 12. Architecture Docs Updated

expected: `docs/architecture/ontology/types.md` reflects the 5-type taxonomy. `grep -c "TODO(26.2)" docs/architecture/ontology/types.md docs/architecture/ontology/algorithms.md docs/architecture/data-flows.md` returns 0 for all files.
result: pass
note: Verified automatically — all 3 files return 0 TODO(26.2) matches, 5-type taxonomy present

## Summary

total: 12
passed: 3
issues: 2
pending: 0
blocked: 7
skipped: 0
blocked: 0

## Gaps

- truth: "Events master toggle + 5 sub-toggles should appear in the entity toggles section, not the visualization layers tab"
  status: failed
  reason: "User reported: There shouldn't be events toggles in the layers tab"
  severity: major
  test: 3
  artifacts:
  - src/components/layout/LayerTogglesSlot.tsx — EventMasterToggle + EventSubToggle components and EVENT_SUB_TOGGLES config were added here (lines 21-63, 117-174, 186-200). This is the visualization layers panel.
  - src/components/layout/FilterPanelSlot.tsx — Already has correct event toggles at lines 326-364 (master "All Events" FilterButton + 5 sub-type FilterButtons wired to filterStore)
    missing:
  - Remove event toggle components (EventMasterToggle, EventSubToggle, EVENT_SUB_TOGGLES) and the separator + event toggle rendering block from LayerTogglesContent() in LayerTogglesSlot.tsx
  - Remove the EVENT_TYPE_COLORS import and useFilterStore import (only needed for event toggles) from LayerTogglesSlot.tsx
  - FilterPanelSlot.tsx already has the correct implementation — no additions needed there

- truth: "Conflict events should be visible on the map with raw GDELT fallback when no LLM keys are set"
  status: failed
  reason: "User reported: Not seeing any events at all"
  severity: blocker
  test: 4
  artifacts:
  - server/schemas/cacheResponse.ts — conflictEventEntitySchema.type uses z.enum(['airstrike', 'on_ground', 'explosion', 'targeted', 'other']) which rejects old cached types
  - server/middleware/validateResponse.ts — sendValidated() throws 500 in dev mode on schema mismatch, or sends unvalidated in prod
  - server/routes/events.ts — serves cached events through sendValidated(res, eventsResponseSchema, ...) at lines 175, 183, 298-303, 308-312, 320-322, 334-338, 346-349
  - src/types/ui.ts — CONFLICT_TOGGLE_GROUPS only maps new 5 types, so old-type events that slip through in prod mode won't match any toggle group
    missing:
  - Cache migration strategy: Either (a) flush Redis events cache on deploy (simplest — add cache flush to deploy script or one-time route), or (b) add a migration layer in the events route that remaps old types to new types before validation, or (c) make the Zod schema accept both old and new types with a transform that normalizes old→new
  - Recommended fix: Option (b) — add a normalizeEventTypes() function before sendValidated that maps old types to new (ground_combat→on_ground, shelling→explosion, bombing→explosion, assassination→targeted, abduction→targeted, assault→on_ground, blockade→other, ceasefire_violation→other, mass_violence→other, wmd→other). This is the safest approach because it handles both stale cache AND any edge cases where old-format data re-enters the pipeline
  - Alternative quick fix: Flush both events:gdelt and events:llm Redis keys after deploying, forcing a fresh GDELT fetch that will produce new-type events. Risk: brief gap where no events are served until fresh fetch completes
