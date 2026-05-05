/**
 * Phase 27.4.1 TS audit (D-14, 3-error sample classified 2026-04-22):
 *
 *   L141 ('g' is possibly undefined):    Category A — noUncheckedIndexedAccess,
 *                                        fix = local-bind + early-continue (D-15).
 *   L248 ('event' possibly undefined):   Category B — noUncheckedIndexedAccess,
 *                                        fix = local-bind + early-continue (D-15).
 *   L258 (TS2345 spread mismatch):       Category C — secondary symptom of B;
 *                                        vanishes when `event` is narrowed by
 *                                        the local-bind guard. No D-16 schema
 *                                        tightening needed — Zod schema is
 *                                        already non-optional on all fields.
 *
 * Conclusion: all 20 errors fall into Categories A + B; Category C is a
 * downstream effect. Fix applied uniformly via D-15 (local-bind + early-
 * continue). No D-17 non-null assertions introduced.
 *
 * Full error map (verified via `npx tsc --noEmit -p tsconfig.server.json`):
 *   - Category A (13 errors, buildBatchUserPrompt L141-151): `g` / `entity`
 *     possibly undefined — resolved by Task 2 Fix 1.
 *   - Category B (4 errors, geocodeEnrichedEvents L248/296/299/310): `event`
 *     possibly undefined — resolved by Task 2 Fix 2.
 *   - Category C (3 errors, spread at L258/289/302): TS2345 — resolves as a
 *     side-effect of Fix 2 (narrowed `event` eliminates the undefined widening
 *     on the `...event` spread).
 */
import { z } from 'zod';

import { callLLM } from '../adapters/llm-provider.js';
import { forwardGeocodeConstrained } from '../adapters/nominatim.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { env } from '../config.js';

import { enqueueDLQ } from './llmDLQ.js';
import { withBatchWatchdog } from './llmExtractorWatchdog.js';
import { updateProgress, llmProgress } from './llmProgress.js';
import { logger } from './logger.js';
import { ME_VIEWBOX, ME_COUNTRY_CODES } from './meBounds.js';

import type { EventGroup } from './eventGrouping.js';

const log = logger.child({ module: 'llm-extractor' });

// ---------------------------------------------------------------------------
// Zod schemas for LLM output validation
// ---------------------------------------------------------------------------

const casualtiesSchema = z.object({
  killed: z.number().int().nullable(),
  injured: z.number().int().nullable(),
  unknown: z.boolean(),
});

export const enrichedEventSchema = z.object({
  groupKey: z.string(),
  location: z.object({
    name: z.string(),
    precision: z.enum(['exact', 'neighborhood', 'city', 'region']),
  }),
  type: z.enum(['airstrike', 'on_ground', 'explosion', 'targeted', 'other']),
  actors: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  summary: z.string(),
  casualties: casualtiesSchema,
  sourceCount: z.number().int(),
});

const batchResponseSchema = z.object({
  events: z.array(enrichedEventSchema),
});

export type EnrichedEvent = z.infer<typeof enrichedEventSchema>;

// ---------------------------------------------------------------------------
// LLM System Prompt (from RESEARCH.md template)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a conflict event analyst extracting structured data from GDELT event records.

For each event group, extract:
1. location: The most specific place name mentioned. Output the name as a string, NOT coordinates.
2. type: One of: "airstrike", "on_ground", "explosion", "targeted", "other"
3. actors: Array of actor names involved (military forces, organizations, individuals)
4. severity: "critical" | "high" | "medium" | "low" based on event impact
5. summary: 2-3 sentence description of what happened
6. casualties: { killed, injured, unknown } - only if mentioned in source data
7. sources: Count of independent sources reporting this event

Rules:
- Location must be a real place name (city, neighborhood, facility, checkpoint), NOT a country name alone
- If only a country is identifiable, set precision to "region"
- If a specific city is identifiable, set precision to "city"
- If a neighborhood or specific location is identifiable, set precision to "neighborhood" or "exact"
- Never invent coordinates. Only output place names.
- If multiple events in the batch, return them as an array.`;

// ---------------------------------------------------------------------------
// JSON Schema for structured LLM output (matches Zod schema)
// ---------------------------------------------------------------------------

const EVENT_EXTRACTION_SCHEMA: Record<string, unknown> = {
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
              name: { type: 'string' },
              precision: { type: 'string', enum: ['exact', 'neighborhood', 'city', 'region'] },
            },
            required: ['name', 'precision'],
            additionalProperties: false,
          },
          type: {
            type: 'string',
            enum: ['airstrike', 'on_ground', 'explosion', 'targeted', 'other'],
          },
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
// Batch processing constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 8;
const GEOCODE_CACHE_PREFIX = 'geocode:fwd:';
const GEOCODE_CACHE_TTL_SEC = 2_592_000; // 30 days
const GEOCODE_DELAY_MS = 1_000; // 1 req/s Nominatim rate limit

// ---------------------------------------------------------------------------
// Build user prompt from event groups
// ---------------------------------------------------------------------------

function buildBatchUserPrompt(groups: EventGroup[]): string {
  const lines: string[] = ['Analyze these GDELT event groups and extract structured data:\n'];

  for (let i = 0; i < groups.length; i++) {
    // Phase 27.4.1 D-15: noUncheckedIndexedAccess guard — local-bind + continue.
    const g = groups[i];
    if (!g) continue;
    const entity = g.entities[0]; // Representative entity for context
    if (!entity) continue;
    lines.push(`--- Event Group ${i + 1} (key: ${g.key}) ---`);
    lines.push(`Date: ${new Date(g.timestamp).toISOString().slice(0, 10)}`);
    lines.push(`CAMEO Code: ${g.primaryCameo}`);
    lines.push(`Location: ${entity.data.locationName}`);
    lines.push(`Actors: ${entity.data.actor1} vs ${entity.data.actor2}`);
    lines.push(`Goldstein Scale: ${entity.data.goldsteinScale}`);
    lines.push(`Total Mentions: ${g.totalMentions}, Total Sources: ${g.totalSources}`);
    lines.push(`Rows in group: ${g.entities.length}`);
    if (g.sourceUrls.length > 0) {
      lines.push(`Source URLs: ${g.sourceUrls.slice(0, 3).join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core processing functions
// ---------------------------------------------------------------------------

/**
 * Process event groups through the LLM pipeline.
 *
 * Chunks groups into batches of BATCH_SIZE, calls LLM for each batch,
 * validates output with Zod. Returns null if LLM is unavailable for all batches.
 */
export async function processEventGroups(
  groups: EventGroup[],
  onBatchComplete?: (completedBatches: number, totalBatches: number) => void,
): Promise<EnrichedEvent[] | null> {
  if (groups.length === 0) return [];

  const results: EnrichedEvent[] = [];
  let allFailed = true;
  const totalBatches = Math.ceil(groups.length / BATCH_SIZE);

  // Chunk groups into batches
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const userPrompt = buildBatchUserPrompt(batch);

    // Phase 27.4.1 D-11/D-12/D-13: SYMMETRY with v2. The rollback path
    // must not exhibit the same P0 hang-stall defect — wrap callLLM in
    // withBatchWatchdog so a 90s+ Cerebras hang routes the batch's groups
    // to the DLQ with reason='timeout_watchdog' and the loop continues.
    // Identical hook shape to v2 (Plan 03).
    const content = await withBatchWatchdog(
      () =>
        callLLM(
          [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          EVENT_EXTRACTION_SCHEMA,
          { batchSize: batch.length },
        ),
      {
        timeoutMs: env.LLM_BATCH_TIMEOUT_MS,
        softWarnMs: 60_000, // D-02 — hard-coded soft-warn threshold
        batchIndex,
        label: 'v1',
        onTimeout: async () => {
          // D-04: DLQ-route every group in the timed-out batch.
          for (const g of batch) {
            await enqueueDLQ({
              id: g.key,
              reason: 'timeout_watchdog',
              lastError: `v1 batch ${batchIndex} exceeded ${env.LLM_BATCH_TIMEOUT_MS}ms`,
              timestamp: Date.now(),
            });
          }
          updateProgress({
            watchdogTimeoutCount: (llmProgress.watchdogTimeoutCount ?? 0) + 1,
          });
        },
        onSoftWarn: (elapsedMs) => {
          // D-02 — append soft-warn entry to callHistory so DevApiStatus can
          // render an amber marker without a separate UI change.
          const history = llmProgress.callHistory ?? [];
          const softWarnEntry: NonNullable<typeof llmProgress.callHistory>[number] = {
            provider: 'cerebras',
            model: 'watchdog-soft-warn',
            tokensIn: 0,
            tokensOut: 0,
            durationMs: elapsedMs,
            ok: true,
            batchSize: batch.length,
            timestamp: Date.now(),
          };
          updateProgress({
            callHistory: [softWarnEntry, ...history].slice(0, 20),
          });
        },
      },
    );

    if (content === null) {
      // Either callLLM returned null OR watchdog fired — both already
      // logged / DLQ'd / incremented telemetry above. Continue to next batch.
      log.warn({ batchIndex }, 'LLM returned null for batch (null or watchdog timeout)');
      onBatchComplete?.(batchIndex + 1, totalBatches);
      continue;
    }

    allFailed = false;

    // Parse and validate
    try {
      const parsed = JSON.parse(content);
      const validated = batchResponseSchema.safeParse(parsed);

      if (!validated.success) {
        log.warn(
          { errors: validated.error.issues, batchIndex },
          'Zod validation failed for LLM batch response',
        );
        onBatchComplete?.(batchIndex + 1, totalBatches);
        continue;
      }

      results.push(...validated.data.events);
    } catch (err) {
      log.warn({ err, batchIndex }, 'Failed to parse LLM response JSON');
    }

    onBatchComplete?.(batchIndex + 1, totalBatches);
  }

  if (allFailed) return null;
  return results;
}

/**
 * Geocode enriched events by resolving LLM-extracted place names via Nominatim.
 *
 * Uses Redis cache (30-day TTL) and sequential 1s delays for rate limiting.
 * On Nominatim failure, falls back to the original GDELT ActionGeo coordinates.
 */
export async function geocodeEnrichedEvents(
  events: EnrichedEvent[],
  groups: EventGroup[],
  onGeocodeComplete?: (completedGeocodes: number, totalGeocodes: number) => void,
): Promise<Array<EnrichedEvent & { resolvedLat: number; resolvedLng: number }>> {
  // Build a map from groupKey to EventGroup for fallback coordinates
  const groupMap = new Map<string, EventGroup>();
  for (const g of groups) {
    groupMap.set(g.key, g);
  }

  const results: Array<EnrichedEvent & { resolvedLat: number; resolvedLng: number }> = [];

  for (let i = 0; i < events.length; i++) {
    // Phase 27.4.1 D-15: noUncheckedIndexedAccess guard — local-bind + continue.
    // Narrows `event` from `EnrichedEvent | undefined` to `EnrichedEvent`, which
    // also resolves the downstream TS2345 spread errors at L258/289/302 without
    // needing to tighten the Zod schema (Category C → secondary symptom of
    // Category B per the audit at the top of this file).
    const event = events[i];
    if (!event) continue;
    const placeName = event.location.name;
    const cacheKey = `${GEOCODE_CACHE_PREFIX}${placeName.toLowerCase().trim()}`;

    // Check Redis cache first
    const cached = await cacheGetSafe<{ lat: number; lng: number; displayName: string }>(
      cacheKey,
      GEOCODE_CACHE_TTL_SEC * 1000,
    );

    if (cached?.data) {
      results.push({
        ...event,
        resolvedLat: cached.data.lat,
        resolvedLng: cached.data.lng,
      });
      onGeocodeComplete?.(i + 1, events.length);
      continue;
    }

    // Rate limit: 1s delay between Nominatim requests (skip for first)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, GEOCODE_DELAY_MS));
    }

    // Phase 27.4 CR-01: constrain legacy v1 geocoder to ME viewbox + country
    // codes so the rollback pipeline honors the D-02 security requirement
    // ("eliminate 'Damascus, Maryland' class misses"). forwardGeocode
    // (unconstrained) is no longer imported.
    const [geocoded] = await forwardGeocodeConstrained(placeName, {
      countrycodes: ME_COUNTRY_CODES,
      viewbox: ME_VIEWBOX,
      limit: 1,
    });

    if (geocoded) {
      // Cache the result
      await cacheSetSafe(
        cacheKey,
        { lat: geocoded.lat, lng: geocoded.lng, displayName: geocoded.displayName },
        GEOCODE_CACHE_TTL_SEC,
      );
      results.push({
        ...event,
        resolvedLat: geocoded.lat,
        resolvedLng: geocoded.lng,
      });
    } else {
      // Fallback to GDELT ActionGeo coordinates from the group
      const group = groupMap.get(event.groupKey);
      if (group) {
        log.warn(
          { placeName, groupKey: event.groupKey },
          'Nominatim failed, falling back to GDELT ActionGeo coordinates',
        );
        results.push({
          ...event,
          resolvedLat: group.centroidLat,
          resolvedLng: group.centroidLng,
        });
      } else {
        // No fallback available — skip event
        log.warn(
          { placeName, groupKey: event.groupKey },
          'No geocoding fallback available, skipping event',
        );
      }
    }

    onGeocodeComplete?.(i + 1, events.length);
  }

  return results;
}
