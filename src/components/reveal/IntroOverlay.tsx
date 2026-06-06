import { useUIStore } from '@/stores/uiStore';

/**
 * Phase 41 Plan 06 (REVEAL-SITE-01) — first-visit intro overlay.
 *
 * Frames what the visitor is looking at on first load (D-01: the dashboard IS
 * the landing surface — this is narrative framing, NOT a second route). Mirrors
 * the DashboardAuthModal render-gate idiom: mounted unconditionally in AppShell,
 * self-gates on `isIntroSeen`.
 *
 *   - renders when isIntroSeen === false; returns null when true.
 *   - "Explore the map" -> setIntroSeen(true) (dismiss; persists to localStorage).
 *   - "Start the tour"  -> setIntroSeen(true) + openTour() (dismiss + launch tour).
 *
 * Colors via colorBridge semantic utilities (border-border / bg-surface-overlay /
 * text-* / bg-black/60), z-index via the --z-modal CSS-var token — NO inline hex,
 * NO raw z-40 (CLAUDE.md D-13 + z-index scale).
 */
export function IntroOverlay() {
  const introSeen = useUIStore((s) => s.isIntroSeen);
  const setIntroSeen = useUIStore((s) => s.setIntroSeen);
  const openTour = useUIStore((s) => s.openTour);

  if (introSeen) return null;

  return (
    <div
      data-testid="intro-overlay"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Backdrop click dismisses (treated as "Explore the map").
        if (e.target === e.currentTarget) setIntroSeen(true);
      }}
    >
      <div className="w-[440px] max-w-[90vw] rounded-lg border border-border bg-surface-overlay p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold tracking-wide text-text-primary">
          Iran Monitor
        </h2>
        <p className="mb-2 text-sm text-text-secondary">
          A real-time intelligence dashboard for the Iran conflict. Live flights, ships, conflict
          events, and infrastructure on a 2.5D map — fed by a dozen public data sources.
        </p>
        <p className="mb-5 text-xs text-text-muted">
          Numbers over narratives. Take the 60-second tour, or dive straight into the map.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setIntroSeen(true)}
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-white/5"
          >
            Explore the map
          </button>
          <button
            type="button"
            onClick={() => {
              setIntroSeen(true);
              openTour();
            }}
            className="rounded-md bg-accent-blue/20 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/30"
          >
            Start the tour
          </button>
        </div>
      </div>
    </div>
  );
}
