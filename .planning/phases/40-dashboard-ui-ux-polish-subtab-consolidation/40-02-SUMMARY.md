---
phase: 40-dashboard-ui-ux-polish-subtab-consolidation
plan: 02
subsystem: ui
tags:
  [react, dev-api-status, operator-console, collapsible-groups, drawer, status-tokens, degrade-open]

# Dependency graph
requires:
  - phase: 40-01
    provides: --color-status-* tokens (healthy/degraded/warning) + uiStore devApiGroupCollapsed/isOperatorDrawerOpen view-state + 3 toggle/setter actions
provides:
  - DevApiStatusAllApisTab restructured into hero header + 4 collapsible groups + operator-controls drawer
  - read-only hero rollup (api-health-hero) with 4 independently-degrading fields sourced from existing polls (no new fetch)
  - CollapsibleGroup + MutedPlaceholder in-file helper components (reusable group/placeholder idiom)
  - operator-console status dots migrated onto the --color-status-* namespace (tier banner + sparkline + hero/budget dots)
  - BudgetBlock + FlightRecorderBlock + actor-quality unified on the canonical muted-placeholder degrade pattern (honest render)
affects: [40-03 tab-bar interaction affordances, 40-04 regression-lock tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Collapsible grouped <section> driven by session-scoped uiStore state (aria-expanded/aria-controls + chevron, default-expanded)'
    - 'Default-closed drawer holding relocated destructive controls (conditional render so buttons are absent from the DOM until opened)'
    - 'Canonical muted-placeholder degrade (text-[10px] text-white/30 italic, "— no data (reason)") replacing self-hide return null'

key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx
    - src/components/ui/BudgetBlock.tsx
    - src/components/ui/FlightRecorderBlock.tsx
    - src/__tests__/components/DevApiStatus.prune.test.tsx
    - src/__tests__/components/DevApiStatus.actorQuality.test.tsx
    - src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx
    - src/components/ui/__tests__/BudgetBlock.test.tsx
    - src/components/ui/__tests__/FlightRecorderBlock.test.tsx

key-decisions:
  - 'Hero "last run" sourced from llmStatus.lastRun (already a prop in scope) rather than coupling to FlightRecorderBlock internal fetch — avoids a second data path; documented inline'
  - 'Tier-summary-banner keeps its verbatim pre-existing classes (mb-2 px-3 py-1 gap-3) — the 4px-grid rule applies to NEW chrome only; the banner is grandfathered chrome whose exact classes the diagnosticBlocks test pins'
  - 'actor-quality-empty wrapper testid RETAINED and the canonical actor-quality-placeholder nested inside it — preserves the existing testid contract while unifying the copy onto the muted pattern'
  - 'BudgetBlock/FlightRecorderBlock root wrappers shed their own mt-4/border-t/px-3 chrome — the CollapsibleGroup body now provides the surrounding structure'

patterns-established:
  - 'CollapsibleGroup(slug,title,collapsed,onToggle) — reusable accessible group section backed by uiStore.devApiGroupCollapsed'
  - 'MutedPlaceholder(testid,reason) — single source for the D-06 honest-degraded render'

requirements-completed: [UI-POLISH-01, UI-POLISH-02, UI-POLISH-03]

# Metrics
duration: 18min
completed: 2026-06-04
---

# Phase 40 Plan 02: API Health Tab Consolidation Summary

**`DevApiStatusAllApisTab` restructured from ~13 stacked sub-blocks into a scannable mission-control surface — a read-only hero rollup + 4 default-expanded collapsible groups + a default-closed operator-controls drawer — with the status dots migrated onto the Plan-01 `--color-status-*` namespace and the BudgetBlock/FlightRecorderBlock/actor-quality self-hides converted to honest muted placeholders.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3
- **Files modified:** 8 (3 source + 5 test)

## Accomplishments

- **Hero header (D-05):** added `<header data-testid="api-health-hero" role="status">` with 4 fields in health → pipeline → cost → data-quality order (`api-health-hero-endpoints/-llm/-budget/-deadurls`). Each field degrades to its own muted fallback independently. Sourced entirely from already-polled data (`health.endpoints`, `llmStatus.lastRun`, `opStatus.tokenBudget.providers.nvidia_nim`, `opStatus.prune.deadUrlCount`) — no new fetch.
- **4 collapsible groups (D-01/D-02):** wrapped the live-DOM sub-blocks into `group-endpoint-health`, `group-llm-pipeline`, `group-budget-cost`, `group-operator-actions` via a new in-file `CollapsibleGroup` helper (accessible `<button aria-expanded aria-controls>` + chevron `▸`/`▾` + `hidden={collapsed}` body). Default-expanded (devApiGroupCollapsed defaults `{}`). FlightRecorderBlock + the adversarial-eval row relocated into the LLM Pipeline group; BudgetBlock into Budget & Cost.
- **Operator-controls drawer (D-02a):** added a default-closed drawer (`operator-drawer`, gated by `isOperatorDrawerOpen`) holding ONLY the Replay (`replay-test-trigger`) + Prune (`prune-dead-urls-trigger`) destructive buttons with captions + an in-drawer close affordance + a scoped Escape handler that `stopPropagation` (so it does not bubble to the modal's capture-phase Escape). Their read-only counters (dead-URL count, drill-down list, actor-quality, 24h count, byBearer, both 429 alerts) stay in Group 4. The drawer is NOT in the document until opened.
- **Visual polish (D-03):** 13/11/10px three-tier hierarchy (hero metric ≫ group header `uppercase tracking-wider` ≫ label/value), two weights (400/600, no bold), `tabular-nums` on hero numerics, 4px-grid spacing on all new chrome, focus-visible rings on the group/drawer buttons.
- **Status-token migration (Task 2):** flipped the tier-banner dots (`--color-site-healthy`→`-status-healthy`, `--color-site-attacked`→`-status-degraded`, `--color-event-airstrike`→`-status-warning`) and the sparkline ok/fail dots onto the operator-console `--color-status-*` namespace. Byte-identical hex ⇒ zero runtime visual change. Hero + budget proximity dots also use the status tokens.
- **Honest degraded render (D-06, Task 3):** replaced `return null` self-hides in BudgetBlock (`budget-block-placeholder`) and FlightRecorderBlock (`flight-recorder-placeholder`) with the canonical muted placeholder (`text-[10px] text-white/30 italic` + `— no data ({reason})`); unified actor-quality (`actor-quality-placeholder`) and added a group-level `group-operator-actions-placeholder` when `opStatus == null`. Degrade-open semantics preserved (no throw, route stays 200).

## Task Commits

1. **Task 1 + 2 (restructure + status-token migration):** `f829f3b` (feat) — hero + 4 groups + drawer + the zero-visual-change `--color-status-*` migration (both live in DevApiStatus.tsx, committed together).
2. **Task 3 (muted-placeholder degrade):** `57d4940` (feat) — BudgetBlock + FlightRecorderBlock + actor-quality + group-null honest render.

## Files Created/Modified

- `src/components/ui/DevApiStatus.tsx` — hero + 4 `CollapsibleGroup` sections + `operator-drawer`; `CollapsibleGroup` / `MutedPlaceholder` / `heroRelativeTime` in-file helpers; status-token migration on tier banner + sparkline + hero/budget dots; relocated Replay + Prune buttons into the drawer; adversarial-eval row + FlightRecorderBlock + BudgetBlock moved into their groups.
- `src/components/ui/BudgetBlock.tsx` — `return null` → `budget-block-placeholder`; provider-empty row re-toned to canonical copy; shed the outer `mt-2 border-t pt-2` chrome (group body provides it).
- `src/components/ui/FlightRecorderBlock.tsx` — `return null` → `flight-recorder-placeholder`; `flight-recorder-empty` re-toned; root section chrome trimmed to `mt-2 text-xs`.
- Test updates (5 files) — see Deviations.

## Decisions Made

- Hero "last run" reads `llmStatus.lastRun` (a prop already in scope) rather than coupling to FlightRecorderBlock's internal `/api/events/llm-history` fetch — keeps the hero a pure derivation over existing data (documented inline). Outcome derived as `error == null ? ok : failed`.
- Tier-summary-banner keeps its verbatim pre-existing classes (`mb-2 px-3 py-1 gap-3 text-[10px]`); the 4px-grid rule applies to NEW structural chrome, and the diagnosticBlocks Test 3 pins those exact classes. Only the dot token NAMES changed.
- `actor-quality-empty` wrapper testid retained with the canonical `actor-quality-placeholder` nested inside — keeps the historical testid present while moving the copy onto the muted pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `relativeTime` symbol collision**

- **Found during:** Task 1 (first test run).
- **Issue:** DevApiStatus.tsx already declares a module-scope `relativeTime(iso: string)`; the new hero helper `relativeTime(ts: number)` collided (esbuild duplicate-symbol error; tsc did not flag it).
- **Fix:** renamed the new helper to `heroRelativeTime`.
- **Files modified:** `src/components/ui/DevApiStatus.tsx`.
- **Commit:** `f829f3b`.

**2. [Rule 1 - Test pollution] prune test drawer-state leak**

- **Found during:** Task 1.
- **Issue:** the prune test's `beforeEach` reset `isDevApiStatusOpen`/`activeDevApiStatusTab` but NOT the new session-scoped `isOperatorDrawerOpen`. After the first test opened the drawer, the next test's `operator-drawer-trigger` click TOGGLED it closed → relocated button missing.
- **Fix:** reset `isOperatorDrawerOpen: false` + `devApiGroupCollapsed: {}` in the prune test `beforeEach`.
- **Files modified:** `src/__tests__/components/DevApiStatus.prune.test.tsx`.
- **Commit:** `f829f3b`.

### Authorized test updates (per plan `<verification>`: "update assertions to the new group ancestry / moved sub-block — do NOT delete coverage")

- **prune test** (4 cases): open the `operator-drawer-trigger` before asserting/clicking the relocated `prune-dead-urls-trigger`. Coverage preserved.
- **diagnosticBlocks test** (Test 2, 16, 18): updated the tier-banner + sparkline dot-color assertions from the old map tokens to `--color-status-*` (the Task 2 migration). Coverage preserved.
- **actorQuality test** (empty case): assert `actor-quality-placeholder` + `— no data (no actor data)` copy.
- **BudgetBlock test** (2 cases): assert `budget-block-placeholder` and the re-toned `budget-empty` copy instead of `container.firstChild === null`.
- **FlightRecorderBlock test** (degrade-open): assert `flight-recorder-placeholder` renders (and the full `flight-recorder` section does NOT) on a non-200 response.

## Known Stubs

None. The hero "last run" reads live `llmStatus.lastRun` (not a hardcoded placeholder); all 4 groups + hero render from real polls with honest muted fallbacks on null.

## Threat Flags

None. No new endpoint, fetch, or mutation surface. The Replay/Prune buttons were RELOCATED (not re-implemented); their server-side Bearer + 50/24h quota gates are unchanged. Moving them into a default-closed drawer is a mild defense-in-depth improvement (reduces accidental-click exposure; keeps destructive controls out of default portfolio screenshots) per the plan's threat register (T-40-02-01 accept).

## Issues Encountered

None beyond the two auto-fixed items above.

## Verification

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` (full suite) → **2498 passed | 19 skipped | 5 todo** (0 failures).
- 4 named test files (DevApiStatusAllApisTab, prune, actorQuality, diagnosticBlocks) → 38 passed.
- operatorActions + tabMerge + devApiStatus + colorBridge → all green.
- grep `--color-site-healthy` / `--color-event-airstrike` / `--color-site-attacked` in DevApiStatus.tsx → 0 (migration complete).
- grep `tokenBudget == null) return null` / `data == null) return null` in BudgetBlock + FlightRecorderBlock → 0 (degrade conversion complete).
- All preserved testids present (tier-summary-banner, audit-result-banner, llm-pipeline-section, adversarial-eval-row, operator-actions-24h-count, dead-url-count, actor-quality-row, replay/prune-quota-alert, replay-test-trigger, prune-dead-urls-trigger, budget-block, flight-recorder, all-apis-tab, api-health-retry).
- `npx eslint` on the 3 source files → 0 errors.

## Self-Check: PASSED

- FOUND: src/components/ui/DevApiStatus.tsx (api-health-hero + group-\* + operator-drawer)
- FOUND: src/components/ui/BudgetBlock.tsx (budget-block-placeholder)
- FOUND: src/components/ui/FlightRecorderBlock.tsx (flight-recorder-placeholder)
- FOUND commit: f829f3b (Task 1+2)
- FOUND commit: 57d4940 (Task 3)

---

_Phase: 40-dashboard-ui-ux-polish-subtab-consolidation_
_Completed: 2026-06-04_
