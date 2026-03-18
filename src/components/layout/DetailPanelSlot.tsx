import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useSelectedEntity } from '@/hooks/useSelectedEntity';
import { FlightDetail } from '@/components/detail/FlightDetail';
import { ShipDetail } from '@/components/detail/ShipDetail';
import { EventDetail } from '@/components/detail/EventDetail';
import { ENTITY_DOT_COLORS } from '@/components/map/layers/constants';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

/** Maps entity type to the ENTITY_DOT_COLORS key */
function getDotColor(type: string): string {
  switch (type) {
    case 'flight': return ENTITY_DOT_COLORS.flights;
    case 'ship': return ENTITY_DOT_COLORS.ships;
    case 'drone': return ENTITY_DOT_COLORS.drones;
    case 'missile': return ENTITY_DOT_COLORS.missiles;
    default: return '#9ca3af';
  }
}

/** Maps entity type to display label */
function getTypeLabel(type: string): string {
  switch (type) {
    case 'flight': return 'FLIGHT';
    case 'ship': return 'SHIP';
    case 'drone': return 'DRONE';
    case 'missile': return 'MISSILE';
    default: return type.toUpperCase();
  }
}

/** Gets the display name for an entity */
function getEntityName(entity: { type: string; data: Record<string, unknown> }): string {
  switch (entity.type) {
    case 'flight': {
      const d = entity.data as FlightEntity['data'];
      return d.callsign || d.icao24;
    }
    case 'ship': {
      const d = entity.data as ShipEntity['data'];
      return d.shipName || String(d.mmsi);
    }
    case 'drone':
    case 'missile': {
      const d = entity.data as ConflictEventEntity['data'];
      return d.eventType;
    }
    default: return '';
  }
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
  const { entity, isLost } = useSelectedEntity();
  const [copied, setCopied] = useState(false);

  const relativeTime = useRelativeTime(entity?.timestamp ?? null);

  const dismiss = useCallback(() => {
    closeDetailPanel();
    selectEntity(null);
  }, [closeDetailPanel, selectEntity]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dismiss]);

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
        {entity ? (
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

            {/* Content area - dims on lost contact */}
            <div className={`p-4 ${isLost ? 'opacity-50 grayscale' : ''}`}>
              {/* Per-type content */}
              {entity.type === 'flight' && (
                <FlightDetail entity={entity as FlightEntity} />
              )}
              {entity.type === 'ship' && (
                <ShipDetail entity={entity as ShipEntity} />
              )}
              {(entity.type === 'drone' || entity.type === 'missile') && (
                <EventDetail entity={entity as ConflictEventEntity} />
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
