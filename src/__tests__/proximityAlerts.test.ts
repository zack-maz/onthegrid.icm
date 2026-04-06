import { describe, it, expect } from 'vitest';
import { computeProximityAlerts } from '../hooks/useProximityAlerts';
import type { FlightEntity, SiteEntity } from '@/types/entities';

function makeFlight(overrides: Partial<FlightEntity> & { data?: Partial<FlightEntity['data']> } = {}): FlightEntity {
  const { data: dataOverrides, ...rest } = overrides;
  return {
    id: 'flight-1',
    type: 'flight',
    lat: 32.0,
    lng: 51.0,
    timestamp: Date.now(),
    label: 'TEST123',
    ...rest,
    data: {
      icao24: 'abc123',
      callsign: 'TEST123',
      originCountry: 'Unknown',
      velocity: 200,
      heading: 90,
      altitude: 10000,
      onGround: false,
      verticalRate: 0,
      unidentified: false,
      ...dataOverrides,
    },
  } as FlightEntity;
}

function makeSite(overrides: Partial<SiteEntity> = {}): SiteEntity {
  return {
    id: 'site-1001',
    type: 'site',
    siteType: 'nuclear',
    lat: 32.0,
    lng: 51.0,
    label: 'Natanz Nuclear Facility',
    osmId: 1001,
    ...overrides,
  };
}

describe('computeProximityAlerts', () => {
  it('returns empty array when no flights exist', () => {
    const sites = [makeSite()];
    const result = computeProximityAlerts([], sites);
    expect(result).toEqual([]);
  });

  it('returns empty array when no sites exist', () => {
    const flights = [makeFlight({ data: { unidentified: true } } as Partial<FlightEntity>)];
    const result = computeProximityAlerts(flights, []);
    expect(result).toEqual([]);
  });

  it('returns empty array when all flights are identified (unidentified=false)', () => {
    const flights = [
      makeFlight({ id: 'f1', lat: 32.0, lng: 51.0, data: { unidentified: false } } as Partial<FlightEntity>),
      makeFlight({ id: 'f2', lat: 32.01, lng: 51.01, data: { unidentified: false } } as Partial<FlightEntity>),
    ];
    const sites = [makeSite()];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toEqual([]);
  });

  it('returns alert when unidentified flight is within 25km of a site', () => {
    // Same lat/lng as site = 0km distance
    const flights = [
      makeFlight({
        id: 'uid-1',
        lat: 32.0,
        lng: 51.0,
        label: 'UNKNOWN',
        data: { unidentified: true, heading: 270 },
      } as Partial<FlightEntity>),
    ];
    const sites = [makeSite()];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      siteId: 'site-1001',
      siteLat: 32.0,
      siteLng: 51.0,
      siteLabel: 'Natanz Nuclear Facility',
      siteType: 'nuclear',
      flightId: 'uid-1',
      flightLabel: 'UNKNOWN',
      heading: 270,
    });
    expect(result[0].distanceKm).toBeLessThanOrEqual(25);
  });

  it('does NOT return alert when unidentified flight is on the ground', () => {
    const flights = [
      makeFlight({
        id: 'uid-ground',
        lat: 32.0,
        lng: 51.0,
        label: 'GROUNDED',
        data: { unidentified: true, onGround: true, heading: 0 },
      } as Partial<FlightEntity>),
    ];
    const sites = [makeSite()];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toEqual([]);
  });

  it('does NOT return alert when flight is > 25km away', () => {
    // ~33km apart (0.3 degree latitude difference)
    const flights = [
      makeFlight({
        id: 'uid-far',
        lat: 32.3,
        lng: 51.0,
        label: 'FAR',
        data: { unidentified: true, heading: 0 },
      } as Partial<FlightEntity>),
    ];
    const sites = [makeSite({ lat: 32.0, lng: 51.0 })];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toEqual([]);
  });

  it('only returns closest flight per site when multiple are in range', () => {
    const sites = [makeSite({ lat: 32.0, lng: 51.0 })];
    const flights = [
      makeFlight({
        id: 'uid-close',
        lat: 32.0,
        lng: 51.0, // 0km away
        label: 'CLOSE',
        data: { unidentified: true, heading: 90 },
      } as Partial<FlightEntity>),
      makeFlight({
        id: 'uid-medium',
        lat: 32.2,
        lng: 51.0, // ~22km away
        label: 'MEDIUM',
        data: { unidentified: true, heading: 180 },
      } as Partial<FlightEntity>),
    ];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toHaveLength(1);
    expect(result[0].flightId).toBe('uid-close');
    expect(result[0].flightLabel).toBe('CLOSE');
  });

  it('includes heading from flight data', () => {
    const flights = [
      makeFlight({
        id: 'uid-heading',
        lat: 32.0,
        lng: 51.0,
        label: 'HEADING',
        data: { unidentified: true, heading: 145 },
      } as Partial<FlightEntity>),
    ];
    const sites = [makeSite()];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBe(145);
  });

  it('includes null heading when flight has no heading', () => {
    const flights = [
      makeFlight({
        id: 'uid-no-heading',
        lat: 32.0,
        lng: 51.0,
        label: 'NO_HEADING',
        data: { unidentified: true, heading: null },
      } as Partial<FlightEntity>),
    ];
    const sites = [makeSite()];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toHaveLength(1);
    expect(result[0].heading).toBeNull();
  });

  it('returns alerts sorted by distanceKm ascending', () => {
    // PROXIMITY_THRESHOLD_KM is 5km, so both sites must be within 5km of the flight
    const sites = [
      makeSite({ id: 'site-near', lat: 32.0, lng: 51.0, label: 'Near Site' }),
      makeSite({ id: 'site-far', lat: 32.03, lng: 51.0, label: 'Far Site' }),
    ];
    // Flight at 32.01 is ~1.1km from site-near, ~2.2km from site-far -- both within 5km
    const flights = [
      makeFlight({
        id: 'uid-1',
        lat: 32.01,
        lng: 51.0,
        label: 'ALERT',
        data: { unidentified: true, heading: 0 },
      } as Partial<FlightEntity>),
    ];
    const result = computeProximityAlerts(flights, sites);
    expect(result).toHaveLength(2);
    expect(result[0].siteId).toBe('site-near');
    expect(result[1].siteId).toBe('site-far');
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
  });
});
