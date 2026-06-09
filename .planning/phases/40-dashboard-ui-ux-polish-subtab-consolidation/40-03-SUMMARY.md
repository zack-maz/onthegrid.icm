---
phase: 40-dashboard-ui-ux-polish-subtab-consolidation
plan: 03
subsystem: ui
tags: [a11y, wai-aria, tablist, roving-tabindex, focus-visible, devapistatus, agent-native]

# Dependency graph
requires:
  - phase: 40-dashboard-ui-ux-polish-subtab-consolidation (Plan 02)
    provides: consolidated DevApiStatusAllApisTab (groups + drawer + hero), relocated retry/replay/prune controls
provides:
  - focus-visible accent-blue ring on TabButton (shared with group/drawer/retry buttons)
  - 2px accent-blue active-tab bottom indicator (greyscale-readable)
  - roving-tabindex keyboard navigation on the tablist (ArrowLeft/Right wrap focus-only, Home/End, Enter/Space activate)
  - role=tabpanel + aria-labelledby on all 4 panel containers; id prop on TabButton
  - agent-native parity verdict (UI-POLISH-04 / SC40-2): consolidation introduces NO new UI-only action
affects:
  [41-public-reveal-polish (REVEAL-SITE-01 owns the visual chrome reveal; D-04b lockdown preserved)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'WAI-ARIA tablist roving-tabindex: only active tab has tabIndex=0; arrow keys move focus (manual activation), Enter/Space activates'
    - 'D-04b additive-only affordance pattern: focus-visible ring + active indicator appended WITHOUT touching chrome (colors/padding/radius/font)'

key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx

key-decisions:
  - 'D-04b chrome lockdown honored: TabButton px-3 py-1 / rounded-md / active bg-white/10 text-white / font UNCHANGED — Phase 41 REVEAL-SITE-01 owns the visual reveal; only affordances added'
  - 'Manual-activation roving pattern (arrow moves focus, does NOT call setDevApiStatusTab) per WAI-ARIA tablist spec; Enter/Space commits activation'
  - 'Roving handler computes the ordered visible-tab set from the showXTab gates at keydown time so dynamic tab visibility stays correct'

patterns-established:
  - 'Tablist roving-tabindex keyboard nav over a DYNAMIC visible-tab set (gated tabs)'
  - 'Additive a11y affordance under a chrome-restyle lockdown (Phase 41 ownership boundary)'

requirements-completed: [UI-POLISH-04]

# Metrics
duration: ~2min (Tasks 1-2 execution); checkpoint approval same session
completed: 2026-06-04
---

# Phase 40 Plan 03: Tab-Bar Interaction Affordances Summary

**WAI-ARIA tablist affordances on the dev-shell tab bar — focus-visible accent-blue ring, 2px greyscale-readable active-tab indicator, roving-tabindex keyboard nav (arrow-wrap focus-only, Home/End, Enter/Space activate), and role=tabpanel/aria-labelledby on all 4 panels — added purely additively under the D-04b chrome lockdown, with agent-native parity confirmed PASS.**

## Performance

- **Duration:** ~2 min (Task 1 + Task 2 execution); Task 3 review checkpoint approved same session
- **Started:** 2026-06-04T20:13:33-0700 (Task 1 commit)
- **Completed:** 2026-06-04
- **Tasks:** 3 (2 auto, 1 human-verify checkpoint)
- **Files modified:** 1 (`src/components/ui/DevApiStatus.tsx`)

## Accomplishments

- `TabButton` gained a `focus-visible:ring-2 focus-visible:ring-accent-blue/60` ring (keyboard focus only — no ring on mouse click), a 2px `border-b-2 border-accent-blue` active indicator (readable in greyscale), `tabIndex={active ? 0 : -1}` roving, and an `id` prop for `aria-labelledby` wiring.
- The same focus-visible ring was applied to the Plan-02 group-header collapse buttons, the operator-controls drawer trigger, and the per-endpoint retry buttons.
- The tablist `<div role="tablist">` gained an `onKeyDown` roving-nav handler: ArrowLeft/Right move focus between visible tabs WRAPPING at the ends (focus-only, no activation), Home/End jump to first/last, Enter/Space activate the focused tab via `setDevApiStatusTab`.
- All 4 panel containers received `role="tabpanel"` + `aria-labelledby` pointing at their tab's `id`.
- **Agent-native parity verified PASS** — the Plan 02 + Plan 03 consolidation introduces NO new UI-only action.

## Task Commits

1. **Task 1: focus-visible ring + 2px active indicator + roving tabIndex + shared ring on group/drawer/retry buttons** — `b9dd811` (feat)
2. **Task 2: tablist roving keyboard nav (onKeyDown) + role=tabpanel/aria-labelledby on all 4 panels** — `ddf2501` (feat)
3. **Task 3: agent-native parity verification** — checkpoint:human-verify (no code commit; verdict captured below; human approved)

## Files Created/Modified

- `src/components/ui/DevApiStatus.tsx` — TabButton affordances (ring/indicator/roving/id), tablist `onKeyDown` roving-nav handler, tabpanel roles + aria-labelledby on the 4 panels, shared focus ring on group/drawer/retry buttons. (+147 / −28)

## Decisions Made

- **D-04b chrome lockdown honored.** TabButton `px-3 py-1`, `rounded-md`, active `bg-white/10 text-white`, and font are UNCHANGED — every change is an additive affordance. Phase 41 REVEAL-SITE-01 owns the shell's visual reveal; a code comment flags the active indicator for Phase 41 to preserve.
- **Manual-activation roving pattern.** Arrow keys move focus only (do NOT call `setDevApiStatusTab`); Enter/Space commits activation — per WAI-ARIA tablist spec.
- **Dynamic visible-tab set.** The roving handler computes the ordered list of currently-rendered tabs from the `showApiHealthTab`/`showWaterTab`/`showSitesTab`/`showEventsTab` gates at keydown time, so wrap/Home/End stay correct as tab visibility changes.

## Agent-Native Parity Verdict (Task 3 — UI-POLISH-04 / SC40-2)

**VERDICT: PASS** — full agent-native parity; the Phase 40 consolidation introduces NO new UI-only action. **Human approved ("approved").**

Reviewed by both the executor static pass and the `compound-engineering:review:agent-native-reviewer` subagent against the UI-SPEC §"Agent-native parity" expected-pass manifest; both PASS, no flags.

**4/4 mutating controls map to Bearer-gated endpoints (all send `dashboardAuthHeaders()`):**

| UI control (testid → handler)                                               | Endpoint                                |
| --------------------------------------------------------------------------- | --------------------------------------- |
| Per-endpoint "Refresh now" (`api-health-retry-{name}` → `handleRefreshNow`) | `GET /api/{endpoint}?_ts=…`             |
| Replay probe (drawer, `replay-test-trigger` → `replayProbe`)                | `POST /api/events/llm-replay/test`      |
| Prune dead URLs (drawer, `prune-dead-urls-trigger` → `pruneHandler`)        | `POST /api/events/prune-dead-urls`      |
| LLM drill-down copy probe (`drill-down-copy` → `copyPromptResponse`)        | `POST /api/events/llm-replay/:groupKey` |

- The Operator Controls drawer **RELOCATED** (did not create) the Replay/Prune buttons — same handlers, same routes.
- All collapse/drawer/tab/row toggles, including the new Plan-03 roving keyboard nav, are pure client view-state and correctly classified as **exempt** (read-only presentation; no data crosses to the server).
- No new client-only state that cannot be reproduced via an endpoint was introduced.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dev-shell tab bar is now WAI-ARIA-conformant (roving tablist + tabpanel roles) and keyboard-navigable.
- **Phase 41 boundary preserved:** D-04b chrome lockdown was honored — TabButton colors/padding/radius/font untouched. REVEAL-SITE-01 can apply the visual reveal without un-doing affordance work; the active indicator carries a preserve-this comment for Phase 41.
- Plan 4 of 4 is next in Phase 40.

## Self-Check: PASSED

- `src/components/ui/DevApiStatus.tsx` — FOUND (modified, +147/−28 across b9dd811+ddf2501)
- Commit `b9dd811` — FOUND
- Commit `ddf2501` — FOUND
- `npx tsc --noEmit` — exit 0
- `npx vitest run src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx` — 11/11 passed

---

_Phase: 40-dashboard-ui-ux-polish-subtab-consolidation_
_Completed: 2026-06-04_
