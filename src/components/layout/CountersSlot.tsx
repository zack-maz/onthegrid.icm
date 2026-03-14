import { useUIStore } from '@/stores/uiStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';

export function CountersSlot() {
  const isCollapsed = useUIStore((s) => s.isCountersCollapsed);
  const toggleCounters = useUIStore((s) => s.toggleCounters);

  return (
    <div data-testid="counters-slot">
      <OverlayPanel>
        <button
          onClick={toggleCounters}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          <span>Counters</span>
          <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
        </button>
        {!isCollapsed && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-text-muted">No data yet</p>
          </div>
        )}
      </OverlayPanel>
    </div>
  );
}
