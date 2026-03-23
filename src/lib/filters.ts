import type { MapEntity } from '../../server/types';
import type { FilterState } from '@/stores/filterStore';
import { isConflictEventType } from '@/types/ui';
import { haversineKm } from '@/lib/geo';

export const KNOTS_PER_MS = 1.94384;
export const FEET_PER_METER = 3.28084;

/**
 * Pure predicate: returns true if the entity passes ALL active filters.
 * Filters are entity-scoped: flight filters only affect flights, etc.
 * Non-applicable filters include (not exclude) the entity.
 * Unknown/null values pass through range filters.
 */
export function entityPassesFilters(
  entity: MapEntity,
  filters: FilterState,
): boolean {
  // ── Flight country filter ──────────────────────────────────────────
  if (filters.flightCountries.length > 0) {
    if (entity.type === 'flight') {
      const origin = entity.data.originCountry.toLowerCase();
      const match = filters.flightCountries.some(
        (c) => c.toLowerCase() === origin,
      );
      if (!match) return false;
    }
    // Ships and events: always pass flight country filter
  }

  // ── Event country filter ───────────────────────────────────────────
  if (filters.eventCountries.length > 0) {
    if (isConflictEventType(entity.type)) {
      const a1 = entity.data.actor1.toLowerCase();
      const a2 = entity.data.actor2.toLowerCase();
      const match = filters.eventCountries.some((c) => {
        const cl = c.toLowerCase();
        return a1.includes(cl) || a2.includes(cl);
      });
      if (!match) return false;
    }
    // Flights and ships: always pass event country filter
  }

  // ── Flight speed filter ────────────────────────────────────────────
  if (filters.flightSpeedMin !== null || filters.flightSpeedMax !== null) {
    if (entity.type === 'flight') {
      // Grounded flights: treat null velocity as 0; airborne: null = unknown → pass
      const velocity = entity.data.velocity ?? (entity.data.onGround ? 0 : null);
      if (velocity !== null) {
        const knots = velocity * KNOTS_PER_MS;
        if (filters.flightSpeedMin !== null && knots < filters.flightSpeedMin) return false;
        if (filters.flightSpeedMax !== null && knots > filters.flightSpeedMax) return false;
      }
    }
    // Ships and events: always pass flight speed filter
  }

  // ── Altitude filter ─────────────────────────────────────────────────
  if (filters.altitudeMin !== null || filters.altitudeMax !== null) {
    if (entity.type === 'flight') {
      // Grounded flights: treat null altitude as 0; airborne: null = unknown → pass
      const altitude = entity.data.altitude ?? (entity.data.onGround ? 0 : null);
      if (altitude !== null) {
        const feet = altitude * FEET_PER_METER;
        if (filters.altitudeMin !== null && feet < filters.altitudeMin) return false;
        if (filters.altitudeMax !== null && feet > filters.altitudeMax) return false;
      }
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

  // ── Flight callsign filter ──
  if (filters.flightCallsign) {
    if (entity.type === 'flight') {
      if (!entity.label.toLowerCase().includes(filters.flightCallsign.toLowerCase())) return false;
    }
  }

  // ── Flight ICAO filter ──
  if (filters.flightIcao) {
    if (entity.type === 'flight') {
      if (!entity.data.icao24.toLowerCase().includes(filters.flightIcao.toLowerCase())) return false;
    }
  }

  // ── Ship MMSI filter ──
  if (filters.shipMmsi) {
    if (entity.type === 'ship') {
      if (!String(entity.data.mmsi).includes(filters.shipMmsi)) return false;
    }
  }

  // ── Ship name filter ──
  if (filters.shipNameFilter) {
    if (entity.type === 'ship') {
      if (!entity.data.shipName.toLowerCase().includes(filters.shipNameFilter.toLowerCase())) return false;
    }
  }

  // ── CAMEO code filter ──
  if (filters.cameoCode) {
    if (isConflictEventType(entity.type)) {
      if (entity.data.cameoCode !== filters.cameoCode) return false;
    }
  }

  // ── Mentions range filter ──
  if (filters.mentionsMin !== null || filters.mentionsMax !== null) {
    if (isConflictEventType(entity.type)) {
      const mentions = entity.data.numMentions ?? 0;
      if (filters.mentionsMin !== null && mentions < filters.mentionsMin) return false;
      if (filters.mentionsMax !== null && mentions > filters.mentionsMax) return false;
    }
  }

  // ── Heading filter (flight only, ±15° tolerance) ──
  if (filters.headingAngle !== null) {
    if (entity.type === 'flight') {
      const heading = entity.data.heading;
      if (heading !== null && heading !== undefined) {
        const diff = Math.abs(((heading - filters.headingAngle + 180) % 360) - 180);
        if (diff > 15) return false;
      }
    }
  }

  return true;
}
