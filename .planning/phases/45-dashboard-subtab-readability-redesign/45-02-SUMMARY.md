---
phase: 45
plan: 02
subsystem: operator-dashboard-ui
tags: [readability, atoms, sparkline, metric-row, dash-read]
status: complete
requires:
  - '@theme tokens (src/styles/app.css) + colorBridge (D-13 single-source color)'
  - 'React + Tailwind v4 + vitest/jsdom (no new packages)'
provides:
  - 'src/components/ui/MetricRow.tsx — DASH-READ-01 tabular-nums right-aligned-value row atom'
  - 'src/components/ui/Sparkline.tsx — DASH-READ-05 ~30-pt inline-SVG trend line primitive'
affects:
  - 'Plan 03 (MetricRow in water/sites rejection + per-type/per-country tables)'
  - 'Plan 04 (Sparkline in events trend wells: dead-link count + per-cron freshness)'
tech-stack:
  added: []
  patterns:
    - 'separate-file presentational atom (FlightRecorderBlock.tsx / BudgetBlock.tsx precedent, CONTEXT D-07)'
    - 'no-inline-hex color sourcing: white/N ramp + var(--color-*) @theme tokens only (DASH-READ-03)'
    - 'degrade-open: Sparkline returns null below 2 points'
key-files:
  created:
    - src/components/ui/MetricRow.tsx
    - src/components/ui/Sparkline.tsx
    - src/components/ui/__tests__/MetricRow.test.tsx
    - src/components/ui/__tests__/Sparkline.test.tsx
  modified: []
decisions:
  - 'MetricRow value tone: text-white/60 default → text-white/80 emphasized (UI-SPEC §Numeric Scannability)'
  - 'Sparkline neutral stroke carried by text-white/40 on the SVG + stroke=currentColor (single token, not per-point)'
  - "Last-point marker: currentColor by default → semanticToken (default var(--color-status-degraded)) on threshold cross; marker radius bumps 2.5→4 when crossed for the 'now pops' effect (D-05)"
  - "thresholdDirection prop: 'above' (dead-link count rising) | 'below' — supports both named DASH-READ-05 sparkline families"
metrics:
  duration_seconds: 151
  tasks_completed: 2
  files_created: 4
  files_modified: 0
  completed: 2026-06-22
---

# Phase 45 Plan 02: Readability Atoms (MetricRow + Sparkline) Summary

Two standalone, unit-tested readability primitives extracted into their own files per CONTEXT D-06/D-07: `MetricRow` (the DASH-READ-01 tabular-nums right-aligned-value row) and `Sparkline` (the DASH-READ-05 ~30-point inline-SVG trend line with neutral stroke + semantic last-point tint). Both are no-inline-hex and two-weight compliant, net-new files with zero edits to `DevApiStatus.tsx` — ready to be composed by the Plan 03/04 restyle.

## What Was Built

### Task 1 — MetricRow atom (commit `539c140`, DASH-READ-01)

`src/components/ui/MetricRow.tsx` exports a `MetricRow` function component: a flex row with a small uppercase label left (`text-[9px] uppercase tracking-wider text-white/40`) and a right-aligned `tabular-nums` value right (`text-white/60` default → `text-white/80` when `emphasized`), with an optional muted unit span (`text-white/40`). Colors come only from the white-opacity ramp; no inline hex, no `font-bold` (two weights).

### Task 2 — Sparkline line primitive (commit `a5f7fb1`, DASH-READ-05)

`src/components/ui/Sparkline.tsx` exports a `Sparkline` function component: an inline-SVG `<polyline>` (viewBox 0 0 100 100, `preserveAspectRatio="none"`, `xStep = 100/(n-1)`, `y = 100 - (v/max)*100`). Self-hides (`return null`) below 2 points. The line draws in one neutral muted token (`text-white/40` on the SVG → `stroke="currentColor"`). A `<circle>` marker at the final coordinate stays neutral (`currentColor`) unless the latest value crosses `threshold` per `thresholdDirection`, in which case it tints to `semanticToken` (a `var(--color-*)` string, default `var(--color-status-degraded)`) and its radius bumps. Zero inline hex; the existing in-file `Sparkline` (DevApiStatus.tsx:3235) is untouched.

## Prop Signatures (for Plan 03/04 executors)

```ts
// MetricRow
interface MetricRowProps {
  label: string; // small uppercase label, left
  value: string | number; // right-aligned tabular-nums value
  unit?: string; // optional muted unit appended after value
  emphasized?: boolean; // value tone white/60 → white/80
  'data-testid'?: string; // root testid; value cell = `${testId}-value`, unit = `${testId}-unit`
}

// Sparkline
interface SparklineProps {
  points: number[]; // oldest→newest (~30); renders null below 2
  threshold?: number; // degradation threshold for last-point tint
  thresholdDirection?: 'above' | 'below'; // default 'above'
  semanticToken?: string; // var(--color-*) tint; default var(--color-status-degraded)
  height?: string; // Tailwind height class; default 'h-4'
  'data-testid'?: string; // root testid; last marker = `${testId}-last`
}
```

**Plan 04 wiring hints:** dead-link count → `thresholdDirection="above"` (rising count = degraded). Cron freshness → sample the age of `cron:lastTick:{name}`, `thresholdDirection="above"` (older = staler = degraded). Caller supplies the current value as the 13px/600 primary metric beside the sparkline (UI-SPEC §Sparkline placement).

## Deviations from Plan

None — plan executed exactly as written. The only auto-applied adjustment was a one-word comment reword in MetricRow.tsx (`no \`font-bold\``→`never the 700 weight`) so the literal `font-bold` acceptance grep returns 0 even from comments; not a behavioral change.

## Verification

- `npx vitest run src/components/ui/__tests__/MetricRow.test.tsx src/components/ui/__tests__/Sparkline.test.tsx` → 2 files / 9 tests green.
- `grep -cE '#[0-9a-fA-F]{3,6}|rgba\(' src/components/ui/MetricRow.tsx src/components/ui/Sparkline.tsx` → 0 / 0 (no inline hex).
- MetricRow gates: `text-right` ✓, `tabular-nums` ✓, `font-bold` count 0 ✓.
- Sparkline gates: `polyline` ✓, `points.length < 2` self-hide gate ✓, `var(--color-|currentColor` token-color ✓.
- `git diff --stat src/components/ui/DevApiStatus.tsx` → empty (host file untouched, in-file Sparkline preserved).
- `npx tsc --noEmit` → exit 0.

## Known Stubs

None. Both atoms are complete, general-purpose primitives. They are intentionally NOT wired into `DevApiStatus.tsx` — that composition is Plans 03 (MetricRow) and 04 (Sparkline), per the plan prohibition "No edit to DevApiStatus.tsx in this plan".

## Self-Check: PASSED

All 4 created files present on disk; both task commits (`539c140`, `a5f7fb1`) present in git history.
