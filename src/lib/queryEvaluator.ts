// Query evaluator: walks AST and matches entities
// Pure functions -- all context injected via EvaluationContext

import type { QueryNode } from './queryParser';
import type {
  MapEntity,
  FlightEntity,
  ShipEntity,
  ConflictEventEntity,
  SiteEntity,
} from '@/types/entities';
import { getSearchableFields } from './searchUtils';
import { computeSeverityScore } from './severity';
import { computeAttackStatus } from './attackStatus';
import { findGeoName } from './geoNames';

// ─── Types ────────────────────────────────────────────────────

export interface EvaluationContext {
  sites: SiteEntity[];
  events: ConflictEventEntity[];
  now: number; // Unix ms, injectable for testability
}

interface RangeResult {
  op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range';
  num: number;
  num2?: number;
}

// ─── Range/Temporal Helpers ───────────────────────────────────

export function parseRangeValue(value: string): RangeResult | null {
  if (value.startsWith('>=')) {
    const n = Number(value.slice(2));
    return isNaN(n) ? null : { op: 'gte', num: n };
  }
  if (value.startsWith('<=')) {
    const n = Number(value.slice(2));
    return isNaN(n) ? null : { op: 'lte', num: n };
  }
  if (value.startsWith('>')) {
    const n = Number(value.slice(1));
    return isNaN(n) ? null : { op: 'gt', num: n };
  }
  if (value.startsWith('<')) {
    const n = Number(value.slice(1));
    return isNaN(n) ? null : { op: 'lt', num: n };
  }
  // Range: "30000-40000" (but not negative numbers like "-10")
  const dashIdx = value.indexOf('-', 1); // skip first char to allow negative
  if (dashIdx > 0) {
    const lo = Number(value.slice(0, dashIdx));
    const hi = Number(value.slice(dashIdx + 1));
    if (!isNaN(lo) && !isNaN(hi)) {
      return { op: 'range', num: lo, num2: hi };
    }
  }
  // Exact
  const n = Number(value);
  return isNaN(n) ? null : { op: 'eq', num: n };
}

function matchRange(actual: number | null | undefined, value: string): boolean {
  if (actual == null) return false;
  const parsed = parseRangeValue(value);
  if (!parsed) return false;
  switch (parsed.op) {
    case 'eq': return actual === parsed.num;
    case 'gt': return actual > parsed.num;
    case 'lt': return actual < parsed.num;
    case 'gte': return actual >= parsed.num;
    case 'lte': return actual <= parsed.num;
    case 'range': return actual >= parsed.num && actual <= (parsed.num2 ?? parsed.num);
  }
}

export function parseTemporalValue(value: string, now: number): number {
  // Relative: "6h", "30m", "2d", "1w"
  const relMatch = value.match(/^(\d+)([mhdw])$/);
  if (relMatch) {
    const amount = Number(relMatch[1]);
    const unit = relMatch[2];
    const multipliers: Record<string, number> = {
      'm': 60_000,
      'h': 3_600_000,
      'd': 86_400_000,
      'w': 604_800_000,
    };
    return now - amount * (multipliers[unit] ?? 0);
  }

  // Absolute: "2026-03-20"
  const ts = Date.parse(value);
  return isNaN(ts) ? now : ts;
}

// ─── Haversine Distance ──────────────────────────────────────

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Case-insensitive helpers ─────────────────────────────────

function ciEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function ciIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ─── Main Evaluator ──────────────────────────────────────────

export function evaluateQuery(
  node: QueryNode | null,
  entity: MapEntity | SiteEntity,
  context: EvaluationContext,
): boolean {
  if (!node) return true; // null AST matches everything

  switch (node.type) {
    case 'or':
      return evaluateQuery(node.left, entity, context) || evaluateQuery(node.right, entity, context);
    case 'tag':
      return evaluateTag(entity, node.prefix, node.value, context);
    case 'text': {
      const fields = getSearchableFields(entity);
      const lower = node.value.toLowerCase();
      return fields.some(f => f.includes(lower));
    }
  }
}

// ─── Tag Evaluator ────────────────────────────────────────────

export function evaluateTag(
  entity: MapEntity | SiteEntity,
  prefix: string,
  value: string,
  context: EvaluationContext,
): boolean {
  switch (prefix.toLowerCase()) {
    case 'type': {
      // Match entity.type directly
      if (ciEq(entity.type, value)) return true;
      // For sites, also match siteType
      if (entity.type === 'site') {
        return ciEq((entity as SiteEntity).siteType, value);
      }
      // For water facilities, also match facilityType
      if (entity.type === 'water') {
        const wf = entity as unknown as { facilityType: string };
        // Allow 'plant' as shorthand for 'treatment_plant'
        if (ciEq(value, 'plant') || ciEq(value, 'treatment_plant')) {
          return ciEq(wf.facilityType, 'treatment_plant');
        }
        return ciEq(wf.facilityType, value);
      }
      return false;
    }

    case 'country': {
      if (entity.type === 'flight') {
        return ciIncludes((entity as FlightEntity).data.originCountry, value);
      }
      if (entity.type !== 'ship' && entity.type !== 'site') {
        // ConflictEventEntity
        const e = entity as ConflictEventEntity;
        return ciIncludes(e.data.actor1, value) || ciIncludes(e.data.actor2, value);
      }
      return false;
    }

    case 'callsign': {
      if (entity.type !== 'flight') return false;
      return ciIncludes((entity as FlightEntity).label, value);
    }

    case 'icao': {
      if (entity.type !== 'flight') return false;
      return ciEq((entity as FlightEntity).data.icao24, value);
    }

    case 'mmsi': {
      if (entity.type !== 'ship') return false;
      return String((entity as ShipEntity).data.mmsi) === value;
    }

    case 'shipname': {
      if (entity.type !== 'ship') return false;
      return ciIncludes((entity as ShipEntity).data.shipName, value);
    }

    case 'actor': {
      if (entity.type === 'ship' || entity.type === 'flight' || entity.type === 'site') return false;
      const e = entity as ConflictEventEntity;
      return ciIncludes(e.data.actor1, value) || ciIncludes(e.data.actor2, value);
    }

    case 'location': {
      if (entity.type === 'site') {
        return ciIncludes((entity as SiteEntity).label, value);
      }
      if (entity.type === 'water') {
        return ciIncludes(entity.label, value);
      }
      if (entity.type !== 'ship' && entity.type !== 'flight') {
        return ciIncludes((entity as ConflictEventEntity).data.locationName, value);
      }
      return false;
    }

    case 'name': {
      return ciIncludes(entity.label, value);
    }

    case 'cameo': {
      if (entity.type === 'ship' || entity.type === 'flight' || entity.type === 'site') return false;
      return (entity as ConflictEventEntity).data.cameoCode === value;
    }

    case 'altitude': {
      if (entity.type !== 'flight') return false;
      return matchRange((entity as FlightEntity).data.altitude, value);
    }

    case 'speed': {
      if (entity.type === 'flight') {
        return matchRange((entity as FlightEntity).data.velocity, value);
      }
      if (entity.type === 'ship') {
        return matchRange((entity as ShipEntity).data.speedOverGround, value);
      }
      return false;
    }

    case 'heading': {
      if (entity.type === 'ship') {
        return matchRange((entity as ShipEntity).data.trueHeading, value);
      }
      if (entity.type === 'flight') {
        return matchRange((entity as FlightEntity).data.heading, value);
      }
      return false;
    }

    case 'mentions': {
      if (entity.type === 'ship' || entity.type === 'flight' || entity.type === 'site') return false;
      return matchRange((entity as ConflictEventEntity).data.numMentions, value);
    }

    case 'ground': {
      if (entity.type !== 'flight') return false;
      const isGround = (entity as FlightEntity).data.onGround;
      return value.toLowerCase() === 'true' ? isGround : !isGround;
    }

    case 'unidentified': {
      if (entity.type !== 'flight') return false;
      const isUnid = (entity as FlightEntity).data.unidentified;
      return value.toLowerCase() === 'true' ? isUnid : !isUnid;
    }

    case 'severity': {
      // Only applies to conflict events
      if (entity.type === 'ship' || entity.type === 'flight' || entity.type === 'site') return false;
      const score = computeSeverityScore(entity as ConflictEventEntity);
      const v = value.toLowerCase();
      if (v === 'high') return score > 50;
      if (v === 'medium') return score > 15 && score <= 50;
      if (v === 'low') return score <= 15;
      // Numeric comparison
      return matchRange(score, value);
    }

    case 'near': {
      const NEAR_RADIUS_KM = 100;
      // Try site name first
      const matchingSite = context.sites.find(s => ciIncludes(s.label, value));
      if (matchingSite) {
        const dist = haversineDistanceKm(entity.lat, entity.lng, matchingSite.lat, matchingSite.lng);
        return dist <= NEAR_RADIUS_KM;
      }
      // Try city/location lookup
      const geoMatch = findGeoName(value);
      if (geoMatch) {
        const dist = haversineDistanceKm(entity.lat, entity.lng, geoMatch.lat, geoMatch.lng);
        return dist <= NEAR_RADIUS_KM;
      }
      // Try parsing as lat,lng coordinates
      const parts = value.split(',');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          const dist = haversineDistanceKm(entity.lat, entity.lng, lat, lng);
          return dist <= NEAR_RADIUS_KM;
        }
      }
      return false;
    }

    case 'stress': {
      if (entity.type !== 'water') return false;
      const wf = entity as unknown as { stress: { compositeHealth: number } };
      const health = wf.stress.compositeHealth;
      const v = value.toLowerCase();
      if (v === 'extreme') return health < 0.1;
      if (v === 'high') return health < 0.3;
      if (v === 'medium') return health >= 0.3 && health <= 0.7;
      if (v === 'low') return health > 0.7;
      return false;
    }

    case 'site': {
      if (entity.type !== 'site') return false;
      return ciEq((entity as SiteEntity).siteType, value);
    }

    case 'status': {
      if (entity.type !== 'site') return false;
      const attackStatus = computeAttackStatus(entity as SiteEntity, context.events, null);
      const v = value.toLowerCase();
      if (v === 'attacked') return attackStatus.isAttacked;
      if (v === 'healthy') return !attackStatus.isAttacked;
      return false;
    }

    case 'since': {
      const threshold = parseTemporalValue(value, context.now);
      return entity.timestamp >= threshold;
    }

    case 'before': {
      const threshold = parseTemporalValue(value, context.now);
      return entity.timestamp <= threshold;
    }

    case 'date': {
      // Match entity timestamp to date string (YYYY-MM-DD)
      const d = new Date(entity.timestamp);
      const dateStr = d.toISOString().slice(0, 10);
      return dateStr === value;
    }

    case 'has': {
      return checkHasAttribute(entity, value);
    }

    default:
      return false;
  }
}

// ─── has: attribute presence check ───────────────────────────

function checkHasAttribute(entity: MapEntity | SiteEntity, attr: string): boolean {
  const a = attr.toLowerCase();

  if (entity.type === 'flight') {
    const f = entity as FlightEntity;
    switch (a) {
      case 'callsign': return !!f.data.callsign;
      case 'altitude': return f.data.altitude != null;
      case 'velocity':
      case 'speed': return f.data.velocity != null;
      case 'heading': return f.data.heading != null;
      case 'verticalrate': return f.data.verticalRate != null;
      default: return false;
    }
  }

  if (entity.type === 'ship') {
    const s = entity as ShipEntity;
    switch (a) {
      case 'shipname':
      case 'name': return !!s.data.shipName;
      case 'heading': return s.data.trueHeading != null;
      default: return false;
    }
  }

  if (entity.type === 'site') {
    const s = entity as SiteEntity;
    switch (a) {
      case 'operator': return !!s.operator;
      case 'wikidata': return !!s.wikidata;
      default: return false;
    }
  }

  // ConflictEventEntity
  const e = entity as ConflictEventEntity;
  switch (a) {
    case 'fatalities': return e.data.fatalities > 0;
    case 'actor1': return !!e.data.actor1;
    case 'actor2': return !!e.data.actor2;
    case 'source': return !!e.data.source;
    case 'mentions': return (e.data.numMentions ?? 0) > 0;
    default: return false;
  }
}
