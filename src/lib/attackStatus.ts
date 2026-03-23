import type { SiteEntity, ConflictEventEntity } from '@/types/entities';

const ATTACK_RADIUS_KM = 5;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AttackStatus {
  isAttacked: boolean;
  latestAttackDate: number | null;
  attackCount: number;
  attacks: ConflictEventEntity[];
}

/**
 * Computes proximity-based attack status for a site against conflict events.
 * Uses all events from the event store (including backfilled data).
 * Only dateEnd is used: a site stays orange as long as the end time is after
 * the attack occurred. dateStart is ignored — once hit, it stays hit.
 */
export function computeAttackStatus(
  site: SiteEntity,
  events: ConflictEventEntity[],
  dateEnd: number,
): AttackStatus {
  // Coarse bbox pre-filter (~0.05 degrees is roughly 5km+)
  const COARSE_DEG = 0.05;
  const attacks = events.filter(e => {
    if (e.timestamp > dateEnd) return false;
    // Coarse filter first
    if (Math.abs(e.lat - site.lat) > COARSE_DEG || Math.abs(e.lng - site.lng) > COARSE_DEG) return false;
    return haversineDistanceKm(site.lat, site.lng, e.lat, e.lng) <= ATTACK_RADIUS_KM;
  });
  return {
    isAttacked: attacks.length > 0,
    latestAttackDate: attacks.length > 0 ? Math.max(...attacks.map(a => a.timestamp)) : null,
    attackCount: attacks.length,
    attacks: attacks.sort((a, b) => b.timestamp - a.timestamp),
  };
}
