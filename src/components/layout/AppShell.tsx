import { TitleSlot } from '@/components/layout/TitleSlot';
import { CountersSlot } from '@/components/layout/CountersSlot';
import { LayerTogglesSlot } from '@/components/layout/LayerTogglesSlot';
import { FiltersSlot } from '@/components/layout/FiltersSlot';
import { DetailPanelSlot } from '@/components/layout/DetailPanelSlot';

export function AppShell() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-surface">
      {/* Map container - fills viewport */}
      <div
        data-testid="map-container"
        className="absolute inset-0 z-[var(--z-map)]"
      >
        {/* Map component will be injected here in Phase 2 */}
        <div className="h-full w-full bg-surface" />
      </div>

      {/* Top-left: Title + Counters */}
      <div className="absolute top-4 left-4 z-[var(--z-overlay)] flex flex-col gap-3">
        <TitleSlot />
        <CountersSlot />
      </div>

      {/* Top-right: Layer toggles + Filters */}
      <div className="absolute top-4 right-4 z-[var(--z-controls)] flex flex-col items-end gap-2">
        <LayerTogglesSlot />
        <FiltersSlot />
      </div>

      {/* Left edge: Detail panel (hidden by default) */}
      <DetailPanelSlot />
    </div>
  );
}
