---
phase: 21-production-review-deploy-sync
plan: 03
subsystem: infra
tags: [vite, rollup, bundle-splitting, vercel-analytics, speed-insights, visualizer]

# Dependency graph
requires:
  - phase: 14-vercel-deployment
    provides: Vite build pipeline and Vercel deployment config
provides:
  - Vendor chunk splitting (react, maplibre, deckgl) for independent browser caching
  - Vercel Analytics and Speed Insights for production monitoring
  - Bundle visualizer output for inspection
affects: [21-05-deploy-verification]

# Tech tracking
tech-stack:
  added: ["rollup-plugin-visualizer", "@vercel/analytics", "@vercel/speed-insights"]
  patterns: ["manualChunks vendor splitting for independent cache invalidation"]

key-files:
  created: []
  modified: ["vite.config.ts", "src/App.tsx", "package.json"]

key-decisions:
  - "Three vendor chunks (react, maplibre, deckgl) chosen to match natural dependency boundaries"
  - "Visualizer set to open: false with gzipSize: true for CI-friendly output"
  - "Analytics and SpeedInsights rendered as siblings to AppShell in fragment (no-op in dev/test)"

patterns-established:
  - "manualChunks in vite.config.ts for vendor chunk splitting"
  - "Vercel observability components at App root level"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 21 Plan 03: Bundle Optimization & Analytics Summary

**Vendor chunk splitting (react 12KB, maplibre 1048KB, deckgl 743KB) with Vercel Analytics and Speed Insights for production observability**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-25T15:00:52Z
- **Completed:** 2026-03-25T15:03:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Split monolithic 2,218 KB bundle into 4 independently cacheable chunks (vendor-react 12KB, vendor-maplibre 1048KB, vendor-deckgl 743KB, app 405KB)
- Added rollup-plugin-visualizer generating dist/bundle-stats.html for manual inspection
- Added Vercel Analytics (page views, geographic breakdown) and Speed Insights (LCP, CLS, INP) -- auto-activate on Vercel deploy, no-op in dev

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and configure bundle splitting with visualizer** - `911e009` (feat)
2. **Task 2: Add Vercel Analytics and Speed Insights to App component** - `e38b826` (feat)

## Files Created/Modified
- `vite.config.ts` - Added visualizer plugin and manualChunks config with 3 vendor groups
- `src/App.tsx` - Added Analytics and SpeedInsights components as AppShell siblings
- `package.json` - Added @vercel/analytics, @vercel/speed-insights, rollup-plugin-visualizer
- `package-lock.json` - Lockfile updated for 3 new packages

## Decisions Made
- Three vendor chunks (react, maplibre, deckgl) chosen to match natural dependency boundaries -- when react updates, only the 12KB react chunk invalidates
- Visualizer configured with `open: false` for CI-friendly builds and `gzipSize: true` for accurate transfer size reporting
- Analytics and SpeedInsights rendered as fragment siblings to AppShell -- both are no-ops in development and test environments

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failure in ThreatHeatmapOverlay.test.tsx (6 tests, from Phase 20.2 commit 969b775) -- not caused by this plan's changes, out of scope

## User Setup Required

None - Vercel Analytics and Speed Insights auto-activate when deployed to Vercel. No environment variables or dashboard configuration needed.

## Next Phase Readiness
- Bundle is production-optimized with independent vendor caching
- Vercel observability is wired and will activate on next production deploy
- Ready for Plan 04 (code polish) and Plan 05 (deploy verification)

## Self-Check: PASSED

- FOUND: vite.config.ts
- FOUND: src/App.tsx
- FOUND: dist/bundle-stats.html
- FOUND: 21-03-SUMMARY.md
- FOUND: commit 911e009
- FOUND: commit e38b826

---
*Phase: 21-production-review-deploy-sync*
*Completed: 2026-03-25*
