import type { MapEntity, SiteEntity, FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';
import type { PanelView, ThreatCluster } from '@/types/ui';
import { isConflictEventType, EVENT_TYPE_LABELS } from '@/types/ui';
import { useUIStore } from '@/stores/uiStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';

/** Maps entity type to display label */
export function getTypeLabel(type: string): string {
  if (type === 'flight') return 'FLIGHT';
  if (type === 'ship') return 'SHIP';
  if (type === 'site') return 'SITE';
  return (EVENT_TYPE_LABELS[type] ?? type).toUpperCase();
}

/** Gets the display name for an entity */
export function getEntityName(entity: { type: string; [key: string]: unknown }): string {
  switch (entity.type) {
    case 'flight': {
      const d = (entity as FlightEntity).data;
      return d.callsign || d.icao24;
    }
    case 'ship': {
      const d = (entity as ShipEntity).data;
      return d.shipName || String(d.mmsi);
    }
    case 'site': {
      return (entity as SiteEntity).label || 'Unknown Site';
    }
    default: {
      if (isConflictEventType(entity.type)) {
        const d = (entity as ConflictEventEntity).data;
        return d.eventType;
      }
      return '';
    }
  }
}

/** Cross-store entity lookup (non-reactive, for imperative use) */
export function findEntityById(id: string): MapEntity | SiteEntity | null {
  const flights = useFlightStore.getState().flights;
  const ships = useShipStore.getState().ships;
  const events = useEventStore.getState().events;
  const sites = useSiteStore.getState().sites;

  return (
    flights.find((f) => f.id === id) ??
    ships.find((s) => s.id === id) ??
    events.find((e) => e.id === id) ??
    sites.find((s) => s.id === id) ??
    null
  );
}

/** Derives a breadcrumb label from an entity or cluster */
export function deriveBreadcrumbLabel(
  entity: MapEntity | SiteEntity | null,
  cluster: ThreatCluster | null,
): string {
  if (cluster) return `Cluster(${cluster.eventCount})`;
  if (!entity) return '';
  const typeLabel = getTypeLabel(entity.type);
  const name = getEntityName(entity);
  return name ? `${typeLabel} ${name}` : typeLabel;
}

/** Snapshots the current detail panel view for pushing onto the navigation stack */
export function getCurrentPanelView(): PanelView | null {
  const { selectedEntityId, selectedCluster, isDetailPanelOpen } = useUIStore.getState();
  if (!isDetailPanelOpen || (!selectedEntityId && !selectedCluster)) return null;
  const entity = selectedEntityId ? findEntityById(selectedEntityId) : null;
  return {
    entityId: selectedEntityId,
    cluster: selectedCluster,
    breadcrumbLabel: deriveBreadcrumbLabel(entity, selectedCluster),
  };
}
