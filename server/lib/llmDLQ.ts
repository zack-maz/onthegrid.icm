/**
 * Phase 27.4 D-30: Dead-letter queue for events that exhaust the retry budget.
 *
 * Bounded at 200 entries (DLQ_MAX) — oldest-by-timestamp eviction. 7-day
 * Redis TTL on the set; the TTL refreshes on every enqueue.
 *
 * Graceful degradation (D-29 / CLAUDE.md): every redis call is try/caught;
 * DLQ never throws out of the fire-and-forget block.
 */

import { redis } from '../cache/redis.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'llm-dlq' });

export const DLQ_KEY = 'events:llm-dlq';
const DLQ_TTL_SEC = 7 * 24 * 3600;
const DLQ_MAX = 200;
const LAST_ERROR_MAX_CHARS = 500; // Pitfall 7

export interface DLQEntry {
  id: string;
  // Phase 27.4.3 (D-09 + integration_points DLQ taxonomy): widened with four
  // v3:* failure modes for the free-claude-code routing cascade. Existing
  // 27.4 reasons preserved for v1/v2 paths and DLQ replay safety.
  reason:
    | 'zod_fail'
    | 'llm_null'
    | 'retry_exhausted'
    | 'timeout_watchdog'
    | 'v3:timeout_watchdog'
    | 'v3:malformed'
    | 'v3:max_tokens_truncation' // Phase 27.4.4 Plan 02 dev-pass — finish_reason=length OR JSON 'Unterminated string'
    | 'v3:schema_fail'
    | 'v3:rate_limit_exhaust'
    | 'v3:adaptive-retry-fail'; // Phase 27.4.4 D-04 — split-on-timeout retry budget exhaustion
  lastError: string;
  timestamp: number;
}

/** Parse a payload string that may be either JSON text or an already-parsed object. */
function parseEntry(raw: unknown): DLQEntry | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as DLQEntry;
    if (raw && typeof raw === 'object') return raw as DLQEntry;
    return null;
  } catch {
    return null;
  }
}

export async function enqueueDLQ(entry: DLQEntry): Promise<void> {
  const capped: DLQEntry = {
    ...entry,
    lastError: entry.lastError.slice(0, LAST_ERROR_MAX_CHARS),
  };
  const payload = JSON.stringify(capped);
  try {
    await redis.sadd(DLQ_KEY, payload);
    await redis.expire(DLQ_KEY, DLQ_TTL_SEC);
    const size = await redis.scard(DLQ_KEY);
    if (size > DLQ_MAX) {
      const all = await redis.smembers(DLQ_KEY);
      // WR-02: pair each raw member string with its parsed form, sort by
      // timestamp, and pass the ORIGINAL raw strings to srem. Re-serialising
      // via JSON.stringify(parsed) is unsafe because Upstash REST may not
      // round-trip byte-for-byte (key ordering, whitespace, number
      // precision), which would cause srem to silently no-op and the DLQ
      // would never shrink below DLQ_MAX.
      const withParsed = all
        .map((raw) => {
          const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
          return { raw: rawStr, parsed: parseEntry(raw) };
        })
        .filter((x): x is { raw: string; parsed: DLQEntry } => x.parsed !== null);
      withParsed.sort((a, b) => a.parsed.timestamp - b.parsed.timestamp);
      const toRemove = withParsed.slice(0, size - DLQ_MAX).map((x) => x.raw);
      if (toRemove.length > 0) await redis.srem(DLQ_KEY, ...toRemove);
    }
  } catch (err) {
    log.warn({ err, id: entry.id }, 'DLQ enqueue failed (redis unreachable)');
  }
}

export async function listDLQ(limit = 50): Promise<DLQEntry[]> {
  try {
    const all = await redis.smembers(DLQ_KEY);
    const parsed: DLQEntry[] = [];
    for (const s of all) {
      const p = parseEntry(s);
      if (p) parsed.push(p);
    }
    return parsed.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  } catch {
    return [];
  }
}

export async function countDLQ(): Promise<number> {
  try {
    return (await redis.scard(DLQ_KEY)) ?? 0;
  } catch {
    return 0;
  }
}
