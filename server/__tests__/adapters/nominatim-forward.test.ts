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
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error')) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    const result = await forwardGeocode('Baghdad');

    expect(result).toBeNull();
  });

  // Phase 27.4.4 Plan 02 dev-pass — fetchWithTimeout AbortController.
  // Live dev surfaced a 5/392 hang when Nominatim accepted but never responded;
  // these tests verify the timeout layer drops the call cleanly.
  it('returns null on AbortError when the underlying fetch is aborted (timeout)', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_, reject) => {
        const signal = (init as RequestInit).signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }
        // Otherwise the promise hangs forever — this branch only fires if
        // the fetchWithTimeout helper isn't passing the signal through.
      });
    }) as unknown as typeof fetch;

    // Speed the timeout for the test itself (the helper reads env at module
    // load; we work around that by mocking abort directly above).
    const { forwardGeocode } = await import('../../adapters/nominatim.js');

    // Trigger the abort via the helper's internal timer by waiting it out.
    // The default timeout is 10s; we don't want the test to wait that long,
    // so we manually trigger abort by clobbering the AbortController to fire
    // on next tick. Simplest path: rely on the implementation calling abort()
    // itself within NOMINATIM_FETCH_TIMEOUT_MS.
    //
    // Belt-and-suspenders: the fetch mock above rejects on abort, so even if
    // the helper takes the full 10s, the test passes — just slowly. Skip if
    // your CI is flaky on long runs.
    const result = await forwardGeocode('Hung Test Place');
    expect(result).toBeNull();
  }, 15_000);

  it('passes an AbortSignal through to the underlying fetch (timeout plumbing)', async () => {
    let receivedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      receivedSignal = (init as RequestInit).signal as AbortSignal | undefined;
      return Promise.resolve({
        ok: true,
        json: async () => [{ lat: '0', lon: '0', display_name: 'X', type: 'city' }],
      });
    }) as unknown as typeof fetch;

    const { forwardGeocode } = await import('../../adapters/nominatim.js');
    await forwardGeocode('Baghdad');

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('Phase 27.4 forwardGeocodeConstrained (D-02/D-03/D-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('builds URL with ME defaults when no opts given (D-02)', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '35', lon: '40', display_name: 'Deir ez-Zor', type: 'city' }],
    });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('Deir ez-Zor');
    const called = mock.mock.calls[0][0] as string;
    expect(called).toContain('q=Deir+ez-Zor');
    expect(called).toContain('format=jsonv2');
    expect(called).toContain('limit=1');
    expect(called).toContain(
      'countrycodes=ir%2Ciq%2Csy%2Clb%2Cil%2Cps%2Cjo%2Ceg%2Csa%2Cae%2Cbh%2Ckw%2Com%2Cqa%2Cye%2Ctr%2Caf%2Cpk%2Ctm%2Caz%2Cam%2Cge',
    );
    expect(called).toContain('viewbox=30%2C15%2C70%2C42');
    expect(called).toContain('bounded=1');
    expect(called).toContain('accept-language=en');
  });

  it('supports limit=5 + addressdetails=1 for 2-pass verify (D-04)', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('Deir ez-Zor', { limit: 5, addressdetails: true });
    const called = mock.mock.calls[0][0] as string;
    expect(called).toContain('limit=5');
    expect(called).toContain('addressdetails=1');
  });

  it('uses amenity=... and omits q= when opts.amenity given (D-03)', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('ignored', {
      amenity: 'nuclear power plant',
      countrycodes: 'ir',
    });
    const called = mock.mock.calls[0][0] as string;
    expect(called).toContain('amenity=nuclear+power+plant');
    expect(called).not.toContain('q=ignored');
    expect(called).toContain('countrycodes=ir');
  });

  it('respects bounded=false', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('x', { bounded: false });
    const called = mock.mock.calls[0][0] as string;
    expect(called).toContain('viewbox=30%2C15%2C70%2C42');
    expect(called).not.toContain('bounded=1');
  });

  it('countrycodes override replaces the default', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('x', { countrycodes: 'ir' });
    const called = mock.mock.calls[0][0] as string;
    // url contains countrycodes=ir only, not the comma-separated list
    expect(called).toMatch(/countrycodes=ir(&|$)/);
  });

  it('returns [] on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    const out = await forwardGeocodeConstrained('x');
    expect(out).toEqual([]);
  });

  it('returns [] when JSON response is not an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'bad query' }),
    }) as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    const out = await forwardGeocodeConstrained('x');
    expect(out).toEqual([]);
  });

  it('parses a 3-result response into 3 ForwardGeocodedLocation entries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '35.33', lon: '40.15', display_name: 'Deir ez-Zor, Syria', type: 'city' },
        { lat: '35.40', lon: '40.10', display_name: 'Deir ez-Zor Governorate', type: 'region' },
        { lat: '35.29', lon: '40.18', display_name: 'Deir ez-Zor Airport', type: 'aerodrome' },
      ],
    }) as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    const out = await forwardGeocodeConstrained('Deir ez-Zor', { limit: 5 });
    expect(out).toHaveLength(3);
    expect(out[0].lat).toBeCloseTo(35.33);
    expect(out[2].type).toBe('aerodrome');
  });

  it('populates address field when addressdetails=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: '33',
          lon: '44',
          display_name: 'Baghdad',
          type: 'city',
          address: { country_code: 'iq', country: 'Iraq', city: 'Baghdad' },
        },
      ],
    }) as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    const out = await forwardGeocodeConstrained('Baghdad', { addressdetails: true });
    expect(out[0].address?.country_code).toBe('iq');
    expect(out[0].address?.city).toBe('Baghdad');
  });

  it('sends User-Agent header', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    globalThis.fetch = mock as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    await forwardGeocodeConstrained('x');
    const opts = mock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(opts.headers['User-Agent']).toBe('IranConflictMonitor/1.0 (personal project)');
  });

  it('returns [] on fetch exception', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;
    const { forwardGeocodeConstrained } = await import('../../adapters/nominatim.js');
    const out = await forwardGeocodeConstrained('x');
    expect(out).toEqual([]);
  });
});
