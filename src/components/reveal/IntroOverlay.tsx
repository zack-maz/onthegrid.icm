import { useEffect, useRef } from 'react';

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
 * Accessibility (WR-03): the panel is a real dialog — role="dialog"
 * aria-modal="true" aria-labelledby. Focus is moved to the primary action on
 * mount and trapped within the dialog while open (Tab/Shift+Tab cycle the two
 * buttons). Escape dismissal is owned by the centralized useEscapeKeyHandler
 * priority stack (Priority 0) so it can't fall through to a lower-priority
 * chrome action behind the backdrop.
 *
 * Colors via colorBridge semantic utilities (border-border / bg-surface-overlay /
 * text-* / bg-black/60), z-index via the --z-modal CSS-var token — NO inline hex,
 * NO raw z-40 (CLAUDE.md D-13 + z-index scale).
 */
export function IntroOverlay() {
  const introSeen = useUIStore((s) => s.isIntroSeen);
  const setIntroSeen = useUIStore((s) => s.setIntroSeen);
  const openTour = useUIStore((s) => s.openTour);

  const panelRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to the primary action on mount so keyboard/AT users start
  // inside the dialog (WR-03).
  useEffect(() => {
    if (introSeen) return;
    primaryButtonRef.current?.focus();
  }, [introSeen]);

  if (introSeen) return null;

  // Focus trap: keep Tab/Shift+Tab cycling within the dialog's focusable
  // controls while the modal is open (WR-03).
  const onKeyDownTrap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      data-testid="intro-overlay"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Backdrop click dismisses (treated as "Explore the map").
        if (e.target === e.currentTarget) setIntroSeen(true);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onKeyDown={onKeyDownTrap}
        className="w-[440px] max-w-[90vw] rounded-lg border border-border bg-surface-overlay p-6 shadow-xl"
      >
        <h2
          id="intro-title"
          className="mb-2 text-base font-semibold tracking-wide text-text-primary"
        >
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
            ref={primaryButtonRef}
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
