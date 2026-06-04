/**
 * Phase 27.4 LLM extraction schemas (D-01, D-11..D-14, D-22, D-23).
 *
 * This module is the SINGLE source of truth for the v3 extraction contract.
 * Phase 38 LLM-PURGE-04 collapsed the v1/v2/v3 discriminated union to a
 * v3-only passthrough: the v1 + v2 EXPORTED schemas (and their batch
 * envelopes) were deleted with the v1 + v2 extractors. `enrichedEventV2`
 * survives as an UN-EXPORTED base const because `enrichedEventV3` is defined
 * by `.extend()`-ing it (Pitfall 2).
 *
 * Invariants (load-bearing):
 *   - D-05: LLM NEVER emits lat/lng. The location object is `.strict()`
 *           so any surplus key including lat/lng/coordinates fails safeParse.
 *   - Pitfall 4: schemaVersion is attached server-side on cache write, never
 *           by the LLM. The `batchResponseV3` preprocess wrapper seeds it on
 *           read for safety.
 *   - Pitfall 5: precision is derived from the deepest non-null hierarchy
 *           field; it is NOT present on the LLM output surface.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// D-22: geocoding resolver provenance (six paths).
//
// Downstream (Plans 03/05/06/07) tag each resolved event with one of these
// six strings so DevApiStatus can render a provenance pie-chart aggregate.
// The exhaustive switch trick in the companion test prevents silent drift
// when a seventh member is added without widening the switch.
// ---------------------------------------------------------------------------

export const GEOCODE_PROVENANCE_VALUES = [
  'own-site-snapshot',
  'poi-amenity-nominatim',
  'nominatim-direct',
  'nominatim-verified-2pass',
  'gdelt-actiongeo-fallback',
  'bellingcat-coord-passthrough',
] as const;

export type GeocodeProvenance = (typeof GEOCODE_PROVENANCE_VALUES)[number];

export const geocodeProvenanceSchema = z.enum(GEOCODE_PROVENANCE_VALUES);

// ---------------------------------------------------------------------------
// Shared sub-schemas.
// ---------------------------------------------------------------------------

const casualtiesSchema = z.object({
  killed: z.number().int().nullable(),
  injured: z.number().int().nullable(),
  unknown: z.boolean(),
});

// ---------------------------------------------------------------------------
// v2 base schema (D-01, D-05, D-11..D-14).
//
// Phase 38 LLM-PURGE-04: this is UN-EXPORTED. `enrichedEventV3` is defined by
// `.extend()`-ing it (Pitfall 2), so the const must stay; the EXPORTED v2
// schema + its `EnrichedEventV2` type were removed (no production importer —
// only the deleted v2 extractor used it).
//
// The location hierarchy uses `.strict()` so ANY extra key (including
// lat/lng/coordinates the LLM might hallucinate despite the system prompt)
// fails safeParse and the event gets routed to the DLQ. This single line is
// the D-05 enforcement: "LLM NEVER emits coordinates."
//
// Note: precision is NOT on this schema — server derives via derivePrecision
// below (RESEARCH.md Pitfall 5 / A7). Keeping precision off the LLM surface
// kills the dual-source-of-truth conflict where the LLM could claim
// "precision: exact" while populating only `country`.
// ---------------------------------------------------------------------------

export const locationHierarchyV2 = z
  .object({
    country: z.string().min(1).nullable(),
    admin1: z.string().min(1).nullable(),
    city: z.string().min(1).nullable(),
    neighborhood: z.string().min(1).nullable(),
    landmark: z.string().min(1).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type LocationHierarchyV2 = z.infer<typeof locationHierarchyV2>;

const enrichedEventV2 = z
  .object({
    schemaVersion: z.literal('v2'),
    groupKey: z.string(),
    location: locationHierarchyV2,
    type: z.enum(['airstrike', 'on_ground', 'explosion', 'targeted', 'other']),
    // D-12: per-event confidence alongside location-level confidence. Location
    // confidence reflects "where"; event confidence reflects overall LLM
    // certainty about the whole extraction (type/actors/casualties/etc).
    confidence: z.number().min(0).max(1),
    // D-12: ≤200 char rationale citing which signals led to the pick.
    // Auditable in DevApiStatus drill-down (D-18).
    //
    // Post-debug 2026-04-21: changed from `.max(200)` (reject) to transform+
    // truncate. The LLM wire JSON schema no longer carries `maxLength: 200`
    // (Cerebras qwen rejects that keyword), so the model isn't structurally
    // constrained — and verbose models routinely emit 200-400 char reasoning.
    // Rejecting the whole batch for one over-long reasoning field loses ALL
    // events in the batch, which is worse than silently truncating one field.
    // The system prompt still says "≤200 chars"; Zod is the enforcement-of-
    // last-resort that keeps the v2 cache compact.
    reasoning: z.string().transform((s) => (s.length > 200 ? `${s.slice(0, 197)}…` : s)),
    // D-13: weapon classification (nullable — not all events specify).
    weaponType: z
      .enum(['airstrike', 'drone', 'missile', 'artillery', 'small_arms', 'IED'])
      .nullable(),
    // D-13: target classification (nullable — not all events specify).
    targetType: z.enum(['military', 'infrastructure', 'civilian', 'leadership']).nullable(),
    // D-14: UTC time-of-day in HH:MM. Strict regex rejects 24:00+ and bad
    // minute ranges (60+). Format-only validation — calendar math lives
    // outside this schema.
    timeOfDay: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    // D-14: duration in minutes. Nullable for instantaneous events.
    durationMinutes: z.number().int().nonnegative().nullable(),
    actors: z.array(z.string()),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    summary: z.string(),
    casualties: casualtiesSchema,
    sourceCount: z.number().int(),
  })
  .strict();

// ---------------------------------------------------------------------------
// v3 schema (Phase 27.4.3 D-10).
//
// The v3 wire contract relaxes (no strict JSON Schema mode on NVIDIA NIM /
// OpenRouter free models — they don't reliably enforce strict JSON Schema
// response_format), but the runtime Zod contract is byte-identical to v2 —
// only `schemaVersion` literal differs. The 27.4 schema lock (D-23) is
// preserved at the type/validation level: derivePrecision + deriveSuspect
// continue to work against the same shape; the discriminated union below
// admits v3 payloads transparently for cache-read.
//
// Note on strict() preservation: `z.object({...}).strict().extend({...})`
// in Zod v3 re-applies strict on the resulting schema. Tested: a v3 payload
// with a surplus `lat` key on `location` still fails safeParse via the
// nested strict() on locationHierarchyV2, AND a surplus top-level key fails
// via the outer strict() preserved through .extend(). If a future Zod
// upgrade changes this, replace this declaration with a full enumerated
// `z.object({...}).strict()` mirroring v2 verbatim.
// ---------------------------------------------------------------------------

/**
 * Phase 33 D-10 — actorConfidence is an index-locked parallel array to actors[].
 *
 * Ships as `.optional()` for the rollout window (Open Q §1) so legacy v3 cache
 * entries through `enrichedEventAny` (the cache-read surface in
 * `llmEventExtractor.v3.ts`) continue to parse during the 24h forward-rollover
 * window. Required-without-optional would reject every pre-Phase-33 v3 entry
 * the daily cron reads for the temporal-context block.
 *
 * The cross-field length-match invariant (`arr.length === actors.length`) is
 * enforced in the EXTRACTOR (`repairActorConfidence` in
 * `server/lib/llmEventExtractor.v3.ts`, Plan 33-04), NOT in a Zod
 * `.superRefine()`. Zod cannot cross-field-refine without re-asserting the
 * parent shape, which complicates the discriminated-union cache-read surface.
 * Server-side repair fills missing/wrong-length entries with `'low'` defaults
 * before the cache write so post-Phase-33 entries always carry valid data.
 *
 * Tighten to required (drop `.optional()`) in a Phase 35+ cleanup phase once
 * the 24h daily cron has overwritten every cache entry.
 */
export const enrichedEventV3 = enrichedEventV2.extend({
  schemaVersion: z.literal('v3'),
  actorConfidence: z.array(z.enum(['high', 'medium', 'low'])).optional(),
});

export type EnrichedEventV3 = z.infer<typeof enrichedEventV3>;

// ---------------------------------------------------------------------------
// Cache-read schema. Phase 38 LLM-PURGE-04 collapsed the former
// `discriminatedUnion('schemaVersion', [v1, v2, v3])` to a single-arm v3
// passthrough: the v1 + v2 extractors (and the events:llm / events:llm:v2
// cache keys) were deleted in Phase 29, so only `schemaVersion: 'v3'` payloads
// remain on the active `events:llm:v3` key. Kept as a named export so the v3
// extractor's cache-read surface + the schema contract test reference one
// canonical alias rather than `enrichedEventV3` directly.
// ---------------------------------------------------------------------------

export const enrichedEventAny = enrichedEventV3;

export type EnrichedEventAny = z.infer<typeof enrichedEventAny>;

// ---------------------------------------------------------------------------
// Server-owned precision derivation (RESEARCH.md Pitfall 5 / A7).
//
// Tie-break rule from D-01: precision is the deepest non-null field in the
// hierarchy. `exact` > `neighborhood` > `city` > `region`. Country-only and
// admin1-only both collapse to `region` — there is no "admin1" precision
// bucket in the five-type ontology.
// ---------------------------------------------------------------------------

export type Precision = 'exact' | 'neighborhood' | 'city' | 'region';

export function derivePrecision(hierarchy: LocationHierarchyV2): Precision {
  if (hierarchy.landmark !== null) return 'exact';
  if (hierarchy.neighborhood !== null) return 'neighborhood';
  if (hierarchy.city !== null) return 'city';
  // Both admin1-only and country-only map to 'region' per D-01.
  return 'region';
}

// ---------------------------------------------------------------------------
// D-23: outlier / suspect flag.
//
// An event is "suspect" (and surfaced as such in DevApiStatus + the
// drill-down deviation list) when ANY of:
//   - confidence < 0.5                                 (low LLM certainty)
//   - precision === 'region'                           (coarse geography)
//   - resolved coord > 100km from GDELT ActionGeo      (spatial outlier)
//   - all source tiers are tier-3 / bronze             (weak sourcing)
//
// The function is pure — no Redis, no I/O — so tests cover all four branches
// and Plans 03 + 06 + 09 consume it at different stages (resolver exit,
// cache-write, UI aggregate).
// ---------------------------------------------------------------------------

export interface SuspectInput {
  confidence: number;
  precision: Precision;
  /** Haversine km between resolved coord and group.centroidLat/Lng. */
  actionGeoDistanceKm: number;
  /** Per-source tier classification from sourceTiers.ts. */
  tiers: Array<'gold' | 'silver' | 'bronze'>;
}

export function deriveSuspect(input: SuspectInput): boolean {
  if (input.confidence < 0.5) return true;
  if (input.precision === 'region') return true;
  if (input.actionGeoDistanceKm > 100) return true;
  if (input.tiers.length > 0 && input.tiers.every((t) => t === 'bronze')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// JSON Schema for Cerebras/Groq `response_format: json_schema` strict mode.
//
// This shape mirrors enrichedEventV2 BUT omits `schemaVersion` — the LLM
// does NOT emit that field; the extractor attaches it server-side on cache
// write (Pitfall 4: "write schemaVersion server-side, never LLM-emitted").
//
// Critical: `additionalProperties: false` on every object level. Dropping
// it on any sub-object means the LLM can leak extra keys through the strict
// gate, which would defeat D-05 enforcement at the wire protocol layer
// (RESEARCH.md Pattern 1 lines 346-378).
// ---------------------------------------------------------------------------

export const EVENT_EXTRACTION_SCHEMA_V2: Record<string, unknown> = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupKey: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              country: { type: ['string', 'null'] },
              admin1: { type: ['string', 'null'] },
              city: { type: ['string', 'null'] },
              neighborhood: { type: ['string', 'null'] },
              landmark: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['country', 'admin1', 'city', 'neighborhood', 'landmark', 'confidence'],
            additionalProperties: false,
          },
          type: {
            type: 'string',
            enum: ['airstrike', 'on_ground', 'explosion', 'targeted', 'other'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          // Post-debug 2026-04-21: removed `maxLength: 200` from the LLM wire
          // schema — Cerebras qwen-3-235b rejects `maxLength` in strict
          // response_format with `wrong_api_format: Invalid fields for schema
          // with types ['string']: {'maxLength'}`. Cerebras Cloud's structured
          // output engine doesn't implement the full JSON Schema validation
          // keyword set that OpenAI/Groq do. Zod still enforces `.max(200)` on
          // the parsed result below, so over-long reasoning trips `zod_fail`
          // in the DLQ instead of silently corrupting the v2 cache. The system
          // prompt instructs the LLM to keep reasoning brief (≤200 chars).
          reasoning: { type: 'string' },
          weaponType: {
            type: ['string', 'null'],
            enum: ['airstrike', 'drone', 'missile', 'artillery', 'small_arms', 'IED', null],
          },
          targetType: {
            type: ['string', 'null'],
            enum: ['military', 'infrastructure', 'civilian', 'leadership', null],
          },
          timeOfDay: { type: ['string', 'null'] },
          durationMinutes: { type: ['integer', 'null'], minimum: 0 },
          actors: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          summary: { type: 'string' },
          casualties: {
            type: 'object',
            properties: {
              killed: { type: ['integer', 'null'] },
              injured: { type: ['integer', 'null'] },
              unknown: { type: 'boolean' },
            },
            required: ['killed', 'injured', 'unknown'],
            additionalProperties: false,
          },
          sourceCount: { type: 'integer' },
        },
        required: [
          'groupKey',
          'location',
          'type',
          'confidence',
          'reasoning',
          'weaponType',
          'targetType',
          'timeOfDay',
          'durationMinutes',
          'actors',
          'severity',
          'summary',
          'casualties',
          'sourceCount',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Phase 27.4.3 D-10: v3 surfaces this constant as PROMPT INSTRUCTION TEXT
// (not response_format.json_schema), because NVIDIA NIM and OpenRouter free
// models do not reliably support strict JSON Schema mode. Zod validates
// post-parse — same defense-in-depth as v2.
// ---------------------------------------------------------------------------

/**
 * Phase 33 D-12 — un-aliased from EVENT_EXTRACTION_SCHEMA_V2 per Open Q §3.
 *
 * v3 diverged from v2 in Phase 33 by adding `actorConfidence` (Open Q §2:
 * required at wire for LLM forcing-function value; server repairs
 * missing/wrong-length entries via `repairActorConfidence` as
 * defense-in-depth — Plan 33-04, `server/lib/llmEventExtractor.v3.ts`).
 *
 * FUTURE v2 SCHEMA CHANGES DO NOT AUTO-PROPAGATE here. V2 is frozen
 * post-Phase-29 (v1+v2 extractors deleted; SIMPLIFY-06). If v2 ever changes,
 * manually port the change here AND assert the divergence in the
 * llmSchema.test.ts contract suite. The schema-pinning contract test
 * (`V3 !== V2` referential check) catches accidental re-aliasing.
 */
export const EVENT_EXTRACTION_SCHEMA_V3: Record<string, unknown> = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupKey: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              country: { type: ['string', 'null'] },
              admin1: { type: ['string', 'null'] },
              city: { type: ['string', 'null'] },
              neighborhood: { type: ['string', 'null'] },
              landmark: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['country', 'admin1', 'city', 'neighborhood', 'landmark', 'confidence'],
            additionalProperties: false,
          },
          type: {
            type: 'string',
            enum: ['airstrike', 'on_ground', 'explosion', 'targeted', 'other'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          weaponType: {
            type: ['string', 'null'],
            enum: ['airstrike', 'drone', 'missile', 'artillery', 'small_arms', 'IED', null],
          },
          targetType: {
            type: ['string', 'null'],
            enum: ['military', 'infrastructure', 'civilian', 'leadership', null],
          },
          timeOfDay: { type: ['string', 'null'] },
          durationMinutes: { type: ['integer', 'null'], minimum: 0 },
          actors: { type: 'array', items: { type: 'string' } },
          // Phase 33 D-12 — required at wire per Open Q §2 (LLM forcing
          // function). Server-side repair (`repairActorConfidence` in
          // llmEventExtractor.v3.ts, Plan 33-04) fills missing/wrong-length
          // entries with 'low' defaults as defense-in-depth.
          actorConfidence: {
            type: 'array',
            items: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          summary: { type: 'string' },
          casualties: {
            type: 'object',
            properties: {
              killed: { type: ['integer', 'null'] },
              injured: { type: ['integer', 'null'] },
              unknown: { type: 'boolean' },
            },
            required: ['killed', 'injured', 'unknown'],
            additionalProperties: false,
          },
          sourceCount: { type: 'integer' },
        },
        required: [
          'groupKey',
          'location',
          'type',
          'confidence',
          'reasoning',
          'weaponType',
          'targetType',
          'timeOfDay',
          'durationMinutes',
          'actors',
          'actorConfidence',
          'severity',
          'summary',
          'casualties',
          'sourceCount',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// v3 batch envelope — Phase 27.4.3 D-10.
//
// Same preprocess pattern as v2 but seeds `schemaVersion: 'v3'`. Plan 02b's
// v3 extractor uses this to parse the LLM batch response under the relaxed
// wire contract (no strict json_schema mode); Zod is the enforcement-of-
// last-resort that keeps malformed v3 payloads out of the v3 cache.
// ---------------------------------------------------------------------------

export const batchResponseV3 = z.object({
  events: z.array(
    z.preprocess((v: unknown) => {
      if (v && typeof v === 'object' && !('schemaVersion' in v)) {
        return { ...(v as object), schemaVersion: 'v3' as const };
      }
      return v;
    }, enrichedEventV3),
  ),
});

export type BatchResponseV3 = z.infer<typeof batchResponseV3>;
