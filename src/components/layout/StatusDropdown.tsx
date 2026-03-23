import { useState, useRef, useEffect, useCallback } from 'react';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useNewsStore } from '@/stores/newsStore';
import { useMarketStore } from '@/stores/marketStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { CONFLICT_TOGGLE_GROUPS } from '@/types/ui';

type FeedStatus = 'connected' | 'stale' | 'error' | 'loading' | 'rate_limited' | 'idle';

const STATUS_DOT_CLASS: Record<FeedStatus, string> = {
  connected: 'bg-accent-green',
  stale: 'bg-accent-yellow',
  error: 'bg-accent-red',
  rate_limited: 'bg-accent-red',
  loading: 'bg-text-muted animate-pulse',
  idle: 'bg-text-muted animate-pulse',
};

function FeedLine({ status, count, label }: { status: FeedStatus; count: number; label: string }) {
  const isLoading = status === 'loading' || status === 'idle';
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

export function StatusDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const flightStatus = useFlightStore((s) => s.connectionStatus);
  const shipStatus = useShipStore((s) => s.connectionStatus);
  const eventStatus = useEventStore((s) => s.connectionStatus);
  const siteConnectionStatus = useSiteStore((s) => s.connectionStatus);
  const siteStatus: FeedStatus = siteConnectionStatus === 'idle' ? 'loading' : siteConnectionStatus;
  const newsStatus = useNewsStore((s) => s.connectionStatus);
  const marketStatus = useMarketStore((s) => s.connectionStatus);

  // Entity counts
  const { flights, ships: filteredShips, events } = useFilteredEntities();
  const showFlights = useUIStore((s) => s.showFlights);
  const showGroundTraffic = useUIStore((s) => s.showGroundTraffic);
  const pulseEnabled = useUIStore((s) => s.pulseEnabled);
  const showShips = useUIStore((s) => s.showShips);
  const showEvents = useUIStore((s) => s.showEvents);
  const showAirstrikes = useUIStore((s) => s.showAirstrikes);
  const showGroundCombat = useUIStore((s) => s.showGroundCombat);
  const showTargeted = useUIStore((s) => s.showTargeted);
  const showSites = useUIStore((s) => s.showSites);
  const sites = useSiteStore((s) => s.sites);
  const newsClusterCount = useNewsStore((s) => s.clusterCount);
  const marketQuoteCount = useMarketStore((s) => s.quotes).length;
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);

  const visibleFlights = flights.filter((f) => {
    if (f.data.unidentified) return pulseEnabled;
    if (f.data.onGround) return showGroundTraffic;
    return showFlights;
  }).length;
  const visibleShips = showShips ? filteredShips.length : 0;

  let visibleEvents = 0;
  if (showEvents) {
    if (showAirstrikes) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(e.type)).length;
    if (showGroundCombat) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(e.type)).length;
    if (showTargeted) visibleEvents += events.filter((e) =>
      (CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(e.type)).length;
  }

  const visibleSites = showSites ? sites.length : 0;

  // Outside click to close
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, handleMouseDown]);

  // Aggregate status for the overall indicator
  const statuses = [flightStatus, shipStatus, eventStatus, siteStatus, newsStatus, marketStatus];
  const hasError = statuses.some((s) => s === 'error' || s === 'rate_limited');
  const hasStale = statuses.some((s) => s === 'stale');
  const allConnected = statuses.every((s) => s === 'connected');
  const overallDotClass = hasError ? 'bg-accent-red' : hasStale ? 'bg-accent-yellow' : allConnected ? 'bg-accent-green' : 'bg-text-muted animate-pulse';

  return (
    <div ref={containerRef} className="relative" data-testid="topbar-status">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${overallDotClass}`} />
        <h1 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Iran Conflict Monitor
        </h1>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full z-[var(--z-modal)] mt-2 rounded-lg border border-border bg-surface-overlay px-4 py-3 shadow-lg backdrop-blur-sm min-w-[180px] transition-[left] duration-300" style={{ left: isSidebarOpen ? 'calc(var(--width-icon-strip) + var(--width-sidebar) - 1rem)' : 'calc(var(--width-icon-strip) - 1rem)' }}>
          <div className="flex flex-col gap-1">
            <FeedLine status={flightStatus} count={visibleFlights} label="flights" />
            <FeedLine status={shipStatus} count={visibleShips} label="ships" />
            <FeedLine status={eventStatus} count={visibleEvents} label="events" />
            <FeedLine status={siteStatus} count={visibleSites} label="sites" />
            <FeedLine status={newsStatus} count={newsClusterCount} label="news" />
            <FeedLine status={marketStatus} count={marketQuoteCount} label="markets" />
          </div>
        </div>
      )}
    </div>
  );
}
