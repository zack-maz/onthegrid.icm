import { driver } from 'driver.js';
import { useEffect } from 'react';

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
 * `isTourOpen` is session-scoped (uiStore, no localStorage). `onDestroyed`
 * (fired when the user finishes/closes the tour, incl. the close "x" and the
 * overlay click) flips the flag back so a re-open via TourTrigger re-runs cleanly.
 */
export function GuidedTour() {
  const isTourOpen = useUIStore((s) => s.isTourOpen);

  useEffect(() => {
    if (!isTourOpen) return;

    const tour = driver({
      showProgress: true,
      allowClose: true,
      steps: tourSteps,
      // Reset the session flag whenever the tour is destroyed (finished,
      // closed, or escaped) so TourTrigger can re-open it.
      onDestroyed: () => useUIStore.getState().closeTour(),
    });

    tour.drive();

    return () => {
      // Guard against double-destroy: if the user already finished the tour,
      // driver() has torn itself down; destroy() is idempotent but the active
      // check avoids re-firing onDestroyed -> closeTour during unmount.
      if (tour.isActive()) tour.destroy();
    };
  }, [isTourOpen]);

  return null;
}
