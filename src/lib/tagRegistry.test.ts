import { describe, it, expect } from 'vitest';
import {
  TAG_REGISTRY,
  ALL_PREFIXES,
  isValidPrefix,
  getTagColor,
  getTagValues,
  type TagDefinition,
  type EntityDataSources,
  type TagValue,
} from './tagRegistry';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '../../server/types';

// --- Helpers ---

function makeFlight(overrides: Partial<FlightEntity> & { data?: Partial<FlightEntity['data']> } = {}): FlightEntity {
  const { data: d, ...rest } = overrides;
  return {
    id: 'flight-1',
    type: 'flight',
    lat: 35.0,
    lng: 51.0,
    timestamp: Date.now(),
    label: 'IRA123',
    data: {
      icao24: 'abc123',
      callsign: 'IRA123',
      originCountry: 'Iran',
      velocity: 250,
      heading: 90,
      altitude: 10000,
      onGround: false,
      verticalRate: 5,
      unidentified: false,
      ...d,
    },
    ...rest,
  };
}

function makeShip(overrides: Partial<ShipEntity> & { data?: Partial<ShipEntity['data']> } = {}): ShipEntity {
  const { data: d, ...rest } = overrides;
  return {
    id: 'ship-1',
    type: 'ship',
    lat: 27.0,
    lng: 56.0,
    timestamp: Date.now(),
    label: 'TANKER IRAN',
    data: {
      mmsi: 123456789,
      shipName: 'TANKER IRAN',
      speedOverGround: 12.5,
      courseOverGround: 180,
      trueHeading: 178,
      ...d,
    },
    ...rest,
  };
}

function makeEvent(overrides: Partial<ConflictEventEntity> & { data?: Partial<ConflictEventEntity['data']> } = {}): ConflictEventEntity {
  const { data: d, ...rest } = overrides;
  return {
    id: 'event-1',
    type: 'airstrike',
    lat: 33.0,
    lng: 44.0,
    timestamp: Date.now(),
    label: 'Airstrike in Baghdad',
    data: {
      eventType: 'Use conventional military force',
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'IRAN',
      actor2: 'IRAQ',
      notes: '',
      source: 'https://example.com',
      goldsteinScale: -9.5,
      locationName: 'Baghdad, Iraq',
      cameoCode: '190',
      numMentions: 10,
      numSources: 5,
      ...d,
    },
    ...rest,
  };
}

function makeSite(overrides: Partial<SiteEntity> = {}): SiteEntity {
  return {
    id: 'site-123',
    type: 'site',
    siteType: 'nuclear',
    lat: 32.0,
    lng: 52.0,
    label: 'Natanz Nuclear Facility',
    operator: 'AEOI',
    osmId: 123,
    ...overrides,
  };
}

function makeDataSources(overrides: Partial<EntityDataSources> = {}): EntityDataSources {
  return {
    flights: [],
    ships: [],
    events: [],
    sites: [],
    ...overrides,
  };
}

// --- Tests ---

describe('TAG_REGISTRY', () => {
  const EXPECTED_PREFIXES = [
    'type', 'country', 'actor', 'location', 'severity', 'near', 'since', 'before', 'has',
    'callsign', 'icao', 'altitude', 'speed', 'ground', 'unidentified',
    'mmsi', 'heading', 'shipname',
    'cameo', 'mentions', 'date',
    'site', 'status',
  ];

  it('has entries for all expected prefixes', () => {
    for (const prefix of EXPECTED_PREFIXES) {
      expect(TAG_REGISTRY[prefix], `Missing registry entry for "${prefix}"`).toBeDefined();
    }
  });

  it('each entry has required metadata fields', () => {
    for (const [prefix, def] of Object.entries(TAG_REGISTRY)) {
      expect(def.prefix, `${prefix}.prefix`).toBe(prefix);
      expect(def.label, `${prefix}.label`).toBeTruthy();
      expect(def.description, `${prefix}.description`).toBeTruthy();
      expect(def.color, `${prefix}.color`).toBeTruthy();
      expect(def.entityTypes, `${prefix}.entityTypes`).toBeInstanceOf(Array);
      expect(def.entityTypes.length, `${prefix}.entityTypes length`).toBeGreaterThan(0);
      expect(def.examples, `${prefix}.examples`).toBeInstanceOf(Array);
      expect(def.examples.length, `${prefix}.examples length`).toBeGreaterThan(0);
    }
  });
});

describe('ALL_PREFIXES', () => {
  it('contains all valid prefix strings', () => {
    const registryKeys = Object.keys(TAG_REGISTRY).sort();
    expect(ALL_PREFIXES).toEqual(registryKeys);
  });

  it('is sorted alphabetically', () => {
    const sorted = [...ALL_PREFIXES].sort();
    expect(ALL_PREFIXES).toEqual(sorted);
  });
});

describe('isValidPrefix', () => {
  it('returns true for known prefixes', () => {
    expect(isValidPrefix('type')).toBe(true);
    expect(isValidPrefix('country')).toBe(true);
    expect(isValidPrefix('callsign')).toBe(true);
    expect(isValidPrefix('site')).toBe(true);
    expect(isValidPrefix('severity')).toBe(true);
  });

  it('returns false for unknown prefixes', () => {
    expect(isValidPrefix('invalid')).toBe(false);
    expect(isValidPrefix('source')).toBe(false);
    expect(isValidPrefix('')).toBe(false);
    expect(isValidPrefix('foo')).toBe(false);
  });
});

describe('getTagColor', () => {
  it('returns a color class string for known prefixes', () => {
    const color = getTagColor('type');
    expect(color).toMatch(/^text-/);
  });

  it('returns a default color for unknown prefixes', () => {
    const color = getTagColor('invalid');
    expect(color).toBeTruthy();
    expect(color).toMatch(/^text-/);
  });

  it('returns specific colors per category', () => {
    expect(getTagColor('type')).toBe('text-blue-400');
    expect(getTagColor('country')).toBe('text-emerald-400');
    expect(getTagColor('severity')).toBe('text-red-400');
    expect(getTagColor('near')).toBe('text-amber-400');
    expect(getTagColor('since')).toBe('text-purple-400');
    expect(getTagColor('before')).toBe('text-purple-400');
    expect(getTagColor('callsign')).toBe('text-yellow-400');
    expect(getTagColor('mmsi')).toBe('text-violet-400');
    expect(getTagColor('cameo')).toBe('text-orange-400');
    expect(getTagColor('site')).toBe('text-green-400');
    expect(getTagColor('has')).toBe('text-cyan-400');
  });
});

describe('getTagValues', () => {
  describe('type: prefix', () => {
    it('returns entity type values with counts from entity arrays', () => {
      const data = makeDataSources({
        flights: [makeFlight(), makeFlight({ id: 'flight-2' })],
        ships: [makeShip()],
        events: [makeEvent(), makeEvent({ id: 'event-2', type: 'ground_combat' })],
        sites: [makeSite()],
      });
      const values = getTagValues('type', data);
      expect(values.length).toBeGreaterThan(0);

      const flightVal = values.find(v => v.value === 'flight');
      expect(flightVal).toBeDefined();
      expect(flightVal!.count).toBe(2);

      const shipVal = values.find(v => v.value === 'ship');
      expect(shipVal).toBeDefined();
      expect(shipVal!.count).toBe(1);

      const siteVal = values.find(v => v.value === 'site');
      expect(siteVal).toBeDefined();
      expect(siteVal!.count).toBe(1);
    });
  });

  describe('country: prefix', () => {
    it('extracts unique originCountry from flights with counts', () => {
      const data = makeDataSources({
        flights: [
          makeFlight({ data: { originCountry: 'Iran' } }),
          makeFlight({ id: 'f2', data: { originCountry: 'Iran' } }),
          makeFlight({ id: 'f3', data: { originCountry: 'Iraq' } }),
        ],
      });
      const values = getTagValues('country', data);
      const iranVal = values.find(v => v.value.toLowerCase() === 'iran');
      expect(iranVal).toBeDefined();
      expect(iranVal!.count).toBe(2);
      const iraqVal = values.find(v => v.value.toLowerCase() === 'iraq');
      expect(iraqVal).toBeDefined();
      expect(iraqVal!.count).toBe(1);
    });
  });

  describe('actor: prefix', () => {
    it('extracts unique actor1/actor2 from events with counts', () => {
      const data = makeDataSources({
        events: [
          makeEvent({ data: { actor1: 'IRAN', actor2: 'IRAQ' } }),
          makeEvent({ id: 'e2', data: { actor1: 'IRAN', actor2: 'ISRAEL' } }),
        ],
      });
      const values = getTagValues('actor', data);
      const iranVal = values.find(v => v.value === 'IRAN');
      expect(iranVal).toBeDefined();
      expect(iranVal!.count).toBe(2); // appears as actor1 twice
      const iraqVal = values.find(v => v.value === 'IRAQ');
      expect(iraqVal).toBeDefined();
      expect(iraqVal!.count).toBe(1);
      const israelVal = values.find(v => v.value === 'ISRAEL');
      expect(israelVal).toBeDefined();
      expect(israelVal!.count).toBe(1);
    });

    it('deduplicates actors appearing as both actor1 and actor2', () => {
      const data = makeDataSources({
        events: [
          makeEvent({ data: { actor1: 'IRAN', actor2: 'IRAN' } }),
        ],
      });
      const values = getTagValues('actor', data);
      const iranEntries = values.filter(v => v.value === 'IRAN');
      expect(iranEntries.length).toBe(1);
      expect(iranEntries[0].count).toBe(2); // counted from both actor1 and actor2
    });
  });

  describe('site: prefix', () => {
    it('extracts unique siteType values with counts', () => {
      const data = makeDataSources({
        sites: [
          makeSite({ siteType: 'nuclear' }),
          makeSite({ id: 'site-2', siteType: 'nuclear' }),
          makeSite({ id: 'site-3', siteType: 'oil' }),
        ],
      });
      const values = getTagValues('site', data);
      const nuclearVal = values.find(v => v.value === 'nuclear');
      expect(nuclearVal).toBeDefined();
      expect(nuclearVal!.count).toBe(2);
      const oilVal = values.find(v => v.value === 'oil');
      expect(oilVal).toBeDefined();
      expect(oilVal!.count).toBe(1);
    });
  });

describe('severity: prefix', () => {
    it('returns static high/medium/low values', () => {
      const values = getTagValues('severity', makeDataSources());
      expect(values).toEqual([
        { value: 'high', count: 0 },
        { value: 'medium', count: 0 },
        { value: 'low', count: 0 },
      ]);
    });
  });

  describe('ground: prefix', () => {
    it('returns static true/false values', () => {
      const values = getTagValues('ground', makeDataSources());
      expect(values).toEqual([
        { value: 'true', count: 0 },
        { value: 'false', count: 0 },
      ]);
    });
  });

describe('unidentified: prefix', () => {
    it('returns static true/false values', () => {
      const values = getTagValues('unidentified', makeDataSources());
      expect(values).toEqual([
        { value: 'true', count: 0 },
        { value: 'false', count: 0 },
      ]);
    });
  });

  describe('status: prefix', () => {
    it('returns static healthy/attacked values', () => {
      const values = getTagValues('status', makeDataSources());
      expect(values).toEqual([
        { value: 'healthy', count: 0 },
        { value: 'attacked', count: 0 },
      ]);
    });
  });

  describe('location: prefix', () => {
    it('extracts unique locationName from events and labels from sites', () => {
      const data = makeDataSources({
        events: [
          makeEvent({ data: { locationName: 'Baghdad, Iraq' } }),
          makeEvent({ id: 'e2', data: { locationName: 'Tehran, Iran' } }),
          makeEvent({ id: 'e3', data: { locationName: 'Baghdad, Iraq' } }),
        ],
        sites: [
          makeSite({ label: 'Natanz Nuclear Facility' }),
        ],
      });
      const values = getTagValues('location', data);
      const baghdadVal = values.find(v => v.value === 'Baghdad, Iraq');
      expect(baghdadVal).toBeDefined();
      expect(baghdadVal!.count).toBe(2);
      const tehranVal = values.find(v => v.value === 'Tehran, Iran');
      expect(tehranVal).toBeDefined();
      expect(tehranVal!.count).toBe(1);
      const natanzVal = values.find(v => v.value === 'Natanz Nuclear Facility');
      expect(natanzVal).toBeDefined();
      expect(natanzVal!.count).toBe(1);
    });
  });

  describe('tags without getValues (numeric/freeform)', () => {
    it('returns empty array for altitude', () => {
      expect(getTagValues('altitude', makeDataSources())).toEqual([]);
    });

    it('returns empty array for speed', () => {
      expect(getTagValues('speed', makeDataSources())).toEqual([]);
    });

it('returns empty array for mentions', () => {
      expect(getTagValues('mentions', makeDataSources())).toEqual([]);
    });

    it('returns empty array for callsign', () => {
      expect(getTagValues('callsign', makeDataSources())).toEqual([]);
    });

    it('returns empty array for icao', () => {
      expect(getTagValues('icao', makeDataSources())).toEqual([]);
    });

    it('returns empty array for mmsi', () => {
      expect(getTagValues('mmsi', makeDataSources())).toEqual([]);
    });

    it('returns empty array for unknown prefix', () => {
      expect(getTagValues('invalid', makeDataSources())).toEqual([]);
    });
  });
});
