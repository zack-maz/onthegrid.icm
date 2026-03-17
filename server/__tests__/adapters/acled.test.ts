// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config module before importing adapter
vi.mock('../../config.js', () => ({
  config: {
    acled: {
      email: 'test@example.com',
      password: 'test-password-secret',
    },
  },
}));

// Sample ACLED event record
const sampleMissileEvent = {
  event_id_cnty: 'IRN12345',
  event_date: '2026-03-10',
  event_type: 'Explosions/Remote violence',
  sub_event_type: 'Shelling/artillery/missile attack',
  actor1: 'Military Forces of Iran',
  actor2: 'Unidentified Armed Group',
  country: 'Iran',
  latitude: '35.6892',
  longitude: '51.3890',
  fatalities: '3',
  notes: 'Missile strike reported in Tehran area',
  source: 'Reuters',
  geo_precision: '1',
};

const sampleDroneEvent = {
  event_id_cnty: 'IRN12346',
  event_date: '2026-03-11',
  event_type: 'Explosions/Remote violence',
  sub_event_type: 'Air/drone strike',
  actor1: 'Military Forces of Iran',
  actor2: 'Unidentified',
  country: 'Iran',
  latitude: '32.6546',
  longitude: '51.6680',
  fatalities: '0',
  notes: 'Drone strike reported near Isfahan',
  source: 'ISNA',
  geo_precision: '2',
};

describe('ACLED Adapter', () => {
  let fetchEvents: typeof import('../../adapters/acled.js').fetchEvents;
  let GREATER_MIDDLE_EAST_COUNTRIES: typeof import('../../adapters/acled.js').GREATER_MIDDLE_EAST_COUNTRIES;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Reset module state between tests
    vi.resetModules();
    const mod = await import('../../adapters/acled.js');
    fetchEvents = mod.fetchEvents;
    GREATER_MIDDLE_EAST_COUNTRIES = mod.GREATER_MIDDLE_EAST_COUNTRIES;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes ACLED event to ConflictEventEntity', async () => {
    // Token request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    // Events request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [sampleMissileEvent] }),
    });

    const events = await fetchEvents();

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.id).toBe('event-IRN12345');
    expect(event.type).toBe('missile');
    expect(event.lat).toBe(35.6892);
    expect(event.lng).toBe(51.389);
    expect(event.label).toContain('Explosions/Remote violence');
    expect(event.data.eventType).toBe('Explosions/Remote violence');
    expect(event.data.subEventType).toBe('Shelling/artillery/missile attack');
    expect(event.data.fatalities).toBe(3);
    expect(event.data.actor1).toBe('Military Forces of Iran');
    expect(event.data.actor2).toBe('Unidentified Armed Group');
    expect(event.data.notes).toBe('Missile strike reported in Tehran area');
    expect(event.data.source).toBe('Reuters');
  });

  it('classifies "Shelling/artillery/missile attack" as missile type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [sampleMissileEvent] }),
    });

    const events = await fetchEvents();
    expect(events[0].type).toBe('missile');
  });

  it('classifies "Air/drone strike" as drone type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [sampleDroneEvent] }),
    });

    const events = await fetchEvents();
    expect(events[0].type).toBe('drone');
  });

  it('requests last 7 days of Greater Middle East data (16 countries)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [] }),
    });

    await fetchEvents();

    // Second call is the data request
    const dataCall = mockFetch.mock.calls[1];
    const url = dataCall[0] as string;
    const decodedUrl = decodeURIComponent(url);

    // Verify multi-country query (pipe-separated)
    // URLSearchParams encodes spaces as '+', so decode those too
    const fullyDecoded = decodedUrl.replace(/\+/g, ' ');
    for (const country of ['Iran', 'Iraq', 'Syria', 'Turkey', 'Saudi Arabia']) {
      expect(fullyDecoded).toContain(country);
    }
    expect(fullyDecoded).toContain('|'); // pipe-separated countries
    expect(decodedUrl).toContain('2026-03-08');
    expect(decodedUrl).toContain('2026-03-15');
    expect(decodedUrl).toContain('event_date_where=BETWEEN');
    expect(dataCall[1].headers.Authorization).toBe('Bearer acled-token');
  });

  it('GREATER_MIDDLE_EAST_COUNTRIES includes 16 pipe-separated countries', () => {
    const countries = GREATER_MIDDLE_EAST_COUNTRIES.split('|');
    expect(countries).toHaveLength(16);
    expect(countries).toContain('Iran');
    expect(countries).toContain('Iraq');
    expect(countries).toContain('Syria');
    expect(countries).toContain('Turkey');
    expect(countries).toContain('Saudi Arabia');
    expect(countries).toContain('Yemen');
    expect(countries).toContain('Oman');
    expect(countries).toContain('United Arab Emirates');
    expect(countries).toContain('Qatar');
    expect(countries).toContain('Bahrain');
    expect(countries).toContain('Kuwait');
    expect(countries).toContain('Jordan');
    expect(countries).toContain('Israel');
    expect(countries).toContain('Lebanon');
    expect(countries).toContain('Afghanistan');
    expect(countries).toContain('Pakistan');
  });

  it('does not leak API credentials in returned ConflictEventEntity data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [sampleMissileEvent, sampleDroneEvent] }),
    });

    const events = await fetchEvents();

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('test@example.com');
    expect(serialized).not.toContain('test-password-secret');
    expect(serialized).not.toContain('acled-token');
  });

  it('caches OAuth2 token and reuses on second call', async () => {
    // First call: token + data
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'acled-token', expires_in: 86400 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [] }),
    });

    await fetchEvents();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call: only data (token cached)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 200, success: true, data: [] }),
    });

    await fetchEvents();
    expect(mockFetch).toHaveBeenCalledTimes(3); // reused token
  });
});
