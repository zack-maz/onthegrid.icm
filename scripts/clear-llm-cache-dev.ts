#!/usr/bin/env node
/**
 * Phase 27.4.4 Plan 02 dev-pass scratch helper. Clears LLM-related cache
 * keys so a fresh /api/events extraction kicks off. Uses the project's
 * redis wrapper so keys auto-prefix with CACHE_KEY_PREFIX (dev:) — never
 * touches prod keys even when .env.local points at PROD Upstash.
 *
 * Usage:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/clear-llm-cache-dev.ts
 *
 * After clearing, hit `curl http://localhost:3001/api/events` and the
 * fire-and-forget LLM extraction will trigger fresh.
 *
 * Safe to delete after Plan 02 dev-pass closes.
 */
import { redis } from '../server/cache/redis.js';

const KEYS = [
  'events:llm:v3',
  'events:llm:v2',
  'events:llm:v2:partial',
  'events:llm-dlq',
  'events:llm-process-ts', // cooldown — clearing forces shouldRunLLM=true
  'events:llm-summary:v3',
  'events:llm-summary:v2',
];

// Phase 27.4.4 Plan 02 dev-pass — also flush stale geocoder cache entries.
// SCAN is the right pattern for prefix-based deletion in Upstash; we batch
// del calls to avoid pagination quirks. A {miss: true} entry written by a
// prior hung run was poisoning Branch 3 for 30 days, falling all the way to
// the GDELT centroid for the affected hierarchies.
const GEOCODE_PATTERNS = ['geocode:fwd:constrained:v2:*', 'geocode:fwd:constrained:*'];

async function flushGeocodeKeys(): Promise<number> {
  let total = 0;
  for (const pattern of GEOCODE_PATTERNS) {
    let cursor: string | number = 0;
    do {
      const result = (await redis.scan(cursor, { match: pattern, count: 100 })) as [
        string,
        string[],
      ];
      cursor = result[0];
      const keys = result[1] ?? [];
      // Strip the cache prefix because redis wrapper auto-prepends it again.
      const prefix = process.env.CACHE_KEY_PREFIX ?? '';
      const stripped = keys.map((k) =>
        prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k,
      );
      for (const k of stripped) {
        try {
          const n = await redis.del(k);
          total += n;
        } catch {
          /* ignore individual failures */
        }
      }
    } while (cursor !== '0' && cursor !== 0);
  }
  return total;
}

async function main(): Promise<void> {
  console.log(`CACHE_KEY_PREFIX=${process.env.CACHE_KEY_PREFIX ?? '(unset)'}`);
  for (const k of KEYS) {
    try {
      const n = await redis.del(k);
      console.log(`  del ${k} → ${n}`);
    } catch (err) {
      console.log(`  del ${k} → ERROR ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log('Flushing geocoder cache (resolver miss-cache cleanup)...');
  const geocodeCount = await flushGeocodeKeys();
  console.log(`  cleared ${geocodeCount} geocode:fwd:constrained:* entries`);
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
