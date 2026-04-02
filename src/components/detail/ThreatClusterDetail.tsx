import { useEventStore } from '@/stores/eventStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { getCurrentPanelView } from '@/lib/panelLabel';
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

export function ThreatClusterDetail({ cluster }: ThreatClusterDetailProps) {
  const events = useEventStore((s) => s.events);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const openDetailPanel = useUIStore((s) => s.openDetailPanel);
  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);

  // Look up individual events by cluster eventIds
  const eventMap = new Map(events.map((e) => [e.id, e]));
  const matchedEvents = cluster.eventIds
    .map((id) => eventMap.get(id))
    .filter((e) => e != null);

  const visibleCount = matchedEvents.length;
  const totalCount = cluster.eventIds.length;

  const dominantTypeLabel = EVENT_TYPE_LABELS[cluster.dominantType] ?? cluster.dominantType;

  const handleEventClick = (eventId: string, lat: number, lng: number) => {
    const currentView = getCurrentPanelView();
    if (currentView) {
      useUIStore.getState().pushView(currentView);
    }
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
        <div className="max-h-[300px] overflow-y-auto">
          {matchedEvents.map((event) => {
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
