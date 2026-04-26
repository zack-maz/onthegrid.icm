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
