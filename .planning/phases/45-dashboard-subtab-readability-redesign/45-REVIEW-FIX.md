---
phase: 45-dashboard-subtab-readability-redesign
fixed_at: 2026-06-22T10:53:00Z
review_path: .planning/phases/45-dashboard-subtab-readability-redesign/45-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 45: Code Review Fix Report

**Fixed at:** 2026-06-22T10:53:00Z
**Source review:** .planning/phases/45-dashboard-subtab-readability-redesign/45-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 3 (0 critical, 3 warning; Info findings IN-01..IN-04 out of scope for `critical_warning`)
- Fixed: 3
- Skipped: 0

All fixes were applied in an isolated git worktree, committed atomically, and
verified against the project's stricter `tsc -b` gate plus the full phase test
sweep. The HARD constraints held: the `role="tablist"`/`role="tab"`/`role="tabpanel"`
subtree and tab-merge logic in `DevApiStatus.tsx` were NOT touched (the four
behavioral pin suites stayed green WITHOUT being edited), and NO new inline
hex/rgba literals were introduced (WR-01's degraded tint uses the `<Sparkline>`
atom's existing `semanticToken` default `var(--color-status-degraded)`).

## Verification

- **`npx tsc -b`** — exit 0 (clean). This is the server-stricter gate that
  caught two bugs earlier this phase; it passes on the committed state.
- **Full phase test sweep (13 files)** — `Test Files 13 passed (13)`,
  `Tests 157 passed | 5 todo (162)`, 0 failures. Ran on the committed state.
- **Behavioral pin suites** — `DevApiStatus.tabMerge`, `DevApiStatus.diagnosticBlocks`,
  `DevApiStatus.operatorActions`, and `DevApiStatus.prune` all pass and were NOT
  edited (confirmed absent from `git status` during the fix session).
- **Consolidated-layout snapshot** — `DevApiStatusConsolidatedLayout.snapshot.test.tsx`
  passed WITHOUT regeneration. WR-01 changes only the conditional `circle`
  `fill`/`r` attributes when a cron's latest age is `null`; the default snapshot
  render has no null-latest cron, so the serialized DOM was unchanged. The
  tablist/tabpanel subtree did not change.
- **No-new-hex gate** — `Sparkline.test.tsx`'s existing hex/rgba grep assertion
  on `Sparkline.tsx` still passes; the new `forceDegraded` path reuses the
  semantic token, adding no literals.

## Fixed Issues

### WR-03: Trend sample age can go negative on clock skew

**Files modified:** `server/routes/cron-health.ts`
**Commit:** 5c165fb
**Applied fix:** Wrapped the per-cron age computation in `Math.max(0, sampleNow - tickTs)`
so Fluid Compute cold-start clock skew (writer wall clock ahead of reader) can no
longer produce a negative `cronAgeMs` that draws the sparkline point below the
viewBox or renders a negative h/m string. Added an explanatory comment.

### WR-02: `appendTrendSample` issued 3 sequential awaited Redis round-trips

**Files modified:** `server/lib/trendHistory.ts`, `server/__tests__/lib/trendHistory.test.ts`
**Commit:** fa6b7f3
**Applied fix:** Collapsed the sequential `lpush` → `ltrim` → `expire` into a single
`redis.pipeline().lpush(...).ltrim(...).expire(...).exec()` round-trip, keeping the
degrade-open try/catch (a pipeline `exec()` throw is logged and swallowed; the
function never throws). This removes the partial-write TTL gap (a kill between
`lpush` and `expire` previously left a no-TTL key; a kill between `lpush` and
`ltrim` left the ring transiently at 31 entries). The cap-30 bound (`ltrim KEY 0 29`)
is preserved.

Updated `trendHistory.test.ts` IN LOCKSTEP: the redis mock now exposes a chainable
`pipeline()` builder recording each staged `lpush`/`ltrim`/`expire` (key + args) and
resolving on `.exec()`. The cap-30 assertion (`ltrim(KEY, 0, 29)`) stays pinned, the
"one round-trip" property is newly asserted (`pipeline` opened once, `exec` once),
and the degrade-open append test now rejects via `exec()` instead of `lpush`. All 7
trendHistory unit tests pass.

### WR-01: Dead-cron freshness rendered as the healthiest sparkline point (semantic inversion)

**Files modified:** `src/components/ui/DevApiStatus.tsx`, `src/components/ui/Sparkline.tsx`, `src/components/ui/__tests__/Sparkline.test.tsx`
**Commit:** c3c4948
**Applied fix:** Took the cleaner of the two reviewer-suggested approaches — a
`forceDegraded` flag on the last-point tint rather than a high sentinel-in-series
(which would inflate `max` and crush the real points, distorting the auto-scale).

- Added a `forceDegraded?: boolean` prop to the `<Sparkline>` atom. When true, the
  last marker tints the degraded semantic token (`semanticToken`, default
  `var(--color-status-degraded)`) regardless of the numeric `threshold` —
  short-circuiting the threshold comparison. The line geometry/auto-scale is
  untouched; only the marker tints. No new hex.
- Threaded `forceDegraded` through the `TrendWell` wrapper to the `Sparkline`.
- In `TrendBlock`, derived `cronLatestNull(name) = latest.cronAgeMs[name] == null`
  and passed it as `forceDegraded` to each of the three cron wells. A dead/never-ran
  cron (absent `cron:lastTick:{name}` key → `null` age → mapped to the `0` floor in
  the series) now reads as DEGRADED at a glance instead of as the freshest point.
  The current-value text (`formatCronAge` → "—") was already honest and is unchanged.

Edits were confined to `TrendBlock`/`TrendWell` (well outside the frozen tablist
subtree). Added a `forceDegraded` case to `Sparkline.test.tsx` proving the marker
tints with `var(--color-*)` even when the latest value is below threshold.

**Note (logic-flag review):** WR-01 changes a visualization condition. Syntax and
the new unit test confirm the marker tints on `forceDegraded`/null-latest, but an
operator should confirm at a glance in the live dashboard that a dead cron now
reads degraded as intended.

---

_Fixed: 2026-06-22T10:53:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
