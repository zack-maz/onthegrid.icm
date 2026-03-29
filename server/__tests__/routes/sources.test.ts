// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';

// Mock rate limiter -- pass through for route tests
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimitMiddleware: _passThrough,
  rateLimiters: {
    flights: _passThrough, ships: _passThrough, events: _passThrough, news: _passThrough,
    markets: _passThrough, weather: _passThrough, sites: _passThrough, sources: _passThrough,
  },
}));

// Mock all adapter modules to prevent real network calls
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

vi.mock('../../adapters/adsb-exchange.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));

vi.mock('../../config.js', () => ({
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  }),
  getConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
  }),
}));

describe('Sources Route', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetModules();

    const { createApp } = await import('../../index.js');
    const app = createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
  });

  it('returns 200 with correct shape', async () => {
    process.env.OPENSKY_CLIENT_ID = 'test-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-secret';
    process.env.ADSB_EXCHANGE_API_KEY = 'test-key';

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('opensky');
    expect(body).toHaveProperty('adsb');
    expect(body).toHaveProperty('adsblol');
    expect(body.opensky).toHaveProperty('configured');
    expect(body.adsb).toHaveProperty('configured');
    expect(body.adsblol).toHaveProperty('configured');

    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
    delete process.env.ADSB_EXCHANGE_API_KEY;
  });

  it('adsblol.configured is always true', async () => {
    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.adsblol.configured).toBe(true);
  });

  it('opensky.configured is true when both env vars are set', async () => {
    process.env.OPENSKY_CLIENT_ID = 'test-id';
    process.env.OPENSKY_CLIENT_SECRET = 'test-secret';

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.opensky.configured).toBe(true);

    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.OPENSKY_CLIENT_SECRET;
  });

  it('opensky.configured is false when CLIENT_ID is missing', async () => {
    delete process.env.OPENSKY_CLIENT_ID;
    process.env.OPENSKY_CLIENT_SECRET = 'test-secret';

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.opensky.configured).toBe(false);

    delete process.env.OPENSKY_CLIENT_SECRET;
  });

  it('opensky.configured is false when CLIENT_SECRET is missing', async () => {
    process.env.OPENSKY_CLIENT_ID = 'test-id';
    delete process.env.OPENSKY_CLIENT_SECRET;

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.opensky.configured).toBe(false);

    delete process.env.OPENSKY_CLIENT_ID;
  });

  it('adsb.configured is true when ADSB_EXCHANGE_API_KEY is set', async () => {
    process.env.ADSB_EXCHANGE_API_KEY = 'test-key';

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.adsb.configured).toBe(true);

    delete process.env.ADSB_EXCHANGE_API_KEY;
  });

  it('adsb.configured is false when ADSB_EXCHANGE_API_KEY is missing', async () => {
    delete process.env.ADSB_EXCHANGE_API_KEY;

    const res = await fetch(`${baseUrl}/api/sources`);
    const body = await res.json();

    expect(body.adsb.configured).toBe(false);
  });
});
