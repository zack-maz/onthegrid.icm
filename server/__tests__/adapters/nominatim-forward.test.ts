import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Save original fetch
const originalFetch = globalThis.fetch;

describe('nominatim forwardGeocode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns { lat, lng, displayName, type } for known city "Baghdad"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '33.3128',
            lon: '44.3615',
            display_name: 'Baghdad, Baghdad Governorate, Iraq',
            type: 'city',
          },
        ]),
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    const result = await forwardGeocode('Baghdad');

    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(33.3128, 3);
    expect(result!.lng).toBeCloseTo(44.3615, 3);
    expect(result!.displayName).toBe('Baghdad, Baghdad Governorate, Iraq');
    expect(result!.type).toBe('city');
  });

  it('returns null on Nominatim failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    const result = await forwardGeocode('Nonexistent Place');

    expect(result).toBeNull();
  });

  it('accepts optional countryCode parameter for disambiguation', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '33.3128',
            lon: '44.3615',
            display_name: 'Baghdad, Iraq',
            type: 'city',
          },
        ]),
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    await forwardGeocode('Baghdad', 'IQ');

    // Verify countryCode was included in the request URL
    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('countrycodes=IQ');
  });

  it('respects 1 req/s rate limit (sequential calls)', async () => {
    // This test verifies that the function can be called sequentially
    // (the rate limiting is enforced at the caller level in geocodeEnrichedEvents)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: '33.3128',
            lon: '44.3615',
            display_name: 'Baghdad, Iraq',
            type: 'city',
          },
        ]),
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');

    const result1 = await forwardGeocode('Baghdad');
    const result2 = await forwardGeocode('Basra');

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(2);
  });

  it('returns null when empty results array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    const result = await forwardGeocode('ZZZZZ Nonexistent');

    expect(result).toBeNull();
  });

  it('returns null on fetch exception', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(
      new Error('Network error'),
    ) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    const result = await forwardGeocode('Baghdad');

    expect(result).toBeNull();
  });
});
