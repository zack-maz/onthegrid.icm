import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import type { ProximityAlert } from '@/hooks/useProximityAlerts';

function AlertIcon({
  alert,
  isExpanded,
  onToggle,
  screenX,
  screenY,
}: {
  alert: ProximityAlert;
  isExpanded: boolean;
  onToggle: () => void;
  screenX: number;
  screenY: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: screenX - 12,
        top: screenY - 12,
        zIndex: 'var(--z-controls)',
        pointerEvents: 'auto',
      }}
    >
      {/* Collapsed: pulsing warning icon */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-black shadow-md animate-pulse hover:animate-none hover:bg-amber-400 transition-colors"
        title={`Proximity alert: ${alert.siteLabel}`}
        aria-label={`Proximity alert at ${alert.siteLabel}`}
      >
        {'\u26A0'}
      </button>

      {/* Expanded: detail card */}
      {isExpanded && (
        <div className="absolute left-8 top-0 w-48 rounded-lg border border-amber-500/50 bg-[var(--color-surface-overlay)]/95 p-2 text-[11px] shadow-lg backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-amber-400">PROXIMITY ALERT</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="ml-2 text-[10px] text-text-secondary hover:text-text-primary"
              aria-label="Close alert details"
            >
              {'\u2715'}
            </button>
          </div>
          <div className="mb-1 truncate font-medium text-text-primary">
            {alert.siteLabel}
          </div>
          <div className="space-y-0.5 text-text-secondary">
            <div>
              <span className="text-text-tertiary">Flight:</span>{' '}
              <span className="text-text-primary">{alert.flightLabel}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Distance:</span>{' '}
              <span className="text-text-primary">{alert.distanceKm.toFixed(1)} km</span>
            </div>
            <div>
              <span className="text-text-tertiary">Heading:</span>{' '}
              <span className="text-text-primary">
                {alert.heading !== null ? `${Math.round(alert.heading)}\u00B0` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProximityAlertOverlay() {
  const alerts = useProximityAlerts();
  const { current: mapRef } = useMap();
  const [, setRenderTick] = useState(0);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const rafRef = useRef<number>(0);

  // Force re-render on map move to update projected positions
  const handleMapMove = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setRenderTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    map.on('move', handleMapMove);
    return () => {
      map.off('move', handleMapMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef, handleMapMove]);

  // Clear expanded state if the expanded site no longer has an alert
  useEffect(() => {
    if (expandedSiteId && !alerts.some((a) => a.siteId === expandedSiteId)) {
      setExpandedSiteId(null);
    }
  }, [alerts, expandedSiteId]);

  if (!mapRef || alerts.length === 0) return null;

  const map = mapRef.getMap();

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 'var(--z-controls)' }}
    >
      {alerts.map((alert) => {
        const projected = map.project([alert.siteLng, alert.siteLat]);
        return (
          <AlertIcon
            key={alert.siteId}
            alert={alert}
            isExpanded={expandedSiteId === alert.siteId}
            onToggle={() =>
              setExpandedSiteId((prev) =>
                prev === alert.siteId ? null : alert.siteId,
              )
            }
            screenX={projected.x}
            screenY={projected.y}
          />
        );
      })}
    </div>
  );
}
