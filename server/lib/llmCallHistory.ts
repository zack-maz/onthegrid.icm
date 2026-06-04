/**
 * Phase 39 OBS-FLIGHT-01 / -05 / -06 — Redis-backed LLM call-history ring.
 *
 * Dual-write companion to the in-memory `LLMPipelineProgress.callHistory`
 * (cap-20, lost on cold start). Every LLM call appended to the singleton is
 * also LPUSH'd here so the flight recorder survives Vercel Fluid Compute cold
 * starts and can group calls by `runId`.
 *
 * Bounded at 500 entries (`CALLS_MAX`) via native LTRIM eviction; 30d Redis
 * TTL (`CALLS_TTL_SEC`) refreshed on every append (D-02).
 *
 * Degrade-open (CLAUDE.md anti-pattern): every redis call is try/caught and
 * this module NEVER throws out of the fire-and-forget extraction pipeline. A
 * history-write failure must not break extraction (mirrors `llmDLQ.ts`,
 * `accrueShadowCost`, every `cacheSetSafe`).
 */

import { redis } from '../cache/redis.js';

import { llmProgress, type CallHistoryEntry } from './llmProgress.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'llm-call-history' });

/** Redis key for the call-history ring (LPUSH+LTRIM 500-cap, 30d TTL). */
export const CALLS_KEY = 'llm:calls:history';
const CALLS_MAX = 500;
const CALLS_TTL_SEC = 30 * 24 * 3600;

/**
 * Parse a list member that may be either JSON text or an already-deserialized
 * object. Upstash REST auto-deserializes some payloads, so a bare `JSON.parse`
 * throws on object members (Pitfall 3 — copied from `llmDLQ.ts` parseEntry).
 */
function parseEntry(raw: unknown): CallHistoryEntry | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as CallHistoryEntry;
    if (raw && typeof raw === 'object') return raw as CallHistoryEntry;
    return null;
  } catch {
    return null;
  }
}

/**
 * Append a call entry to `llm:calls:history` (newest at head). LTRIM keeps the
 * 500 newest; EXPIRE refreshes the 30d TTL. Degrade-open — never throws.
 */
export async function appendCallHistory(entry: CallHistoryEntry): Promise<void> {
  try {
    await redis.lpush(CALLS_KEY, JSON.stringify(entry)); // newest at head
    await redis.ltrim(CALLS_KEY, 0, CALLS_MAX - 1); // native bounded ring
    await redis.expire(CALLS_KEY, CALLS_TTL_SEC);
  } catch (err) {
    log.warn({ err }, 'callHistory append failed'); // observability-only — NEVER throw
  }
}

/**
 * Return up to `limit` call entries, newest first; on Redis failure returns [].
 * Members run through `parseEntry` (string-or-object) and nulls are filtered.
 */
export async function listCallHistory(limit = CALLS_MAX): Promise<CallHistoryEntry[]> {
  try {
    const raw = await redis.lrange(CALLS_KEY, 0, limit - 1);
    return raw.map((r) => parseEntry(r)).filter((x): x is CallHistoryEntry => x !== null);
  } catch {
    return [];
  }
}

/**
 * OBS-FLIGHT-06 cold-start hydration. On the first call after a cold start,
 * repopulate the empty in-memory `llmProgress.callHistory` singleton (cap 20)
 * from Redis, then flip a module-level flag so subsequent requests skip the
 * LRANGE. The flag is set FIRST (best-effort, never retry-loop, D-05).
 */
let callHistoryHydrated = false;
export async function hydrateCallHistoryIfCold(): Promise<void> {
  if (callHistoryHydrated) return;
  callHistoryHydrated = true; // set FIRST — best-effort, never retry-loop
  const fromRedis = await listCallHistory(20);
  if (fromRedis.length > 0 && (llmProgress.callHistory?.length ?? 0) === 0) {
    llmProgress.callHistory = fromRedis.slice(0, 20);
  }
}

/** Test-only: reset the module-level hydration flag between cases. */
export function __resetCallHistoryHydrationForTest(): void {
  callHistoryHydrated = false;
}
