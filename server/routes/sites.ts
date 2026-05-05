import { Router } from 'express';
import { z } from 'zod';

import { fetchSites, type SiteFilterStats } from '../adapters/overpass.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { SITES_CACHE_TTL } from '../config.js';
import { logger } from '../lib/logger.js';
import { loadSitesSnapshot } from '../lib/sitesSnapshot.js';
import { AppError } from '../middleware/errorHandler.js';
import { validateQuery } from '../middleware/validate.js';
import { sendValidated } from '../middleware/validateResponse.js';
import { sitesResponseSchema } from '../schemas/cacheResponse.js';

import type { SiteEntity } from '../types.js';

const log = logger.child({ module: 'sites' });

/**
 * Phase 27.3.1 Plan 11 G4 — Redis envelope shape, mirrors WaterCachePayload
 * in server/routes/water.ts.
 *
 * Pre-Plan-11 the SITES_KEY stored a bare SiteEntity[] and SiteFilterStats was
 * lost on cache writeback. Every cache-hit response then synthesized zero-
 * tally stats via buildEmptyFilterStats — DevApiStatus rendered all-zeros for
 * byType / byCountry / Overpass health ~10s after cold start (as soon as
 * Redis warmed from the snapshot).
 *
 * Post-Plan-11 both the sites AND the filterStats travel together inside the
 * envelope. The cache-hit response spreads `cached.data.filterStats` and
 * overrides `source: 'redis'` + `generatedAt: ISO(lastFresh)` so DevApiStatus
 * renders populated tallies with accurate provenance even though the stats
 * originally came from the snapshot that warmed Redis.
 *
 * Rollout: SITES_KEY bumped from 'sites:v2' to 'sites:v3' to force a cold-
 * fill on deploy. The old key becomes orphaned and expires via its 72h hard
 * Redis TTL. No runtime shape-guard code required — the bump guarantees
 * pre-bump payloads are never read by post-bump code.
 */
type SitesCachePayload = {
  sites: SiteEntity[];
  filterStats: SiteFilterStats;
};

/** Zod schema for /api/sites query params */
const sitesQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/**
 * Phase 27.3.1 Plan 11 G4 — Redis key bumped from 'sites:v2' to 'sites:v3'
 * so post-deploy reads cold-miss and write the new envelope shape from
 * scratch. The old v2 key orphans and expires naturally under its 72h hard
 * Redis TTL.
 */
const SITES_KEY = 'sites:v3';

/** Logical TTL in ms -- 24 hours for static site data */
const LOGICAL_TTL_MS = SITES_CACHE_TTL;

/** Hard Redis TTL in seconds -- 3 days fallback window */
const REDIS_TTL_SEC = 259_200;

/**
 * Phase 27.3.1 R-05 D-30 parity — minimal filterStats stub for response paths
 * that don't have a fresh fetchSites() result to attach.
 *
 * Plan 11 G4 note: this helper is NO LONGER invoked on Redis cache-hit
 * branches — those now spread the cached envelope's filterStats instead.
 * Retained only for defensive reuse; the sole remaining call site in this
 * file post-Plan-11 is the error-without-cache branch, which throws 502
 * instead of returning a body so buildEmptyFilterStats isn't actually
 * invoked there either. Kept for Plan-12+ future paths that may need an
 * empty stub.
 */
function buildEmptyFilterStats(
  source: 'snapshot' | 'redis' | 'overpass',
  generatedAt: string,
): SiteFilterStats {
  return {
    rawCount: 0,
    filteredCount: 0,
    rejections: { excluded_turkey: 0, no_coords: 0, no_type: 0, duplicate: 0 },
    byCountry: {},
    byType: {},
    overpass: [],
    source,
    generatedAt,
  };
}
// Reference buildEmptyFilterStats to avoid unused-export warnings — retained
// for future defensive paths; the Plan 11 main + error branches now spread
// the cached filterStats directly.
void buildEmptyFilterStats;

export const sitesRouter = Router();

/**
 * GET /api/sites
 * Returns infrastructure sites (nuclear, naval, oil, airbase, port).
 *
 * Phase 27.3.1 R-07 multi-user-resilience invariant:
 *   Redis is the canonical source of truth for user requests.
 *   The committed snapshot (src/data/sites.json, R-05 D-16..D-18) sits
 *   behind Redis as the production cold-start floor.
 *   The Overpass API is NEVER on a synchronous user-request path in
 *   production — cold-start misses are served from the snapshot, which
 *   populates Redis on the first hit. From that point on, Overpass is
 *   reachable only via `npm run refresh:sites` (a manual developer action)
 *   or a legacy `?refresh=true` query param.
 *   See Phase 27.3.1 R-04 / R-05 / R-07 and CONTEXT.md D-16..D-18, D-25..D-27.
 *
 * Tier order on a standard GET (forceRefresh=false):
 *   1. Redis (24h logical TTL — `sites:v3` post-Plan-11)
 *   2. Committed snapshot (src/data/sites.json — R-05)
 *   3. Overpass API (only when both above miss AND refresh gate permits)
 */
sitesRouter.get('/', validateQuery(sitesQuerySchema), async (_req, res) => {
  const { refresh: forceRefresh } = res.locals.validatedQuery as z.infer<typeof sitesQuerySchema>;
  const cached = await cacheGetSafe<SitesCachePayload>(SITES_KEY, LOGICAL_TTL_MS);

  if (cached && !cached.stale && !forceRefresh) {
    // Phase 27.3.1 Plan 11 G4 — spread the cached filterStats envelope and
    // override provenance. The cached stats originally came from whichever
    // tier warmed Redis (usually snapshot); the byType / byCountry / overpass /
    // rejections tallies round-trip unchanged. `source='redis'` reports the
    // SERVE tier to DevApiStatus, not the origin tier.
    const payload = cached.data;
    return sendValidated(res, sitesResponseSchema, {
      data: payload.sites,
      stale: cached.stale,
      lastFresh: cached.lastFresh,
      filterStats: {
        ...payload.filterStats,
        source: 'redis' as const,
        generatedAt: new Date(cached.lastFresh).toISOString(),
      },
    });
  }

  // Tier 2 — committed JSON snapshot (R-05 D-16..D-18).
  //   Cold Redis → read snapshot → populate Redis → serve with source='snapshot'.
  //   Keeps Overpass off the synchronous user-request path entirely.
  //
  //   Plan 11 G4: persist snapshot.stats alongside the sites so the first
  //   cache-hit post-snapshot-warm has real byType / byCountry / overpass data
  //   instead of synthesized zeros.
  if (!forceRefresh) {
    const snapshot = loadSitesSnapshot();
    if (snapshot) {
      await cacheSetSafe(
        SITES_KEY,
        { sites: snapshot.sites, filterStats: snapshot.stats },
        REDIS_TTL_SEC,
      );
      log.info(
        { count: snapshot.sites.length, generatedAt: snapshot.generatedAt },
        'serving sites from committed snapshot; Overpass untouched',
      );
      return sendValidated(res, sitesResponseSchema, {
        data: snapshot.sites,
        stale: false,
        lastFresh: Date.now(),
        filterStats: snapshot.stats, // source='snapshot' already forced in loadSitesSnapshot
      });
    }
  }

  try {
    const { sites, stats } = await fetchSites();
    // Plan 11 G4: persist the full envelope so DevApiStatus observability
    // survives the Redis round trip.
    await cacheSetSafe(SITES_KEY, { sites, filterStats: stats }, REDIS_TTL_SEC);
    sendValidated(res, sitesResponseSchema, {
      data: sites,
      stale: false,
      lastFresh: Date.now(),
      filterStats: stats,
    });
  } catch (err) {
    log.error({ err }, 'Overpass error');
    if (cached) {
      // Phase 27.3.1 Plan 11 G4 — serving stale cache after upstream error.
      // Spread the cached filterStats envelope so DevApiStatus renders real
      // tallies on error-degraded responses too (pre-Plan-11 this was
      // buildEmptyFilterStats, which zeroed R-05 observability under stress).
      const payload = cached.data;
      sendValidated(res, sitesResponseSchema, {
        data: payload.sites,
        stale: true,
        lastFresh: cached.lastFresh,
        filterStats: {
          ...payload.filterStats,
          source: 'redis' as const,
          generatedAt: new Date(cached.lastFresh).toISOString(),
        },
      });
    } else {
      // Unchanged — sites throws 502 on full failure (different from water
      // which degrades to an empty array). No stats to attach at 502 anyway.
      throw new AppError(502, 'UPSTREAM_FAIL', `overpass fetch failed: ${(err as Error).message}`);
    }
  }
});
