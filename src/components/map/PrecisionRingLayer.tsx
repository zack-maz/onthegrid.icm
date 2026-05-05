import { ScatterplotLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';
import type { ConflictEventEntity } from '@/types/entities';
import { isConflictEventType } from '@/types/ui';

/** Radius mapping per precision level in meters */
const PRECISION_RADIUS_METERS: Record<string, number> = {
  exact: 0, // No ring for exact — point icon only
  neighborhood: 5000, // 5km ring
  city: 25000, // 25km ring
  region: 100000, // 100km ring
};

/**
 * Renders translucent radius rings around conflict events
 * to indicate geolocation precision/uncertainty.
 *
 * Selection-aware opacity:
 * - Ambient (no selection): 5% fill, subtle stroke
 * - Selected event: 40% fill, bold stroke
 * - Non-selected (when one is selected): stays at 5%
 */
export function usePrecisionRingLayer(): ScatterplotLayer<ConflictEventEntity>[] {
  const { events: filteredEvents } = useFilteredEntities();
  const showEvents = useFilterStore((s) => s.showEvents);
  const selectedEntityId = useUIStore((s) => s.selectedEntityId);

  const ringEvents = useMemo(() => {
    if (!showEvents) return [];
    return filteredEvents.filter(
      (e): e is ConflictEventEntity =>
        isConflictEventType(e.type) &&
        'precision' in (e as ConflictEventEntity).data &&
        (e as ConflictEventEntity).data.precision !== undefined &&
        (e as ConflictEventEntity).data.precision !== 'exact',
    );
  }, [filteredEvents, showEvents]);

  return useMemo(() => {
    if (ringEvents.length === 0) return [];

    return [
      new ScatterplotLayer<ConflictEventEntity>({
        id: 'precision-rings',
        data: ringEvents,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: (d) => PRECISION_RADIUS_METERS[d.data.precision ?? ''] ?? 0,
        getFillColor: (d: ConflictEventEntity) => {
          const isSelected = d.id === selectedEntityId;
          return [239, 68, 68, isSelected ? 30 : 3]; // Subtle fill: 12% selected, 1% ambient
        },
        getLineColor: (d: ConflictEventEntity) => {
          const isSelected = d.id === selectedEntityId;
          return [239, 68, 68, isSelected ? 140 : 50]; // Ring stroke: 55% selected, 20% ambient
        },
        radiusUnits: 'meters',
        radiusMinPixels: 8,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 2,
        pickable: false,
        updateTriggers: {
          getRadius: [ringEvents],
          getLineColor: [selectedEntityId],
        },
      }),
    ];
  }, [ringEvents, selectedEntityId]);
}
