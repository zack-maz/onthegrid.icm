import { useState, useEffect } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
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
  const flightCount = useFlightStore((s) => s.flightCount);
  const shipStatus = useShipStore((s) => s.connectionStatus);
  const shipCount = useShipStore((s) => s.shipCount);
  const eventStatus = useEventStore((s) => s.connectionStatus);
  const eventCount = useEventStore((s) => s.eventCount);

  return (
    <OverlayPanel className="min-w-[140px]">
      <div className="flex flex-col gap-1">
        <span data-testid="utc-clock" className="text-xs text-text-secondary tabular-nums tracking-wide">
          {utc}
        </span>
        <FeedLine status={flightStatus} count={flightCount} label="flights" />
        <FeedLine status={shipStatus} count={shipCount} label="ships" />
        <FeedLine status={eventStatus} count={eventCount} label="events" />
      </div>
    </OverlayPanel>
  );
}
