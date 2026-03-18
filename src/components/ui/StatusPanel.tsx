import { useState, useEffect } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { CONFLICT_TOGGLE_GROUPS } from '@/types/ui';
import { OverlayPanel } from '@/components/ui/OverlayPanel';

function useUtcClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toISOString().slice(11, 19) + 'Z';
}

type FeedStatus = 'connected' | 'stale' | 'error' | 'loading' | 'rate_limited';

const STATUS_DOT_CLASS: Record<FeedStatus, string> = {
  connected: 'bg-accent-green',
  stale: 'bg-accent-yellow',
  error: 'bg-accent-red',
  rate_limited: 'bg-accent-red',
  loading: 'bg-text-muted animate-pulse',
};

function FeedLine({ status, count, label }: { status: FeedStatus; count: number; label: string }) {
  const isLoading = status === 'loading';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        data-testid={`status-dot-${label}`}
        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`}
      />
      <span className="text-text-secondary tabular-nums">
        {isLoading ? '\u2014' : count}
      </span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

export function StatusPanel() {
  const utc = useUtcClock();
  const isCollapsed = useUIStore((s) => s.isStatusCollapsed);
  const toggleStatus = useUIStore((s) => s.toggleStatus);
  const flightStatus = useFlightStore((s) => s.connectionStatus);
  const flights = useFlightStore((s) => s.flights);
  const shipStatus = useShipStore((s) => s.connectionStatus);
  const shipCount = useShipStore((s) => s.shipCount);
  const eventStatus = useEventStore((s) => s.connectionStatus);
  const events = useEventStore((s) => s.events);

  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showShips = useUIStore((s) => s.showShips);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const visibleFlights = flights.filter((f) => {
    if (f.data.unidentified) return pulseEnabled;
    if (f.data.onGround) return showGroundTraffic;
    return showFlights;
  }).length;

  const visibleShips = showShips ? shipCount : 0;

  let visibleEvents = 0;
  if (showEvents) {
    if (showAirstrikes) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(e.type)).length;
    if (showGroundCombat) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(e.type)).length;
    if (showTargeted) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(e.type)).length;
  }

  return (
    <OverlayPanel className="min-w-[140px]">
      <button
        onClick={toggleStatus}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-secondary"
      >
        <span>Status</span>
        <span className="text-text-muted">{isCollapsed ? '+' : '-'}</span>
      </button>
      {!isCollapsed && (
        <div className="mt-2 flex flex-col gap-1">
          <span data-testid="utc-clock" className="text-xs text-text-secondary tabular-nums tracking-wide">
            {utc}
          </span>
          <FeedLine status={flightStatus} count={visibleFlights} label="flights" />
          <FeedLine status={shipStatus} count={visibleShips} label="ships" />
          <FeedLine status={eventStatus} count={visibleEvents} label="events" />
        </div>
      )}
    </OverlayPanel>
  );
}
