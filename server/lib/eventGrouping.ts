import type { ConflictEventEntity } from '../types.js';

/** Haversine distance in km (inlined to avoid cross-boundary import from client src/) */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GROUP_RADIUS_KM = 50;
const MS_PER_DAY = 86_400_000;

export interface EventGroup {
  key: string;
  entities: ConflictEventEntity[];
  centroidLat: number;
  centroidLng: number;
  primaryCameo: string;
  timestamp: number;
  totalMentions: number;
  totalSources: number;
  sourceUrls: string[];
}

/** Extract CAMEO root code (first 2 chars) from a CAMEO event code */
function cameoRoot(cameoCode: string): string {
  return cameoCode.slice(0, 2);
}

/** Get the day bucket for a timestamp */
function dayBucket(timestamp: number): number {
  return Math.floor(timestamp / MS_PER_DAY);
}

/** Recompute centroid from entities */
function computeCentroid(entities: ConflictEventEntity[]): { lat: number; lng: number } {
  let latSum = 0;
  let lngSum = 0;
  for (const e of entities) {
    latSum += e.lat;
    lngSum += e.lng;
  }
  return { lat: latSum / entities.length, lng: lngSum / entities.length };
}

/**
 * Group raw GDELT conflict event entities by real-world event.
 *
 * Algorithm: For each entity (sorted by timestamp), find an existing group where:
 *   - Same day (Math.floor(timestamp / 86400000))
 *   - Same CAMEO root code (first 2 chars of cameoCode)
 *   - Group centroid within 50km (haversine)
 *
 * If match found, add to group and recompute centroid. Otherwise, create new group.
 */
export function groupGdeltRows(entities: ConflictEventEntity[]): EventGroup[] {
  // Sort by timestamp ascending
  const sorted = [...entities].sort((a, b) => a.timestamp - b.timestamp);
  const groups: EventGroup[] = [];

  for (const entity of sorted) {
    const entityDay = dayBucket(entity.timestamp);
    const entityRoot = cameoRoot(entity.data.cameoCode);

    // Find a matching group
    let matched = false;
    for (const group of groups) {
      const groupDay = dayBucket(group.timestamp);
      if (groupDay !== entityDay) continue;
      if (cameoRoot(group.primaryCameo) !== entityRoot) continue;
      if (haversineKm(group.centroidLat, group.centroidLng, entity.lat, entity.lng) > GROUP_RADIUS_KM) continue;

      // Match found — add to group
      group.entities.push(entity);
      const centroid = computeCentroid(group.entities);
      group.centroidLat = centroid.lat;
      group.centroidLng = centroid.lng;
      group.totalMentions += (entity.data.numMentions ?? 0);
      group.totalSources += (entity.data.numSources ?? 0);
      if (entity.data.source) {
        group.sourceUrls.push(entity.data.source);
      }
      if (entity.timestamp < group.timestamp) {
        group.timestamp = entity.timestamp;
      }
      matched = true;
      break;
    }

    if (!matched) {
      // Create new group
      groups.push({
        key: `grp-${entityDay}-${entityRoot}-${groups.length}`,
        entities: [entity],
        centroidLat: entity.lat,
        centroidLng: entity.lng,
        primaryCameo: entity.data.cameoCode,
        timestamp: entity.timestamp,
        totalMentions: entity.data.numMentions ?? 0,
        totalSources: entity.data.numSources ?? 0,
        sourceUrls: entity.data.source ? [entity.data.source] : [],
      });
    }
  }

  return groups;
}
