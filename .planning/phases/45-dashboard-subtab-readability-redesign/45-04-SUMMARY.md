---
phase: 45
plan: 04
subsystem: operator-dashboard-ui
tags: [readability, dash-read, events, sparkline, trend, progressive-disclosure]
status: complete
requires:
  - 'src/components/ui/Sparkline.tsx (Plan 02 — ~30-pt inline-SVG trend line, self-hides < 2 points)'
  - 'opStatus.trendHistory + TrendSample type (Plan 01 — dashboard:trends:history ring on /api/operator-status)'
  - 'src/components/ui/DevApiStatus.tsx DisclosureSection + readability idiom (Plan 03)'
provides:
  - 'Events subtab: 4 mounted trend wells (cron freshness ×3 + dead-link count) reading opStatus.trendHistory via Plan-02 <Sparkline>'
  - 'Phase-44 events blocks re-toned to the two-weight readability grammar (font-bold→font-semibold, 29 sites) with every presence-gate + honest-signal copy preserved verbatim'
  - 'TrendBlock + TrendWell + formatCronAge helpers inside DevApiStatus.tsx'
affects:
  - 'Plan 05 (re-verifies frozen behavioral pins green; owns the deliberate consolidated-layout snapshot regeneration)'
tech-stack:
  added: []
  patterns:
    - 'trend ring threaded off the already-fetched events-scoped /api/operator-status poll (NO new fetch) — same WR-02 out-of-order + degrade-open contract as the prune thread'
    - 'degrade-open trend block: self-hides when ring absent/empty; each Sparkline returns null < 2 points; null cron age renders "—" (no fabricated zeros)'
    - 'two-weight {400,600} readability re-tone applied IN PLACE — no block re-mount, no presence-gate edit'
key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx
    - src/__tests__/devApiStatusEventsSection.test.tsx
decisions:
  - 'Threaded trendHistory off the EXISTING events-scoped /api/operator-status fetch (the same effect that already reads prune, lines ~706) rather than the separate opStatus poll — keeps the trend data tab-scoped, inherits the WR-02 out-of-order guard + degrade-open nulling, and adds zero new fetch'
  - 'Cron freshness stale threshold = 30h (108_000_000 ms) for all three crons: every cron is daily (health 0 0, warm 0 12, refresh-events 0 4) so 24h schedule + 6h grace; last-point tints via var(--color-status-degraded) when the latest measured age crosses it'
  - 'Dead-link tint threshold = the max of all PRIOR points (thresholdDirection above) — a new high past the prior peak reads as worsening; the now-point pops'
  - 'Null cron age (lastTick key absent) maps to 0 in the polyline but the AGE metric beside it shows "—" — a stalled cron reads as null/floor, never a fabricated healthy value (T-45-10 spoofing mitigation)'
  - 'Renamed the new ms-duration formatter to formatCronAge to avoid colliding with the pre-existing timestamp formatAge at DevApiStatus.tsx:49 (different semantics)'
  - 'Re-toned the font-bold comment mention in the DeadLinkBucketsBlock docstring too, so the events-range font-bold grep returns exactly 0 (matches Plan 02 comment-hygiene precedent)'
metrics:
  duration_seconds: 240
  tasks_completed: 3
  files_created: 0
  files_modified: 2
  completed: 2026-06-22
---

# Phase 45 Plan 04: Events Subtab Trend Sparklines + Readability Grammar Summary

Mounted the four DASH-READ-05 trend sparklines (3 per-cron freshness — health/warm/refresh-events — + 1 dead-link count) inside the events subtab, each in a labeled well with the current value as a 13px/600 primary metric beside a Plan-02 `<Sparkline>`, fed from the Plan-01 `opStatus.trendHistory` ring threaded off the already-fetched events-scoped `/api/operator-status` poll (no new fetch). Re-toned every `font-bold` (700) header across the 21 Phase-44 events blocks to `font-semibold` (600) for the two-weight readability grammar — in place, with every presence-gate and the `DeadLinkBucketsBlock` honest-signal copy preserved verbatim. All work lands inside the frozen `role="tabpanel"` container; the four behavioral pinning suites + the events-section render pin stay green.

## What Was Built

### Task 1 — 4 trend wells from opStatus.trendHistory (commit `6627e63`, DASH-READ-05)

- Imported the Plan-02 `Sparkline`. Added an `eventsTrend` state that is populated from the SAME events-scoped `/api/operator-status` fetch that already reads `prune` (lines ~706) — `setEventsTrend(data?.trendHistory ?? null)` — inheriting the WR-02 out-of-order guard and the degrade-open nulling on non-200 / network failure. NO new fetch (verified: the only two `/api/operator-status` fetch sites are the pre-existing ones).
- Threaded `trendHistory={eventsTrend}` into `EventsFiltersSectionV3` (new optional `trendHistory?: TrendSample[] | null` prop, forward-compat).
- Built `TrendBlock` (4 wells in a `grid-cols-2`) + `TrendWell` (label / 13px-600 current-value metric / `<Sparkline>`) + `formatCronAge`. The ring is newest-first, so each derived series is reversed for the oldest→newest Sparkline; the current value is read from `trendHistory[0]`.
- Degrade-open: `TrendBlock` self-hides when `trendHistory` is null/absent/empty; each `<Sparkline>` returns null below 2 points (the well then shows only the bare current value); a null cron age renders `—` in the metric (no fabricated zeros).

### Task 2 — two-weight readability re-tone of the Phase-44 blocks (commit `b914ce5`, DASH-READ-02/03)

- Re-toned `font-bold` → `font-semibold` at 29 sites across the events-block range (RoutingTrace, Latency, RateLimit, SchemaStrict, ErrorTaxonomy, CostShadow, Waterfall, Histograms, DrillDown, CallLog, BudgetBars, EvalScore, Dlq, Suspect, DeadLinkBuckets, Prewarm/AdaptiveBatch/LineagePrefilter cells). Events-range `font-bold` count is now 0.
- Every presence-gate is byte-stable (`stage !== 'idle'`, `callHistory && callHistory.length > 0`, `tokenCounters && breakerState`): no gate edited, no block re-mounted.
- `DeadLinkBucketsBlock` honest-signal copy preserved verbatim: the authoritative `Dead URL events: {deadUrlCount}` line and the `of {scannedTotal} scanned` sampled-tally caveat are untouched.

### Task 3 — events-section render pins evolve in lockstep (commit `255a47b`, DASH-READ-05)

Added a `Events subtab trend sparklines` describe block (4 new tests, render pins NOT frozen behavioral pins). A `stubOperatorStatusFetch` helper threads `trendHistory` down through the real fetch path:

- **T1:** the 4 wells render from a ≥2-point ring with labels + current-value metrics; each Sparkline mounts (≥2 points).
- **T2:** the block self-hides (degrade-open) when `trendHistory` is absent; the rest of the V3 body still renders.
- **T3:** a 1-point ring shows the wells' bare current values but every Sparkline self-hides (`return null` < 2 points).
- **T4:** the Phase-44 authoritative dead-URL total + `of N scanned` caveat survive verbatim beside the new wells.

## Degradation Thresholds (D-05 last-point tint — recorded per plan `<output>`)

| Series                         | Threshold                                                       | Direction | Tint behavior                                                                      |
| ------------------------------ | --------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Cron · Health / Warm / Refresh | `30h` (108,000,000 ms) = 24h daily schedule + 6h grace          | above     | last point tints `var(--color-status-degraded)` when the latest measured age > 30h |
| Dead links · 30d               | `max(prior points)` (the running peak before the latest sample) | above     | last point tints when the latest count sets a new high (rising = worsening)        |

Null cron age (lastTick key absent) → 0 in the polyline, `—` in the metric — a stalled cron reads as null/floor, never false-healthy (T-45-10).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Renamed the new ms-duration formatter to `formatCronAge`**

- **Found during:** Task 1
- **Issue:** The new helper `formatAge(ms)` collided with a pre-existing `formatAge(ts)` at `DevApiStatus.tsx:49` (a timestamp→relative-time formatter with different semantics) — esbuild errored `The symbol "formatAge" has already been declared`.
- **Fix:** Renamed the new helper to `formatCronAge` and updated its three callsites. No behavior change.
- **Files modified:** `src/components/ui/DevApiStatus.tsx`
- **Commit:** `6627e63`

No other deviations. The progressive-disclosure density for the Phase-44 blocks was left to planner discretion (plan + CONTEXT deferred area); the conservative, load-bearing-safe choice — in-place two-weight re-tone with every presence-gate preserved and the existing FlightRecorder/DrillDown disclosure idioms untouched — was applied, keeping all four behavioral pins green.

## Verification

- `npx vitest run src/__tests__/devApiStatusEventsSection.test.tsx` → 19/19 green (15 original + 4 new trend pins).
- Behavioral pins (frozen, re-verified): `npx vitest run DevApiStatus.tabMerge DevApiStatus.diagnosticBlocks DevApiStatus.operatorActions DevApiStatus.prune` → 60/60 green; the tabMerge/diagnosticBlocks/operatorActions/prune files are untouched by this plan.
- Atoms re-verified: `Sparkline.test.tsx` + `MetricRow.test.tsx` green. Full combined run = 88/88.
- `npx tsc --noEmit` → exit 0.
- Acceptance greps: `import { Sparkline }` ✓; `trendHistory` threaded into `EventsFiltersSectionV3` ✓; 4 well labels (`CRON · HEALTH|CRON · WARM|CRON · REFRESH|DEAD LINKS`) ✓; `text-[13px] font-semibold` in the wells ✓; only 2 pre-existing `/api/operator-status` fetch sites (no new trend fetch) ✓; events-range `font-bold` count 0 ✓; presence-gates byte-stable ✓; `of {scannedTotal} scanned` + `Dead URL events:` verbatim ✓; no new inline hex/rgba in either diff ✓.
- Exactly 4 sparklines mounted: 4 `<TrendWell>` instances each render the single `<Sparkline>` (CONTEXT D-02).
- Consolidated-layout snapshot (`DevApiStatusConsolidatedLayout.snapshot.test.tsx`) → 1 passed, no diff (it does not capture the populated events-body trend wells). Plan 05 owns any deliberate regeneration.

## Known Stubs

None. The four wells are wired to live `opStatus.trendHistory` from the Bearer-gated `/api/operator-status` aggregator; no placeholder data, no TODO/FIXME introduced. The ring fills one sample per day (Plan 01), so a full 30-point sparkline takes 30 cron ticks — until then the wells render whatever points exist and each Sparkline self-hides below 2 points (degrade-open, not a stub).

## Threat Surface

No new threat surface beyond the plan's `<threat_model>`. T-45-08 (info disclosure) is mitigated — the trend series ride the existing Bearer-gated `/api/operator-status` fetch; no new fetch, no ungated exposure. T-45-09 (tampering) is mitigated — the re-tone preserved every presence-gate byte-stable and the `of N scanned` caveat verbatim (greps pin it). T-45-10 (spoofing) is mitigated — degrade-open: `< 2` points → Sparkline null + bare value, null `trendHistory` → block self-hides, null cron age → `—`; a stalled cron reads as flatline/absent, never false-healthy. No package installs (T-45-SC).

## Self-Check: PASSED

- FOUND: src/components/ui/DevApiStatus.tsx (contains `import { Sparkline }`, `TrendBlock`, `trend-dead-links`, `CRON · HEALTH`)
- FOUND: src/**tests**/devApiStatusEventsSection.test.tsx (contains the `Events subtab trend sparklines` describe block)
- FOUND: .planning/phases/45-dashboard-subtab-readability-redesign/45-04-SUMMARY.md
- FOUND commit 6627e63 (Task 1)
- FOUND commit b914ce5 (Task 2)
- FOUND commit 255a47b (Task 3)

---

_Phase: 45-dashboard-subtab-readability-redesign_
_Completed: 2026-06-22_
