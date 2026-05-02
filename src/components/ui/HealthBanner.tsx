import { useMemo, useState } from 'react';
import { useHealthStatusContext } from '@/components/providers/HealthStatusProvider';

/**
 * Phase 28.1 W2 — Critical-tier outage warning toast.
 *
 * Renders a fixed-position banner below the topbar when one or more
 * `tier === 'critical'` endpoints are `status === 'unhealthy'`. Per user
 * decision 2026-05-01, the banner is mounted UNCONDITIONALLY in AppShell
 * (NOT gated behind `shouldRenderDashboard()` — UI-SPEC §Q1 default
 * recommendation OVERRIDDEN). Visible to anonymous users; preserves the
 * "numbers over narratives" transparency pillar.
 *
 * Data source: `useHealthStatusContext()` from HealthStatusProvider.
 * MUST NOT call the raw poller hook directly — that would double the
 * `/api/health` poll rate when DevApiStatus is also mounted (Task 5b
 * audit grep enforces this invariant).
 *
 * Dismiss is session-local: clicking Dismiss adds the currently-listed
 * endpoint names to a local `acknowledged` Set. Endpoints recovering and
 * then re-going-unhealthy reappear (because the Set membership is fixed
 * but the filter `!acknowledged.has(name)` continues to apply only as
 * long as the operator hasn't acknowledged THIS particular run). Page
 * reload clears acknowledgement.
 */

const MAX_VISIBLE_NAMES = 3;

export function HealthBanner(): JSX.Element | null {
  const { health } = useHealthStatusContext();
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const criticalUnhealthy = useMemo(() => {
    if (!health) return [];
    return Object.values(health.endpoints).filter(
      (e) => e.tier === 'critical' && e.status === 'unhealthy' && !acknowledged.has(e.name),
    );
  }, [health, acknowledged]);

  if (!health) return null;
  if (criticalUnhealthy.length === 0) return null;

  const visible = criticalUnhealthy.slice(0, MAX_VISIBLE_NAMES);
  const overflow = Math.max(0, criticalUnhealthy.length - MAX_VISIBLE_NAMES);
  const namesText =
    visible.map((e) => e.name).join(', ') + (overflow > 0 ? ` … (+${overflow} more)` : '');

  const handleDismiss = (): void => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      criticalUnhealthy.forEach((e) => next.add(e.name));
      return next;
    });
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="health-banner"
      className="fixed top-12 left-1/2 z-[var(--z-tooltip)] flex min-w-[320px] max-w-[min(92vw,640px)] -translate-x-1/2 items-center gap-2 rounded-md border border-accent-red bg-red-950/95 px-4 py-2 shadow-lg backdrop-blur-sm"
    >
      <span className="text-xs font-semibold text-accent-red">API outage</span>
      <span className="text-xs text-text-primary">— {namesText}</span>
      <button
        type="button"
        onClick={handleDismiss}
        className="ml-auto rounded-md px-2 py-1 text-xs text-text-muted hover:bg-white/5 hover:text-text-secondary"
        aria-label="Dismiss API outage banner"
      >
        Dismiss
      </button>
    </div>
  );
}
