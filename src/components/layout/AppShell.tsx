import { Topbar } from '@/components/layout/Topbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { MarketsSlot } from '@/components/layout/MarketsSlot';
import { BaseMap } from '@/components/map/BaseMap';
import { useFlightPolling } from '@/hooks/useFlightPolling';
import { useShipPolling } from '@/hooks/useShipPolling';
import { useEventPolling } from '@/hooks/useEventPolling';
import { useSiteFetch } from '@/hooks/useSiteFetch';
import { useNewsPolling } from '@/hooks/useNewsPolling';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { useWeatherPolling } from '@/hooks/useWeatherPolling';
import { useWaterFetch } from '@/hooks/useWaterFetch';
import { useWaterPrecipPolling } from '@/hooks/useWaterPrecipPolling';
import { useNotifications } from '@/hooks/useNotifications';
import { useEscapeKeyHandler } from '@/hooks/useEscapeKeyHandler';
import { Component, type ReactNode } from 'react';
import { useQuerySync } from '@/hooks/useQuerySync';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import { DashboardAuthModal } from '@/components/ui/DashboardAuthModal';
import { shouldRenderDashboard } from '@/lib/dashboardAuth';
import { HealthStatusProvider } from '@/components/providers/HealthStatusProvider';

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

        {/* Phase 27.4.4 Plan 02 — DevApiStatus now renders in dev OR when an
          operator has stored a dashboard auth key in localStorage (prod). The
          previous AppShell-level `import.meta.env.DEV` outer gate is now
          delegated to `shouldRenderDashboard()` so the component ships in
          prod bundles for authed operators. ErrorBoundary preserved. */}
        {shouldRenderDashboard() && (
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
