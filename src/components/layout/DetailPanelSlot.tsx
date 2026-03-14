import { useUIStore } from '@/stores/uiStore';

export function DetailPanelSlot() {
  const isOpen = useUIStore((s) => s.isDetailPanelOpen);
  const close = useUIStore((s) => s.closeDetailPanel);

  return (
    <div
      data-testid="detail-panel-slot"
      className={`absolute top-0 left-0 z-[var(--z-panel)] h-full
                  w-[var(--width-detail-panel)] transform transition-transform
                  duration-300 ease-in-out
                  ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="h-full border-r border-border bg-surface/95 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-primary">
            Details
          </h2>
          <button
            onClick={close}
            className="text-text-muted transition-colors hover:text-text-primary"
          >
            Close
          </button>
        </div>
        <p className="text-sm text-text-secondary">Select an entity on the map</p>
      </div>
    </div>
  );
}
