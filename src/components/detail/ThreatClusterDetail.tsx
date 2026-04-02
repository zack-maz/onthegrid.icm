import { useMemo } from 'react';
import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useGeoContext } from '@/hooks/useGeoContext';
import { computeThreatWeight } from '@/components/map/layers/ThreatHeatmapOverlay';
import { EVENT_TYPE_LABELS } from '@/types/ui';
import type { ThreatCluster } from '@/types/ui';

interface ThreatClusterDetailProps {
  cluster: ThreatCluster;
}

/** Relative time helper */
function formatRelativeTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Maximum number of type breakdown bars to show */
const MAX_TYPE_BARS = 5;

export function ThreatClusterDetail({ cluster }: ThreatClusterDetailProps) {
  const events = useEventStore((s) => s.events);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);
  const geoContext = useGeoContext(cluster);

  // Look up individual events by cluster eventIds
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const matchedEvents = cluster.eventIds
    .map((id) => eventMap.get(id))
    .filter((e) => e != null);

  // Sort events by threat weight (highest severity first)
  const sortedEvents = useMemo(
    () => [...matchedEvents].sort((a, b) => computeThreatWeight(b) - computeThreatWeight(a)),
    [matchedEvents],
  );

  // Event type breakdown: count per type, sorted by count descending
  const typeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of matchedEvents) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1]);
  }, [matchedEvents]);

  const maxTypeCount = typeBreakdown.length > 0 ? typeBreakdown[0][1] : 1;
  const visibleTypes = typeBreakdown.slice(0, MAX_TYPE_BARS);
  const hiddenTypeCount = typeBreakdown.length - visibleTypes.length;

  const visibleCount = matchedEvents.length;
  const totalCount = cluster.eventIds.length;

  const dominantTypeLabel = EVENT_TYPE_LABELS[cluster.dominantType] ?? cluster.dominantType;

  const handleEventClick = (eventId: string, lat: number, lng: number) => {
    selectEntity(eventId);
    openDetailPanel();
    setFlyToTarget({ lng, lat, zoom: 10 });
  };

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 mt-0">
        Threat Cluster
      </h3>

      {/* Summary */}
      <div className="flex flex-col gap-0.5 px-3 py-1">
        <div className="flex justify-between text-xs">
          <span className="text-text-primary font-medium">{cluster.eventCount} events</span>
          <span className="text-text-muted">{formatRelativeTime(cluster.latestTime)}</span>
        </div>
        <div className="text-xs text-text-muted">
          Dominant type: <span className="text-text-primary">{dominantTypeLabel}</span>
        </div>
        {cluster.totalFatalities > 0 && (
          <div className="text-xs text-red-400">{cluster.totalFatalities} fatalities</div>
        )}
      </div>

      {/* Geographic context */}
      <div className="px-3 py-1" data-testid="geo-context">
        {geoContext ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3 shrink-0 opacity-60"
            >
              <path
                fillRule="evenodd"
                d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.291 5.597a15.591 15.591 0 0 0 2.236 2.235l.012.01ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
                clipRule="evenodd"
              />
            </svg>
            <span>{geoContext.label}</span>
          </div>
        ) : (
          <div className="h-4 w-32 rounded bg-white/5 animate-pulse" />
        )}
      </div>

      {/* Event type breakdown bars */}
      {visibleTypes.length > 0 && (
        <div className="px-3 py-1" data-testid="type-breakdown">
          <h4 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
            Event Types
          </h4>
          <div className="flex flex-col gap-1">
            {visibleTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-[11px]">
                <span className="text-text-muted w-24 truncate shrink-0">
                  {EVENT_TYPE_LABELS[type] ?? type}
                </span>
                <div className="flex-1 h-4 rounded-sm bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-white/25"
                    style={{ width: `${(count / maxTypeCount) * 100}%` }}
                  />
                </div>
                <span className="text-text-muted w-5 text-right shrink-0">{count}</span>
              </div>
            ))}
          </div>
          {hiddenTypeCount > 0 && (
            <div className="text-[10px] text-text-muted mt-1">
              and {hiddenTypeCount} more {hiddenTypeCount === 1 ? 'type' : 'types'}
            </div>
          )}
        </div>
      )}

      {/* Visibility message */}
      {visibleCount < totalCount && (
        <div className="px-3 py-1 text-[10px] text-text-muted">
          {visibleCount} of {totalCount} events visible
        </div>
      )}

      {/* Scrollable event list */}
      <div className="mt-2 border-t border-border pt-2">
        <h3 className="text-[10px] uppercase tracking-wider text-text-muted mb-1 px-3">
          Events
        </h3>
        <div className="max-h-[300px] overflow-y-auto" key={cluster.id}>
          {sortedEvents.map((event) => {
            const typeLabel = EVENT_TYPE_LABELS[event.type] ?? event.type;
            const fatalities = event.data.fatalities ?? 0;

            return (
              <button
                key={event.id}
                onClick={() => handleEventClick(event.id, event.lat, event.lng)}
                className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-border/50 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-primary">{typeLabel}</span>
                  <span className="text-[10px] text-text-muted">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {event.data.locationName || `${event.lat.toFixed(3)}, ${event.lng.toFixed(3)}`}
                </div>
                {fatalities > 0 && (
                  <div className="text-[10px] text-red-400 mt-0.5">
                    {fatalities} fatalities
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
