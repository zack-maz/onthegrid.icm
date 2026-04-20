import { z, type ZodTypeAny } from 'zod';

/**
 * Generic Zod schema for the `CacheResponse<T>` envelope that wraps every
 * cached API response in the server.
 *
 * Mirrors the OpenAPI `CacheResponseBase` allOf composition in
 * `server/openapi.yaml` lines 609-624 — kept deliberately loose on the
 * `data` payload so each route can specialize it with its own entity
 * schema (e.g. `cacheResponseSchema(z.array(flightEntitySchema))`).
 *
 * Fields:
 *  - `data`       — payload, shape varies per endpoint (caller supplies schema)
 *  - `stale`      — true when served from cache beyond its logical TTL
 *  - `lastFresh`  — Unix ms of last successful upstream fetch (0 when never fetched)
 *  - `rateLimited`— optional, set by flight route when upstream returns 429
 *  - `degraded`   — optional, set by cacheGetSafe when serving from memCache fallback
 */
export function cacheResponseSchema<S extends ZodTypeAny>(dataSchema: S) {
  return z.object({
    data: dataSchema,
    stale: z.boolean(),
    lastFresh: z.number(),
    rateLimited: z.boolean().optional(),
    degraded: z.boolean().optional(),
  });
}

// ---------- Entity payload schemas (simplified) ----------
//
// Each entity schema documents only the load-bearing fields checked in CI —
// anything else is `passthrough`ed so adding a new property in
// `server/types.ts` does not break validation until the schema is updated.
// This mirrors the intentionally-simplified OpenAPI surface area: documenting
// every nested property would duplicate the TypeScript type and create drift.

/** Minimal flight entity shape for response validation */
export const flightEntitySchema = z
  .object({
    id: z.string(),
    type: z.literal('flight'),
    lat: z.number(),
    lng: z.number(),
    timestamp: z.number(),
    label: z.string(),
    data: z
      .object({
        icao24: z.string(),
        callsign: z.string(),
        originCountry: z.string(),
        onGround: z.boolean(),
        unidentified: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

/** Minimal conflict event entity shape for response validation */
export const conflictEventEntitySchema = z
  .object({
    id: z.string(),
    type: z.enum(['airstrike', 'on_ground', 'explosion', 'targeted', 'other']),
    lat: z.number(),
    lng: z.number(),
    timestamp: z.number(),
    label: z.string(),
    data: z
      .object({
        eventType: z.string(),
        subEventType: z.string(),
        fatalities: z.number(),
        cameoCode: z.string(),
        // LLM-enriched fields (all optional, present when LLM processed)
        summary: z.string().optional(),
        casualties: z
          .object({
            killed: z.number().optional(),
            injured: z.number().optional(),
            unknown: z.boolean().optional(),
          })
          .optional(),
        precision: z.enum(['exact', 'neighborhood', 'city', 'region']).optional(),
        actors: z.array(z.string()).optional(),
        sourceCount: z.number().optional(),
        llmProcessed: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough();

/** Minimal water facility entity shape for response validation */
export const waterFacilityEntitySchema = z
  .object({
    id: z.string(),
    type: z.literal('water'),
    facilityType: z.enum(['dam', 'reservoir', 'desalination']),
    lat: z.number(),
    lng: z.number(),
    label: z.string(),
    osmId: z.number(),
    stress: z
      .object({
        compositeHealth: z.number(),
      })
      .passthrough(),
    capacity: z
      .object({
        height: z.number().optional(),
        volume: z.number().optional(),
        area: z.number().optional(),
      })
      .optional(),
    nearestCity: z
      .object({
        name: z.string(),
        distanceKm: z.number(),
        population: z.number(),
      })
      .optional(),
    linkedRiver: z
      .object({
        name: z.string(),
        distanceKm: z.number(),
      })
      .optional(),
    notabilityScore: z.number().optional(),
  })
  .passthrough();

/**
 * Phase 27.3.1 Plan 10 (G2) — `excluded_turkey` added as a required bucket
 * alongside the six pre-existing ones. The shape is used both in
 * `rejections` (summed) and as the inner value of `byTypeRejections`.
 * `.strict()` rejects unknown bucket names — only the explicitly-listed
 * seven keys are accepted, so a bucket-name typo or a future rename surfaces
 * as a validation failure rather than silent data loss.
 */
const rejectionsSchema = z
  .object({
    excluded_location: z.number(),
    excluded_turkey: z.number(),
    not_notable: z.number(),
    no_name: z.number(),
    no_resolved_name: z.number().int().nonnegative(),
    duplicate: z.number(),
    low_score: z.number(),
    no_city: z.number(),
  })
  .strict();

/** Phase 27.3.1 R-08 D-29 — Overpass fetch telemetry record. */
const overpassFetchRecordSchema = z.object({
  facilityType: z.string(),
  mirror: z.string(),
  status: z.number(),
  durationMs: z.number(),
  attempts: z.number(),
  ok: z.boolean(),
});

/**
 * Phase 27.3.1 R-08 — extended water filter stats schema. Mirrors the TS
 * interface in `server/adapters/overpass-water.ts` (`WaterFilterStats`).
 *
 * The wrapper is `.strict()` on the four new R-08 fields (D-28 byCountry,
 * D-29 overpass, D-30 source + generatedAt, D-31 byTypeRejections) so a
 * cached response that forgets to attach them fails validation rather than
 * silently dropping observability. The `.optional()` on the outer schema is
 * preserved to keep Phase 27.3 truth-21 behavior — pure-cached payloads with
 * NO `filterStats` key at all still validate.
 */
const waterFilterStatsSchema = z
  .object({
    rawCounts: z.record(z.string(), z.number()),
    filteredCounts: z.record(z.string(), z.number()),
    rejections: rejectionsSchema,
    // Phase 27.3.1 R-08 D-31
    byTypeRejections: z.record(z.string(), rejectionsSchema),
    // Phase 27.3.1 R-08 D-28
    byCountry: z.record(z.string(), z.record(z.string(), z.number())),
    // Phase 27.3.1 R-08 D-29
    overpass: z.array(overpassFetchRecordSchema),
    // Phase 27.3.1 R-08 D-30
    source: z.enum(['snapshot', 'redis', 'overpass']),
    generatedAt: z.string(),
    enrichment: z.object({
      withCapacity: z.number(),
      withCity: z.number(),
      withRiver: z.number(),
    }),
    scoreHistogram: z.array(z.object({ bucket: z.string(), count: z.number() })),
  })
  .strict()
  .optional();

// ---------- Sites schemas (Phase 27.3.1 R-05) ----------
//
// Sites mirror the water observability contract (R-08 D-28..D-31 applied to
// R-05 D-19). The `siteFilterStatsSchema` is the site-side parity of
// `waterFilterStatsSchema` with a narrower rejections bucket set (4 buckets
// specific to fetchSites: excluded_turkey, no_coords, no_type, duplicate).

/** Minimal site entity shape for response validation */
export const siteEntitySchema = z
  .object({
    id: z.string(),
    type: z.literal('site'),
    siteType: z.enum(['nuclear', 'naval', 'oil', 'airbase', 'port']),
    lat: z.number(),
    lng: z.number(),
    label: z.string(),
    operator: z.string().optional(),
    wikidata: z.string().optional(),
    osmId: z.number(),
  })
  .passthrough();

const siteRejectionsSchema = z.object({
  excluded_turkey: z.number(),
  no_coords: z.number(),
  no_type: z.number(),
  duplicate: z.number(),
});

/**
 * Phase 27.3.1 R-05 — site filter stats schema. Mirrors SiteFilterStats in
 * server/adapters/overpass.ts. `.strict()` guards against missing R-05 fields
 * once filterStats is present (same rationale as waterFilterStatsSchema).
 * Outer `.optional()` preserves back-compat with any response path that
 * doesn't attach filterStats.
 */
const siteFilterStatsSchema = z
  .object({
    rawCount: z.number(),
    filteredCount: z.number(),
    rejections: siteRejectionsSchema,
    byCountry: z.record(z.string(), z.record(z.string(), z.number())),
    byType: z.record(z.string(), z.number()),
    overpass: z.array(overpassFetchRecordSchema),
    source: z.enum(['snapshot', 'redis', 'overpass']),
    generatedAt: z.string(),
  })
  .strict()
  .optional();

// ---------- Wrapped CacheResponse schemas per route ----------

export const flightsResponseSchema = cacheResponseSchema(z.array(flightEntitySchema));
export const eventsResponseSchema = cacheResponseSchema(z.array(conflictEventEntitySchema));
export const waterResponseSchema = cacheResponseSchema(z.array(waterFacilityEntitySchema)).extend({
  filterStats: waterFilterStatsSchema,
});
export const sitesResponseSchema = cacheResponseSchema(z.array(siteEntitySchema)).extend({
  filterStats: siteFilterStatsSchema,
});
