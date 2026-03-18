import type { MapEntity } from '../../server/types';
import type { FilterState } from '@/stores/filterStore';
import { isConflictEventType } from '@/types/ui';
import { haversineKm } from '@/lib/geo';

export const KNOTS_PER_MS = 1.94384;
export const FEET_PER_METER = 3.28084;

/**
 * Pure predicate: returns true if the entity passes ALL active filters.
 * Non-applicable filters include (not exclude) the entity.
 * Unknown/null values pass through range filters.
 */
export function entityPassesFilters(
  entity: MapEntity,
  filters: FilterState,
): boolean {
  // ── Country filter ──────────────────────────────────────────────────
  if (filters.selectedCountries.length > 0) {
    if (entity.type === 'flight') {
      const origin = entity.data.originCountry.toLowerCase();
      const match = filters.selectedCountries.some(
        (c) => c.toLowerCase() === origin,
      );
      if (!match) return false;
    } else if (isConflictEventType(entity.type)) {
      const a1 = entity.data.actor1.toLowerCase();
      const a2 = entity.data.actor2.toLowerCase();
      const match = filters.selectedCountries.some((c) => {
        const cl = c.toLowerCase();
        return a1.includes(cl) || a2.includes(cl);
      });
      if (!match) return false;
    }
    // Ships: always pass (no nationality in AIS)
  }

  // ── Speed filter ────────────────────────────────────────────────────
  if (filters.speedMin !== null || filters.speedMax !== null) {
    if (entity.type === 'flight') {
      if (entity.data.velocity !== null) {
        const knots = entity.data.velocity * KNOTS_PER_MS;
        if (filters.speedMin !== null && knots < filters.speedMin) return false;
        if (filters.speedMax !== null && knots > filters.speedMax) return false;
      }
      // null velocity = unknown → pass through
    } else if (entity.type === 'ship') {
      const knots = entity.data.speedOverGround;
      if (filters.speedMin !== null && knots < filters.speedMin) return false;
      if (filters.speedMax !== null && knots > filters.speedMax) return false;
    }
    // Conflict events: always pass (no speed data)
  }

  // ── Altitude filter ─────────────────────────────────────────────────
  if (filters.altitudeMin !== null || filters.altitudeMax !== null) {
    if (entity.type === 'flight') {
      if (entity.data.altitude !== null) {
        const feet = entity.data.altitude * FEET_PER_METER;
        if (filters.altitudeMin !== null && feet < filters.altitudeMin) return false;
        if (filters.altitudeMax !== null && feet > filters.altitudeMax) return false;
      }
      // null altitude = unknown → pass through
    }
    // Ships and events: always pass (no altitude)
  }

  // ── Proximity filter ────────────────────────────────────────────────
  if (filters.proximityPin !== null) {
    const dist = haversineKm(
      filters.proximityPin.lat,
      filters.proximityPin.lng,
      entity.lat,
      entity.lng,
    );
    if (dist > filters.proximityRadiusKm) return false;
  }

  // ── Date range filter ───────────────────────────────────────────────
  if (filters.dateStart !== null || filters.dateEnd !== null) {
    if (entity.type !== 'flight' && entity.type !== 'ship') {
      // Only applies to conflict events (historical); flights/ships are live
      if (filters.dateStart !== null && entity.timestamp < filters.dateStart) return false;
      if (filters.dateEnd !== null && entity.timestamp > filters.dateEnd) return false;
    }
  }

  return true;
}
