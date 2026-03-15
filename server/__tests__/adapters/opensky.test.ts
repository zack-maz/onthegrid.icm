// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config module before importing adapter
vi.mock('../../config.js', () => ({
  config: {
    opensky: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    },
  },
}));

// Sample OpenSky state vector (array of 18 values per API docs)
// [0]=icao24, [1]=callsign, [2]=origin_country, [3]=time_position, [4]=last_contact,
// [5]=longitude, [6]=latitude, [7]=baro_altitude, [8]=on_ground, [9]=velocity,
// [10]=true_track, [11]=vertical_rate, [12]=sensors, [13]=geo_altitude, [14]=squawk,
// [15]=spi, [16]=position_source, [17]=category
const validState = [
  'abc123',    // [0] icao24
  'IRN1234 ',  // [1] callsign (with trailing space)
  'Iran',      // [2] origin_country
  1700000000,  // [3] time_position
  1700000005,  // [4] last_contact
  51.5,        // [5] longitude
  35.6,        // [6] latitude
  10000,       // [7] baro_altitude
  false,       // [8] on_ground
  250,         // [9] velocity
  180,         // [10] true_track
  -5.0,        // [11] vertical_rate
  null,        // [12] sensors
  10200,       // [13] geo_altitude
  '7700',      // [14] squawk
  false,       // [15] spi
  0,           // [16] position_source
  0,           // [17] category
];

const nullLatLngState = [
  'def456',   // [0] icao24
  'TEST ',    // [1] callsign
  'USA',      // [2] origin_country
  1700000000, // [3] time_position
  1700000005, // [4] last_contact
  null,       // [5] longitude -- NULL
  null,       // [6] latitude -- NULL
  null,       // [7] baro_altitude
  true,       // [8] on_ground
  0,          // [9] velocity
  0,          // [10] true_track
  0,          // [11] vertical_rate
  null,       // [12] sensors
  null,       // [13] geo_altitude
  null,       // [14] squawk
  false,      // [15] spi
  0,          // [16] position_source
  0,          // [17] category
];

describe('OpenSky Adapter', () => {
  let fetchFlights: typeof import('../../adapters/opensky.js').fetchFlights;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Reset module state (cached token) between tests
    vi.resetModules();
    const mod = await import('../../adapters/opensky.js');
    fetchFlights = mod.fetchFlights;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes OpenSky state vector arrays to FlightEntity objects', async () => {
    // First call: token request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    // Second call: states request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [validState] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    const flights = await fetchFlights(bbox);

    expect(flights).toHaveLength(1);
    const flight = flights[0];
    expect(flight.id).toBe('flight-abc123');
    expect(flight.type).toBe('flight');
    expect(flight.lat).toBe(35.6);
    expect(flight.lng).toBe(51.5);
    expect(flight.label).toBe('IRN1234');
    expect(flight.data.icao24).toBe('abc123');
    expect(flight.data.callsign).toBe('IRN1234');
    expect(flight.data.originCountry).toBe('Iran');
    expect(flight.data.velocity).toBe(250);
    expect(flight.data.heading).toBe(180);
    expect(flight.data.altitude).toBe(10000);
    expect(flight.data.onGround).toBe(false);
    expect(flight.data.verticalRate).toBe(-5.0);
  });

  it('filters out entries with null lat/lng', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [validState, nullLatLngState] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    const flights = await fetchFlights(bbox);

    expect(flights).toHaveLength(1);
    expect(flights[0].data.icao24).toBe('abc123');
  });

  it('makes authenticated request with bbox params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    await fetchFlights(bbox);

    // Second call should be the API request with auth header and bbox params
    const apiCall = mockFetch.mock.calls[1];
    const url = apiCall[0] as string;
    expect(url).toContain('lamin=25');
    expect(url).toContain('lamax=40');
    expect(url).toContain('lomin=44');
    expect(url).toContain('lomax=63.5');
    expect(apiCall[1].headers.Authorization).toBe('Bearer test-token');
  });

  it('caches OAuth2 token and reuses on second call', async () => {
    // First fetchFlights call: token + states
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    await fetchFlights(bbox);
    expect(mockFetch).toHaveBeenCalledTimes(2); // token + states

    // Second fetchFlights call: only states (token cached)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000001, states: [] }),
    });

    await fetchFlights(bbox);
    expect(mockFetch).toHaveBeenCalledTimes(3); // reused token, only 1 more call
  });

  it('does not leak API credentials in returned FlightEntity data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [validState] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    const flights = await fetchFlights(bbox);

    const serialized = JSON.stringify(flights);
    expect(serialized).not.toContain('test-client-id');
    expect(serialized).not.toContain('test-client-secret');
    expect(serialized).not.toContain('test-token');
  });

  it('uses callsign as label, falling back to icao24 when callsign is empty', async () => {
    const emptyCallsignState = [...validState];
    emptyCallsignState[1] = '       '; // blank callsign

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token', expires_in: 1800 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ time: 1700000000, states: [emptyCallsignState] }),
    });

    const bbox = { south: 25, north: 40, west: 44, east: 63.5 };
    const flights = await fetchFlights(bbox);

    expect(flights[0].label).toBe('abc123');
  });
});
