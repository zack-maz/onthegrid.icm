import { useUIStore } from '@/stores/uiStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { useCounterData } from '@/components/counters/useCounterData';
import { CounterRow } from '@/components/counters/CounterRow';

export function CountersSlot() {
  const isCollapsed = useUIStore((s) => s.isCountersCollapsed);
  const toggleCounters = useUIStore((s) => s.toggleCounters);
  const counters = useCounterData();

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
          <div className="mt-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Flights
            </div>
            <div className="mt-0.5 space-y-0.5">
              <CounterRow label="Iranian" value={counters.iranianFlights} />
              <CounterRow label="Unidentified" value={counters.unidentifiedFlights} />
            </div>

            <div className="border-t border-border my-1.5" />

            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Events
            </div>
            <div className="mt-0.5 space-y-0.5">
              <CounterRow label="Airstrikes" value={counters.airstrikes} />
              <CounterRow label="Ground Combat" value={counters.groundCombat} />
              <CounterRow label="Targeted" value={counters.targeted} />
              <CounterRow label="Fatalities" value={counters.fatalities} />
            </div>
          </div>
        )}
      </OverlayPanel>
    </div>
  );
}
