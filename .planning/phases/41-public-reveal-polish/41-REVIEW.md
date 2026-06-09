---
phase: 41-public-reveal-polish
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/components/reveal/GuidedTour.tsx
  - src/components/reveal/IntroOverlay.tsx
  - src/components/reveal/TourTrigger.tsx
  - src/lib/tourSteps.ts
  - src/stores/uiStore.ts
  - src/types/ui.ts
  - src/components/layout/AppShell.tsx
  - src/components/layout/DetailPanelSlot.tsx
  - src/components/layout/Sidebar.tsx
  - src/components/layout/StatusDropdown.tsx
  - src/components/layout/Topbar.tsx
  - scripts/capture-hero.ts
  - index.html
  - server/openapi.yaml
  - .env.example
  - package.json
  - src/__tests__/stores/uiStore.reveal.test.ts
  - src/__tests__/components/reveal/IntroOverlay.test.tsx
  - src/__tests__/components/reveal/TourTrigger.test.tsx
  - src/__tests__/components/reveal/tourSteps.test.tsx
  - src/__tests__/og-tags.test.ts
  - src/__tests__/capture-layers.contract.test.ts
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the Phase 41 "public reveal" surface: first-visit `IntroOverlay`, driver.js-powered `GuidedTour` controller, `TourTrigger`, the `tourSteps` selector list, the uiStore reveal slice, the `data-tour` wiring across HUD chrome, the extended `capture-hero.ts --layers` mode, static OG/Twitter meta in `index.html`, and additive `openapi.yaml` operations.

The implementation is clean on the conventions front: Zustand curried pattern + `s => s.field` selectors are followed, color/z tokens are sourced from `app.css` custom properties (no inline hex in the new reveal components), the persist idiom mirrors `isMarketsCollapsed`, and all five `data-tour` selectors resolve to present DOM nodes. SSR/localStorage access is guarded with try/catch.

No BLOCKER-class correctness or security defects were found. However, there are several WARNING-level robustness and behavioral issues that should be fixed before this ships to a public audience: a guided tour that spotlights HUD chrome which is hidden/off-screen at tour-start (layers + detail panel), a re-entrancy edge in the GuidedTour effect cleanup, accessibility gaps in the intro modal (no Escape, no focus trap, no dialog role), and a few inconsistencies the new components introduce relative to the rest of the app.

## Warnings

### WR-01: Guided tour spotlights hidden / off-screen HUD chrome (layers + detail panel)

**File:** `src/lib/tourSteps.ts:42,58` (targets), `src/components/layout/Sidebar.tsx:361-396`, `src/components/layout/DetailPanelSlot.tsx:118-123`

**Issue:** Two of the five tour steps target nodes that are visually hidden at tour-launch time:

- Step 2 `[data-tour="layers"]` lives inside `sidebar-content`, which is `-translate-x-full opacity-0 !pointer-events-none` whenever `isSidebarOpen === false` (Sidebar.tsx:361-365). On first visit the sidebar is closed (`isSidebarOpen: false` default, uiStore.ts:25).
- Step 4 `[data-tour="detail"]` is the detail panel, which is `translate-x-full` (translated fully off the right edge) whenever `isDetailPanelOpen === false` (DetailPanelSlot.tsx:122). It is closed by default.

driver.js highlights the element's bounding box. A node translated off-screen / at `opacity-0` still has a bounding rect, so driver.js will draw a spotlight on an empty or off-viewport region — the user sees a popover pointing at nothing. The `tourSteps.test.tsx` contract only asserts the nodes _exist_ in the DOM (`container.querySelector(...).not.toBeNull()`), so this passes CI while being broken at runtime. This directly undercuts the headline feature of a "public reveal" phase.

**Fix:** Either (a) open the relevant panels as part of the tour so the highlighted chrome is actually visible, by adding driver.js `onHighlightStarted` hooks per step that call `useUIStore.getState().toggleSidebar()` / set the appropriate section, or (b) re-point those two steps at always-visible affordances (e.g. the sidebar Layers _icon-strip button_ and the detail panel's slot wrapper while open). Minimum viable fix — drive the panel-open side effects in the step config:

```ts
// tourSteps.ts — give steps that need a panel open a side effect
{
  element: '[data-tour="layers"]',
  popover: { title: 'Visualization layers', description: '…' },
  onHighlightStarted: () => {
    const ui = useUIStore.getState();
    if (!ui.isSidebarOpen) ui.openSidebarSection('layers');
  },
},
```

(Requires importing the driver.js `DriveStep` type instead of the hand-rolled `TourStep`, or extending `TourStep` with the optional hook.)

### WR-02: GuidedTour cleanup re-runs `closeTour()` via `onDestroyed`, risking a redundant state write / future re-entrancy

**File:** `src/components/reveal/GuidedTour.tsx:40-45`

**Issue:** The effect's cleanup calls `tour.destroy()` when `tour.isActive()`. `destroy()` fires the `onDestroyed` callback, which calls `useUIStore.getState().closeTour()`. The cleanup runs in two scenarios:

1. `isTourOpen` flips `true → false` (normal close path). Here `closeTour()` already set the flag false, so the cleanup's `destroy()` → `onDestroyed` → `closeTour()` is a redundant no-op write — harmless today only because `set({ isTourOpen: false })` on an already-false value is idempotent.
2. The component unmounts while the tour is still active (e.g. AppShell teardown, or a future ErrorBoundary reset). `destroy()` → `onDestroyed` → `closeTour()` calls `set` on the store during React unmount/teardown, which is fragile and can warn ("cannot update state on unmounted tree") depending on timing.

The comment at line 41-43 acknowledges the double-destroy concern but the guard (`isActive()`) does not prevent the `onDestroyed → closeTour` re-entry; it only prevents calling `destroy()` twice. The flag-flip that _triggered_ this cleanup and the flag-flip the cleanup _causes_ are the same value, so it works, but it is load-bearing-by-accident.

**Fix:** Make the teardown not write back to the store. Use a ref to suppress the store write during cleanup, or null out `onDestroyed` before destroying in the cleanup path:

```ts
return () => {
  if (tour.isActive()) {
    tour.setConfig({ onDestroyed: undefined }); // don't bounce back into closeTour
    tour.destroy();
  }
};
```

### WR-03: IntroOverlay is a modal with no Escape handling, no focus trap, and no dialog semantics

**File:** `src/components/reveal/IntroOverlay.tsx:26-67`

**Issue:** The intro overlay is a full-screen `fixed inset-0 z-[var(--z-modal)]` blocking modal but:

- It is **not** registered in the centralized `useEscapeKeyHandler` priority stack (`src/hooks/useEscapeKeyHandler.ts`). Every other dismissible surface in the app (search modal, detail panel, sidebar, markets) responds to Escape; the very first thing a visitor sees does not. Worse, pressing Escape while the intro is up will fall through the priority stack and fire a _lower-priority_ action (e.g. reset camera) underneath the still-open overlay.
- No `role="dialog"` / `aria-modal="true"` / `aria-labelledby`, so screen readers do not announce it as a modal (the sibling `DashboardAuthModal` at least sets `role`/`aria-describedby`).
- No focus management — focus is not moved into the dialog on open and not trapped, so keyboard/AT users can tab into the map chrome behind the backdrop while it is visually blocked.

For a phase whose entire purpose is the public first impression, the landing modal should meet baseline a11y.

**Fix:** Add `role="dialog" aria-modal="true" aria-labelledby="intro-title"` to the panel, give the `<h2>` `id="intro-title"`, move focus to the primary button on mount (`useRef` + `autoFocus`), and add an Escape branch. Cleanest is to fold dismissal into the existing priority stack:

```ts
// useEscapeKeyHandler.ts — add as a high-priority branch
if (!useUIStore.getState().isIntroSeen) {
  useUIStore.getState().setIntroSeen(true);
  return;
}
```

### WR-04: `data-tour="threat-density"` is mislabeled — it targets the whole map container, not the threat-density layer

**File:** `src/components/layout/AppShell.tsx:70-77`, `src/lib/tourSteps.ts:50-55`

**Issue:** The `data-tour="threat-density"` attribute is placed on the top-level `map-container` div (AppShell.tsx:72), which already carries `data-testid="map-container"`. The tour step keyed on it is titled "The map itself" and only _mentions_ threat density in prose. The attribute name therefore lies about what it marks: a future reader wiring a real threat-density-specific tour target will find the name already taken by the map container. This is a naming/maintainability trap, not a runtime bug.

**Fix:** Rename the attribute to `data-tour="map"` (matching its actual referent) and update the selector in `tourSteps.ts`. If a literal threat-density target is wanted later, it can then claim the accurate name.

### WR-05: `capture-hero.ts` shells out with an unquoted glob and `shell: '/bin/bash'`, and uses a brittle `command -v` prereq check

**File:** `scripts/capture-hero.ts:118-124,384-389`

**Issue:** Two shell-integration smells in the capture script (dev-tooling, not shipped to users, hence WARNING not BLOCKER):

- Line 387: `gifski -o "${HERO_GIF}" … ${frameDir}/frame-*.png` passes an **unquoted** glob through `execSync(cmd, { shell: '/bin/bash' })`. `frameDir` is derived from `import.meta.dirname` + fixed path segments, so it is not attacker-controlled, but if the repo is ever checked out under a path containing spaces or glob metacharacters the command silently breaks or expands wrong. `HERO_GIF` is quoted but `frameDir` is not.
- Lines 119-123: prereq detection uses `execSync('command -v ${bin}')`. `command -v` is a bash builtin; under the default `execSync` shell (`/bin/sh`) on some systems this is fine, but the check and the stitch step assume bash semantics inconsistently (the stitch explicitly forces `/bin/bash`, the prereq check does not).

**Fix:** Build the frame list in JS and pass argv to avoid the shell entirely (`execFileSync('gifski', ['-o', HERO_GIF, '--fps', String(fps), …, ...framePaths])`), or at minimum quote the glob and run the stitch via a shell consistently. For the prereq check, prefer `execFileSync('command', ['-v', bin], { shell: '/bin/bash' })` or test for the binary with a portable mechanism.

### WR-06: OG `og:image` points at a generated artifact that is not guaranteed present at deploy time

**File:** `index.html:18,24`; `scripts/capture-hero.ts:713-726`

**Issue:** The static OG/Twitter meta hard-codes `https://otg-iran-monitor.vercel.app/screenshots/og-card.png`. That PNG is produced only by `npm run capture:layers` (capture-hero.ts:716) against a running local dev server with a working headless WebGL stack, and lands in `public/screenshots/`. If `og-card.png` was not generated and committed, every social-share crawl resolves a 404 image — a silent failure invisible to the unit tests (`og-tags.test.ts` only asserts the _meta string_, never that the file exists). For a "public reveal" this is the difference between a rich share card and a broken one.

**Fix:** Add a committed-asset guard so this can't ship empty: a test asserting `public/screenshots/og-card.png` exists and is non-trivial in size, plus a note in the deploy checklist that `capture:layers` must be re-run and its output committed when the OG card changes. Confirm the file is committed (not git-ignored under `public/screenshots/`).

## Info

### IN-01: IntroOverlay backdrop-dismiss is not keyboard reachable and duplicates "Explore" semantics silently

**File:** `src/components/reveal/IntroOverlay.tsx:30-33`

**Issue:** Backdrop click → `setIntroSeen(true)`. There is no keyboard equivalent (covered structurally by WR-03's Escape gap). Minor: the backdrop dismissal silently equals "Explore the map" with no affordance telling the user a click-outside dismisses; acceptable but worth a comment or an explicit close affordance.

**Fix:** Add Escape handling (WR-03) and optionally a small "×" in the panel corner for discoverability.

### IN-02: `IntroOverlay` re-reads three selectors but `setIntroSeen`/`openTour` are stable store actions — fine, noted for consistency

**File:** `src/components/reveal/IntroOverlay.tsx:20-22`

**Issue:** Three separate `useUIStore` selector subscriptions. This is idiomatic per CLAUDE.md (`s => s.field` to minimize re-renders) and correct; only `isIntroSeen` drives a re-render. No change needed — recorded so a future reviewer doesn't "optimize" it into a single object selector that would re-render more.

**Fix:** None.

### IN-03: Magic dimension `w-[440px]` and `min-w-[180px]` are inline literals rather than tokens

**File:** `src/components/reveal/IntroOverlay.tsx:35`, `src/components/layout/StatusDropdown.tsx:103`

**Issue:** The intro card width (`440px`) and dropdown min-width (`180px`) are inline arbitrary values. The codebase otherwise leans on CSS custom-property width tokens (`--width-detail-panel`, `--width-sidebar`, `--width-icon-strip`). Minor consistency drift; not a correctness issue.

**Fix:** Optionally promote to a `--width-*` token if these dimensions are reused; otherwise leave as-is.

### IN-04: `TourTrigger` button lacks `aria-label`; relies on visible "Tour" text + `title`

**File:** `src/components/reveal/TourTrigger.tsx:20-29`

**Issue:** The button has visible text "Tour" and a `title`, so it has an accessible name — acceptable. Recorded only because sibling Topbar buttons (ResetButton, search hint) use `aria-label`; for consistency an explicit `aria-label="Take the guided tour"` matching the `title` would align with the local pattern.

**Fix:** Optional: add `aria-label`.

### IN-05: ACLED env vars retained as empty legacy fields — confirm Zod schema still defaults them

**File:** `.env.example:35-41`

**Issue:** `.env.example` now ships `ACLED_EMAIL=` / `ACLED_PASSWORD=` as empty with a comment that the drift gate (`check:env`) requires them declared and that `server/config.ts` keeps them as defaulted-empty legacy fields. This is correct only if the Zod schema actually `.default('')`s them; given Phase 26.3 fail-fast `parseEnv()` throws on missing/malformed vars, an empty value for a required field would crash boot. Out of direct scope (server/config.ts not in this diff) but worth a one-line verification.

**Fix:** Verify `server/config.ts` declares `ACLED_EMAIL`/`ACLED_PASSWORD` with `.default('')` (or `.optional()`) so empty values don't trip the fail-fast parser.

### IN-06: openapi.yaml additions reference handler line numbers that will rot

**File:** `server/openapi.yaml` (added blocks: "Handler: `server/routes/events.ts:495`" and ":649")

**Issue:** The new `/api/events/llm-history` and `/api/events/prune-dead-urls` descriptions embed absolute source line numbers. These drift the moment events.ts is edited and there is no test pinning them. Documentation-only; low cost but guaranteed to go stale.

**Fix:** Reference the handler by function name (e.g. `getLlmHistory` / `pruneDeadUrls`) rather than file:line.

### IN-07: `tourSteps.ts` docstring claims targets are wired onto "LayerTogglesSlot / map-container / DevApiStatus trigger" but the actual layers target moved to the Sidebar accordion

**File:** `src/lib/tourSteps.ts:14-16` vs `src/components/layout/Sidebar.tsx:386`

**Issue:** The module docstring says the `data-tour` attributes are wired onto "StatusDropdown / LayerTogglesSlot / DetailPanelSlot / map-container / DevApiStatus trigger." In reality `data-tour="layers"` is on the Sidebar accordion section (LayerTogglesSlot's own wrapper "is not mounted in AppShell," per Sidebar.tsx:384-385), not on LayerTogglesSlot. Stale doc comment.

**Fix:** Update the docstring to name the Sidebar accordion as the layers target.

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
