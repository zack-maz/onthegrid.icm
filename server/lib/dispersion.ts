// Concentric ring dispersion for city-centroid GDELT events
// Spreads stacked centroid events into visually distinguishable positions

import type { ConflictEventEntity } from '../types.js';
import { detectCentroid, CITY_CENTROIDS } from './geoValidation.js';

/**
 * Ring definitions: [slotCount, radiusKm]
 * Ring 0: 6 slots at 3km
 * Ring 1: 12 slots at 6km
 * Ring 2: 18 slots at 9km
 * Total capacity: 36 slots per centroid
 */
export const RINGS: ReadonlyArray<readonly [number, number]> = [
  [6, 3],
  [12, 6],
  [18, 9],
] as const;

const TOTAL_SLOTS = RINGS.reduce((sum, [count]) => sum + count, 0); // 36
const KM_PER_DEG_LAT = 111.32;

export interface DispersionResult {
  lat: number;
  lng: number;
  originalLat: number;
  originalLng: number;
  ringIndex: number;
  slotIndex: number;
}

/**
 * Compute dispersed lat/lng for a given global slot index around a centroid.
 *
 * - Slot 0..5 -> Ring 0 (6 slots at 3km)
 * - Slot 6..17 -> Ring 1 (12 slots at 6km)
 * - Slot 18..35 -> Ring 2 (18 slots at 9km)
 * - Slot >= 36 wraps to Ring 2
 *
 * Ring 0 slot 0 is due north. Odd-numbered rings have half-step angle offset
 * to prevent radial alignment between rings.
 *
 * Longitude is corrected for latitude via cos(lat).
 */
export function dispersePosition(
  centroidLat: number,
  centroidLng: number,
  globalSlotIndex: number,
): DispersionResult & { dispersedLat: number; dispersedLng: number } {
  let ringIndex: number;
  let localSlot: number;

  if (globalSlotIndex < TOTAL_SLOTS) {
    // Find which ring this slot belongs to
    let cumulative = 0;
    ringIndex = 0;
    for (let i = 0; i < RINGS.length; i++) {
      const [count] = RINGS[i];
      if (globalSlotIndex < cumulative + count) {
        ringIndex = i;
        localSlot = globalSlotIndex - cumulative;
        break;
      }
      cumulative += count;
    }
    localSlot = localSlot!;
  } else {
    // Overflow: wrap to Ring 2
    ringIndex = 2;
    const overflowIndex = globalSlotIndex - TOTAL_SLOTS;
    localSlot = overflowIndex % RINGS[2][0];
  }

  const [slotCount, radiusKm] = RINGS[ringIndex];

  // Base angle: evenly distribute around circle
  const baseAngle = (2 * Math.PI * localSlot) / slotCount;

  // Odd-numbered rings get half-step offset to prevent radial alignment
  const halfStep = ringIndex % 2 === 1 ? Math.PI / slotCount : 0;
  const angle = baseAngle + halfStep;

  // Convert polar to lat/lng offset with cosine correction
  const cosLat = Math.cos((centroidLat * Math.PI) / 180);
  const dLat = (radiusKm / KM_PER_DEG_LAT) * Math.cos(angle);
  const dLng = (radiusKm / (KM_PER_DEG_LAT * cosLat)) * Math.sin(angle);

  const dispersedLat = centroidLat + dLat;
  const dispersedLng = centroidLng + dLng;

  return {
    lat: dispersedLat,
    lng: dispersedLng,
    dispersedLat,
    dispersedLng,
    originalLat: centroidLat,
    originalLng: centroidLng,
    ringIndex,
    slotIndex: localSlot,
  };
}

/** Max distance (km) to match an event to a city centroid for dispersion */
const CENTROID_MATCH_RADIUS_KM = 15;

/**
 * Find the nearest city centroid within CENTROID_MATCH_RADIUS_KM.
 * Uses nearest-neighbor matching instead of a tight tolerance box,
 * because GDELT geocodes the same city to different GNS feature IDs
 * with coordinates that can vary by 0.1°+ from canonical centroids.
 */
function findCentroidKey(lat: number, lng: number): string | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  let bestName: string | null = null;
  let bestDistSqKm = Infinity;

  for (const city of CITY_CENTROIDS) {
    const dLatKm = (lat - city.lat) * KM_PER_DEG_LAT;
    const dLngKm = (lng - city.lng) * KM_PER_DEG_LAT * cosLat;
    const distSqKm = dLatKm * dLatKm + dLngKm * dLngKm;
    if (distSqKm < bestDistSqKm) {
      bestDistSqKm = distSqKm;
      bestName = city.name;
    }
  }

  if (bestDistSqKm <= CENTROID_MATCH_RADIUS_KM * CENTROID_MATCH_RADIUS_KM) {
    return bestName;
  }
  return null;
}

/**
 * Disperse city-centroid events into concentric rings around their centroids.
 *
 * Events matching a known city centroid are dispersed. When actionGeoType is
 * present, only types 3 (city) and 4 (landmark) are eligible. When absent
 * (common in real GDELT data), centroid matching alone is sufficient.
 *
 * Within each centroid group, events are sorted by timestamp for deterministic
 * slot assignment. Each group gets independent slot numbering.
 *
 * Dispersed events get updated lat/lng and originalLat/originalLng in their data.
 */
export function disperseEvents(events: ConflictEventEntity[]): ConflictEventEntity[] {
  // Group centroid events by city
  const groups = new Map<string, ConflictEventEntity[]>();
  const passThrough: ConflictEventEntity[] = [];

  for (const event of events) {
    // If actionGeoType is known and not city/landmark, skip dispersion
    const geoType = event.data.actionGeoType;
    if (geoType !== undefined && geoType !== 3 && geoType !== 4) {
      passThrough.push(event);
      continue;
    }

    const centroidKey = findCentroidKey(event.lat, event.lng);
    if (!centroidKey) {
      passThrough.push(event);
      continue;
    }

    if (!groups.has(centroidKey)) {
      groups.set(centroidKey, []);
    }
    groups.get(centroidKey)!.push(event);
  }

  // Disperse each group
  const dispersed: ConflictEventEntity[] = [];

  for (const [, group] of groups) {
    // Sort by timestamp for deterministic slot assignment
    group.sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < group.length; i++) {
      const event = group[i];
      const pos = dispersePosition(event.lat, event.lng, i);

      dispersed.push({
        ...event,
        lat: pos.lat,
        lng: pos.lng,
        data: {
          ...event.data,
          originalLat: pos.originalLat,
          originalLng: pos.originalLng,
        },
      });
    }
  }

  return [...passThrough, ...dispersed];
}
