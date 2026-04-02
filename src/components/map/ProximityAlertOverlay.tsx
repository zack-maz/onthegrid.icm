import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { useProximityAlerts } from '@/hooks/useProximityAlerts';
import { useNotificationStore } from '@/stores/notificationStore';
import { useUIStore } from '@/stores/uiStore';
import { getCurrentPanelView } from '@/lib/panelLabel';
import type { ProximityAlert } from '@/hooks/useProximityAlerts';

function AlertIcon({
  alert,
  isExpanded,
  onExpand,
  onCollapse,
  onFlyTo,
  screenX,
  screenY,
}: {
  alert: ProximityAlert;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onFlyTo: () => void;
  screenX: number;
  screenY: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: screenX - 8,
        top: screenY - 8,
        zIndex: 'var(--z-controls)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onExpand}
      onMouseLeave={onCollapse}
    >
      {/* Pulsing warning icon — click to fly to */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFlyTo();
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black shadow-md animate-pulse hover:animate-none hover:bg-amber-400 transition-colors"
        title={`Proximity alert: ${alert.siteLabel}`}
        aria-label={`Proximity alert at ${alert.siteLabel}`}
      >
        {'\u26A0'}
      </button>

      {/* Detail card on hover */}
      {isExpanded && (
        <div className="absolute left-5 top-0 w-36 rounded-md border border-amber-500/50 bg-[var(--color-surface-overlay)]/95 px-1.5 py-1 text-[9px] shadow-lg backdrop-blur-sm">
          <div className="mb-0.5">
            <span className="font-semibold text-amber-400 text-[9px]">PROXIMITY ALERT</span>
          </div>
          <div className="mb-0.5 truncate font-medium text-text-primary">
            {alert.siteLabel}
          </div>
          <div className="space-y-px text-text-secondary">
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
  const expandedSiteId = useUIStore((s) => s.expandedAlertSiteId);
  const setExpandedSiteId = useUIStore((s) => s.setExpandedAlertSiteId);
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
    // Collapse expanded alert on any map click
    const handleMapClick = () => setExpandedSiteId(null);
    map.on('click', handleMapClick);
    return () => {
      map.off('move', handleMapMove);
      map.off('click', handleMapClick);
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
            onExpand={() => setExpandedSiteId(alert.siteId)}
            onCollapse={() => setExpandedSiteId(null)}
            onFlyTo={() => {
              const currentView = getCurrentPanelView();
              if (currentView) {
                useUIStore.getState().pushView(currentView);
              }
              useNotificationStore.getState().setFlyToTarget({
                lng: alert.siteLng,
                lat: alert.siteLat,
                zoom: 10,
              });
              useUIStore.getState().selectEntity(alert.flightId);
              useUIStore.getState().openDetailPanel();
            }}
            screenX={projected.x}
            screenY={projected.y}
          />
        );
      })}
    </div>
  );
}
