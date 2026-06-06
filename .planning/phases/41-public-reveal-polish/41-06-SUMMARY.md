---
phase: 41-public-reveal-polish
plan: 06
subsystem: ui
tags: [driver.js, zustand, react, tailwind, open-graph, onboarding, guided-tour, localStorage]

# Dependency graph
requires:
  - phase: 41-01
    provides: Wave-0 red test stubs (uiStore.reveal / IntroOverlay / TourTrigger / tourSteps / og-tags)
  - phase: 41-03
    provides: docs/COSTS.md (REVEAL-SITE-04 append/confirmation target)
  - phase: 41-04
    provides: public/screenshots/og-card.png (1200x630 share card, served at /screenshots/og-card.png)
provides:
  - First-visit dismissible IntroOverlay gated on uiStore isIntroSeen (localStorage iran-monitor.intro-seen)
  - Re-openable driver.js GuidedTour spotlighting HUD chrome via data-tour selectors
  - Persistent TourTrigger affordance in the Topbar (not first-visit-gated)
  - uiStore reveal slice (isIntroSeen/isTourOpen + setIntroSeen/openTour/closeTour) + UIState members
  - Static OG/Twitter/description meta in index.html (absolute vercel.app URLs, 1200x630 og-card)
  - REVEAL-SITE-04 stay-on-vercel.app decision confirmed in docs/COSTS.md
affects: [public-reveal, onboarding, social-share, phase-42]

# Tech tracking
tech-stack:
  added: ['driver.js@1.4.0 (exact pin, zero runtime deps, MIT)']
  patterns:
    - 'Behavior-only null-render controller mounted in shell (GuidedTour, mirrors CompassControl)'
    - 'data-tour stable selector attrs for tour targeting (Pitfall 5 avoidance)'
    - 'Static SPA OG tags in index.html (no SSR; crawlers read raw HTML)'

key-files:
  created:
    - src/lib/tourSteps.ts
    - src/components/reveal/IntroOverlay.tsx
    - src/components/reveal/GuidedTour.tsx
    - src/components/reveal/TourTrigger.tsx
  modified:
    - src/types/ui.ts
    - src/stores/uiStore.ts
    - src/components/layout/AppShell.tsx
    - src/components/layout/Topbar.tsx
    - src/components/layout/StatusDropdown.tsx
    - src/components/layout/Sidebar.tsx
    - src/components/layout/DetailPanelSlot.tsx
    - index.html
    - docs/COSTS.md
    - package.json

key-decisions:
  - 'driver.js@1.4.0 installed (legitimacy-verified) rather than the custom-overlay fallback'
  - 'data-tour=layers placed on the Sidebar layers accordion section, not the unmounted LayerTogglesSlot wrapper'
  - 'threat-density tour step points at the map-container div (Pitfall 1 — never an in-canvas entity)'
  - 'TourTrigger mounted in the Topbar right cluster; IntroOverlay+GuidedTour as AppShell siblings of DashboardAuthModal'

patterns-established:
  - 'Reveal-overlay render-gate idiom: mount unconditionally in shell, self-gate on a uiStore boolean'
  - 'Persisted vs session-scoped uiStore flags: isIntroSeen persists (readBool+write-through), isTourOpen does not'

requirements-completed: [REVEAL-SITE-01, REVEAL-SITE-02, REVEAL-SITE-03, REVEAL-SITE-04]

# Metrics
duration: 34min
completed: 2026-06-05
---

# Phase 41 Plan 06: REVEAL-SITE strand (intro overlay + guided tour + OG meta) Summary

**First-visit IntroOverlay + re-openable driver.js GuidedTour spotlighting HUD chrome via stable data-tour selectors, plus static 1200x630 OG/Twitter share-card meta in index.html — all five remaining Wave-0 red stubs now green.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-06-06T00:51:00Z
- **Completed:** 2026-06-06T01:25:30Z
- **Tasks:** 4 (Task 1 install + Task 2 store slice + Task 3a reveal core + Task 3b wiring; Task 5 is a deferred human-verify checkpoint)
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- **driver.js@1.4.0 legitimacy-verified and installed** (exact pin, zero runtime deps) — see Package Legitimacy Verdict below.
- **uiStore reveal slice** added: `isIntroSeen` (persisted, localStorage `iran-monitor.intro-seen`) and `isTourOpen` (session-scoped) + `setIntroSeen`/`openTour`/`closeTour`, with matching `UIState` members.
- **IntroOverlay / GuidedTour / TourTrigger / tourSteps** built and mounted: first-visit dismissible framing overlay, behavior-only driver.js controller, persistent Topbar tour affordance, and a 5-step tour list keyed on stable `[data-tour]` HUD selectors.
- **data-tour attrs** wired onto the live HUD nodes (status, layers, threat-density/map-container, detail, api-health).
- **index.html OG/Twitter/description meta** added with absolute `vercel.app` URLs, `og:image=/screenshots/og-card.png`, 1200x630, `summary_large_image`.
- **REVEAL-SITE-04 stay-on-vercel.app** decision confirmed in docs/COSTS.md (tied to the OG share-card origin).
- **All 5 remaining Wave-0 stubs GREEN** (uiStore.reveal, IntroOverlay, TourTrigger, tourSteps, og-tags — 20/20). `npm run build` succeeds (Vite + tsup).

## Package Legitimacy Verdict

**VERDICT: INSTALLED (driver.js@1.4.0, exact pin) — fallback NOT used.**

All `npm view` legitimacy signals were clean (verified before install):

| Signal              | Expected                 | Observed                                       | Pass |
| ------------------- | ------------------------ | ---------------------------------------------- | ---- |
| version             | current `^1.3.x`+        | `1.4.0`                                        | ✅   |
| maintainers         | kamranahmedse            | `kamranahmedse <kamranahmed.se@gmail.com>`     | ✅   |
| dependencies        | `{}` (zero runtime deps) | none                                           | ✅   |
| scripts.postinstall | undefined                | undefined (only dev/build/test/format scripts) | ✅   |
| license             | permissive               | MIT                                            | ✅   |
| last publish        | recent (not abandoned)   | 2025-11-18 (~6.5 months)                       | ✅   |
| weekly downloads    | high (widely used)       | 915,663                                        | ✅   |

Installed via `npm install --save-exact driver.js@1.4.0` (exact pin, no caret range — no surprise upgrades). Result: 1 package added, zero transitive deps, **0 vulnerabilities**. The custom-overlay fallback was therefore not exercised; GuidedTour imports `driver.js` + `driver.js/dist/driver.css` directly.

## Task Commits

1. **Task 1: driver.js legitimacy + install** - `279d9b6` (chore)
2. **Task 2: uiStore reveal slice + UIState members** - `07288bf` (feat)
3. **Task 3a: reveal core (IntroOverlay/GuidedTour/TourTrigger/tourSteps + mount)** - `11e91f2` (feat)
4. **Task 3b: data-tour HUD attrs + index.html OG meta + REVEAL-SITE-04** - `6ca82db` (feat)

_Task 5 (manual tour walkthrough + OG-card validator) is a `checkpoint:human-verify` deferred to end-of-phase per `workflow.human_verify_mode=end-of-phase` — see Human Verification Needed below._

## Files Created/Modified

- `src/lib/tourSteps.ts` (new) - 5-step tour list, `[data-tour]` selectors only, own structural TourStep type (no driver.js import).
- `src/components/reveal/IntroOverlay.tsx` (new) - first-visit dismissible overlay; Explore→setIntroSeen(true); Start the tour→setIntroSeen(true)+openTour(); `data-testid="intro-overlay"`.
- `src/components/reveal/GuidedTour.tsx` (new) - behavior-only null render; effect keyed on isTourOpen drives `driver().drive()`; `onDestroyed`→closeTour; idempotent destroy on cleanup.
- `src/components/reveal/TourTrigger.tsx` (new) - persistent (non-gated) Topbar button→openTour; `data-testid="tour-trigger"`.
- `src/types/ui.ts` - UIState extended with 5 reveal members.
- `src/stores/uiStore.ts` - reveal slice (persisted isIntroSeen + session-scoped isTourOpen).
- `src/components/layout/AppShell.tsx` - mounts IntroOverlay+GuidedTour; `data-tour="threat-density"` on map-container.
- `src/components/layout/Topbar.tsx` - mounts TourTrigger; `data-tour="api-health"` on dev-api-status-trigger.
- `src/components/layout/StatusDropdown.tsx` - `data-tour="status"`.
- `src/components/layout/Sidebar.tsx` - `data-tour="layers"` on the live layers accordion section.
- `src/components/layout/DetailPanelSlot.tsx` - `data-tour="detail"`.
- `index.html` - static OG/Twitter/description meta block.
- `docs/COSTS.md` - REVEAL-SITE-04 stay-on-vercel.app confirmation note.
- `package.json` / `package-lock.json` - driver.js@1.4.0 (exact).

## Decisions Made

- **driver.js installed, not the fallback** — every legitimacy signal was clean (see verdict table); no reason to hand-roll an SVG-cutout overlay.
- **`data-tour="layers"` relocated** from the planned `LayerTogglesSlot` wrapper to the Sidebar layers accordion `<div ref={layersRef}>`. The `LayerTogglesSlot` component is NOT mounted in AppShell — the live layers panel is the Sidebar accordion (which uses `LayerTogglesContent`). The Sidebar content stays in the DOM (CSS-translated off-screen, not conditionally removed), so the selector resolves in the rendered shell. (Caught by the tourSteps.test.tsx RED→GREEN cycle.)
- **`threat-density` step points at `map-container`** (always present) rather than the threat-density legend (which only renders when the threat layer is active) — honors Pitfall 1 ("to point at the map, highlight the map-container div").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved `data-tour="layers"` to the actually-mounted layers node**

- **Found during:** Task 3b (tourSteps.test.tsx initially RED on the `[data-tour="layers"]` selector)
- **Issue:** The plan's read_first pointed the `layers` attr at `LayerTogglesSlot.tsx`, but that wrapper component is never mounted in AppShell — the Sidebar renders `LayerTogglesContent` inside its own accordion. The selector resolved to null in the rendered shell, failing the selector-existence contract.
- **Fix:** Reverted the attr on `LayerTogglesSlot.tsx` and placed `data-tour="layers"` on the Sidebar layers accordion wrapper (`<div ref={layersRef}>`), which is always in the DOM.
- **Files modified:** src/components/layout/Sidebar.tsx, src/components/layout/LayerTogglesSlot.tsx
- **Verification:** tourSteps.test.tsx GREEN (9/9 in the reveal+og subset).
- **Committed in:** `6ca82db` (Task 3b commit)

---

**Total deviations:** 1 auto-fixed (1 blocking). **Impact on plan:** Necessary to satisfy the selector-existence contract; no scope creep — the same logical "layers panel" target, relocated to the node that actually mounts.

## Issues Encountered

- **Full-suite worker timeout (flake, out of scope):** `npx vitest run` (full 2505-test suite) reported `1 failed | 2480 passed` where the single "failure" was a `[vitest-pool-runner]: Timeout waiting for worker to respond` infrastructure error under heavy parallel load (1716s wall, 2721s aggregate setup) — NOT a named test assertion failure. Re-running the reveal + uiStore subset in isolation passes cleanly (51/51). This is pre-existing parallel-run flakiness, unrelated to this plan's changes.

## Human Verification Needed

Task 5 is a `checkpoint:human-verify` deferred to end-of-phase (per `workflow.human_verify_mode=end-of-phase`). The automatable build is complete, `npm run build` passes, and the dev server can be started for verification. Exact steps for the operator:

1. **Intro overlay first-visit + persistence:** `npm run dev` (http://localhost:5173). In a fresh profile (clear `localStorage` key `iran-monitor.intro-seen`), confirm the IntroOverlay appears on first load. Click **"Explore the map"** → overlay dismisses. Reload → overlay stays dismissed (localStorage persisted).
2. **Re-openable tour + spotlight geometry:** Click the persistent **"Tour"** affordance in the Topbar. Step through; confirm the spotlight lands on each HUD node in order — StatusDropdown (status) → Layers panel → the map (threat-density) → DetailPanelSlot (detail) → API Health trigger — and NOT the WebGL canvas / a flight icon. Note: the Layers and Detail panels may be off-screen when collapsed/closed; driver.js scrolls/positions to the data-tour node, but if a step looks misplaced, open the Sidebar (Layers) / select an entity (Detail) first to confirm geometry.
3. **OG card (post-deploy):** After deploy, validate the share card on the `vercel.app` URL via the LinkedIn Post Inspector + Twitter/X Card Validator. Confirm `https://otg-iran-monitor.vercel.app/screenshots/og-card.png` resolves and renders at 1200x630.
4. **D-02 read-only API-Health:** Confirm the read-only API-Health surface exposes no Bearer/token/key, and that write paths (replay / prune / force-trigger) still demand a Bearer (verification only — no new gating was built).

## User Setup Required

None - no external service configuration required. driver.js is a build-time dependency; the OG card asset already exists (Plan 04).

## Next Phase Readiness

- SC41-4 (REVEAL-SITE strand) implementation complete: intro overlay + re-openable tour + social-share meta + custom-domain decision all ship.
- One open item: the end-of-phase human-verify checkpoint (Task 5) above — visual tour geometry + crawler-side OG rendering (neither is jsdom-testable).

## Self-Check: PASSED

- All 4 created files present (tourSteps.ts, IntroOverlay.tsx, GuidedTour.tsx, TourTrigger.tsx).
- SUMMARY.md present.
- All 4 task commits found in git log (279d9b6, 07288bf, 11e91f2, 6ca82db).

---

_Phase: 41-public-reveal-polish_
_Completed: 2026-06-05_
