import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from './logger.js';

import type { SiteFilterStats } from '../adapters/overpass.js';
import type { SiteEntity } from '../types.js';

const log = logger.child({ module: 'sites-snapshot' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '../../src/data/sites.json');

/**
 * Phase 27.3.1 R-05 / R-07 — committed JSON snapshot of pre-normalized
 * infrastructure sites. Mirrors `server/lib/waterSnapshot.ts`. Runtime
 * resolution tier for /api/sites:
 *
 *   Redis → snapshot (this module) → (manual refresh: Overpass)
 *
 * This is the production cold-start floor. Refresh is manual (`npm run
 * refresh:sites`). Overpass is NEVER reached from a user-facing request:
 * on a cold Redis miss the snapshot serves the first hit and populates
 * Redis, taking Overpass off the synchronous request path entirely
 * (R-07 multi-user-resilience invariant from
 * `.planning/phases/27.3.1-water-facility-retry-and-cleanup/27.3.1-CONTEXT.md`
 * D-18 / D-25).
 *
 * The loader validates the top-level shape (generatedAt string, sites
 * array, stats object) and forces `stats.source = 'snapshot'` + refreshes
 * `stats.generatedAt` from the snapshot's own timestamp so DevApiStatus
 * provenance renders accurately regardless of what the refresh script
 * persisted (defensive layering matching waterSnapshot.ts).
 */
export interface SitesSnapshot {
  generatedAt: string;
  sites: SiteEntity[];
  stats: SiteFilterStats;
}

/** In-module cache. `undefined` = not yet loaded; `null` = load attempted and failed. */
let cachedSnapshot: SitesSnapshot | null | undefined = undefined;

/**
 * Load the committed sites snapshot. Returns null when the file does not
 * exist or fails structural validation. Cached in-module so subsequent
 * calls are O(1) — the snapshot is immutable at runtime.
 *
 * Exceptions (malformed JSON, read errors) are caught and logged as warnings;
 * the tier above (Overpass refresh) handles fallthrough on `?refresh=true`.
 */
export function loadSitesSnapshot(): SitesSnapshot | null {
  if (cachedSnapshot !== undefined) return cachedSnapshot;

  try {
    if (!existsSync(SNAPSHOT_PATH)) {
      log.info(
        { path: SNAPSHOT_PATH },
        'sites snapshot file absent; cold-start will hit Overpass on refresh',
      );
      cachedSnapshot = null;
      return null;
    }

    const raw = readFileSync(SNAPSHOT_PATH, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      log.warn({ err: parseErr, path: SNAPSHOT_PATH }, 'sites snapshot JSON parse failed');
      cachedSnapshot = null;
      return null;
    }

    if (!isValidSnapshot(parsed)) {
      log.warn({ path: SNAPSHOT_PATH }, 'sites snapshot failed structural validation; ignoring');
      cachedSnapshot = null;
      return null;
    }

    // R-05 D-30 parity — snapshot source overrides any persisted value, and
    // stats.generatedAt is re-derived from the snapshot's own top-level
    // generatedAt. Keeps provenance consistent even if the refresh script
    // accidentally persisted source='overpass' into the stats sub-object.
    const snapshot: SitesSnapshot = {
      generatedAt: parsed.generatedAt,
      sites: parsed.sites,
      stats: {
        ...parsed.stats,
        source: 'snapshot',
        generatedAt: parsed.generatedAt,
      },
    };

    log.info(
      { count: snapshot.sites.length, generatedAt: snapshot.generatedAt },
      'loaded sites snapshot',
    );
    cachedSnapshot = snapshot;
    return snapshot;
  } catch (err) {
    log.warn({ err, path: SNAPSHOT_PATH }, 'failed to load sites snapshot');
    cachedSnapshot = null;
    return null;
  }
}

/** Reset the in-module cache. Test-only. */
export function __resetSitesSnapshotCacheForTests(): void {
  cachedSnapshot = undefined;
}

/**
 * Structural validator. Checks the three top-level fields; inner shape is
 * trusted because the snapshot is produced by the refresh script running
 * the same typed `fetchSites()` pipeline as the route. Plan 07 threat model
 * T-27.3.1.07-03 disposition: mitigate via graceful fallthrough, not strict
 * parsing — a corrupt snapshot should serve Overpass on next refresh, not crash.
 */
function isValidSnapshot(v: unknown): v is SitesSnapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.generatedAt !== 'string') return false;
  if (!Array.isArray(o.sites)) return false;
  if (!o.stats || typeof o.stats !== 'object') return false;
  return true;
}
