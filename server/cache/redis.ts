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
    const result = await cacheGet<T>(key, logicalTtlMs);
    if (result) {
      // Populate memCache on success
      memCache.set(key, { data: result.data, fetchedAt: result.lastFresh });
    }
    return result;
  } catch {
    // Redis failed -- try in-memory fallback
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
    await cacheSet(key, data, redisTtlSec);
  } catch {
    // Swallow Redis error -- memCache is already updated
  }
}
