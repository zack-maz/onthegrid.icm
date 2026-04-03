import type {
  FlightEntity,
  ShipEntity,
  ConflictEventEntity,
  SiteEntity,
  WaterFacility,
} from '../../server/types';
import { GEO_NAMES } from './geoNames';

// --- Types ---

export interface TagValue {
  value: string;
  count: number;
  label?: string;
}

export interface EntityDataSources {
  flights: FlightEntity[];
  ships: ShipEntity[];
  events: ConflictEventEntity[];
  sites: SiteEntity[];
  water?: WaterFacility[];
}

type TagEntityCategory = 'flight' | 'ship' | 'event' | 'site' | 'water';

export interface TagDefinition {
  prefix: string;
  label: string;
  description: string;
  color: string; // Tailwind text color class for syntax highlighting
  entityTypes: TagEntityCategory[];
  examples: string[];
  getValues?: (data: EntityDataSources) => TagValue[];
}

// --- Value Extractor Helpers ---

/** Count occurrences of each value in an array */
function countValues(values: string[]): TagValue[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue; // skip empty strings
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Return static enum values with count 0 */
function staticValues(values: string[]): TagValue[] {
  return values.map(value => ({ value, count: 0 }));
}

// --- Value Extractors ---

function getTypeValues(data: EntityDataSources): TagValue[] {
  const typeList: string[] = [];

  for (const f of data.flights) typeList.push(f.type);
  for (const s of data.ships) typeList.push(s.type);
  for (const e of data.events) typeList.push(e.type);
  for (const s of data.sites) typeList.push(s.type);

  return countValues(typeList);
}

function getCountryValues(data: EntityDataSources): TagValue[] {
  const countries: string[] = [];

  for (const f of data.flights) {
    if (f.data.originCountry) countries.push(f.data.originCountry);
  }

  return countValues(countries);
}

function getActorValues(data: EntityDataSources): TagValue[] {
  const actors: string[] = [];

  for (const e of data.events) {
    if (e.data.actor1) actors.push(e.data.actor1);
    if (e.data.actor2) actors.push(e.data.actor2);
  }

  return countValues(actors);
}

function getLocationValues(data: EntityDataSources): TagValue[] {
  const locations: string[] = [];

  for (const e of data.events) {
    if (e.data.locationName) locations.push(e.data.locationName);
  }
  for (const s of data.sites) {
    if (s.label) locations.push(s.label);
  }

  return countValues(locations);
}

function getNearValues(data: EntityDataSources): TagValue[] {
  const names: TagValue[] = [];
  // Sites first (with count 1 to rank above cities)
  for (const s of data.sites) {
    if (s.label) names.push({ value: s.label, count: 1 });
  }
  // Water facilities (with count 1 to rank above cities)
  if (data.water) {
    for (const w of data.water) {
      if (w.label) names.push({ value: w.label, count: 1 });
    }
  }
  // Then cities (count 0)
  for (const g of GEO_NAMES) {
    names.push({ value: g.name, count: 0 });
  }
  return names;
}

function getSiteValues(data: EntityDataSources): TagValue[] {
  const types: string[] = [];

  for (const s of data.sites) {
    types.push(s.siteType);
  }

  return countValues(types);
}

// --- Registry ---

export const TAG_REGISTRY: Record<string, TagDefinition> = {
  // Cross-entity tags
  type: {
    prefix: 'type',
    label: 'Entity Type',
    description: 'Filter by entity type (flight, ship, event types, site, water facility types)',
    color: 'text-blue-400',
    entityTypes: ['flight', 'ship', 'event', 'site', 'water'],
    examples: ['type:flight', 'type:airstrike', 'type:dam', 'type:reservoir'],
    getValues: getTypeValues,
  },
  country: {
    prefix: 'country',
    label: 'Country',
    description: 'Filter by country of origin (flights) or actor country (events)',
    color: 'text-emerald-400',
    entityTypes: ['flight', 'event'],
    examples: ['country:iran', 'country:iraq', 'country:israel'],
    getValues: getCountryValues,
  },
  actor: {
    prefix: 'actor',
    label: 'Actor',
    description: 'Filter by GDELT actor name (actor1 or actor2)',
    color: 'text-emerald-400',
    entityTypes: ['event'],
    examples: ['actor:IRAN', 'actor:UNITED STATES'],
    getValues: getActorValues,
  },
  location: {
    prefix: 'location',
    label: 'Location',
    description: 'Filter by location name from events or site labels',
    color: 'text-emerald-400',
    entityTypes: ['event', 'site'],
    examples: ['location:Baghdad', 'location:Tehran'],
    getValues: getLocationValues,
  },
  severity: {
    prefix: 'severity',
    label: 'Severity',
    description: 'Filter events by severity score (high, medium, low)',
    color: 'text-red-400',
    entityTypes: ['event'],
    examples: ['severity:high', 'severity:medium', 'severity:low'],
    getValues: () => staticValues(['high', 'medium', 'low']),
  },
  near: {
    prefix: 'near',
    label: 'Near Location',
    description: 'Drop proximity pin near a site, city, or coordinates (100km radius)',
    color: 'text-amber-400',
    entityTypes: ['flight', 'ship', 'event', 'site'],
    examples: ['near:Tehran', 'near:Natanz', 'near:Baghdad'],
    getValues: getNearValues,
  },
  since: {
    prefix: 'since',
    label: 'Since',
    description: 'Filter entities from a time offset or date (e.g., 6h, 2d, 2026-03-20)',
    color: 'text-purple-400',
    entityTypes: ['flight', 'ship', 'event', 'site'],
    examples: ['since:6h', 'since:2d', 'since:2026-03-20'],
  },
  before: {
    prefix: 'before',
    label: 'Before',
    description: 'Filter entities before a time offset or date',
    color: 'text-purple-400',
    entityTypes: ['flight', 'ship', 'event', 'site'],
    examples: ['before:24h', 'before:2026-03-20'],
  },
  has: {
    prefix: 'has',
    label: 'Has Attribute',
    description: 'Filter by presence of an attribute (e.g., callsign, actor2)',
    color: 'text-cyan-400',
    entityTypes: ['flight', 'ship', 'event', 'site'],
    examples: ['has:callsign', 'has:actor2', 'has:operator'],
  },

  // Flight-specific tags
  callsign: {
    prefix: 'callsign',
    label: 'Callsign',
    description: 'Filter flights by callsign',
    color: 'text-yellow-400',
    entityTypes: ['flight'],
    examples: ['callsign:IRA123', 'callsign:QTR'],
  },
  icao: {
    prefix: 'icao',
    label: 'ICAO Hex',
    description: 'Filter flights by ICAO24 hex code',
    color: 'text-yellow-400',
    entityTypes: ['flight'],
    examples: ['icao:abc123', 'icao:4b1'],
  },
  altitude: {
    prefix: 'altitude',
    label: 'Altitude',
    description: 'Filter flights by barometric altitude (meters, supports >/< operators)',
    color: 'text-yellow-400',
    entityTypes: ['flight'],
    examples: ['altitude:>10000', 'altitude:<1000'],
  },
  speed: {
    prefix: 'speed',
    label: 'Speed',
    description: 'Filter by ground speed (m/s for flights, knots for ships, supports >/< operators)',
    color: 'text-yellow-400',
    entityTypes: ['flight', 'ship'],
    examples: ['speed:>200', 'speed:<50'],
  },
  ground: {
    prefix: 'ground',
    label: 'On Ground',
    description: 'Filter flights by on-ground status',
    color: 'text-yellow-400',
    entityTypes: ['flight'],
    examples: ['ground:true', 'ground:false'],
    getValues: () => staticValues(['true', 'false']),
  },
  unidentified: {
    prefix: 'unidentified',
    label: 'Unidentified',
    description: 'Filter flights with no callsign (hex-only, often military)',
    color: 'text-yellow-400',
    entityTypes: ['flight'],
    examples: ['unidentified:true', 'unidentified:false'],
    getValues: () => staticValues(['true', 'false']),
  },

  // Ship-specific tags
  mmsi: {
    prefix: 'mmsi',
    label: 'MMSI',
    description: 'Filter ships by MMSI number',
    color: 'text-violet-400',
    entityTypes: ['ship'],
    examples: ['mmsi:123456789'],
  },
  heading: {
    prefix: 'heading',
    label: 'Heading',
    description: 'Filter ships by heading in degrees (supports >/< operators)',
    color: 'text-violet-400',
    entityTypes: ['flight', 'ship'],
    examples: ['heading:>180', 'heading:<90'],
  },
  shipname: {
    prefix: 'shipname',
    label: 'Ship Name',
    description: 'Filter ships by vessel name',
    color: 'text-violet-400',
    entityTypes: ['ship'],
    examples: ['shipname:TANKER', 'shipname:CARGO'],
  },

  // Event-specific tags
  cameo: {
    prefix: 'cameo',
    label: 'CAMEO Code',
    description: 'Filter events by CAMEO event code',
    color: 'text-orange-400',
    entityTypes: ['event'],
    examples: ['cameo:190', 'cameo:195'],
  },
  mentions: {
    prefix: 'mentions',
    label: 'Mentions',
    description: 'Filter events by number of media mentions (supports >/< operators)',
    color: 'text-orange-400',
    entityTypes: ['event'],
    examples: ['mentions:>100', 'mentions:>50'],
  },
  date: {
    prefix: 'date',
    label: 'Event Date',
    description: 'Filter events by specific date',
    color: 'text-purple-400',
    entityTypes: ['event'],
    examples: ['date:2026-03-20', 'date:2026-03-15'],
  },

  // Water-specific tags
  stress: {
    prefix: 'stress',
    label: 'Water Stress',
    description: 'Filter water facilities by stress level',
    color: 'text-cyan-400',
    entityTypes: ['water'],
    examples: ['stress:high', 'stress:low', 'stress:extreme'],
    getValues: () => staticValues(['low', 'medium', 'high', 'extreme']),
  },

  // Site-specific tags
  site: {
    prefix: 'site',
    label: 'Site Type',
    description: 'Filter sites by type (nuclear, naval, oil, airbase, port)',
    color: 'text-green-400',
    entityTypes: ['site'],
    examples: ['site:nuclear', 'site:oil', 'site:airbase'],
    getValues: getSiteValues,
  },
  status: {
    prefix: 'status',
    label: 'Attack Status',
    description: 'Filter sites by attack status (healthy or attacked)',
    color: 'text-green-400',
    entityTypes: ['site'],
    examples: ['status:healthy', 'status:attacked'],
    getValues: () => staticValues(['healthy', 'attacked']),
  },
};

// --- Exported Helpers ---

/** Sorted list of all valid tag prefixes */
export const ALL_PREFIXES: string[] = Object.keys(TAG_REGISTRY).sort();

/** Check if a prefix string is a valid tag prefix */
export function isValidPrefix(prefix: string): boolean {
  return prefix in TAG_REGISTRY;
}

/** Get the Tailwind color class for a tag prefix. Returns a default for unknown prefixes. */
export function getTagColor(prefix: string): string {
  return TAG_REGISTRY[prefix]?.color ?? 'text-gray-400';
}

/**
 * Get autocomplete values for a tag prefix from live entity data.
 * Returns empty array if prefix has no value extractor or is unknown.
 */
export function getTagValues(prefix: string, data: EntityDataSources): TagValue[] {
  const def = TAG_REGISTRY[prefix];
  if (!def?.getValues) return [];
  return def.getValues(data);
}
