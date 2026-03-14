import { OverlayPanel } from '@/components/ui/OverlayPanel';

export function TitleSlot() {
  return (
    <div data-testid="title-slot">
      <OverlayPanel>
        <h1 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Iran Conflict Monitor
        </h1>
      </OverlayPanel>
    </div>
  );
}
