import type { MapEntity, SiteEntity, FlightEntity, ShipEntity, ConflictEventEntity } from '@/types/entities';

export interface SearchResult<T> {
  entity: T;
  matchField: string;
  matchValue: string;
}

/**
 * Extracts searchable lowercase string fields from any entity type.
 * Flight: label (callsign), icao24, originCountry
 * Ship: label, mmsi, shipName
 * Event: label, type, actor1, actor2, locationName
 * Site: label, siteType, operator
 */
export function getSearchableFields(entity: MapEntity | SiteEntity): string[] {
  const fields: string[] = [];

  if (entity.type === 'flight') {
    const e = entity as FlightEntity;
    if (e.label) fields.push(e.label.toLowerCase());
    if (e.data.icao24) fields.push(e.data.icao24.toLowerCase());
    if (e.data.originCountry) fields.push(e.data.originCountry.toLowerCase());
  } else if (entity.type === 'ship') {
    const e = entity as ShipEntity;
    if (e.label) fields.push(e.label.toLowerCase());
    if (e.data.mmsi != null) fields.push(String(e.data.mmsi).toLowerCase());
    if (e.data.shipName) fields.push(e.data.shipName.toLowerCase());
  } else if (entity.type === 'site') {
    const e = entity as SiteEntity;
    if (e.label) fields.push(e.label.toLowerCase());
    if (e.siteType) fields.push(e.siteType.toLowerCase());
    if (e.operator) fields.push(e.operator.toLowerCase());
  } else if (entity.type === 'water') {
    const e = entity as unknown as { label: string; facilityType: string; operator?: string };
    if (e.label) fields.push(e.label.toLowerCase());
    if (e.facilityType) fields.push(e.facilityType.toLowerCase());
    if (e.operator) fields.push(e.operator.toLowerCase());
  } else {
    // ConflictEventEntity (all other types are conflict event types)
    const e = entity as ConflictEventEntity;
    if (e.label) fields.push(e.label.toLowerCase());
    if (e.type) fields.push(e.type.toLowerCase());
    if (e.data.actor1) fields.push(e.data.actor1.toLowerCase());
    if (e.data.actor2) fields.push(e.data.actor2.toLowerCase());
    if (e.data.locationName) fields.push(e.data.locationName.toLowerCase());
  }

  return fields;
}

/** Field name mapping for display */
function getFieldNames(entity: MapEntity | SiteEntity): string[] {
  if (entity.type === 'flight') {
    return ['callsign', 'icao24', 'originCountry'];
  } else if (entity.type === 'ship') {
    return ['name', 'mmsi', 'shipName'];
  } else if (entity.type === 'site') {
    return ['name', 'siteType', 'operator'];
  } else if (entity.type === 'water') {
    return ['name', 'facilityType', 'operator'];
  } else {
    return ['label', 'type', 'actor1', 'actor2', 'location'];
  }
}

/**
 * Search entities by substring match (case-insensitive).
 * Returns empty array for empty/whitespace query.
 */
export function searchEntities<T extends MapEntity | SiteEntity>(
  query: string,
  entities: T[],
): SearchResult<T>[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lowerQuery = trimmed.toLowerCase();
  const results: SearchResult<T>[] = [];

  for (const entity of entities) {
    const fields = getSearchableFields(entity);
    const fieldNames = getFieldNames(entity);

    for (let i = 0; i < fields.length; i++) {
      if (fields[i].includes(lowerQuery)) {
        results.push({
          entity,
          matchField: fieldNames[i] ?? 'unknown',
          matchValue: fields[i],
        });
        break; // Only one match per entity
      }
    }
  }

  return results;
}
