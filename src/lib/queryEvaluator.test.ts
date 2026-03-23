import { describe, it, expect } from 'vitest';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';
import { evaluateQuery, evaluateTag, type EvaluationContext } from './queryEvaluator';
import { parse } from './queryParser';

// ─── Mock Data ────────────────────────────────────────────────

const NOW = Date.parse('2026-03-22T12:00:00Z');

const mockFlight: FlightEntity = {
  id: 'flight-1',
  type: 'flight',
  lat: 32.0,
  lng: 52.0,
  timestamp: NOW - 60_000, // 1 min ago
  label: 'IRA123',
  data: {
    icao24: 'abc123',
    callsign: 'IRA123',
    originCountry: 'Iran',
    velocity: 250,
    heading: 90,
    altitude: 35000,
    onGround: false,
    verticalRate: 2.5,
    unidentified: false,
  },
};

const mockShip: ShipEntity = {
  id: 'ship-1',
  type: 'ship',
  lat: 27.0,
  lng: 56.0,
  timestamp: NOW - 120_000,
  label: 'PERSIAN GULF TANKER',
  data: {
    mmsi: 123456789,
    shipName: 'PERSIAN GULF TANKER',
    speedOverGround: 12.5,
    courseOverGround: 180,
    trueHeading: 175,
  },
};

const mockEvent: ConflictEventEntity = {
  id: 'event-1',
  type: 'airstrike',
  lat: 33.0,
  lng: 44.0,
  timestamp: NOW - 3600_000, // 1 hour ago
  label: 'Airstrike in Baghdad',
  data: {
    eventType: 'Use conventional military force',
    subEventType: 'CAMEO 190',
    fatalities: 5,
    actor1: 'United States',
    actor2: 'Iran',
    notes: 'Military strike on convoy',
    source: 'GDELT v2',
    goldsteinScale: -10,
    locationName: 'Baghdad, Iraq',
    cameoCode: '190',
    numMentions: 100,
    numSources: 25,
  },
};

const mockSite: SiteEntity = {
  id: 'site-1',
  type: 'site',
  siteType: 'nuclear',
  lat: 32.5,
  lng: 51.7,
  label: 'Isfahan Nuclear Facility',
  operator: 'AEOI',
  osmId: 12345,
};

const emptyContext: EvaluationContext = {
  sites: [],
  events: [],
  now: NOW,
};

const contextWithSites: EvaluationContext = {
  sites: [mockSite],
  events: [mockEvent],
  now: NOW,
};

// ─── evaluateQuery Tests ──────────────────────────────────────

describe('evaluateQuery', () => {
  it('null AST matches everything', () => {
    expect(evaluateQuery(null, mockFlight, emptyContext)).toBe(true);
  });

  it('OR node matches when either child matches', () => {
    const ast = parse('type:flight OR type:ship');
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(true);
    expect(evaluateQuery(ast, mockShip, emptyContext)).toBe(true);
  });

  it('OR node fails when neither child matches', () => {
    const ast = parse('type:ship OR country:turkey');
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(false);
  });

  it('TEXT node does substring match against searchable fields', () => {
    const ast = parse('IRA123');
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(true);
  });

  it('TEXT node is case-insensitive', () => {
    const ast = parse('ira123');
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(true);
  });

  it('TEXT node fails when no field matches', () => {
    const ast = parse('nonexistent');
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(false);
  });

  it('implicit OR matches when one term matches', () => {
    const ast = parse('type:flight country:turkey');
    // type:flight matches, country:turkey does not, but OR means pass
    expect(evaluateQuery(ast, mockFlight, emptyContext)).toBe(true);
  });
});

// ─── evaluateTag Tests ────────────────────────────────────────

describe('evaluateTag', () => {
  describe('type:', () => {
    it('matches entity type exactly', () => {
      expect(evaluateTag(mockFlight, 'type', 'flight', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'type', 'ship', emptyContext)).toBe(false);
    });

    it('matches event subtypes', () => {
      expect(evaluateTag(mockEvent, 'type', 'airstrike', emptyContext)).toBe(true);
    });

    it('matches site siteType', () => {
      expect(evaluateTag(mockSite, 'type', 'nuclear', emptyContext)).toBe(true);
      expect(evaluateTag(mockSite, 'type', 'site', emptyContext)).toBe(true);
    });
  });

  describe('country:', () => {
    it('matches flight originCountry (case-insensitive)', () => {
      expect(evaluateTag(mockFlight, 'country', 'iran', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'country', 'Iran', emptyContext)).toBe(true);
    });

    it('matches event actor countries', () => {
      expect(evaluateTag(mockEvent, 'country', 'iran', emptyContext)).toBe(true);
      expect(evaluateTag(mockEvent, 'country', 'united states', emptyContext)).toBe(true);
    });

    it('does not match for ships (no country field)', () => {
      expect(evaluateTag(mockShip, 'country', 'iran', emptyContext)).toBe(false);
    });
  });

  describe('callsign:', () => {
    it('matches flight label substring', () => {
      expect(evaluateTag(mockFlight, 'callsign', 'IRA', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'callsign', 'ira', emptyContext)).toBe(true);
    });

    it('does not match non-flights', () => {
      expect(evaluateTag(mockShip, 'callsign', 'test', emptyContext)).toBe(false);
    });
  });

  describe('icao:', () => {
    it('matches flight icao24', () => {
      expect(evaluateTag(mockFlight, 'icao', 'abc123', emptyContext)).toBe(true);
    });
  });

  describe('mmsi:', () => {
    it('matches ship mmsi', () => {
      expect(evaluateTag(mockShip, 'mmsi', '123456789', emptyContext)).toBe(true);
    });
  });

  describe('shipname:', () => {
    it('matches ship name substring', () => {
      expect(evaluateTag(mockShip, 'shipname', 'persian', emptyContext)).toBe(true);
    });
  });

  describe('actor:', () => {
    it('matches event actor1 or actor2 substring', () => {
      expect(evaluateTag(mockEvent, 'actor', 'united', emptyContext)).toBe(true);
      expect(evaluateTag(mockEvent, 'actor', 'iran', emptyContext)).toBe(true);
    });
  });

  describe('location:', () => {
    it('matches event locationName substring', () => {
      expect(evaluateTag(mockEvent, 'location', 'baghdad', emptyContext)).toBe(true);
    });

    it('matches site label substring', () => {
      expect(evaluateTag(mockSite, 'location', 'isfahan', emptyContext)).toBe(true);
    });
  });

  describe('cameo:', () => {
    it('matches event cameoCode', () => {
      expect(evaluateTag(mockEvent, 'cameo', '190', emptyContext)).toBe(true);
    });
  });

  describe('altitude: (range operators)', () => {
    it('exact match', () => {
      expect(evaluateTag(mockFlight, 'altitude', '35000', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'altitude', '30000', emptyContext)).toBe(false);
    });

    it('greater than', () => {
      expect(evaluateTag(mockFlight, 'altitude', '>30000', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'altitude', '>40000', emptyContext)).toBe(false);
    });

    it('less than', () => {
      expect(evaluateTag(mockFlight, 'altitude', '<40000', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'altitude', '<30000', emptyContext)).toBe(false);
    });

    it('greater or equal', () => {
      expect(evaluateTag(mockFlight, 'altitude', '>=35000', emptyContext)).toBe(true);
    });

    it('less or equal', () => {
      expect(evaluateTag(mockFlight, 'altitude', '<=35000', emptyContext)).toBe(true);
    });

    it('range between', () => {
      expect(evaluateTag(mockFlight, 'altitude', '30000-40000', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'altitude', '36000-40000', emptyContext)).toBe(false);
    });

    it('returns false for null altitude', () => {
      const noAlt = { ...mockFlight, data: { ...mockFlight.data, altitude: null } };
      expect(evaluateTag(noAlt, 'altitude', '>0', emptyContext)).toBe(false);
    });
  });

  describe('speed:', () => {
    it('matches flight velocity', () => {
      expect(evaluateTag(mockFlight, 'speed', '>200', emptyContext)).toBe(true);
    });

    it('matches ship speedOverGround', () => {
      expect(evaluateTag(mockShip, 'speed', '>10', emptyContext)).toBe(true);
    });
  });

  describe('heading:', () => {
    it('matches ship trueHeading', () => {
      expect(evaluateTag(mockShip, 'heading', '175', emptyContext)).toBe(true);
    });

    it('matches flight heading', () => {
      expect(evaluateTag(mockFlight, 'heading', '90', emptyContext)).toBe(true);
    });
  });

  describe('mentions:', () => {
    it('matches event numMentions', () => {
      expect(evaluateTag(mockEvent, 'mentions', '>50', emptyContext)).toBe(true);
    });
  });

  describe('ground:', () => {
    it('matches flight onGround boolean', () => {
      expect(evaluateTag(mockFlight, 'ground', 'false', emptyContext)).toBe(true);
      expect(evaluateTag(mockFlight, 'ground', 'true', emptyContext)).toBe(false);
    });
  });

  describe('unidentified:', () => {
    it('matches flight unidentified flag', () => {
      expect(evaluateTag(mockFlight, 'unidentified', 'true', emptyContext)).toBe(false);
      expect(evaluateTag(mockFlight, 'unidentified', 'false', emptyContext)).toBe(true);
    });
  });

  describe('site:', () => {
    it('matches site siteType', () => {
      expect(evaluateTag(mockSite, 'site', 'nuclear', emptyContext)).toBe(true);
      expect(evaluateTag(mockSite, 'site', 'naval', emptyContext)).toBe(false);
    });
  });

  describe('near:', () => {
    it('matches entities within 50km of named site', () => {
      const closeFlight = { ...mockFlight, lat: 32.5, lng: 51.7 };
      expect(evaluateTag(closeFlight, 'near', 'isfahan', contextWithSites)).toBe(true);
    });

    it('does not match entities far from site', () => {
      const farFlight = { ...mockFlight, lat: 40.0, lng: 60.0 };
      expect(evaluateTag(farFlight, 'near', 'isfahan', contextWithSites)).toBe(false);
    });
  });

  describe('since:', () => {
    it('matches relative time (entity within window)', () => {
      expect(evaluateTag(mockFlight, 'since', '1h', { ...emptyContext, now: NOW })).toBe(true);
    });

    it('does not match entity older than window', () => {
      const oldFlight = { ...mockFlight, timestamp: NOW - 7_200_000 }; // 2h ago
      expect(evaluateTag(oldFlight, 'since', '1h', { ...emptyContext, now: NOW })).toBe(false);
    });

    it('matches absolute date', () => {
      expect(evaluateTag(mockFlight, 'since', '2026-03-22', { ...emptyContext, now: NOW })).toBe(true);
    });
  });

  describe('before:', () => {
    it('matches entities before given time', () => {
      expect(evaluateTag(mockEvent, 'before', '2h', { ...emptyContext, now: NOW })).toBe(false);
    });
  });

  describe('has:', () => {
    it('checks attribute presence', () => {
      expect(evaluateTag(mockFlight, 'has', 'callsign', emptyContext)).toBe(true);
    });

    it('returns false for empty attribute', () => {
      const noCallsign = { ...mockFlight, data: { ...mockFlight.data, callsign: '' } };
      expect(evaluateTag(noCallsign, 'has', 'callsign', emptyContext)).toBe(false);
    });
  });

  describe('unknown prefix', () => {
    it('returns false for unknown prefix', () => {
      expect(evaluateTag(mockFlight, 'unknown', 'value', emptyContext)).toBe(false);
    });
  });
});
