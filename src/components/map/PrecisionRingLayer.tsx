import { useMemo } from 'react';
import { ScatterplotLayer } from '@deck.gl/layers';
import { useFilteredEntities } from '@/hooks/useFilteredEntities';
import { useFilterStore } from '@/stores/filterStore';
import type { ConflictEventEntity } from '@/types/entities';
import { isConflictEventType } from '@/types/ui';

/** Radius mapping per precision level in meters */
const PRECISION_RADIUS_METERS: Record<string, number> = {
  exact: 0, // No ring for exact — point icon only
  neighborhood: 1000, // 1km ring
  city: 5000, // 5km ring
  region: 25000, // 25km ring
};

/** Color for precision rings: translucent red */
const RING_FILL_COLOR: [number, number, number, number] = [239, 68, 68, 40];
const RING_LINE_COLOR: [number, number, number, number] = [239, 68, 68, 120];

/**
 * Renders translucent radius rings around conflict events
 * to indicate geolocation precision/uncertainty.
 *
 * - exact: no ring (point icon only)
 * - neighborhood: 1km ring
 * - city: 5km ring
 * - region: 25km ring
 */
export function usePrecisionRingLayer(): ScatterplotLayer<ConflictEventEntity>[] {
  const { events: filteredEvents } = useFilteredEntities();
  const showEvents = useFilterStore((s) => s.showEvents);

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
        getFillColor: RING_FILL_COLOR,
        getLineColor: RING_LINE_COLOR,
        radiusUnits: 'meters',
        stroked: true,
        filled: true,
        lineWidthMinPixels: 1,
        pickable: false,
        updateTriggers: {
          getRadius: [ringEvents],
        },
      }),
    ];
  }, [ringEvents]);
}
