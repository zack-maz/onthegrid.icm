import { Component, type ReactNode } from 'react';

import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { MarketsSlot } from '@/components/layout/MarketsSlot';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { BaseMap } from '@/components/map/BaseMap';
import { HealthStatusProvider } from '@/components/providers/HealthStatusProvider';
import { DashboardAuthModal } from '@/components/ui/DashboardAuthModal';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import { HealthBanner } from '@/components/ui/HealthBanner';
import { useEscapeKeyHandler } from '@/hooks/useEscapeKeyHandler';
import { useEventPolling } from '@/hooks/useEventPolling';
import { useFlightPolling } from '@/hooks/useFlightPolling';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { useNewsPolling } from '@/hooks/useNewsPolling';
import { useNotifications } from '@/hooks/useNotifications';
import { useQuerySync } from '@/hooks/useQuerySync';
import { useShipPolling } from '@/hooks/useShipPolling';
import { useSiteFetch } from '@/hooks/useSiteFetch';
import { useWaterFetch } from '@/hooks/useWaterFetch';
import { useWaterPrecipPolling } from '@/hooks/useWaterPrecipPolling';
import { useWeatherPolling } from '@/hooks/useWeatherPolling';
import { useShouldRenderDashboard } from '@/lib/dashboardAuth';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function AppShell() {
  useFlightPolling();
  useShipPolling();
  useEventPolling();
  useSiteFetch();
  useNewsPolling();
  useMarketPolling();
  useWeatherPolling();
  useWaterFetch();
  useWaterPrecipPolling();
  useNotifications();
  useEscapeKeyHandler();
  useQuerySync();

  // Reactive read: re-renders when the auth modal opens/closes so the
  // DevApiStatus mount gate reflects the latest localStorage state. Plain
  // `shouldRenderDashboard()` was returning false stale-once-mounted —
  // setDashboardKey writes localStorage but doesn't trigger a React
  // re-render, so the dashboard never appeared after a successful auth.
  const showDashboard = useShouldRenderDashboard();

  return (
    // Phase 28.1 W2 — HealthStatusProvider wraps the entire tree so
    // HealthBanner + DevApiStatus "All APIs" tab share ONE /api/health
    // poll cadence (single-poll invariant). useHealthStatus() is called
    // exactly once here; consumers use useHealthStatusContext().
    <HealthStatusProvider>
      <div className="relative h-screen w-screen overflow-hidden bg-surface">
        {/* Topbar - full width at top */}
        <Topbar />

        {/* Map container - fills viewport below topbar */}
        <div
          data-testid="map-container"
          className="absolute inset-0 z-[var(--z-map)]"
          style={{ top: 'var(--height-topbar)' }}
        >
          <BaseMap />
        </div>

        {/* Left sidebar - overlays map */}
        <Sidebar />

        {/* Right detail panel - unchanged */}
        <DetailPanelSlot />

        {/* Floating markets panel */}
        <MarketsSlot />

        {/* Phase 28.1 W2 — HealthBanner is intentionally NOT gated behind
          shouldRenderDashboard() per user decision 2026-05-01. Visible to
          anonymous users; preserves "numbers over narratives" transparency.
          UI-SPEC §Open Questions Q1 default-recommendation OVERRIDDEN.
          Consumes useHealthStatusContext() from the surrounding
          HealthStatusProvider — does NOT call useHealthStatus() directly
          (single-poll guarantee). */}
        <ErrorBoundary>
          <HealthBanner />
        </ErrorBoundary>

        {/* Phase 27.4.4 Plan 02 — DevApiStatus now renders in dev OR when an
          operator has stored a dashboard auth key in localStorage (prod). The
          previous AppShell-level `import.meta.env.DEV` outer gate is now
          delegated to `useShouldRenderDashboard()` (Phase 28.2 W6 hotfix)
          so the gate is reactive — see the hook's docstring. ErrorBoundary
          preserved. */}
        {showDashboard && (
          <ErrorBoundary>
            <DevApiStatus />
          </ErrorBoundary>
        )}

        {/* Dashboard auth gate modal — opens via DevApiStatusTrigger in prod
          when the user has not yet entered a key. Self-closes when not open. */}
        <DashboardAuthModal />
      </div>
    </HealthStatusProvider>
  );
}
