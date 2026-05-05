// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { WeatherGridPoint } from '../../types.js';

describe('Open-Meteo Adapter', () => {
  let fetchWeather: () => Promise<WeatherGridPoint[]>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
    const mod = await import('../../adapters/open-meteo.js');
    fetchWeather = mod.fetchWeather;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns array of WeatherGridPoint objects with lat, lng, temperature, windSpeed, windDirection', async () => {
    // Single-location response shape from Open-Meteo when querying multiple coords
    const makeResponse = (count: number) => {
      const results = Array.from({ length: count }, (_, i) => ({
        latitude: 15 + i,
        longitude: 30,
        current: {
          temperature_2m: 25 + i,
          wind_speed_10m: 10 + i,
          wind_direction_10m: 180 + i,
        },
      }));
      return new Response(JSON.stringify(results), { status: 200 });
    };

    const mockFetch = vi.mocked(globalThis.fetch);
    // Two requests (two latitude bands)
    mockFetch.mockResolvedValueOnce(makeResponse(14 * 41)); // band 1: lat 15-28, 14 lats * 41 lngs
    mockFetch.mockResolvedValueOnce(makeResponse(14 * 41)); // band 2: lat 29-42, 14 lats * 41 lngs

    const points = await fetchWeather();

    expect(points.length).toBeGreaterThan(0);
    const point = points[0];
    expect(point).toHaveProperty('lat');
    expect(point).toHaveProperty('lng');
    expect(point).toHaveProperty('temperature');
    expect(point).toHaveProperty('windSpeed');
    expect(point).toHaveProperty('windDirection');
    expect(typeof point.lat).toBe('number');
    expect(typeof point.lng).toBe('number');
    expect(typeof point.temperature).toBe('number');
    expect(typeof point.windSpeed).toBe('number');
    expect(typeof point.windDirection).toBe('number');
  });

  it('grid covers lat 15-42, lng 30-70 at 1-degree steps', async () => {
    const makeResponse = (count: number) => {
      const results = Array.from({ length: count }, (_, i) => ({
        latitude: 15 + Math.floor(i / 41),
        longitude: 30 + (i % 41),
        current: {
          temperature_2m: 25,
          wind_speed_10m: 10,
          wind_direction_10m: 180,
        },
      }));
      return new Response(JSON.stringify(results), { status: 200 });
    };

    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(makeResponse(14 * 41)); // band 1
    mockFetch.mockResolvedValueOnce(makeResponse(14 * 41)); // band 2

    const points = await fetchWeather();

    // lat 15..42 = 28 values, lng 30..70 = 41 values => 28 * 41 = 1148 grid points
    expect(points).toHaveLength(28 * 41);
  });

  it('splits into 2 requests (each under 1000 locations) and combines results', async () => {
    const makeResponse = (count: number) => {
      const results = Array.from({ length: count }, (_, i) => ({
        latitude: 15 + i,
        longitude: 30,
        current: {
          temperature_2m: 25,
          wind_speed_10m: 10,
          wind_direction_10m: 180,
        },
      }));
      return new Response(JSON.stringify(results), { status: 200 });
    };

    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(makeResponse(5));
    mockFetch.mockResolvedValueOnce(makeResponse(3));

    await fetchWeather();

    // Must make exactly 2 fetch calls (2 latitude bands)
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify each URL contains the wind_speed_unit=kn parameter
    for (const call of mockFetch.mock.calls) {
      const url = call[0] as string;
      expect(url).toContain('api.open-meteo.com');
    }
  });

  it('throws on non-OK response from Open-Meteo', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    await expect(fetchWeather()).rejects.toThrow();
  });

  it('wind speed is in knots (wind_speed_unit=kn parameter)', async () => {
    const makeResponse = (count: number) => {
      const results = Array.from({ length: count }, () => ({
        latitude: 20,
        longitude: 40,
        current: {
          temperature_2m: 25,
          wind_speed_10m: 15,
          wind_direction_10m: 270,
        },
      }));
      return new Response(JSON.stringify(results), { status: 200 });
    };

    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(makeResponse(1));
    mockFetch.mockResolvedValueOnce(makeResponse(1));

    await fetchWeather();

    // Check that both requests include wind_speed_unit=kn
    for (const call of mockFetch.mock.calls) {
      const url = call[0] as string;
      expect(url).toContain('wind_speed_unit=kn');
    }
  });
});
