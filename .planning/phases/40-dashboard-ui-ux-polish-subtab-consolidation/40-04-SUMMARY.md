---
phase: 40-dashboard-ui-ux-polish-subtab-consolidation
plan: 04
subsystem: ui
tags:
  [
    react,
    rtl,
    vitest,
    regression-lock,
    snapshot,
    dev-api-status,
    operator-console,
    a11y,
    degrade-open,
  ]

# Dependency graph
requires:
  - phase: 40-02
    provides: consolidated DevApiStatusAllApisTab (hero + 4 collapsible groups + operator drawer + muted-placeholder degrade)
  - phase: 40-03
    provides: tab-bar interaction affordances (roving tabIndex, focus-visible ring, 2px active indicator, role=tabpanel)
  - phase: 40-01
    provides: --color-status-* tokens + colorBridge byte-identity sentinel (regression-lock assertion 7)
provides:
  - 8 UI-SPEC §Regression-Lock render-contract assertions coded as RTL tests across the 6 existing DevApiStatus test files (extended, not replaced)
  - 1 consolidated-layout snapshot locking the fully-populated DevApiStatusAllApisTab shape (hero + 4 expanded groups + closed drawer)
  - a maintainer cross-reference comment mapping each of assertions 1-8 to the file that owns it
affects:
  [
    phase-41 public-reveal (snapshot will churn if the consolidated chrome is restyled — expected; regenerate intentionally),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Reused operator-status fetch stub (route-by-URL vi.stubGlobal) to drive null vs populated opStatus for hero/Group-4 RTL contract tests'
    - 'Deterministic snapshot via pinned Date.now() so relative-time + freshness strings do not churn the layout-shape lock'
    - 'Snapshot scoped to the all-apis-tab subtree (not the whole modal) so unrelated chrome changes do not churn the regression lock'

key-files:
  created:
    - src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx
    - src/components/ui/__tests__/__snapshots__/DevApiStatusConsolidatedLayout.snapshot.test.tsx.snap
  modified:
    - src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx
    - src/__tests__/components/DevApiStatus.prune.test.tsx
    - src/components/ui/__tests__/DevApiStatus.operatorActions.test.tsx
    - src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx
    - src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx

key-decisions:
  - 'Assertion 2 muted-markup pinned in THREE vantages (DevApiStatusAllApisTab all-null, diagnosticBlocks health-present-opStatus-null, actorQuality empty) so the D-06 honest-render contract is locked from every degrade path, not just one'
  - 'Assertion 5 (drawer default-closed) coded in BOTH prune.test (Replay+Prune) and operatorActions.test (Replay-only, no prune block) so the security-adjacent "destructive controls absent until opened" contract holds across both opStatus shapes'
  - 'Snapshot scoped to the all-apis-tab subtree + Date.now() pinned — keeps the layout-shape lock stable and immune to modal-chrome / clock churn'

patterns-established:
  - 'Cross-reference comment block at the top of the snapshot file mapping all 8 UI-SPEC regression-lock assertions to their owning test file (maintainer navigation)'

requirements-completed: [UI-POLISH-05]

# Metrics
duration: ~12min
completed: 2026-06-04
---

# Phase 40 Plan 04: Regression-Lock Contract Summary

**The post-polish API Health dashboard is now regression-proof: the 8 UI-SPEC §Regression-Lock render-contract assertions (honest all-null render, muted placeholders, hero 4-field fallback + live values, default-expanded groups, default-closed destructive drawer, roving keyboard nav, `--color-status-*` byte-identity, and one fully-populated consolidated-layout snapshot) are coded as RTL/snapshot tests across the 6 existing DevApiStatus test files (extended, never deleted) plus one new snapshot file.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 3
- **Files:** 2 created (snapshot test + snapshot) + 5 modified (existing test files)

## Accomplishments

- **Assertions 1-4 (DevApiStatusAllApisTab.test.tsx):** new `describe` block reusing a route-by-URL operator-status fetch stub. (1) all 4 `group-*` sections render when `health=null` AND `opStatus=null`; (2) each null group body shows the muted placeholder (`text-white/30 italic` + `^— no data (...)$`); (3a) hero renders all 4 fields with independent muted fallbacks, (3b) hero renders live values (1/2 healthy, 60% of cap, dead-URL 4) each with a `tabular-nums` value span; (4) default render is all-expanded (every `#group-{slug}-body` not `hidden`, `aria-expanded=true`), and clicking the Endpoint Health header flips `hidden`+`aria-expanded` while sibling groups stay expanded.
- **Assertion 5 (prune.test.tsx + operatorActions.test.tsx):** drawer default-closed — `operator-drawer` / `replay-test-trigger` / `prune-dead-urls-trigger` absent (conditional render, not hidden) until `operator-drawer-trigger` clicked, while the read-only `dead-url-count` / `operator-actions-24h-count` stay in Group 4; opening reveals both destructive buttons inside the drawer and flips the trigger's `aria-expanded`. Coded from both opStatus shapes (with-prune and without).
- **Assertion 2 reinforcement (diagnosticBlocks.test.tsx):** Budget + FlightRecorder muted placeholders pinned under the health-present / opStatus-null degrade path.
- **Assertion 6 (tabMerge.test.tsx):** roving keyboard nav — `ArrowRight` moves `document.activeElement` to the next tab WITHOUT changing `aria-selected` (manual-activation, no `setTab`); `Enter` activates the focused tab; the active tab carries `border-b-2 border-accent-blue` + `tabIndex=0` while inactive tabs are `tabIndex=-1`; every rendered panel is `role="tabpanel"` with `aria-labelledby` pointing at its tab id.
- **Assertion 8 (new DevApiStatusConsolidatedLayout.snapshot.test.tsx):** the single layout-shape regression lock — renders the FULLY-POPULATED state (mixed healthy/degraded endpoints, populated `opStatus` with audit24h/byBearer/prune+sample/actorQuality+sample/tokenBudget.nvidia_nim, a FlightRecorder run via mocked `/api/events/llm-history`, hero live values, all 4 groups expanded, drawer closed) and `toMatchSnapshot()` on the `all-apis-tab` subtree. `Date.now()` pinned to a fixed epoch for deterministic relative-time strings.
- **Assertion 7 (Plan 01):** verified already covered — `COLOR_STATUS_{HEALTHY,DEGRADED,WARNING}_HEX` byte-identity assertions live in `src/__tests__/lib/colorBridge.test.ts`.
- **Maintainer cross-reference:** comment block at the top of the snapshot file maps all 8 assertions to their owning file.

## Task Commits

1. **Task 1 (assertions 1-5):** `ee5bd66` (test) — DevApiStatusAllApisTab (1-4) + prune/operatorActions (5) + diagnosticBlocks (2 reinforcement).
2. **Task 2 (assertions 6 + 8):** `c78cf0a` (test) — tabMerge roving keyboard nav + the new consolidated-layout snapshot file + written snapshot.
3. **Task 3 (full green-up + coverage verify):** no code commit — the cross-reference comment shipped in Task 2; the full suite was already green and no prior assertion needed a nesting update (Plans 02/03 had already migrated the structurally-affected assertions). Verification captured below.

## Files Created/Modified

- `src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx` — NEW; assertion 8 snapshot + the 1-8 cross-reference comment.
- `src/components/ui/__tests__/__snapshots__/DevApiStatusConsolidatedLayout.snapshot.test.tsx.snap` — NEW; 930-line consolidated-layout snapshot (hero + 4 expanded groups, no drawer).
- `src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx` — +202; assertions 1-4 describe block + operator-status fetch stub helper.
- `src/__tests__/components/DevApiStatus.prune.test.tsx` — +43; assertion 5 (drawer default-closed, with-prune vantage).
- `src/components/ui/__tests__/DevApiStatus.operatorActions.test.tsx` — +36 / −1; assertion 5 (Replay-only vantage) + `fireEvent` import.
- `src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx` — +22; assertion 2 muted-placeholder reinforcement.
- `src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx` — assertion 6 roving keyboard nav + active indicator + tabpanel.

## Decisions Made

- **Assertion 2 pinned from three degrade paths** (all-null in AllApisTab, health-present/opStatus-null in diagnosticBlocks, actorQuality-empty in actorQuality) so the muted-render contract is locked regardless of which data source is missing.
- **Assertion 5 coded twice** (with-prune in prune.test, Replay-only in operatorActions.test) so the destructive-controls-default-hidden security-adjacent guard holds for both operator-status shapes.
- **Snapshot determinism + scope** — `Date.now()` pinned and the snapshot scoped to `all-apis-tab` (not the modal/app) so the lock is stable and only churns on genuine consolidated-layout drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test assertion bug] `\b4\b` word-boundary mismatch on hero dead-URL value**

- **Found during:** Task 1 (assertion 3b first run).
- **Issue:** the hero dead-URL field renders `4dead URLs` (value span + label adjacent), so `/\b4\b/` failed — `4` and `d` are both word chars, no boundary between them.
- **Fix:** asserted against the `.tabular-nums` value span's `textContent === '4'` directly + a separate `/dead URLs/` label check, instead of a boundary regex over the concatenated text.
- **Files modified:** `src/components/ui/__tests__/DevApiStatusAllApisTab.test.tsx`.
- **Commit:** `ee5bd66`.

No production code changed (test-only plan). No prior coverage deleted; no nesting updates were required (Plans 02/03 had already migrated the structurally-affected assertions, per their summaries).

## Known Stubs

None. Every assertion drives the real `DevApiStatusAllApisTab` render through real store/context/fetch-stub state; the snapshot captures live-derived values, not hardcoded placeholders.

## Threat Flags

None. Test-only plan — no new endpoint, fetch, mutation, or boundary. Assertion 5 (drawer default-closed, destructive Replay/Prune buttons absent until opened) is itself a security-adjacent regression guard (T-40-04-01 accept).

## Issues Encountered

None beyond the one auto-fixed assertion-regex item above.

## Verification

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` (full frontend suite) → **2511 passed | 19 skipped | 5 todo** (0 failures; +13 over the Plan-02 baseline of 2498).
- Task 1 set (5 files) → 52 passed. Task 2 set (tabMerge + snapshot) → 16 passed (snapshot written on first run).
- `git diff` on the 5 existing test files → additions only; no deleted `it(`/`test(` blocks (the lone `−1` is the `act` → `act, fireEvent` import edit).
- Snapshot sanity: 930 lines, contains `api-health-hero` + all 4 `group-*` + `operator-drawer-trigger` + `flight-recorder`; `data-testid="operator-drawer"` count = 0 (drawer correctly closed).
- All 8 UI-SPEC §Regression-Lock assertions mapped: 1-4 (DevApiStatusAllApisTab), 5 (prune + operatorActions), 6 (tabMerge), 7 (colorBridge.test.ts, Plan 01), 8 (new snapshot) — cross-reference comment in the snapshot file.

## Self-Check: PASSED

- FOUND: src/components/ui/**tests**/DevApiStatusConsolidatedLayout.snapshot.test.tsx
- FOUND: src/components/ui/**tests**/**snapshots**/DevApiStatusConsolidatedLayout.snapshot.test.tsx.snap
- FOUND commit: ee5bd66 (Task 1)
- FOUND commit: c78cf0a (Task 2)

---

_Phase: 40-dashboard-ui-ux-polish-subtab-consolidation_
_Completed: 2026-06-04_
