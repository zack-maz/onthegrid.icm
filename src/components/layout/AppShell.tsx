import { TitleSlot } from '@/components/layout/TitleSlot';
import { CountersSlot } from '@/components/layout/CountersSlot';
import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';
import { FiltersSlot } from '@/components/layout/FiltersSlot';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';
import { BaseMap } from '@/components/map/BaseMap';

export function AppShell() {
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

      {/* Top-right: Counters + Layer toggles */}
      <div className="absolute top-4 right-4 z-[var(--z-controls)] flex flex-col items-end gap-2">
        <CountersSlot />
        <LayerTogglesSlot />
      </div>

      {/* Bottom-left: Filters */}
      <div className="absolute bottom-4 left-4 z-[var(--z-controls)]">
        <FiltersSlot />
      </div>

      {/* Left edge: Detail panel (hidden by default) */}
      <DetailPanelSlot />
    </div>
  );
}
