import { useState, useEffect } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
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
  const flightStatus = useFlightStore((s) => s.connectionStatus);
  const flights = useFlightStore((s) => s.flights);
  const shipStatus = useShipStore((s) => s.connectionStatus);
  const shipCount = useShipStore((s) => s.shipCount);
  const eventStatus = useEventStore((s) => s.connectionStatus);
  const events = useEventStore((s) => s.events);

  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const showShips = useUIStore((s) => s.showShips);
  const showDrones = useUIStore((s) => s.showDrones);
  const showMissiles = useUIStore((s) => s.showMissiles);

  let visibleFlights = 0;
  if (showFlights && showGroundTraffic) visibleFlights = flights.length;
  else if (showFlights) visibleFlights = flights.filter((f) => !f.data.onGround).length;
  else if (showGroundTraffic) visibleFlights = flights.filter((f) => f.data.onGround).length;

  const visibleShips = showShips ? shipCount : 0;

  let visibleEvents = 0;
  if (showDrones) visibleEvents += events.filter((e) => e.type === 'drone').length;
  if (showMissiles) visibleEvents += events.filter((e) => e.type === 'missile').length;

  return (
    <OverlayPanel className="min-w-[140px]">
      <div className="flex flex-col gap-1">
        <span data-testid="utc-clock" className="text-xs text-text-secondary tabular-nums tracking-wide">
          {utc}
        </span>
        <FeedLine status={flightStatus} count={visibleFlights} label="flights" />
        <FeedLine status={shipStatus} count={visibleShips} label="ships" />
        <FeedLine status={eventStatus} count={visibleEvents} label="events" />
      </div>
    </OverlayPanel>
  );
}
