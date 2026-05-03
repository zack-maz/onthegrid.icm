import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from './logger.js';

import type { WaterFilterStats } from '../adapters/overpass-water.js';
import type { WaterFacility } from '../types.js';

const log = logger.child({ module: 'water-snapshot' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '../../src/data/water-facilities.json');

/**
 * Phase 27.3.1 R-04 / R-07 — committed JSON snapshot of pre-enriched water
 * facilities. The snapshot sits at the bottom of the runtime resolution tier:
 *
 *   Redis → devFileCache (dev only) → snapshot → (manual refresh: Overpass)
 *
 * This is the production cold-start floor. Refresh is manual (`npm run
 * refresh:water`) — the script regenerates the file, the developer reviews
 * the diff, the commit ships. Overpass is NEVER reached from a user-facing
 * request: on a cold Redis + missing dev cache, the snapshot serves the
 * first miss and populates Redis, taking Overpass off the synchronous
 * request path entirely (R-07 multi-user-resilience invariant from
 * `.planning/phases/27.3.1-water-facility-retry-and-cleanup/27.3.1-CONTEXT.md`
 * D-13 / D-25).
 *
 * The loader validates the top-level shape (generatedAt string, facilities
 * array, stats object) and forces `stats.source = 'snapshot'` + refreshes
 * `stats.generatedAt` from the snapshot's own timestamp so DevApiStatus
 * provenance renders accurately regardless of what the refresh script
 * persisted (defensive layering).
 */
export interface WaterSnapshot {
  generatedAt: string;
  facilities: WaterFacility[];
  stats: WaterFilterStats;
}

/** In-module cache. `undefined` = not yet loaded; `null` = load attempted and failed. */
let cachedSnapshot: WaterSnapshot | null | undefined = undefined;

/**
 * Load the committed water facility snapshot. Returns null when the file
 * does not exist or fails structural validation. Cached in-module so
 * subsequent calls are O(1) — the snapshot is immutable at runtime.
 *
 * Exceptions (malformed JSON, read errors) are caught and logged as warnings;
 * the tier above (dev file cache / Overpass refresh) handles fallthrough.
 */
export function loadWaterSnapshot(): WaterSnapshot | null {
  if (cachedSnapshot !== undefined) return cachedSnapshot;

  try {
    if (!existsSync(SNAPSHOT_PATH)) {
      log.info(
        { path: SNAPSHOT_PATH },
        'water snapshot file absent; cold-start will fall through to Overpass',
      );
      cachedSnapshot = null;
      return null;
    }

    const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      log.warn({ err: parseErr, path: SNAPSHOT_PATH }, 'water snapshot JSON parse failed');
      cachedSnapshot = null;
      return null;
    }

    if (!isValidSnapshot(parsed)) {
      log.warn({ path: SNAPSHOT_PATH }, 'water snapshot failed structural validation; ignoring');
      cachedSnapshot = null;
      return null;
    }

    // R-08 D-30 — snapshot source overrides any persisted source value, and
    // stats.generatedAt is re-derived from the snapshot's own top-level
    // generatedAt. This keeps provenance consistent even if a refresh run
    // accidentally persisted source='overpass' into the stats sub-object.
    const snapshot: WaterSnapshot = {
      generatedAt: parsed.generatedAt,
      facilities: parsed.facilities,
      stats: {
        ...parsed.stats,
        source: 'snapshot',
        generatedAt: parsed.generatedAt,
      },
    };

    log.info(
      { count: snapshot.facilities.length, generatedAt: snapshot.generatedAt },
      'loaded water snapshot',
    );
    cachedSnapshot = snapshot;
    return snapshot;
  } catch (err) {
    log.warn({ err, path: SNAPSHOT_PATH }, 'failed to load water snapshot');
    cachedSnapshot = null;
    return null;
  }
}

/** Reset the in-module cache. Test-only. */
export function __resetSnapshotCacheForTests(): void {
  cachedSnapshot = undefined;
}

/**
 * Structural validator. Checks the three top-level fields; inner shape is
 * trusted because the snapshot is produced by the refresh script running
 * the same typed `fetchWaterFacilities()` pipeline as the route. Plan 05
 * threat model T-27.3.1.05-03 disposition: mitigate via graceful fallthrough,
 * not strict parsing — a corrupt snapshot should serve Overpass, not crash.
 */
function isValidSnapshot(v: unknown): v is WaterSnapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.generatedAt !== 'string') return false;
  if (!Array.isArray(o.facilities)) return false;
  if (!o.stats || typeof o.stats !== 'object') return false;
  return true;
}
