// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { waterResponseSchema } from '../../schemas/cacheResponse.js';

/**
 * Phase 27.3.1 R-08 schema regression tests for the four observability
 * extensions: byCountry (D-28), overpass (D-29), source + generatedAt (D-30),
 * and byTypeRejections (D-31).
 *
 * Phase 27.3.1 Plan 10 (G2) adds a seventh rejection bucket `excluded_turkey`
 * mirrored in both `rejections` and `byTypeRejections` inner shapes. The
 * `.strict()` guard on rejectionsSchema rejects unknown bucket names AND the
 * new field is REQUIRED — this prevents silent data loss if a caller forgets
 * to emit the bucket.
 *
 * The base schema is `.optional()` for filterStats; once present every new
 * field is required. Negative tests guard against accidental loosening.
 */
describe('Phase 27.3.1 R-08 waterFilterStatsSchema extensions', () => {
  const base = {
    data: [],
    stale: false,
    lastFresh: Date.now(),
  };
  const emptyStats = {
    rawCounts: {},
    filteredCounts: {},
    rejections: {
      excluded_location: 0,
      // Phase 27.3.1 Plan 10 (G2) — Turkey country-exclusion bucket.
      excluded_turkey: 0,
      not_notable: 0,
      no_name: 0,
      // Phase 27.3.2 D-04 — Latin-script admission bucket.
      no_resolved_name: 0,
      duplicate: 0,
      low_score: 0,
      no_city: 0,
    },
    byTypeRejections: {},
    byCountry: {},
    overpass: [],
    source: 'overpass' as const,
    generatedAt: new Date(0).toISOString(),
    enrichment: { withCapacity: 0, withCity: 0, withRiver: 0 },
    scoreHistogram: [],
  };

  it('accepts the empty-stats shape', () => {
    const r = waterResponseSchema.safeParse({ ...base, filterStats: emptyStats });
    expect(r.success).toBe(true);
  });

  it('accepts populated byCountry + byTypeRejections', () => {
    const populated = {
      ...emptyStats,
      byCountry: { Iran: { dam: 20, reservoir: 35 }, Iraq: { dam: 15 } },
      byTypeRejections: {
        dams: {
          excluded_location: 1,
          excluded_turkey: 0,
          not_notable: 0,
          no_name: 3,
          no_resolved_name: 0,
          duplicate: 0,
          low_score: 2,
          no_city: 0,
        },
      },
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: populated });
    expect(r.success).toBe(true);
  });

  it('accepts overpass telemetry array', () => {
    const withTelemetry = {
      ...emptyStats,
      overpass: [
        {
          facilityType: 'dams',
          mirror: 'primary',
          status: 200,
          durationMs: 1500,
          attempts: 1,
          ok: true,
        },
      ],
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: withTelemetry });
    expect(r.success).toBe(true);
  });

  it('accepts both snapshot and redis source values', () => {
    const snap = { ...emptyStats, source: 'snapshot' as const };
    const red = { ...emptyStats, source: 'redis' as const };
    expect(waterResponseSchema.safeParse({ ...base, filterStats: snap }).success).toBe(true);
    expect(waterResponseSchema.safeParse({ ...base, filterStats: red }).success).toBe(true);
  });

  it('rejects missing source field', () => {
    const bad: Record<string, unknown> = { ...emptyStats };
    delete bad.source;
    const r = waterResponseSchema.safeParse({ ...base, filterStats: bad });
    expect(r.success).toBe(false);
  });

  it('rejects unknown source value', () => {
    const bad = { ...emptyStats, source: 'file-cache' };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: bad });
    expect(r.success).toBe(false);
  });

  // ---------- Phase 27.3.1 Plan 10 (G2) excluded_turkey field tests ----------

  it('Plan 10 G2: accepts rejections.excluded_turkey as a non-zero number', () => {
    const withTurkeyRejects = {
      ...emptyStats,
      rejections: {
        ...emptyStats.rejections,
        excluded_turkey: 165, // pre-Plan-10 baseline was ~165 Turkey admits
      },
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: withTurkeyRejects });
    expect(r.success).toBe(true);
  });

  it('Plan 10 G2: accepts byTypeRejections.*.excluded_turkey', () => {
    const withPerTypeTurkey = {
      ...emptyStats,
      byTypeRejections: {
        reservoirs: {
          excluded_location: 1277,
          excluded_turkey: 14,
          not_notable: 1063,
          no_name: 12942,
          no_resolved_name: 0,
          duplicate: 0,
          low_score: 0,
          no_city: 0,
        },
      },
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: withPerTypeTurkey });
    expect(r.success).toBe(true);
  });

  it('Plan 10 G2: rejections.excluded_turkey is REQUIRED — omitting it fails validation', () => {
    const bad = {
      ...emptyStats,
      rejections: {
        excluded_location: 0,
        // excluded_turkey intentionally missing
        not_notable: 0,
        no_name: 0,
        duplicate: 0,
        low_score: 0,
        no_city: 0,
      },
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: bad });
    expect(r.success).toBe(false);
  });

  it('Plan 10 G2: unknown bucket name in rejections still fails (excluded_turkey precedent does NOT loosen strict mode)', () => {
    const bad = {
      ...emptyStats,
      rejections: {
        ...emptyStats.rejections,
        excluded_mars: 42,
      },
    };
    const r = waterResponseSchema.safeParse({ ...base, filterStats: bad });
    expect(r.success).toBe(false);
  });
});
