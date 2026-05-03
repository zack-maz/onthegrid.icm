/**
 * Phase 27.4.3 D-13 — lineage drill-down storage (B-2 fix).
 *
 * Each enriched v3 event produces a lineage record at
 *   events:llm:v3:lineage:{eventId}    (HSET — 7d TTL)
 * tracked by an LRU sorted set:
 *   events:llm:v3:lineage-keys         (ZADD timestamp; cap 500 entries)
 *
 * Plan 04 DrillDownRow renders RecentEnrichedEvent.reasoningTrace + .lineageHash;
 * those two fields ARE populated here at write time and threaded back into
 * llmProgress.recentEvents by Task 4 (v3 extractor) — they are NOT optional
 * "if-Plan-02-populated" hand-waves.
 */
import crypto from 'node:crypto';

import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

const LINEAGE_KEY_PREFIX = 'events:llm:v3:lineage:';
const LINEAGE_INDEX_KEY = 'events:llm:v3:lineage-keys';
const LINEAGE_TTL_SEC = 7 * 24 * 3600;
const LINEAGE_MAX_ENTRIES = 500;

export interface LineagePayload {
  prompt: string; // full system + user prompt
  response: string; // raw LLM response (post-think-strip)
  parsed: unknown; // post-Zod-parse object
  coord: { lat: number; lng: number };
  provenance: string; // GeocodeProvenance enum value
  resolverPath: string; // which of the 6 resolver branches fired
  reasoningTrace: string; // <think>...</think> content (stripped from response)
  model: string; // e.g. 'moonshotai/kimi-k2.5'
}

/** sha256(prompt || model || eventId) — D-13 reproducibility hash. */
export function computeLineageHash(eventId: string, prompt: string, model: string): string {
  return crypto
    .createHash('sha256')
    .update(prompt)
    .update('|')
    .update(model)
    .update('|')
    .update(eventId)
    .digest('hex');
}

/**
 * Writes the lineage hash + indexes the key for LRU eviction. Returns the
 * computed lineageHash so the caller can stamp it onto the recentEvents entry.
 */
export async function appendLineage(
  eventId: string,
  payload: LineagePayload,
): Promise<{ lineageHash: string }> {
  const lineageHash = computeLineageHash(eventId, payload.prompt, payload.model);
  const key = `${LINEAGE_KEY_PREFIX}${eventId}`;
  const log = logger.child({ component: 'llm-lineage' });
  try {
    // HSET fields (Upstash REST supports object-form hset).
    await redis.hset(key, {
      prompt: payload.prompt.slice(0, 32_000), // safety bound; prompts ~10-15k typical
      response: payload.response.slice(0, 32_000),
      parsed: JSON.stringify(payload.parsed).slice(0, 32_000),
      coord: JSON.stringify(payload.coord),
      provenance: payload.provenance,
      resolverPath: payload.resolverPath,
      reasoningTrace: payload.reasoningTrace.slice(0, 8_000),
      model: payload.model,
      lineageHash,
      ts: String(Date.now()),
    });
    await redis.expire(key, LINEAGE_TTL_SEC);

    // LRU index: ZADD by timestamp, then ZREMRANGEBYRANK from oldest.
    // Newest entries have the highest scores; trim everything except the
    // top LINEAGE_MAX_ENTRIES (rank-by-score ascending => index 0 is oldest).
    await redis.zadd(LINEAGE_INDEX_KEY, { score: Date.now(), member: eventId });
    await redis.zremrangebyrank(LINEAGE_INDEX_KEY, 0, -LINEAGE_MAX_ENTRIES - 1);
    await redis.expire(LINEAGE_INDEX_KEY, LINEAGE_TTL_SEC);
  } catch (err) {
    log.warn({ err, eventId }, 'lineage append failed (redis unreachable)');
  }
  return { lineageHash };
}

export const __testing = {
  LINEAGE_KEY_PREFIX,
  LINEAGE_INDEX_KEY,
  LINEAGE_TTL_SEC,
  LINEAGE_MAX_ENTRIES,
};

// ---------------------------------------------------------------------------
// Phase 27.4.4 Plan 01 Task 7 (D-18) — group-level lineage pre-filter.
//
// Hash a GDELT EventGroup's stable identity (key + sorted(sourceUrls) +
// totalMentions) so the v3 extractor can short-circuit groups whose enriched
// output is already cached. Read-side only in 27.4.4 — the WRITE-side
// `redis.setex(GROUP_LINEAGE_KEY_PREFIX + hash, GROUP_LINEAGE_TTL_SEC, value)`
// lands in a future phase. For 27.4.4 the pre-filter only consumes pre-existing
// cache entries (e.g. seeded by external warm tooling or the snapshot script);
// a true write-through of every successful batch is held back so Plan 02
// Gate B telemetry stays comparable to pre-pre-filter runs.
//
// Default OFF via env.V3_LINEAGE_PREFILTER. Operator flips after Plan 02.
// ---------------------------------------------------------------------------

/** Read-side cache key for the group-lineage pre-filter. */
export const GROUP_LINEAGE_KEY_PREFIX = 'events:llm:v3:group-lineage:';

/** TTL for cached group lineage. 7 days mirrors per-event lineage TTL. */
export const GROUP_LINEAGE_TTL_SEC = 7 * 24 * 3600;

/**
 * Future write-side payload shape for the pre-filter cache. Defined here so
 * the (read-only) v3 extractor and any future writer agree on the on-disk
 * envelope. `event` is intentionally `unknown` — the v3 extractor parses it
 * through batchResponseV3.safeParse on read, which is cheaper than importing
 * EnrichedEventV3 here and creating a circular module dependency.
 */
export interface GroupLineageCachePayload {
  /** EnrichedEventV3 from a prior successful extract (writer's responsibility). */
  event: unknown;
  /** Unix-ms timestamp the writer captured when persisting. Used for in-app
   *  TTL gating before the Redis hard TTL fires (defense-in-depth). */
  ts: number;
}

/**
 * sha256(key || sorted(sourceUrls).join('|') || totalMentions) — group-stable
 * identity hash. Mentions count is included so the same upstream key with a
 * higher source count (i.e. more corroboration) recomputes a fresh hash and
 * triggers a re-extract rather than serving the lower-corroboration result.
 *
 * sourceUrls are sorted to defend against upstream ordering noise; the GDELT
 * pipeline does not guarantee deterministic URL ordering across days.
 */
export function computeGroupLineageHash(input: {
  key: string;
  sourceUrls: readonly string[];
  totalMentions: number;
}): string {
  const sortedUrls = [...input.sourceUrls].sort().join('|');
  return crypto
    .createHash('sha256')
    .update(input.key)
    .update('|')
    .update(sortedUrls)
    .update('|')
    .update(String(input.totalMentions))
    .digest('hex');
}
