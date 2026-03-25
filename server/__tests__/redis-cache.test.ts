// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In-memory store backing the mock Redis
const store = new Map<string, unknown>();

vi.mock('@upstash/redis', () => {
  class Redis {
    async get<T>(key: string): Promise<T | null> {
      const val = store.get(key);
      return (val as T) ?? null;
    }
    async set(
      key: string,
      value: unknown,
      opts?: { ex?: number },
    ): Promise<'OK'> {
      void opts; // Redis TTL not tracked in mock
      store.set(key, value);
      return 'OK';
    }
  }
  return { Redis };
});

describe('Redis cache helpers', () => {
  beforeEach(() => {
    store.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cacheGet returns null when key does not exist', async () => {
    const { cacheGet } = await import('../cache/redis.js');
    const result = await cacheGet('nonexistent', 10_000);
    expect(result).toBeNull();
  });

  it('cacheGet returns { stale: false } when data is within logical TTL', async () => {
    const { cacheGet, cacheSet } = await import('../cache/redis.js');
    const now = Date.now();

    await cacheSet('test:fresh', ['a', 'b'], 100);

    const result = await cacheGet<string[]>('test:fresh', 10_000);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(['a', 'b']);
    expect(result!.stale).toBe(false);
    expect(result!.lastFresh).toBeGreaterThanOrEqual(now);
  });

  it('cacheGet returns { stale: true } when data exceeds logical TTL', async () => {
    const { cacheGet, cacheSet } = await import('../cache/redis.js');

    await cacheSet('test:stale', ['old'], 100);

    // Advance past the 10s logical TTL
    vi.advanceTimersByTime(10_001);

    const result = await cacheGet<string[]>('test:stale', 10_000);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(['old']);
    expect(result!.stale).toBe(true);
  });

  it('cacheSet stores { data, fetchedAt } with redis set call', async () => {
    const { cacheSet } = await import('../cache/redis.js');

    await cacheSet('test:store', { foo: 'bar' }, 60);

    const stored = store.get('test:store') as { data: unknown; fetchedAt: number };
    expect(stored).toBeDefined();
    expect(stored.data).toEqual({ foo: 'bar' });
    expect(typeof stored.fetchedAt).toBe('number');
  });

  it('module exports cacheGet, cacheSet, and redis client', async () => {
    const mod = await import('../cache/redis.js');
    expect(typeof mod.cacheGet).toBe('function');
    expect(typeof mod.cacheSet).toBe('function');
    expect(mod.redis).toBeDefined();
  });
});

describe('cacheGetSafe / cacheSetSafe (in-memory fallback)', () => {
  let shouldThrow = false;

  beforeEach(() => {
    store.clear();
    shouldThrow = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cacheGetSafe returns Redis data and populates memCache on success', async () => {
    const { cacheSetSafe, cacheGetSafe } = await import('../cache/redis.js');
    await cacheSetSafe('safe:test', ['x', 'y'], 100);

    const result = await cacheGetSafe<string[]>('safe:test', 10_000);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(['x', 'y']);
    expect(result!.stale).toBe(false);
    expect(result!.degraded).toBeUndefined();
  });

  it('cacheGetSafe returns memCache data with degraded:true when Redis throws', async () => {
    const { cacheSetSafe, cacheGetSafe, redis: redisClient } = await import('../cache/redis.js');

    // Populate via normal path first (writes to both Redis and memCache)
    await cacheSetSafe('safe:fallback', { val: 42 }, 100);

    // Now make Redis throw on get
    const origGet = redisClient.get.bind(redisClient);
    vi.spyOn(redisClient, 'get').mockRejectedValue(new Error('Connection refused'));

    const result = await cacheGetSafe<{ val: number }>('safe:fallback', 10_000);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual({ val: 42 });
    expect(result!.degraded).toBe(true);
    expect(result!.stale).toBe(true);

    // Restore
    vi.mocked(redisClient.get).mockImplementation(origGet);
  });

  it('cacheGetSafe returns null when both Redis and memCache miss', async () => {
    const { cacheGetSafe, redis: redisClient } = await import('../cache/redis.js');

    // Redis throws, memCache empty
    vi.spyOn(redisClient, 'get').mockRejectedValue(new Error('Down'));

    const result = await cacheGetSafe<string>('nonexistent:key', 10_000);
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it('cacheSetSafe writes to both Redis and memCache', async () => {
    const { cacheSetSafe, cacheGetSafe, redis: redisClient } = await import('../cache/redis.js');

    await cacheSetSafe('safe:dual', [1, 2, 3], 60);

    // Verify Redis has it
    const fromRedis = await cacheGetSafe<number[]>('safe:dual', 10_000);
    expect(fromRedis!.data).toEqual([1, 2, 3]);

    // Now make Redis fail -- should still get from memCache
    vi.spyOn(redisClient, 'get').mockRejectedValue(new Error('Down'));
    const fromMem = await cacheGetSafe<number[]>('safe:dual', 10_000);
    expect(fromMem!.data).toEqual([1, 2, 3]);
    expect(fromMem!.degraded).toBe(true);

    vi.restoreAllMocks();
  });

  it('cacheSetSafe survives Redis failure (memCache still updated)', async () => {
    const { cacheSetSafe, cacheGetSafe, redis: redisClient } = await import('../cache/redis.js');

    // Make Redis set throw
    vi.spyOn(redisClient, 'set').mockRejectedValue(new Error('Down'));
    vi.spyOn(redisClient, 'get').mockRejectedValue(new Error('Down'));

    // Should NOT throw despite Redis being down
    await expect(cacheSetSafe('safe:survive', 'data', 60)).resolves.toBeUndefined();

    // memCache should have the data -- but since Redis.get also fails, we get degraded
    const result = await cacheGetSafe<string>('safe:survive', 10_000);
    expect(result).not.toBeNull();
    expect(result!.data).toBe('data');
    expect(result!.degraded).toBe(true);

    vi.restoreAllMocks();
  });

  it('module exports cacheGetSafe and cacheSetSafe', async () => {
    const mod = await import('../cache/redis.js');
    expect(typeof mod.cacheGetSafe).toBe('function');
    expect(typeof mod.cacheSetSafe).toBe('function');
  });
});
