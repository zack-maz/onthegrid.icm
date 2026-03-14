import { OverlayPanel } from '@/components/ui/OverlayPanel';

export function LayerTogglesSlot() {
  return (
    <div data-testid="layer-toggles-slot">
      <OverlayPanel>
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Layers
        </span>
      </OverlayPanel>
    </div>
  );
}
