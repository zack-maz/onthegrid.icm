import { Topbar } from '@/components/layout/Topbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { MarketsSlot } from '@/components/layout/MarketsSlot';
import { UtcClock } from '@/components/layout/UtcClock';
import { BaseMap } from '@/components/map/BaseMap';
import { useFlightPolling } from '@/hooks/useFlightPolling';
import { useShipPolling } from '@/hooks/useShipPolling';
import { useEventPolling } from '@/hooks/useEventPolling';
import { useSiteFetch } from '@/hooks/useSiteFetch';
import { useNewsPolling } from '@/hooks/useNewsPolling';
import { useMarketPolling } from '@/hooks/useMarketPolling';
import { useNotifications } from '@/hooks/useNotifications';

export function AppShell() {
  useFlightPolling();
  useShipPolling();
  useEventPolling();
  useSiteFetch();
  useNewsPolling();
  useMarketPolling();
  useNotifications();

  return (
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

      {/* Bottom-left: UTC clock */}
      <UtcClock />
    </div>
  );
}
