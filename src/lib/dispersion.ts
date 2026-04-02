// Client-side dispersion: spreads stacking events into concentric rings.
// Applied dynamically after filtering so it adjusts when filters change.

import type { ConflictEventEntity } from '@/types/entities';

/** Ring definitions: [slotCount, radiusKm] */
const RINGS: ReadonlyArray<readonly [number, number]> = [
  [6, 3],
  [12, 6],
  [18, 9],
];
const TOTAL_SLOTS = RINGS.reduce((sum, [count]) => sum + count, 0); // 36
const KM_PER_DEG_LAT = 111.32;

/**
 * Compute dispersed lat/lng for a given slot index around a centroid.
 * Odd-numbered rings get half-step angle offset to prevent radial alignment.
 */
function dispersePosition(
  centroidLat: number,
  centroidLng: number,
  globalSlotIndex: number,
): { lat: number; lng: number } {
  let ringIndex: number;
  let localSlot: number;

  if (globalSlotIndex < TOTAL_SLOTS) {
    let cumulative = 0;
    ringIndex = 0;
    localSlot = 0;
    for (let i = 0; i < RINGS.length; i++) {
      const [count] = RINGS[i];
      if (globalSlotIndex < cumulative + count) {
        ringIndex = i;
        localSlot = globalSlotIndex - cumulative;
        break;
      }
      cumulative += count;
    }
  } else {
    ringIndex = 2;
    localSlot = (globalSlotIndex - TOTAL_SLOTS) % RINGS[2][0];
  }

  const [slotCount, radiusKm] = RINGS[ringIndex];
  const baseAngle = (2 * Math.PI * localSlot) / slotCount;
  const halfStep = ringIndex % 2 === 1 ? Math.PI / slotCount : 0;
  const angle = baseAngle + halfStep;

  const cosLat = Math.cos((centroidLat * Math.PI) / 180);
  const dLat = (radiusKm / KM_PER_DEG_LAT) * Math.cos(angle);
  const dLng = (radiusKm / (KM_PER_DEG_LAT * cosLat)) * Math.sin(angle);

  return { lat: centroidLat + dLat, lng: centroidLng + dLng };
}

/**
 * Spatial hash: rounds coordinates to ~1.1km grid cells.
 * Events landing in the same cell are stacking candidates.
 */
function spatialKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
}

/**
 * Disperse stacking events into concentric rings.
 * Groups events by spatial proximity (~1km grid), then spreads groups
 * of 2+ events into ring positions around the group centroid.
 * City-agnostic: catches stacking at any location, not just known centroids.
 */
export function disperseEvents(events: ConflictEventEntity[]): ConflictEventEntity[] {
  const groups = new Map<string, ConflictEventEntity[]>();

  for (const event of events) {
    const key = spatialKey(event.lat, event.lng);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }

  const result: ConflictEventEntity[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort by timestamp for deterministic slot assignment
    group.sort((a, b) => a.timestamp - b.timestamp);
    const centroidLat = group[0].lat;
    const centroidLng = group[0].lng;

    for (let i = 0; i < group.length; i++) {
      const pos = dispersePosition(centroidLat, centroidLng, i);
      result.push({
        ...group[i],
        lat: pos.lat,
        lng: pos.lng,
        data: {
          ...group[i].data,
          originalLat: centroidLat,
          originalLng: centroidLng,
        },
      });
    }
  }

  return result;
}
