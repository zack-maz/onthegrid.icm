// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  enrichedEventV3,
  enrichedEventAny,
  derivePrecision,
  deriveSuspect,
  GEOCODE_PROVENANCE_VALUES,
  EVENT_EXTRACTION_SCHEMA_V2,
  EVENT_EXTRACTION_SCHEMA_V3,
  type GeocodeProvenance,
  type LocationHierarchyV2,
} from '../../lib/llmSchema.js';

// ---------------------------------------------------------------------------
// Minimal valid v3 payload helper — keeps tests terse and avoids repetition.
//
// Phase 38 LLM-PURGE-04: the v1 + v2 EXPORTED schemas were deleted (only the
// un-exported v2 base const survives as the `.extend()` base for v3). All
// schema parse/reject coverage now runs against `enrichedEventV3` — v3 is
// structurally v2 + `schemaVersion:'v3'` + optional `actorConfidence`, so the
// D-05 strict-location + constraint invariants are exercised identically.
// ---------------------------------------------------------------------------

function validPayload(): Record<string, unknown> {
  return {
    schemaVersion: 'v3',
    groupKey: 'grp-001',
    location: {
      country: 'Iran',
      admin1: null,
      city: null,
      neighborhood: null,
      landmark: null,
      confidence: 0.7,
    },
    type: 'airstrike',
    confidence: 0.7,
    reasoning: 'Bellingcat report naming location and time',
    weaponType: null,
    targetType: null,
    timeOfDay: null,
    durationMinutes: null,
    actors: ['IRGC'],
    severity: 'high',
    summary: 'Strike on suspected military site.',
    casualties: { killed: null, injured: null, unknown: true },
    sourceCount: 3,
  };
}

describe('enrichedEventV3 parse acceptance', () => {
  it('Test 1: accepts a minimal valid v3 payload (country-only, confidence=0.7, null nullables)', () => {
    const payload = validPayload();
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('Test 6: accepts a payload with weaponType=null and targetType=null (both nullable)', () => {
    const payload = validPayload();
    payload.weaponType = null;
    payload.targetType = null;
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('enrichedEventV3 parse rejection (D-05 + constraint enforcement)', () => {
  it('Test 2: REJECTS a payload with a location.lat field (D-05 enforcement via .strict())', () => {
    const payload = validPayload();
    (payload.location as Record<string, unknown>).lat = 35.6;
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      // At least one Zod issue must involve the `location` path (surplus key rejection).
      const touchesLocation = result.error.issues.some((issue) => issue.path.includes('location'));
      expect(touchesLocation).toBe(true);
    }
  });

  it('Test 3: REJECTS a payload where confidence=1.5 (out of [0,1])', () => {
    const payload = validPayload();
    payload.confidence = 1.5;
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('Test 4: TRUNCATES reasoning over 200 chars to 197 chars + ellipsis (post-debug 2026-04-21)', () => {
    // Post-debug: changed from reject-on-over-200 to transform+truncate
    // because qwen strips `maxLength` from the LLM wire schema, and chatty
    // models routinely emit 200-400 char reasoning. Rejecting the whole batch
    // for one over-long reasoning loses ALL events; silent truncation keeps
    // the extraction-yield high while still bounding cache size.
    const payload = validPayload();
    payload.reasoning = 'x'.repeat(400);
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reasoning.length).toBe(198); // 197 chars + ellipsis (1 code point)
    expect(result.data.reasoning.endsWith('…')).toBe(true);
  });

  it('Test 4b: reasoning ≤200 chars passes through unchanged', () => {
    const payload = validPayload();
    payload.reasoning = 'Event matched by date + actors + distance <50km from GDELT centroid.';
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reasoning).toBe(payload.reasoning);
  });

  it('Test 5: REJECTS a payload where weaponType="nuke" (not in enum)', () => {
    const payload = validPayload();
    payload.weaponType = 'nuke';
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('Test 7: REJECTS a payload where timeOfDay="25:00" (regex rejects 24:00+)', () => {
    const payload = validPayload();
    payload.timeOfDay = '25:00';
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('enrichedEventAny (v3-only passthrough — Phase 38 LLM-PURGE-04)', () => {
  it('Test 8c: v3 payload with schemaVersion:"v3" parses', () => {
    // Phase 38 collapsed the former discriminatedUnion(v1,v2,v3) to a single-arm
    // v3 passthrough — only `events:llm:v3` payloads remain after the v1 + v2
    // extractors + cache keys were deleted in Phase 29.
    const result = enrichedEventAny.safeParse(validPayload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe('v3');
    }
  });

  it('Test 8d: payload with schemaVersion:"v2" rejects (v2 arm removed)', () => {
    const payload = validPayload();
    payload.schemaVersion = 'v2';
    const result = enrichedEventAny.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('derivePrecision', () => {
  function hierarchy(overrides: Partial<LocationHierarchyV2>): LocationHierarchyV2 {
    return {
      country: null,
      admin1: null,
      city: null,
      neighborhood: null,
      landmark: null,
      confidence: 0.8,
      ...overrides,
    };
  }

  it('Test 9: returns "exact" when landmark is non-null', () => {
    expect(derivePrecision(hierarchy({ landmark: 'Natanz' }))).toBe('exact');
  });

  it('Test 10: returns "neighborhood" when neighborhood is the deepest non-null', () => {
    expect(derivePrecision(hierarchy({ neighborhood: 'Jobar' }))).toBe('neighborhood');
  });

  it('Test 11: returns "city" when city is the deepest non-null', () => {
    expect(derivePrecision(hierarchy({ city: 'Baghdad' }))).toBe('city');
  });

  it('Test 12: returns "region" when only admin1 is non-null', () => {
    expect(derivePrecision(hierarchy({ admin1: 'Anbar', country: 'Iraq' }))).toBe('region');
  });

  it('Test 13: returns "region" defensively when all hierarchy fields are null', () => {
    expect(derivePrecision(hierarchy({}))).toBe('region');
  });
});

describe('deriveSuspect (D-23)', () => {
  it('Test 14: true when confidence < 0.5 (even with good precision/distance/tiers)', () => {
    expect(
      deriveSuspect({
        confidence: 0.4,
        precision: 'city',
        actionGeoDistanceKm: 20,
        tiers: ['gold', 'silver'],
      }),
    ).toBe(true);
  });

  it('Test 15: true when precision === "region" (even with high confidence)', () => {
    expect(
      deriveSuspect({
        confidence: 0.9,
        precision: 'region',
        actionGeoDistanceKm: 20,
        tiers: ['gold'],
      }),
    ).toBe(true);
  });

  it('Test 16: true when distance > 100km from GDELT ActionGeo', () => {
    expect(
      deriveSuspect({
        confidence: 0.9,
        precision: 'city',
        actionGeoDistanceKm: 150,
        tiers: ['gold'],
      }),
    ).toBe(true);
  });

  it('Test 17: true when ALL source tiers are bronze (tier-3)', () => {
    expect(
      deriveSuspect({
        confidence: 0.9,
        precision: 'city',
        actionGeoDistanceKm: 20,
        tiers: ['bronze', 'bronze'],
      }),
    ).toBe(true);
  });

  it('Test 18: false when mixed tiers (some non-bronze)', () => {
    expect(
      deriveSuspect({
        confidence: 0.9,
        precision: 'city',
        actionGeoDistanceKm: 20,
        tiers: ['bronze', 'silver'],
      }),
    ).toBe(false);
  });
});

describe('GeocodeProvenance exhaustiveness (D-22)', () => {
  it('Test 19: GeocodeProvenance has exactly six values and exhaustive switch compiles', () => {
    expect(GEOCODE_PROVENANCE_VALUES).toHaveLength(6);
    const exhaustive = (p: GeocodeProvenance): string => {
      switch (p) {
        case 'own-site-snapshot':
        case 'poi-amenity-nominatim':
        case 'nominatim-direct':
        case 'nominatim-verified-2pass':
        case 'gdelt-actiongeo-fallback':
        case 'bellingcat-coord-passthrough':
          return p;
        default: {
          // Compile-time exhaustiveness — if a seventh member is ever added, this
          // line stops type-checking until the switch is updated.
          const _never: never = p;
          return _never;
        }
      }
    };
    for (const p of GEOCODE_PROVENANCE_VALUES) {
      expect(exhaustive(p)).toBe(p);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 33 D-10: enrichedEventV3 + actorConfidence (.optional() rollout)
//
// Per CONTEXT.md D-10 and RESEARCH.md Open Q §1, actorConfidence ships as
// z.array(z.enum(['high','medium','low'])).optional() so legacy v3 cache
// entries (pre-Phase 33) continue to parse through enrichedEventAny during
// the 24h forward-rollout window. Tighten to required in a Phase 35+ cleanup
// once daily cron rollover completes.
// ---------------------------------------------------------------------------

/** Build a minimal valid v3 payload (v2 shape + schemaVersion='v3'). */
function validV3Payload(): Record<string, unknown> {
  return {
    schemaVersion: 'v3',
    groupKey: 'grp-v3-001',
    location: {
      country: 'Iran',
      admin1: null,
      city: null,
      neighborhood: null,
      landmark: null,
      confidence: 0.7,
    },
    type: 'airstrike',
    confidence: 0.7,
    reasoning: 'v3 fixture for Phase 33 actorConfidence tests',
    weaponType: null,
    targetType: null,
    timeOfDay: null,
    durationMinutes: null,
    actors: ['IRGC', 'IDF'],
    severity: 'high',
    summary: 'v3 fixture event.',
    casualties: { killed: null, injured: null, unknown: true },
    sourceCount: 3,
  };
}

describe('Phase 33 enrichedEventV3 — actorConfidence (D-10, Open Q §1 .optional() rollout)', () => {
  it('accepts payload WITH actorConfidence array of enum values', () => {
    const payload = validV3Payload();
    payload.actorConfidence = ['high', 'medium'];
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('accepts payload WITHOUT actorConfidence (rollout-window forward-compat)', () => {
    // Open Q §1: .optional() preserves legacy v3 cache reads through enrichedEventAny
    const payload = validV3Payload();
    // intentionally omit actorConfidence — represents legacy pre-Phase-33 cache entries
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid actorConfidence enum value', () => {
    const payload = validV3Payload();
    payload.actorConfidence = ['certain']; // not in ['high','medium','low']
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('admits legacy v3 payload (no actorConfidence) via enrichedEventAny discriminated union', () => {
    // Forward-compat: enrichedEventAny is the cache-read surface in
    // llmEventExtractor.v3.ts (temporal-context block). Rejecting legacy
    // entries here would break the daily cron's prior-snapshot read.
    const payload = validV3Payload();
    const result = enrichedEventAny.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe('v3');
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 33 D-12: EVENT_EXTRACTION_SCHEMA_V3 un-aliased + actorConfidence
//
// Per CONTEXT.md D-12 and RESEARCH.md Open Q §3, the V3 JSON-Schema literal
// is un-aliased from V2 so that adding actorConfidence to the v3 wire
// contract does NOT pollute the v2 contract. Per Open Q §2, actorConfidence
// is required at the wire level (LLM forcing-function value); server-side
// repair fills missing/wrong-length entries as defense-in-depth (Plan 33-04).
// ---------------------------------------------------------------------------

describe('Phase 33 EVENT_EXTRACTION_SCHEMA_V3 — un-aliased + actorConfidence (D-12, Open Q §2/§3)', () => {
  it('is un-aliased from V2 (Open Q §3)', () => {
    // Referential inequality after un-aliasing — accidental re-aliasing
    // would silently re-pollute V2 with any future V3 edits.
    expect(EVENT_EXTRACTION_SCHEMA_V3).not.toBe(EVENT_EXTRACTION_SCHEMA_V2);
  });

  it('declares actorConfidence in events.items.properties with the expected enum', () => {
    // Navigate the nested JSON Schema literal. Type narrowing via `as` casts
    // is acceptable here — schema literals are `Record<string, unknown>` by
    // design.
    const eventsSchema = (EVENT_EXTRACTION_SCHEMA_V3.properties as Record<string, unknown>)
      .events as Record<string, unknown>;
    const itemsSchema = eventsSchema.items as Record<string, unknown>;
    const itemProps = itemsSchema.properties as Record<string, unknown>;
    const actorConfidenceSchema = itemProps.actorConfidence as Record<string, unknown> | undefined;
    expect(actorConfidenceSchema).toBeDefined();
    expect(actorConfidenceSchema!.type).toBe('array');
    const itemsConstraint = actorConfidenceSchema!.items as Record<string, unknown>;
    expect(itemsConstraint.type).toBe('string');
    expect(itemsConstraint.enum).toEqual(['high', 'medium', 'low']);
  });

  it('declares actorConfidence in events.items.required (Open Q §2 — wire required)', () => {
    const eventsSchema = (EVENT_EXTRACTION_SCHEMA_V3.properties as Record<string, unknown>)
      .events as Record<string, unknown>;
    const itemsSchema = eventsSchema.items as Record<string, unknown>;
    const requiredArr = itemsSchema.required as string[];
    expect(Array.isArray(requiredArr)).toBe(true);
    expect(requiredArr.includes('actorConfidence')).toBe(true);
  });

  it('V2 literal is unchanged — frozen, no actorConfidence leak', () => {
    // V2 must remain canonical for the v2 rollback path. The un-alias is the
    // mechanism that prevents v3 additions from contaminating v2.
    const v2EventsSchema = (EVENT_EXTRACTION_SCHEMA_V2.properties as Record<string, unknown>)
      .events as Record<string, unknown>;
    const v2ItemsSchema = v2EventsSchema.items as Record<string, unknown>;
    const v2ItemProps = v2ItemsSchema.properties as Record<string, unknown>;
    expect(v2ItemProps.actorConfidence).toBeUndefined();
    const v2RequiredArr = v2ItemsSchema.required as string[];
    expect(v2RequiredArr.includes('actorConfidence')).toBe(false);
  });
});
