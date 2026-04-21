// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  enrichedEventV1,
  enrichedEventV2,
  enrichedEventAny,
  derivePrecision,
  deriveSuspect,
  GEOCODE_PROVENANCE_VALUES,
  type GeocodeProvenance,
  type LocationHierarchyV2,
} from '../../lib/llmSchema.js';

// ---------------------------------------------------------------------------
// Minimal valid v2 payload helper — keeps tests terse and avoids repetition.
// ---------------------------------------------------------------------------

function validV2Payload(): Record<string, unknown> {
  return {
    schemaVersion: 'v2',
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

describe('enrichedEventV2 parse acceptance', () => {
  it('Test 1: accepts a minimal valid v2 payload (country-only, confidence=0.7, null nullables)', () => {
    const payload = validV2Payload();
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('Test 6: accepts a payload with weaponType=null and targetType=null (both nullable)', () => {
    const payload = validV2Payload();
    payload.weaponType = null;
    payload.targetType = null;
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('enrichedEventV2 parse rejection (D-05 + constraint enforcement)', () => {
  it('Test 2: REJECTS a payload with a location.lat field (D-05 enforcement via .strict())', () => {
    const payload = validV2Payload();
    (payload.location as Record<string, unknown>).lat = 35.6;
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      // At least one Zod issue must involve the `location` path (surplus key rejection).
      const touchesLocation = result.error.issues.some((issue) =>
        issue.path.includes('location'),
      );
      expect(touchesLocation).toBe(true);
    }
  });

  it('Test 3: REJECTS a payload where confidence=1.5 (out of [0,1])', () => {
    const payload = validV2Payload();
    payload.confidence = 1.5;
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('Test 4: TRUNCATES reasoning over 200 chars to 197 chars + ellipsis (post-debug 2026-04-21)', () => {
    // Post-debug: changed from reject-on-over-200 to transform+truncate
    // because Cerebras qwen strips `maxLength` from the LLM wire schema,
    // and chatty models routinely emit 200-400 char reasoning. Rejecting
    // the whole batch for one over-long reasoning loses ALL events; silent
    // truncation keeps the extraction-yield high while still bounding cache size.
    const payload = validV2Payload();
    payload.reasoning = 'x'.repeat(400);
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reasoning.length).toBe(198); // 197 chars + ellipsis (1 code point)
    expect(result.data.reasoning.endsWith('…')).toBe(true);
  });

  it('Test 4b: reasoning ≤200 chars passes through unchanged', () => {
    const payload = validV2Payload();
    payload.reasoning = 'Event matched by date + actors + distance <50km from GDELT centroid.';
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reasoning).toBe(payload.reasoning);
  });

  it('Test 5: REJECTS a payload where weaponType="nuke" (not in enum)', () => {
    const payload = validV2Payload();
    payload.weaponType = 'nuke';
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('Test 7: REJECTS a payload where timeOfDay="25:00" (regex rejects 24:00+)', () => {
    const payload = validV2Payload();
    payload.timeOfDay = '25:00';
    const result = enrichedEventV2.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('enrichedEventAny discriminator', () => {
  function validV1Payload(): Record<string, unknown> {
    return {
      schemaVersion: 'v1',
      groupKey: 'grp-legacy-001',
      location: { name: 'Tehran', precision: 'city' },
      type: 'airstrike',
      actors: ['IRGC'],
      severity: 'high',
      summary: 'Legacy v1 shape.',
      casualties: { killed: null, injured: null, unknown: true },
      sourceCount: 2,
    };
  }

  it('Test 8a: v1 payload with schemaVersion:"v1" parses as the v1 branch', () => {
    const result = enrichedEventAny.safeParse(validV1Payload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe('v1');
    }
  });

  it('Test 8b: v2 payload with schemaVersion:"v2" parses as the v2 branch', () => {
    const result = enrichedEventAny.safeParse(validV2Payload());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe('v2');
    }
  });

  it('Test 8c: payload with schemaVersion:"v3" rejects (no matching discriminator)', () => {
    const payload = validV2Payload();
    payload.schemaVersion = 'v3';
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
