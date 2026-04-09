import { z } from 'zod';
import { callLLM } from '../adapters/llm-provider.js';
import { forwardGeocode } from '../adapters/nominatim.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from './logger.js';
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
    const g = groups[i];
    const entity = g.entities[0]; // Representative entity for context
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
): Promise<EnrichedEvent[] | null> {
  if (groups.length === 0) return [];

  const results: EnrichedEvent[] = [];
  let allFailed = true;

  // Chunk groups into batches
  for (let i = 0; i < groups.length; i += BATCH_SIZE) {
    const batch = groups.slice(i, i + BATCH_SIZE);
    const userPrompt = buildBatchUserPrompt(batch);

    const content = await callLLM(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      EVENT_EXTRACTION_SCHEMA,
    );

    if (content === null) {
      log.warn({ batchIndex: Math.floor(i / BATCH_SIZE) }, 'LLM returned null for batch');
      continue;
    }

    allFailed = false;

    // Parse and validate
    try {
      const parsed = JSON.parse(content);
      const validated = batchResponseSchema.safeParse(parsed);

      if (!validated.success) {
        log.warn(
          { errors: validated.error.issues, batchIndex: Math.floor(i / BATCH_SIZE) },
          'Zod validation failed for LLM batch response',
        );
        continue;
      }

      results.push(...validated.data.events);
    } catch (err) {
      log.warn({ err, batchIndex: Math.floor(i / BATCH_SIZE) }, 'Failed to parse LLM response JSON');
    }
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
): Promise<Array<EnrichedEvent & { resolvedLat: number; resolvedLng: number }>> {
  // Build a map from groupKey to EventGroup for fallback coordinates
  const groupMap = new Map<string, EventGroup>();
  for (const g of groups) {
    groupMap.set(g.key, g);
  }

  const results: Array<EnrichedEvent & { resolvedLat: number; resolvedLng: number }> = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
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
      continue;
    }

    // Rate limit: 1s delay between Nominatim requests (skip for first)
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, GEOCODE_DELAY_MS));
    }

    const geocoded = await forwardGeocode(placeName);

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
        log.warn({ placeName, groupKey: event.groupKey }, 'No geocoding fallback available, skipping event');
      }
    }
  }

  return results;
}
