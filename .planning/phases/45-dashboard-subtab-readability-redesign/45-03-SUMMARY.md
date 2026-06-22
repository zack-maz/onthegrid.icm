---
phase: 45
plan: 03
subsystem: operator-dashboard-ui
tags: [readability, dash-read, water, sites, metric-row, progressive-disclosure]
status: complete
requires:
  - 'src/components/ui/MetricRow.tsx (Plan 02 atom — tabular-nums right-aligned-value row)'
  - 'src/components/ui/FlightRecorderBlock.tsx (run→detail disclosure idiom)'
  - '@theme tokens + colorBridge (D-13 single-source color, no inline hex)'
provides:
  - 'Restyled WaterFiltersSection + SitesFiltersSection (MetricRow Reason|Count tables + progressive-disclosure drill-downs + single 13px/600 primary metric)'
  - 'Reusable DisclosureSection helper (FlightRecorder idiom: aria-expanded/aria-controls, local useState, ▸/▾ caret, L2 indent) inside DevApiStatus.tsx'
affects:
  - 'Plan 04 (EventsFiltersSectionV3 restyle — may reuse DisclosureSection)'
  - 'Plan 05 (re-verifies frozen behavioral pins green)'
tech-stack:
  added: []
  patterns:
    - 'progressive disclosure via shared DisclosureSection (aria-expanded/aria-controls, local transient useState, NOT uiStore)'
    - 'rejection string-dumps → labeled Reason|Count MetricRow tables (DASH-READ-01)'
    - 'single 13px/600 primary metric per subtab; {400,600} two-weight typography'
    - 'render pins evolve in lockstep with intentional DOM change; behavioral pins stay frozen'
key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx
    - src/__tests__/devApiStatus.test.tsx
    - src/__tests__/sitesFiltersSection.test.tsx
decisions:
  - 'Added a shared DisclosureSection helper (not inline per-section) so Water + Sites read visually identical and Plan 04 can reuse it'
  - 'Per-type table defaults OPEN (the single most-useful table per UI-SPEC); By Country + Rejections default COLLAPSED (the raw dumps being tamed)'
  - 'Rejection reason labels are human-readable ("Excluded turkey"); underlying bucket keys preserved as data-testid suffixes (water-rejection-{key}/sites-rejection-{key}) for stable render pins'
  - 'Two-weights render-contract assertions scoped to the subtab section container (closest div of the heading), excluding the out-of-scope Phase-40 modal h2 title which keeps font-bold'
metrics:
  duration_seconds: 420
  tasks_completed: 3
  files_created: 0
  files_modified: 3
  completed: 2026-06-21
---

# Phase 45 Plan 03: Water + Sites Subtab Readability Restyle Summary

Replaced the worst readability offenders — the left-flowing `excl=… turkey=… nn=… dup=…` rejection string-dumps in the Water and Sites operator subtabs — with labeled, right-aligned, `tabular-nums` Reason|Count tables built from the Plan-02 `<MetricRow>` atom, promoted each subtab's kept % to a single 13px/600 primary metric, moved the heavy per-country / rejection detail behind FlightRecorder-style progressive-disclosure drill-downs, and re-toned every `font-bold` (700) header to `font-semibold` (600). All restyle lands INSIDE the frozen `role="tabpanel"` containers; the render pins evolved in lockstep while the frozen behavioral pins stayed untouched and green.

## What Was Built

### Task 1 — WaterFiltersSection restyle (commit `1e87e62`, DASH-READ-01/02/03)

- New shared `DisclosureSection` helper added above `WaterFiltersSection`: clickable summary row (`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5`) + `▸/▾` caret + `aria-expanded`/`aria-controls` + inline L2 expansion (`mt-1 ml-2 border-l border-white/10 pl-2`), local transient `useState` — the FlightRecorderBlock idiom, verbatim.
- Kept % promoted to a single `text-[13px] font-semibold tabular-nums text-white/80` primary metric (`data-testid="water-primary-metric"`); the verbatim `N raw → M kept (P%)` summary preserved below it; provenance header strings preserved verbatim (re-toned inline labels font-bold→font-semibold).
- Per-type breakdown converted from a `<table>` to `<MetricRow>` rows (default open).
- The `excl=…` per-type dump **and** the `Total rejections:` summed line replaced with a labeled 8-bucket Reason|Count `<MetricRow>` table behind a collapsed "Rejections by Type" disclosure (with an emphasized "Total rejections" row + the per-type `byTypeRejections` breakdown).
- "By Country" table moved behind a sibling collapsed disclosure.
- Enrichment coverage converted to `<MetricRow>` rows; Overpass/Scores rows re-toned. Loading placeholder re-toned to `text-white/30 italic`.

### Task 2 — SitesFiltersSection restyle (commit `fb785f3`, DASH-READ-01/02/03)

Mirrors the water treatment exactly so the two sections read visually identical: single 13px/600 kept-% primary metric (`data-testid="sites-primary-metric"`), verbatim raw→kept + provenance strings, per-type `<MetricRow>` table (default open), the 4-bucket `turkey=…nocoords=…notype=…dup=` dump replaced with a 4-row Reason|Count `<MetricRow>` table behind a collapsed "Rejections" disclosure, By Country behind a sibling disclosure. The documented water/sites asymmetry is honored — exactly 4 buckets (`excluded_turkey`/`no_coords`/`no_type`/`duplicate`), no invented buckets, no per-type rejection split. Every `font-bold` header re-toned to `font-semibold`; loading placeholder re-toned.

### Task 3 — Render-pin evolution (commit `d69b1d5`, DASH-READ-01/02/03)

- `devApiStatus.test.tsx`: new `WaterFiltersSection render contract` describe block seeds populated water `filterStats` and asserts (a) one 13px/600 primary metric (`24%`) with verbatim raw→kept summary, (b) the rejection breakdown is a Reason|Count MetricRow table behind a collapsed disclosure with `aria-expanded` flipping, (c) per-country behind a collapsed disclosure, (d) two-weights-only (no `font-bold` in the section).
- `sitesFiltersSection.test.tsx`: evolved the "all 6 blocks" + "Redis round-trip" pins to expand the new disclosures and assert the 4-bucket Reason|Count table via `data-testid`; added a `Phase 45 DASH-READ render contract` test (one primary metric, two weights, aria-expanded flip) scoped to the sites section.
- `DevApiStatusV3.test.tsx`: no edit needed — it seeds water for the API Health path only and sets sites `filterStats: null`, so it asserts no rejection-dump DOM; passes unmodified (11/11).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Evolved `sitesFiltersSection.test.tsx` (not in the plan's Task 3 file list)**

- **Found during:** Task 2 / Task 3
- **Issue:** The plan's Task 3 `<files>` listed only `devApiStatus.test.tsx` and `DevApiStatusV3.test.tsx`, but `src/__tests__/sitesFiltersSection.test.tsx` is a render pin that asserts the OLD Sites DOM (the `turkey=156.*nocoords=0.*notype=0.*dup=0` string-dump at line 192 and the always-visible "By Country" table). The intentional restyle broke 2 of its tests.
- **Fix:** This is a subtab render pin that evolves in lockstep with the intentional DOM change (per UI-SPEC §Regression-Lock: "the subtab-specific render suites extend in lockstep"), NOT a frozen behavioral pin. Evolved its 2 broken tests to expand the new disclosures + assert the Reason|Count table by `data-testid`, and added a DASH-READ render-contract test. The verbatim provenance + raw→kept strings remain asserted unchanged.
- **Files modified:** `src/__tests__/sitesFiltersSection.test.tsx`
- **Commit:** `d69b1d5`

**2. [Rule 2 — Scoping] Two-weights assertion scoped to the subtab section, not the whole modal**

- **Found during:** Task 3
- **Issue:** `container.querySelectorAll('.font-bold')` over the whole rendered modal returned 1 — the Phase-40 modal `<h2>` title (`:852`, out of scope per UI-SPEC §0 Scope Map).
- **Fix:** Scoped the two-weights + one-primary-metric assertions to the subtab section container (`screen.getByText('…Filters').closest('div')`), which correctly excludes the out-of-scope chrome. This matches the plan's intent ("no font-bold survives in the touched WaterFiltersSection/SitesFiltersSection code").
- **Files modified:** `src/__tests__/devApiStatus.test.tsx`, `src/__tests__/sitesFiltersSection.test.tsx`
- **Commit:** `d69b1d5`

## Verification

- `npx vitest run src/__tests__/devApiStatus.test.tsx src/__tests__/DevApiStatusV3.test.tsx src/__tests__/sitesFiltersSection.test.tsx` → 3 files / 34 passed + 5 todo, green.
- `npx tsc --noEmit` → exit 0.
- **Frozen behavioral pins (NOT modified, re-verified green):** `npx vitest run DevApiStatus.tabMerge.test.tsx DevApiStatus.diagnosticBlocks.test.tsx DevApiStatus.operatorActions.test.tsx DevApiStatus.prune.test.tsx` → 4 files / 60 passed. `git diff` confirms these files are byte-identical (untouched this plan).
- **Consolidated-layout snapshot** (`DevApiStatusConsolidatedLayout.snapshot.test.tsx`) → 1 passed, no regeneration needed (it does not capture the populated water/sites subtab body).
- **Acceptance greps (scoped to each section's line range):**
  - WaterFiltersSection: `font-bold` count 0 ✓; `text-[13px] font-semibold` present (1) ✓; old tokens `excl={ / nname={ / nocity={` count 0 ✓; inline hex/rgba count 0 ✓.
  - SitesFiltersSection: `font-bold` count 0 ✓; old tokens `nocoords={ / notype={` count 0 ✓; invented buckets (`no_name/not_notable/low_score/no_city/no_resolved_name/excluded_location`) count 0 ✓; 4 valid buckets present ✓; inline hex/rgba count 0 ✓.
  - `aria-expanded` present in both sections (via shared DisclosureSection) ✓.

## Known Stubs

None. Both sections are fully wired to live `filterStats` from `useWaterStore` / `useSiteStore`; no placeholder data, no TODO/FIXME introduced. The `<Sparkline>` atom (Plan 02) is intentionally NOT wired here — that is Plan 04's events-subtab work.

## Self-Check: PASSED

- `src/components/ui/DevApiStatus.tsx` present, contains `MetricRow` import + `DisclosureSection` + `water-primary-metric`/`sites-primary-metric`.
- Commits `1e87e62`, `fb785f3`, `d69b1d5` present in git history (`git log --oneline`).
- All three modified files present on disk; all evolved suites + frozen pins green.
