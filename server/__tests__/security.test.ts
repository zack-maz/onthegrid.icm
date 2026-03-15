// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { FlightEntity, ConflictEventEntity } from '../types.js';

// Mock config module with test credentials
vi.mock('../config.js', () => ({
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: {
      clientId: 'SECRET_OPENSKY_CLIENT_ID',
      clientSecret: 'SECRET_OPENSKY_CLIENT_SECRET',
    },
    aisstream: {
      apiKey: 'SECRET_AISSTREAM_API_KEY',
    },
    acled: {
      email: 'SECRET_ACLED_EMAIL@example.com',
      password: 'SECRET_ACLED_PASSWORD',
    },
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: {
      clientId: 'SECRET_OPENSKY_CLIENT_ID',
      clientSecret: 'SECRET_OPENSKY_CLIENT_SECRET',
    },
    aisstream: {
      apiKey: 'SECRET_AISSTREAM_API_KEY',
    },
    acled: {
      email: 'SECRET_ACLED_EMAIL@example.com',
      password: 'SECRET_ACLED_PASSWORD',
    },
  }),
}));

// Mock the adapter modules to return test data without hitting upstream APIs
vi.mock('../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async (): Promise<FlightEntity[]> => [
    {
      id: 'flight-abc123',
      type: 'flight',
      lat: 35.6,
      lng: 51.5,
      timestamp: Date.now(),
      label: 'IRN1234',
      data: {
        icao24: 'abc123',
        callsign: 'IRN1234',
        originCountry: 'Iran',
        velocity: 250,
        heading: 180,
        altitude: 10000,
        onGround: false,
        verticalRate: -5.0,
      },
    },
  ]),
}));

vi.mock('../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

vi.mock('../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async (): Promise<ConflictEventEntity[]> => [
    {
      id: 'event-IRN12345',
      type: 'missile' as const,
      lat: 35.6892,
      lng: 51.389,
      timestamp: Date.now(),
      label: 'Explosions/Remote violence: Shelling/artillery/missile attack',
      data: {
        eventType: 'Explosions/Remote violence',
        subEventType: 'Shelling/artillery/missile attack',
        fatalities: 0,
        actor1: 'Military Forces of Iran',
        actor2: 'Unknown',
        notes: 'Test event',
        source: 'Test Source',
      },
    },
  ]),
}));

describe('Security: No credential leaks in API responses', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const { createApp } = await import('../index.js');
    const app = createApp();

    // Start on random port
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

  it('GET /api/flights response does not contain OpenSky credentials', async () => {
    const res = await fetch(`${baseUrl}/api/flights`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_OPENSKY_CLIENT_ID');
    expect(text).not.toContain('SECRET_OPENSKY_CLIENT_SECRET');
  });

  it('GET /api/ships response does not contain AISStream API key', async () => {
    const res = await fetch(`${baseUrl}/api/ships`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_AISSTREAM_API_KEY');
  });

  it('GET /api/events response does not contain ACLED credentials', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const text = await res.text();

    expect(text).not.toContain('SECRET_ACLED_EMAIL@example.com');
    expect(text).not.toContain('SECRET_ACLED_PASSWORD');
  });
});
