#!/usr/bin/env node
/**
 * Phase 44 — one-off operator tool to reconcile the `events:url-liveness-count`
 * sidecar against the authoritative liveness keyspace.
 *
 * Why this exists: the sidecar has no TTL and only mutates on dead<->live
 * transitions + prune, so terminal-dead keys that expire on their TTL (or whose
 * events leave the daily probe set) leave the counter permanently over-stated.
 * Observed in prod as deadUrlCount=202 with ZERO live liveness keys, which made
 * the operator "Prune N dead events" button a no-op. The durable fix wires
 * reconcileDeadUrlCount() into the daily cron sweep + every prune; this script
 * applies the same repair immediately so prod doesn't have to wait for the next
 * sweep.
 *
 * Usage:
 *   # Dry-run (default): read current count + authoritative keyspace count, print, NO write.
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm \
 *     scripts/reconcile-deadurl-count.ts
 *
 *   # Commit: actually SET the sidecar to the authoritative count.
 *   node ... scripts/reconcile-deadurl-count.ts --commit
 */

import { redis } from '../server/cache/redis.js';
import {
  reconcileDeadUrlCount,
  URL_LIVENESS_COUNT_KEY,
  URL_LIVENESS_KEY_PREFIX,
} from '../server/lib/urlLiveness.js';

const commit = process.argv.includes('--commit');

async function scanTerminalDeadKeyCount(): Promise<number> {
  let cursor: string | number = '0';
  let total = 0;
  do {
    const reply = (await redis.scan(cursor, {
      match: `${URL_LIVENESS_KEY_PREFIX}*`,
      count: 200,
    })) as [string | number, string[]];
    cursor = reply[0];
    total += reply[1].length;
  } while (cursor !== '0' && cursor !== 0);
  return total;
}

async function main(): Promise<void> {
  const before = await redis.get(URL_LIVENESS_COUNT_KEY);
  const liveKeyCount = await scanTerminalDeadKeyCount();

  console.log('--- reconcile-deadurl-count ---');
  console.log(`mode:                     ${commit ? 'COMMIT' : 'DRY-RUN (no write)'}`);
  console.log(`sidecar count (before):   ${String(before)}`);
  console.log(`live url-liveness keys:   ${liveKeyCount}`);

  if (!commit) {
    console.log(
      '\nDry-run only. Re-run with --commit to SET the sidecar to the authoritative count.',
    );
    return;
  }

  const reconciled = await reconcileDeadUrlCount();
  const after = await redis.get(URL_LIVENESS_COUNT_KEY);
  console.log(`reconcileDeadUrlCount():  ${String(reconciled)}`);
  console.log(`sidecar count (after):    ${String(after)}`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('reconcile-deadurl-count failed:', err);
  process.exit(1);
});
