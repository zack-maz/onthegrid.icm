import { driver } from 'driver.js';
import { useEffect, useRef } from 'react';

import { tourSteps } from '@/lib/tourSteps';
import { useUIStore } from '@/stores/uiStore';

import 'driver.js/dist/driver.css';

/**
 * Phase 41 Plan 06 (REVEAL-SITE-02) — guided-tour controller.
 *
 * Behavior-only, renders null (mirrors CompassControl — a controller mounted in
 * the shell with no own DOM). An effect keyed on `isTourOpen` drives the
 * driver.js spotlight over the HUD `data-tour` nodes and tears it down on close.
 *
 * Spotlights DOM HUD chrome ONLY, never in-canvas WebGL entities (Pitfall 1) —
 * the step selectors in tourSteps.ts all target stable `data-tour` attributes.
 *
 * WR-01: two of the steps (layers, detail) target chrome that is hidden/off-
 * screen by default — the per-step `onHighlightStarted` hooks in tourSteps.ts
 * open those panels so the spotlight lands on real, on-screen chrome. Before
 * driving, this controller snapshots the pre-tour panel state and restores it
 * when the tour ends so the tour leaves the HUD as it found it.
 *
 * `isTourOpen` is session-scoped (uiStore, no localStorage). `onDestroyed`
 * (fired when the user finishes/closes the tour, incl. the close "x" and the
 * overlay click) flips the flag back and restores panel state so a re-open via
 * TourTrigger re-runs cleanly.
 */
export function GuidedTour() {
  const isTourOpen = useUIStore((s) => s.isTourOpen);

  // WR-02: set true in the effect-cleanup path so the `destroy()` we issue on
  // unmount/close does NOT bounce back into `closeTour()` (a store write during
  // React teardown). Reset to false at the top of each run.
  const suppressStoreWriteRef = useRef(false);

  useEffect(() => {
    if (!isTourOpen) return;

    suppressStoreWriteRef.current = false;

    // WR-01: snapshot the pre-tour HUD state so we can restore it on tour end.
    // The step `onHighlightStarted` hooks open the sidebar (Layers section) and
    // the detail panel; without this, the tour would leave them open.
    const ui = useUIStore.getState();
    const prior = {
      isSidebarOpen: ui.isSidebarOpen,
      activeSidebarSection: ui.activeSidebarSection,
      isDetailPanelOpen: ui.isDetailPanelOpen,
    };

    const restorePriorState = () => {
      const store = useUIStore.getState();
      // Restore the sidebar to its pre-tour open/section state.
      if (!prior.isSidebarOpen) {
        store.closeSidebar();
      } else if (
        prior.activeSidebarSection &&
        store.activeSidebarSection !== prior.activeSidebarSection
      ) {
        store.openSidebarSection(prior.activeSidebarSection);
      }
      // Restore the detail panel.
      if (!prior.isDetailPanelOpen) {
        store.closeDetailPanel();
      }
    };

    const tour = driver({
      showProgress: true,
      allowClose: true,
      steps: tourSteps,
      // Reset the session flag whenever the tour is destroyed (finished,
      // closed, or escaped) so TourTrigger can re-open it, and restore the
      // pre-tour HUD state. Suppressed when the destroy was triggered by the
      // effect cleanup (WR-02) — in that path the store is torn down/closing
      // and we must not write back into it.
      onDestroyed: () => {
        if (suppressStoreWriteRef.current) return;
        restorePriorState();
        useUIStore.getState().closeTour();
      },
    });

    tour.drive();

    return () => {
      // WR-02: suppress the onDestroyed -> closeTour re-entry. The flag flip
      // that triggered this cleanup is the same `isTourOpen: false` that
      // closeTour would set, so re-firing it is at best a redundant write and
      // at worst a state write during unmount. We still restore panel state
      // directly (the tour opened those panels), but we do NOT bounce back
      // into the store's tour flag.
      if (tour.isActive()) {
        suppressStoreWriteRef.current = true;
        restorePriorState();
        tour.destroy();
      }
    };
  }, [isTourOpen]);

  return null;
}
