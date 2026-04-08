import { Redis } from '@upstash/redis';
import type { CacheResponse } from '../types.js';

/** Shared Upstash Redis client (REST-based, safe for serverless) */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** Internal storage shape persisted in Redis */
interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Unix ms
}

/** In-memory fallback cache for when Redis is unavailable */
const memCache = new Map<string, { data: unknown; fetchedAt: number }>();

/**
 * Hard timeout (ms) for a single Redis operation inside the safe wrappers.
 *
 * Upstash REST is synchronous from our perspective (HTTP fetch under the hood),
 * but the client retries internally on network errors. Under pathological
 * network partitions or misconfiguration the call can hang indefinitely — e.g.
 * when `UPSTASH_REDIS_REST_URL` is missing the client still attempts to fetch
 * and retries per its default retry policy, blocking the request thread.
 *
 * 2000 ms is an order of magnitude above a healthy Upstash RTT (~10-80 ms),
 * so it doesn't affect the happy path, but it caps the worst case and lets
 * the safe wrapper fall through to the in-memory cache.
 */
const REDIS_OP_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Read a cached value from Redis.
 *
 * Returns null if the key does not exist.
 * Returns { data, stale, lastFresh } — where `stale` is true when
 * the entry age exceeds `logicalTtlMs`.
 */
export async function cacheGet<T>(
  key: string,
  logicalTtlMs: number,
): Promise<CacheResponse<T> | null> {
  const entry = await redis.get<CacheEntry<T>>(key);
  if (!entry) return null;

  const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
  return {
    data: entry.data,
    stale,
    lastFresh: entry.fetchedAt,
  };
}

/**
 * Write a value to Redis with a hard TTL (seconds).
 *
 * The hard TTL should be generously larger than the logical TTL so that
 * stale-but-servable data remains available for upstream error fallback.
 */
export async function cacheSet<T>(key: string, data: T, redisTtlSec: number): Promise<void> {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  await redis.set(key, entry, { ex: redisTtlSec });
}

/**
 * Safe cache read with in-memory fallback.
 *
 * On Redis success: returns result and populates memCache.
 * On Redis failure: returns memCache entry with `degraded: true`.
 * On both miss: returns null.
 */
export async function cacheGetSafe<T>(
  key: string,
  logicalTtlMs: number,
): Promise<CacheResponse<T> | null> {
  try {
    const result = await withTimeout(
      cacheGet<T>(key, logicalTtlMs),
      REDIS_OP_TIMEOUT_MS,
      `cacheGet(${key})`,
    );
    if (result) {
      // Populate memCache on success
      memCache.set(key, { data: result.data, fetchedAt: result.lastFresh });
    }
    return result;
  } catch {
    // Redis failed or timed out -- try in-memory fallback
    const mem = memCache.get(key);
    if (mem) {
      return {
        data: mem.data as T,
        stale: true,
        lastFresh: mem.fetchedAt,
        degraded: true,
      };
    }
    return null;
  }
}

/**
 * Safe cache write to both Redis and in-memory fallback.
 *
 * Always writes to memCache regardless of Redis success.
 */
export async function cacheSetSafe<T>(key: string, data: T, redisTtlSec: number): Promise<void> {
  // Always update memCache first
  memCache.set(key, { data, fetchedAt: Date.now() });
  try {
    await withTimeout(cacheSet(key, data, redisTtlSec), REDIS_OP_TIMEOUT_MS, `cacheSet(${key})`);
  } catch {
    // Swallow Redis error or timeout -- memCache is already updated
  }
}
