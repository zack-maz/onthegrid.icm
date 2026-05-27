// @vitest-environment node
/**
 * Phase 27.4.4 D-20 Option B (RESEARCH §6) — CACHE_KEY_PREFIX wrapper tests.
 *
 * Verifies the Proxy on the exported `redis` instance prefixes keys when
 * CACHE_KEY_PREFIX is set, passes through unchanged when it isn't, skips
 * non-key methods (ping/dbsize), and prefixes all variadic key args for
 * del/unlink without touching member/value args (sadd/zadd/hset/hincrby).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const calls: Array<{ method: string; args: unknown[] }> = [];

vi.mock('@upstash/redis', () => {
  const stub =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push({ method: name, args });
      return null;
    };
  class FakeRedis {
    get = stub('get');
    set = stub('set');
    del = stub('del');
    sadd = stub('sadd');
    smembers = stub('smembers');
    srem = stub('srem');
    expire = stub('expire');
    hset = stub('hset');
    hincrby = stub('hincrby');
    zadd = stub('zadd');
    lpush = stub('lpush');
    lrange = stub('lrange');
    keys = stub('keys');
    ping = stub('ping');
    dbsize = stub('dbsize');
  }
  return { Redis: FakeRedis };
});

describe('redis CACHE_KEY_PREFIX wrapper', () => {
  const originalPrefix = process.env.CACHE_KEY_PREFIX;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    calls.length = 0;
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPrefix === undefined) delete process.env.CACHE_KEY_PREFIX;
    else process.env.CACHE_KEY_PREFIX = originalPrefix;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  });

  it('passes keys through unchanged when CACHE_KEY_PREFIX is unset', async () => {
    delete process.env.CACHE_KEY_PREFIX;
    const { redis } = await import('../../cache/redis.js');
    await redis.get('events:llm:v3');
    await redis.set('events:llm:v3', 'x');
    expect(calls[0]).toEqual({ method: 'get', args: ['events:llm:v3'] });
    expect(calls[1]).toEqual({ method: 'set', args: ['events:llm:v3', 'x'] });
  });

  it('passes keys through unchanged when CACHE_KEY_PREFIX is empty string', async () => {
    process.env.CACHE_KEY_PREFIX = '';
    const { redis } = await import('../../cache/redis.js');
    await redis.get('events:llm:v3');
    expect(calls[0]).toEqual({ method: 'get', args: ['events:llm:v3'] });
  });

  it('prefixes single-key methods (get/set/expire/lpush/lrange/keys/sadd/smembers)', async () => {
    process.env.CACHE_KEY_PREFIX = 'dev:';
    const { redis } = await import('../../cache/redis.js');
    await redis.get('events:llm:v3');
    await redis.set('events:llm:v3', 'x');
    await redis.expire('events:llm:v3', 60);
    await redis.lpush('events:llm-pipeline-audit', 'entry');
    await redis.lrange('events:llm-pipeline-audit', 0, 9);
    await redis.keys('events:*');
    await redis.sadd('events:llm-dlq', 'payload');
    await redis.smembers('events:llm-dlq');

    expect(calls[0].args[0]).toBe('dev:events:llm:v3');
    expect(calls[1].args[0]).toBe('dev:events:llm:v3');
    expect(calls[2].args[0]).toBe('dev:events:llm:v3');
    expect(calls[3].args[0]).toBe('dev:events:llm-pipeline-audit');
    expect(calls[4].args[0]).toBe('dev:events:llm-pipeline-audit');
    expect(calls[5].args[0]).toBe('dev:events:*');
    expect(calls[6].args[0]).toBe('dev:events:llm-dlq');
    expect(calls[7].args[0]).toBe('dev:events:llm-dlq');
  });

  it('does NOT prefix members/values/fields (sadd/srem/zadd/hincrby/hset payload args)', async () => {
    process.env.CACHE_KEY_PREFIX = 'dev:';
    const { redis } = await import('../../cache/redis.js');
    await redis.sadd('events:llm-dlq', 'payload-string-not-a-key');
    await redis.srem('events:llm-dlq', 'member-1', 'member-2');
    await redis.zadd('lineage:idx', { score: 1, member: 'event-id-not-a-key' });
    await redis.hincrby('llm:tokens:nvidia_nim', 'tokensIn', 100);
    await redis.hset('lineage:event-id', { hash: 'abc', model: 'qwen' });

    expect(calls[0].args).toEqual(['dev:events:llm-dlq', 'payload-string-not-a-key']);
    expect(calls[1].args).toEqual(['dev:events:llm-dlq', 'member-1', 'member-2']);
    expect(calls[2].args).toEqual(['dev:lineage:idx', { score: 1, member: 'event-id-not-a-key' }]);
    expect(calls[3].args).toEqual(['dev:llm:tokens:nvidia_nim', 'tokensIn', 100]);
    expect(calls[4].args).toEqual(['dev:lineage:event-id', { hash: 'abc', model: 'qwen' }]);
  });

  it('prefixes ALL string args for variadic key methods (del/unlink)', async () => {
    process.env.CACHE_KEY_PREFIX = 'dev:';
    const { redis } = await import('../../cache/redis.js');
    await redis.del('events:llm:v3', 'events:llm-pipeline-audit');
    expect(calls[0].args).toEqual(['dev:events:llm:v3', 'dev:events:llm-pipeline-audit']);
  });

  it('passes through non-key methods unchanged (ping/dbsize)', async () => {
    process.env.CACHE_KEY_PREFIX = 'dev:';
    const { redis } = await import('../../cache/redis.js');
    await redis.ping();
    await redis.dbsize();
    expect(calls[0]).toEqual({ method: 'ping', args: [] });
    expect(calls[1]).toEqual({ method: 'dbsize', args: [] });
  });

  it('cacheGet/cacheSet inherit prefixing via the wrapped redis instance', async () => {
    process.env.CACHE_KEY_PREFIX = 'dev:';
    const { cacheSet, cacheGet } = await import('../../cache/redis.js');
    await cacheSet('test-key', { foo: 'bar' }, 60);
    await cacheGet('test-key', 30_000);
    expect(calls[0].args[0]).toBe('dev:test-key');
    expect(calls[1].args[0]).toBe('dev:test-key');
  });
});
