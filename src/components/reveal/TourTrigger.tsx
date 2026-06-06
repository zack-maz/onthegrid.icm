import { useUIStore } from '@/stores/uiStore';

/**
 * Phase 41 Plan 06 (REVEAL-SITE-02) — persistent "Tour" affordance.
 *
 * Re-opens the guided tour at any time. CONTRACT (pinned by
 * src/__tests__/components/reveal/TourTrigger.test.tsx): rendered
 * UNCONDITIONALLY — NOT first-visit-gated (D-03). There is deliberately no
 * `if (isIntroSeen) return null` gate here; the trigger must remain reachable
 * after the intro overlay has been dismissed.
 *
 * Mounted in the Topbar right cluster as a sibling affordance — it does NOT
 * re-style the existing tab-bar chrome (40-CONTEXT D-04b). Colors via
 * colorBridge utilities; no inline hex.
 */
export function TourTrigger() {
  const openTour = useUIStore((s) => s.openTour);

  return (
    <button
      type="button"
      data-tour-trigger
      data-testid="tour-trigger"
      onClick={openTour}
      title="Take the guided tour"
      className="rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-white/5 hover:text-text-secondary"
    >
      Tour
    </button>
  );
}
