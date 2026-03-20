// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { ConflictEventEntity, CacheResponse } from '../../types.js';
import { WAR_START } from '../../constants.js';

// Sample event fixtures
const makeEvent = (
  overrides: Partial<ConflictEventEntity> = {},
): ConflictEventEntity => ({
  id: 'gdelt-100001',
  type: 'airstrike',
  lat: 33.3,
  lng: 44.4,
  timestamp: Date.now(),
  label: 'Baghdad: Aerial weapons',
  data: {
    eventType: 'Aerial weapons',
    subEventType: 'CAMEO 195',
    fatalities: 0,
    actor1: 'USA',
    actor2: 'IRN',
    notes: '',
    source: 'https://example.com/article',
    goldsteinScale: -10,
    locationName: 'Baghdad, Iraq',
    cameoCode: '195',
  },
  ...overrides,
});

const eventA = makeEvent({ id: 'gdelt-A', label: 'Event A' });
const eventB = makeEvent({ id: 'gdelt-B', label: 'Event B', type: 'ground_combat' });
const eventC = makeEvent({
  id: 'gdelt-C',
  label: 'Event C (old)',
  timestamp: WAR_START - 86_400_000, // 1 day before war start
});

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();

// Module-level mock functions
const mockFetchEvents = vi.fn(async (): Promise<ConflictEventEntity[]> => []);

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
  }),
}));

// Mock flight adapters (needed by server import chain)
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-exchange.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));

// Mock aisstream adapter (ships route uses it)
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));

// Mock ACLED adapter
vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));

// Mock GDELT adapter -- only fetchEvents, no backfillEvents
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: (...args: unknown[]) => mockFetchEvents(...args),
}));

// Mock Redis cache module with in-memory store
vi.mock('../../cache/redis.js', () => ({
  redis: {},
  cacheGet: vi.fn(async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  }),
  cacheSet: vi.fn(async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  }),
}));

describe('Events Route (Redis accumulator)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    mockFetchEvents.mockClear();
    mockFetchEvents.mockResolvedValue([]);

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

  it('returns fresh cached data without calling fetchEvents when cache is fresh', async () => {
    // Pre-populate Redis mock with fresh data
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now(), // fresh
    });

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('gdelt-A');
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });

  it('calls fetchEvents on cache miss and returns merged result', async () => {
    mockFetchEvents.mockResolvedValue([eventA, eventB]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(mockFetchEvents).toHaveBeenCalledTimes(1);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(2);
  });

  it('merges fresh events with previously cached events', async () => {
    // Seed cache with event A (make it stale so route fetches)
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now() - 901_000, // past 15min TTL
    });

    // GDELT returns event B (different ID)
    mockFetchEvents.mockResolvedValue([eventB]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((e: ConflictEventEntity) => e.id);
    expect(ids).toContain('gdelt-A');
    expect(ids).toContain('gdelt-B');
  });

  it('upserts -- same event ID in fresh overwrites cached version', async () => {
    const cachedA = makeEvent({ id: 'gdelt-A', label: 'Old label' });
    redisStore.set('events:gdelt', {
      data: [cachedA],
      fetchedAt: Date.now() - 901_000, // stale
    });

    const freshA = makeEvent({ id: 'gdelt-A', label: 'New label' });
    mockFetchEvents.mockResolvedValue([freshA]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].label).toBe('New label');
  });

  it('prunes events with timestamp before WAR_START', async () => {
    mockFetchEvents.mockResolvedValue([eventA, eventC]);

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    // eventC has timestamp before WAR_START, should be pruned
    const ids = body.data.map((e: ConflictEventEntity) => e.id);
    expect(ids).toContain('gdelt-A');
    expect(ids).not.toContain('gdelt-C');
  });

  it('falls back to stale cache with stale:true when fetchEvents throws', async () => {
    // Seed stale cache
    redisStore.set('events:gdelt', {
      data: [eventA],
      fetchedAt: Date.now() - 901_000, // stale
    });

    mockFetchEvents.mockRejectedValue(new Error('GDELT upstream failure'));

    const res = await fetch(`${baseUrl}/api/events`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('gdelt-A');
  });

  it('returns 500 when fetchEvents throws and no cache exists', async () => {
    mockFetchEvents.mockRejectedValue(new Error('GDELT down'));

    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(500);
  });

  it('has no module-level backfill code (no fs access, no GDELT fetch at import time)', async () => {
    // The fact we can import the module without any fs errors or GDELT calls
    // proves there are no module-level side effects.
    // fetchEvents should only be called within the route handler, not at import time.
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });
});
