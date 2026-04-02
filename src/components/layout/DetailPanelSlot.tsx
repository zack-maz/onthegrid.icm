import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSelectedEntity } from '@/hooks/useSelectedEntity';
import { FlightDetail } from '@/components/detail/FlightDetail';
import { ShipDetail } from '@/components/detail/ShipDetail';
import { EventDetail } from '@/components/detail/EventDetail';
import { SiteDetail } from '@/components/detail/SiteDetail';
import { ThreatClusterDetail } from '@/components/detail/ThreatClusterDetail';
import { BreadcrumbRow } from '@/components/detail/BreadcrumbRow';
import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';
import { isConflictEventType, CONFLICT_TOGGLE_GROUPS } from '@/types/ui';
import { getTypeLabel, getEntityName, findEntityById } from '@/lib/panelLabel';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';

/** Maps entity type to the ENTITY_DOT_COLORS key */
function getDotColor(type: string): string {
  if (type === 'flight') return ENTITY_DOT_COLORS.flights;
  if (type === 'ship') return ENTITY_DOT_COLORS.ships;
  if (type === 'site') return ENTITY_DOT_COLORS.siteHealthy;
  if (isConflictEventType(type)) {
    if ((CONFLICT_TOGGLE_GROUPS.showAirstrikes as readonly string[]).includes(type)) return ENTITY_DOT_COLORS.airstrikes;
    if ((CONFLICT_TOGGLE_GROUPS.showGroundCombat as readonly string[]).includes(type)) return ENTITY_DOT_COLORS.groundCombat;
    if ((CONFLICT_TOGGLE_GROUPS.showTargeted as readonly string[]).includes(type)) return ENTITY_DOT_COLORS.targeted;
    return ENTITY_DOT_COLORS.groundCombat;
  }
  return '#9ca3af';
}

/** Hook: returns a ticking relative time string */
function useRelativeTime(timestamp: number | null): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (timestamp === null) return;

    // Calculate initial elapsed
    setElapsed(Math.floor((Date.now() - timestamp) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timestamp) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  if (timestamp === null) return '--';
  if (elapsed <= 0) return 'Updated just now';
  return `Updated ${elapsed}s ago`;
}

export function DetailPanelSlot() {
  const isOpen = useUIStore((s) => s.isDetailPanelOpen);
  const closeDetailPanel = useUIStore((s) => s.closeDetailPanel);
  const selectEntity = useUIStore((s) => s.selectEntity);
  const selectedCluster = useUIStore((s) => s.selectedCluster);
  const setSelectedCluster = useUIStore((s) => s.setSelectedCluster);
  const navigationStack = useUIStore((s) => s.navigationStack);
  const slideDirection = useUIStore((s) => s.slideDirection);
  const goBack = useUIStore((s) => s.goBack);
  const clearStack = useUIStore((s) => s.clearStack);
  const setFlyToTarget = useNotificationStore((s) => s.setFlyToTarget);
  const { entity, isLost } = useSelectedEntity();
  const [copied, setCopied] = useState(false);

  const relativeTime = useRelativeTime(entity?.timestamp ?? null);

  const dismiss = useCallback(() => {
    closeDetailPanel();
    selectEntity(null);
    setSelectedCluster(null);
    clearStack();
  }, [closeDetailPanel, selectEntity, setSelectedCluster, clearStack]);

  const handleGoBack = useCallback(() => {
    // Read the entry we're about to restore BEFORE calling goBack
    const stack = useUIStore.getState().navigationStack;
    const prev = stack[stack.length - 1];
    goBack();
    // Fly to the restored view's coordinates
    if (prev) {
      if (prev.cluster) {
        setFlyToTarget({ lng: prev.cluster.centroidLng, lat: prev.cluster.centroidLat, zoom: 8 });
      } else if (prev.entityId) {
        const restoredEntity = findEntityById(prev.entityId);
        if (restoredEntity) {
          setFlyToTarget({ lng: restoredEntity.lng, lat: restoredEntity.lat, zoom: 10 });
        }
      }
    }
  }, [goBack, setFlyToTarget]);

  // Escape key handling moved to centralized useEscapeKeyHandler (priority stack)

  const handleCopy = useCallback(() => {
    if (!entity) return;
    navigator.clipboard.writeText(
      `${entity.lat.toFixed(6)}, ${entity.lng.toFixed(6)}`
    ).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [entity]);

  return (
    <div
      data-testid="detail-panel-slot"
      className={`absolute top-0 right-0 z-[var(--z-panel)] h-full
                  w-[var(--width-detail-panel)] transform transition-transform
                  duration-300 ease-in-out
                  ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="h-full border-l border-border bg-surface/95 backdrop-blur-sm overflow-y-auto">
        {selectedCluster ? (
          <>
            {/* Cluster Header */}
            <div
              data-testid="detail-panel-header"
              className="flex items-center justify-between px-4 py-3 border-b border-border"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: '#f97316' }}
                />
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  THREAT CLUSTER
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {selectedCluster.eventCount} events
                </span>
              </div>
              <button
                onClick={dismiss}
                aria-label="Close"
                className="text-text-muted transition-colors hover:text-text-primary text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Breadcrumb row */}
            {navigationStack.length > 0 && (
              <BreadcrumbRow stack={navigationStack} onBack={handleGoBack} />
            )}

            {/* Cluster content with directional slide */}
            <div
              key={selectedCluster.id}
              data-testid="detail-content"
              className={`p-4 ${
                slideDirection === 'forward'
                  ? 'animate-slide-in-right'
                  : slideDirection === 'back'
                  ? 'animate-slide-in-left'
                  : ''
              }`}
            >
              <ThreatClusterDetail cluster={selectedCluster} />
            </div>
          </>
        ) : entity ? (
          <>
            {/* Lost contact banner */}
            {isLost && (
              <div className="bg-red-900/50 px-3 py-2 text-center">
                <span className="text-red-400 text-xs font-bold uppercase tracking-wider">
                  LOST CONTACT
                </span>
              </div>
            )}

            {/* Header */}
            <div
              data-testid="detail-panel-header"
              className="flex items-center justify-between px-4 py-3 border-b border-border"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: getDotColor(entity.type) }}
                />
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  {getTypeLabel(entity.type)}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {getEntityName(entity)}
                </span>
              </div>
              <button
                onClick={dismiss}
                aria-label="Close"
                className="text-text-muted transition-colors hover:text-text-primary text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Breadcrumb row */}
            {navigationStack.length > 0 && (
              <BreadcrumbRow stack={navigationStack} onBack={handleGoBack} />
            )}

            {/* Content area with directional slide - dims on lost contact */}
            <div
              key={entity.id}
              data-testid="detail-content"
              className={`p-4 ${isLost ? 'opacity-50 grayscale' : ''} ${
                slideDirection === 'forward'
                  ? 'animate-slide-in-right'
                  : slideDirection === 'back'
                  ? 'animate-slide-in-left'
                  : ''
              }`}
            >
              {/* Per-type content */}
              {entity.type === 'flight' && (
                <FlightDetail entity={entity as FlightEntity} />
              )}
              {entity.type === 'ship' && (
                <ShipDetail entity={entity as ShipEntity} />
              )}
              {isConflictEventType(entity.type) && (
                <EventDetail entity={entity as ConflictEventEntity} />
              )}
              {entity.type === 'site' && (
                <SiteDetail entity={entity as SiteEntity} />
              )}

              {/* Coordinates with copy button */}
              <div className="mt-3 flex items-center justify-between px-3 py-1">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Coordinates
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-text-primary text-xs">
                    {entity.lat.toFixed(6)}, {entity.lng.toFixed(6)}
                  </span>
                  <button
                    data-testid="copy-coords-btn"
                    onClick={handleCopy}
                    className="text-text-muted hover:text-text-primary text-xs transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Relative timestamp */}
              <div className="mt-3 px-3 py-1">
                <span className="text-[10px] text-text-muted">
                  {relativeTime}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-secondary">Select an entity on the map</p>
          </div>
        )}
      </div>
    </div>
  );
}
