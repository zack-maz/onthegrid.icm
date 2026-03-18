import { TitleSlot } from '@/components/layout/TitleSlot';
import { CountersSlot } from '@/components/layout/CountersSlot';
import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';

import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { StatusPanel } from '@/components/ui/StatusPanel';
import { BaseMap } from '@/components/map/BaseMap';
import { useFlightPolling } from '@/hooks/useFlightPolling';
import { useShipPolling } from '@/hooks/useShipPolling';
import { useEventPolling } from '@/hooks/useEventPolling';

export function AppShell() {
  useFlightPolling();
  useShipPolling();
  useEventPolling();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-surface">
      {/* Map container - fills viewport */}
      <div
        data-testid="map-container"
        className="absolute inset-0 z-[var(--z-map)]"
      >
        <BaseMap />
      </div>

      {/* Top-left: Title */}
      <div className="absolute top-4 left-4 z-[var(--z-overlay)]">
        <TitleSlot />
      </div>

      {/* Top-right: Status panel + Counters + Layer toggles */}
      <div className="absolute top-4 right-4 z-[var(--z-controls)] flex flex-col items-end gap-2">
        <StatusPanel />
        <CountersSlot />
        <LayerTogglesSlot />
      </div>

{/* Left edge: Detail panel (hidden by default) */}
      <DetailPanelSlot />
    </div>
  );
}
