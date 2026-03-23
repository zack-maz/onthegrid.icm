import { describe, expect, it } from 'vitest';
import { entityPassesFilters, KNOTS_PER_MS, FEET_PER_METER } from '@/lib/filters';
import type { FilterState } from '@/stores/filterStore';
import type { FlightEntity, ShipEntity, ConflictEventEntity } from '../../server/types';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeDefaults(): FilterState {
  return {
    flightCountries: [],
    eventCountries: [],
    flightSpeedMin: null,
    flightSpeedMax: null,
    altitudeMin: null,
    altitudeMax: null,
    proximityPin: null,
    proximityRadiusKm: 100,
    dateStart: 0,
    dateEnd: Date.now() + 86400000,
    isSettingPin: false,
    granularity: 'hour' as const,
    // New text search fields
    flightCallsign: '',
    flightIcao: '',
    shipMmsi: '',
    shipNameFilter: '',
    cameoCode: '',
    // New range fields
    mentionsMin: null,
    mentionsMax: null,
    headingAngle: null,
    // Severity toggles
    showHighSeverity: true,
    showMediumSeverity: true,
    showLowSeverity: true,
    // Actions (unused by pure function, but satisfy the type)
    setFlightCountries: () => {},
    addFlightCountry: () => {},
    removeFlightCountry: () => {},
    setEventCountries: () => {},
    addEventCountry: () => {},
    removeEventCountry: () => {},
    setFlightSpeedRange: () => {},
    setAltitudeRange: () => {},
    setProximityPin: () => {},
    setProximityRadius: () => {},
    setDateRange: () => {},
    setSettingPin: () => {},
    setGranularity: () => {},
    clearFilter: () => {},
    clearAll: () => {},
    activeFilterCount: () => 0,
    setFlightCallsign: () => {},
    setFlightIcao: () => {},
    setShipMmsi: () => {},
    setShipNameFilter: () => {},
    setCameoCode: () => {},
    setMentionsRange: () => {},
    setHeadingAngle: () => {},
    setShowHighSeverity: () => {},
    setShowMediumSeverity: () => {},
    setShowLowSeverity: () => {},
  };
}

function makeFlight(overrides: Partial<FlightEntity['data']> & { lat?: number; lng?: number; timestamp?: number } = {}): FlightEntity {
  return {
    id: 'f1',
    type: 'flight',
    lat: overrides.lat ?? 35,
    lng: overrides.lng ?? 51,
    timestamp: overrides.timestamp ?? Date.now(),
    label: 'TST123',
    data: {
      icao24: 'abc123',
      callsign: 'TST123',
      originCountry: 'Iran',
      velocity: 250,
      heading: 90,
      altitude: 10000,
      onGround: false,
      verticalRate: 0,
      unidentified: false,
      ...overrides,
    },
  };
}

function makeShip(overrides: Partial<ShipEntity['data']> & { lat?: number; lng?: number; timestamp?: number } = {}): ShipEntity {
  return {
    id: 's1',
    type: 'ship',
    lat: overrides.lat ?? 26,
    lng: overrides.lng ?? 56,
    timestamp: overrides.timestamp ?? Date.now(),
    label: 'CARGO ONE',
    data: {
      mmsi: 123456789,
      shipName: 'CARGO ONE',
      speedOverGround: 15,
      courseOverGround: 180,
      trueHeading: 180,
      ...overrides,
    },
  };
}

function makeEvent(overrides: Partial<ConflictEventEntity['data']> & { lat?: number; lng?: number; timestamp?: number; type?: ConflictEventEntity['type'] } = {}): ConflictEventEntity {
  const { lat, lng, timestamp, type: eventType, ...dataOverrides } = overrides;
  return {
    id: 'e1',
    type: eventType ?? 'airstrike',
    lat: lat ?? 33,
    lng: lng ?? 44,
    timestamp: timestamp ?? Date.now(),
    label: 'Airstrike in Baghdad',
    data: {
      eventType: 'Use of conventional military force',
      subEventType: 'CAMEO 190',
      fatalities: 0,
      actor1: 'IRAN',
      actor2: 'IRAQ',
      notes: 'test event',
      source: 'GDELT',
      goldsteinScale: -7,
      locationName: 'Baghdad, Iraq',
      cameoCode: '190',
      ...dataOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('entityPassesFilters', () => {
  describe('no filters active', () => {
    it('flight passes when no filters are active', () => {
      expect(entityPassesFilters(makeFlight(), makeDefaults())).toBe(true);
    });

    it('ship passes when no filters are active', () => {
      expect(entityPassesFilters(makeShip(), makeDefaults())).toBe(true);
    });

    it('event passes when no filters are active', () => {
      expect(entityPassesFilters(makeEvent(), makeDefaults())).toBe(true);
    });
  });

  describe('flight country filter', () => {
    it('flight with matching originCountry passes', () => {
      const filters = { ...makeDefaults(), flightCountries: ['Iran'] };
      expect(entityPassesFilters(makeFlight({ originCountry: 'Iran' }), filters)).toBe(true);
    });

    it('flight with non-matching originCountry fails', () => {
      const filters = { ...makeDefaults(), flightCountries: ['Iran'] };
      expect(entityPassesFilters(makeFlight({ originCountry: 'Turkey' }), filters)).toBe(false);
    });

    it('country match is case-insensitive for flights', () => {
      const filters = { ...makeDefaults(), flightCountries: ['iran'] };
      expect(entityPassesFilters(makeFlight({ originCountry: 'Iran' }), filters)).toBe(true);
    });

    it('ship always passes flight country filter', () => {
      const filters = { ...makeDefaults(), flightCountries: ['Iran'] };
      expect(entityPassesFilters(makeShip(), filters)).toBe(true);
    });

    it('event always passes flight country filter', () => {
      const filters = { ...makeDefaults(), flightCountries: ['Iran'] };
      expect(entityPassesFilters(makeEvent(), filters)).toBe(true);
    });
  });

  describe('event country filter', () => {
    it('event with actor1 containing selected country passes (case-insensitive)', () => {
      const filters = { ...makeDefaults(), eventCountries: ['IRAN'] };
      expect(entityPassesFilters(makeEvent({ actor1: 'IRAN GOVERNMENT' }), filters)).toBe(true);
    });

    it('event with actor2 containing selected country passes', () => {
      const filters = { ...makeDefaults(), eventCountries: ['Israel'] };
      expect(entityPassesFilters(makeEvent({ actor2: 'ISRAEL MILITARY' }), filters)).toBe(true);
    });

    it('event with neither actor matching fails', () => {
      const filters = { ...makeDefaults(), eventCountries: ['Syria'] };
      expect(entityPassesFilters(makeEvent({ actor1: 'IRAN', actor2: 'IRAQ' }), filters)).toBe(false);
    });

    it('flight always passes event country filter', () => {
      const filters = { ...makeDefaults(), eventCountries: ['IRAN'] };
      expect(entityPassesFilters(makeFlight(), filters)).toBe(true);
    });

    it('ship always passes event country filter', () => {
      const filters = { ...makeDefaults(), eventCountries: ['IRAN'] };
      expect(entityPassesFilters(makeShip(), filters)).toBe(true);
    });
  });

  describe('flight speed filter', () => {
    it('flight within speed range passes (velocity in m/s, filter in knots)', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeFlight({ velocity: 150 }), filters)).toBe(true);
    });

    it('flight below speed range fails', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeFlight({ velocity: 50 }), filters)).toBe(false);
    });

    it('flight above speed range fails', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeFlight({ velocity: 300 }), filters)).toBe(false);
    });

    it('airborne flight with null velocity passes (unknown = include)', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeFlight({ velocity: null, onGround: false }), filters)).toBe(true);
    });

    it('grounded flight with null velocity treated as 0 (fails speed min)', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 10, flightSpeedMax: null };
      expect(entityPassesFilters(makeFlight({ velocity: null, onGround: true }), filters)).toBe(false);
    });

    it('grounded flight with velocity 0 fails speed min', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 10, flightSpeedMax: null };
      expect(entityPassesFilters(makeFlight({ velocity: 0, onGround: true }), filters)).toBe(false);
    });

    it('ship always passes flight speed filter', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeShip(), filters)).toBe(true);
    });

    it('event always passes flight speed filter', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: 400 };
      expect(entityPassesFilters(makeEvent(), filters)).toBe(true);
    });

    it('flight speed filter with only min set works', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: 200, flightSpeedMax: null };
      expect(entityPassesFilters(makeFlight({ velocity: 150 }), filters)).toBe(true); // 291kn > 200
      expect(entityPassesFilters(makeFlight({ velocity: 50 }), filters)).toBe(false); // 97kn < 200
    });

    it('flight speed filter with only max set works', () => {
      const filters = { ...makeDefaults(), flightSpeedMin: null, flightSpeedMax: 100 };
      expect(entityPassesFilters(makeFlight({ velocity: 50 }), filters)).toBe(true); // 97kn < 100
      expect(entityPassesFilters(makeFlight({ velocity: 150 }), filters)).toBe(false); // 291kn > 100
    });
  });

describe('altitude filter', () => {
    it('flight within altitude range passes (altitude in meters, filter in feet)', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeFlight({ altitude: 5000 }), filters)).toBe(true);
    });

    it('flight below altitude range fails', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeFlight({ altitude: 2000 }), filters)).toBe(false);
    });

    it('flight above altitude range fails', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeFlight({ altitude: 15000 }), filters)).toBe(false);
    });

    it('airborne flight with null altitude passes (unknown = include)', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeFlight({ altitude: null, onGround: false }), filters)).toBe(true);
    });

    it('grounded flight with null altitude treated as 0 (fails altitude min)', () => {
      const filters = { ...makeDefaults(), altitudeMin: 500, altitudeMax: null };
      expect(entityPassesFilters(makeFlight({ altitude: null, onGround: true }), filters)).toBe(false);
    });

    it('grounded flight with altitude 0 fails altitude min', () => {
      const filters = { ...makeDefaults(), altitudeMin: 500, altitudeMax: null };
      expect(entityPassesFilters(makeFlight({ altitude: 0, onGround: true }), filters)).toBe(false);
    });

    it('ship always passes altitude filter (no altitude)', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeShip(), filters)).toBe(true);
    });

    it('event always passes altitude filter (no altitude)', () => {
      const filters = { ...makeDefaults(), altitudeMin: 10000, altitudeMax: 40000 };
      expect(entityPassesFilters(makeEvent(), filters)).toBe(true);
    });
  });

  describe('proximity filter', () => {
    it('entity within radius passes', () => {
      const filters = { ...makeDefaults(), proximityPin: { lat: 35, lng: 51 }, proximityRadiusKm: 100 };
      expect(entityPassesFilters(makeFlight({ lat: 35.5, lng: 51.5 }), filters)).toBe(true);
    });

    it('entity outside radius fails', () => {
      const filters = { ...makeDefaults(), proximityPin: { lat: 35, lng: 51 }, proximityRadiusKm: 100 };
      expect(entityPassesFilters(makeFlight({ lat: 40, lng: 60 }), filters)).toBe(false);
    });

    it('applies to ships', () => {
      const filters = { ...makeDefaults(), proximityPin: { lat: 26, lng: 56 }, proximityRadiusKm: 50 };
      expect(entityPassesFilters(makeShip({ lat: 26.1, lng: 56.1 }), filters)).toBe(true);
      expect(entityPassesFilters(makeShip({ lat: 30, lng: 60 }), filters)).toBe(false);
    });

    it('applies to events', () => {
      const filters = { ...makeDefaults(), proximityPin: { lat: 33, lng: 44 }, proximityRadiusKm: 50 };
      expect(entityPassesFilters(makeEvent({ lat: 33.1, lng: 44.1 }), filters)).toBe(true);
      expect(entityPassesFilters(makeEvent({ lat: 40, lng: 50 }), filters)).toBe(false);
    });
  });

  describe('date filter', () => {
    const dayMs = 86400000;
    const now = Date.now();

    it('event within date range passes', () => {
      const filters = { ...makeDefaults(), dateStart: now - dayMs, dateEnd: now + dayMs };
      expect(entityPassesFilters(makeEvent({ timestamp: now }), filters)).toBe(true);
    });

    it('event before date range fails', () => {
      const filters = { ...makeDefaults(), dateStart: now - dayMs, dateEnd: now + dayMs };
      expect(entityPassesFilters(makeEvent({ timestamp: now - 2 * dayMs }), filters)).toBe(false);
    });

    it('event after date range fails', () => {
      const filters = { ...makeDefaults(), dateStart: now - dayMs, dateEnd: now + dayMs };
      expect(entityPassesFilters(makeEvent({ timestamp: now + 2 * dayMs }), filters)).toBe(false);
    });

    it('flight always passes date filter (live data)', () => {
      const filters = { ...makeDefaults(), dateStart: now - dayMs, dateEnd: now + dayMs };
      expect(entityPassesFilters(makeFlight({ timestamp: now - 2 * dayMs }), filters)).toBe(true);
    });

    it('ship always passes date filter (live data)', () => {
      const filters = { ...makeDefaults(), dateStart: now - dayMs, dateEnd: now + dayMs };
      expect(entityPassesFilters(makeShip({ timestamp: now - 2 * dayMs }), filters)).toBe(true);
    });

    it('date filter with start only (end far in future)', () => {
      const filters = { ...makeDefaults(), dateStart: now, dateEnd: now + 10 * dayMs };
      expect(entityPassesFilters(makeEvent({ timestamp: now + dayMs }), filters)).toBe(true);
      expect(entityPassesFilters(makeEvent({ timestamp: now - dayMs }), filters)).toBe(false);
    });

    it('date filter with end only (start at 0)', () => {
      const filters = { ...makeDefaults(), dateStart: 0, dateEnd: now };
      expect(entityPassesFilters(makeEvent({ timestamp: now - dayMs }), filters)).toBe(true);
      expect(entityPassesFilters(makeEvent({ timestamp: now + dayMs }), filters)).toBe(false);
    });
  });

  describe('combined filters (AND logic)', () => {
    it('flight must pass ALL applicable filters', () => {
      const filters = {
        ...makeDefaults(),
        flightCountries: ['Iran'],
        flightSpeedMin: 200,
        flightSpeedMax: 400,
        altitudeMin: 10000,
        altitudeMax: 40000,
      };
      expect(entityPassesFilters(makeFlight({ originCountry: 'Iran', velocity: 150, altitude: 5000 }), filters)).toBe(true);
    });

    it('entity failing any one applicable filter is excluded', () => {
      const filters = {
        ...makeDefaults(),
        flightCountries: ['Iran'],
        flightSpeedMin: 200,
        flightSpeedMax: 400,
      };
      expect(entityPassesFilters(makeFlight({ originCountry: 'Turkey', velocity: 150 }), filters)).toBe(false);
    });

    it('flight fails when speed passes but altitude fails', () => {
      const filters = {
        ...makeDefaults(),
        flightSpeedMin: 200,
        flightSpeedMax: 400,
        altitudeMin: 10000,
        altitudeMax: 40000,
      };
      expect(entityPassesFilters(makeFlight({ velocity: 150, altitude: 2000 }), filters)).toBe(false);
    });

    it('ships pass through flight-scoped filters', () => {
      const filters = {
        ...makeDefaults(),
        flightCountries: ['Iran'],
        flightSpeedMin: 200,
        flightSpeedMax: 400,
        altitudeMin: 10000,
        altitudeMax: 40000,
      };
      expect(entityPassesFilters(makeShip(), filters)).toBe(true);
    });

    it('events pass through speed and altitude filters', () => {
      const filters = {
        ...makeDefaults(),
        flightSpeedMin: 200,
        flightSpeedMax: 400,
        altitudeMin: 10000,
        altitudeMax: 40000,
      };
      expect(entityPassesFilters(makeEvent(), filters)).toBe(true);
    });
  });

  describe('conversion constants', () => {
    it('KNOTS_PER_MS is approximately 1.94384', () => {
      expect(KNOTS_PER_MS).toBeCloseTo(1.94384, 4);
    });

    it('FEET_PER_METER is approximately 3.28084', () => {
      expect(FEET_PER_METER).toBeCloseTo(3.28084, 4);
    });
  });
});
