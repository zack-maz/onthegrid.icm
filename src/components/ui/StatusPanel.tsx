import { useState, useEffect } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useWaterStore } from '@/stores/waterStore';
import { useLayerStore } from '@/stores/layerStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
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
      <span className="text-text-secondary tabular-nums">{isLoading ? '\u2014' : count}</span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}

export function StatusPanel() {
  const utc = useUtcClock();
  const isCollapsed = useUIStore((s) => s.isStatusCollapsed);
  const toggleStatus = useUIStore((s) => s.toggleStatus);
  const flightStatus = useFlightStore((s) => s.connectionStatus);
  const shipStatus = useShipStore((s) => s.connectionStatus);
  const eventStatus = useEventStore((s) => s.connectionStatus);
  const siteConnectionStatus = useSiteStore((s) => s.connectionStatus);
  const siteStatus: FeedStatus = siteConnectionStatus === 'idle' ? 'loading' : siteConnectionStatus;

  const waterLayerActive = useLayerStore((s) => s.activeLayers.has('water'));
  const waterConnectionStatus = useWaterStore((s) => s.connectionStatus);
  const waterStatus: FeedStatus =
    waterConnectionStatus === 'idle' ? 'loading' : waterConnectionStatus;
  const waterFacilities = useWaterStore((s) => s.facilities);
  const visibleWater = waterFacilities.length;

  const flightDegraded = useFlightStore((s) => s.degraded);
  const shipDegraded = useShipStore((s) => s.degraded);
  const eventDegraded = useEventStore((s) => s.degraded);
  const anyDegraded = flightDegraded || shipDegraded || eventDegraded;

  // Use filtered entities (applies filter store predicates) — unconditional counts
  const { flights, ships: filteredShips, events } = useFilteredEntities();

  const sites = useSiteStore((s) => s.sites);
  const visibleFlights = flights.length;
  const visibleShips = filteredShips.length;
  const visibleEvents = events.length;
  const visibleSites = sites.length;

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
          <span
            data-testid="utc-clock"
            className="text-xs text-text-secondary tabular-nums tracking-wide"
          >
            {utc}
          </span>
          {anyDegraded && (
            <div
              data-testid="degraded-indicator"
              className="flex items-center gap-1.5 text-xs text-accent-yellow"
              title="Data may be outdated"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-accent-yellow" />
              <span>Degraded</span>
            </div>
          )}
          <FeedLine status={flightStatus} count={visibleFlights} label="flights" />
          <FeedLine status={shipStatus} count={visibleShips} label="ships" />
          <FeedLine status={eventStatus} count={visibleEvents} label="events" />
          <FeedLine status={siteStatus} count={visibleSites} label="sites" />
          {waterLayerActive && <FeedLine status={waterStatus} count={visibleWater} label="water" />}
        </div>
      )}
    </OverlayPanel>
  );
}
