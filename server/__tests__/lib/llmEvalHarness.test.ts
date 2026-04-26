// @vitest-environment node
/**
 * Phase 27.4 Plan 08 — unit tests for server/lib/llmEvalHarness.ts.
 *
 * Covers:
 *   - loadGroundTruth: file present / missing / malformed / wrong-shape + cache
 *   - runEval: resolver-only accuracy scoring at 5/20/100 km thresholds
 *   - A6 / Pitfall 8 assertion: eval NEVER calls callLLM directly
 *   - Side-effects: evalScore → updateProgress, baseline → Redis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — registered BEFORE import() of the module under test.
// ---------------------------------------------------------------------------

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (p: string) => mockExistsSync(p),
    readFileSync: (p: string, enc?: string) => mockReadFileSync(p, enc),
  };
});

vi.mock('../../lib/llmResolver.js', () => ({
  resolveLocation: vi.fn(),
}));

vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn(),
}));

vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
}));

// Mocked so Test 9 can assert the eval harness NEVER calls it (A6 / Pitfall 8).
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
  isLLMConfigured: vi.fn(() => false),
}));

// Imports AFTER mocks are registered.
import { resolveLocation } from '../../lib/llmResolver.js';
import { updateProgress } from '../../lib/llmProgress.js';
import { cacheSetSafe } from '../../cache/redis.js';
import { callLLM } from '../../adapters/llm-provider.js';
import {
  loadGroundTruth,
  runEval,
  __resetGroundTruthCacheForTests,
} from '../../lib/llmEvalHarness.js';

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

/** A single ground-truth entry mirroring the 50-event JSON's first record. */
const gtEventOne = {
  id: 'gt-001',
  description: 'Test strike — Natanz',
  sourceUrl: 'https://example.com/gt-001',
  truth: {
    lat: 33.7225,
    lng: 51.7261,
    precision: 'exact' as const,
    landmark: 'Natanz nuclear enrichment complex',
    country: 'Iran',
    admin1: 'Isfahan Province',
  },
  hierarchy: {
    country: 'Iran',
    admin1: 'Isfahan Province',
    city: null,
    neighborhood: null,
    landmark: 'Natanz nuclear enrichment complex',
    confidence: 0.95,
  },
};

/** Second GT entry for multi-event scoring tests. */
const gtEventTwo = {
  id: 'gt-002',
  description: 'Test strike — Fordow',
  sourceUrl: 'https://example.com/gt-002',
  truth: {
    lat: 34.8846,
    lng: 50.9935,
    precision: 'exact' as const,
    landmark: 'Fordow',
    country: 'Iran',
    admin1: 'Qom Province',
  },
  hierarchy: {
    country: 'Iran',
    admin1: 'Qom Province',
    city: null,
    neighborhood: null,
    landmark: 'Fordow Fuel Enrichment Plant',
    confidence: 0.95,
  },
};

/** Build a minimal valid JSON payload for readFileSync mocks. */
function gtFileJson(
  events: Array<typeof gtEventOne>,
  overrides: Partial<{ version: number; curatedAt: string; source: string }> = {},
): string {
  return JSON.stringify({
    version: overrides.version ?? 1,
    curatedAt: overrides.curatedAt ?? '2026-04-21',
    source: overrides.source ?? 'test',
    events,
  });
}

/**
 * Resolver return shape (mirrors ResolvedLocation from llmResolver.ts).
 * provenance/actionGeoDistanceKm/displayName are carried through but the
 * harness only reads lat/lng — default them to safe values.
 */
function resolvedLoc(lat: number, lng: number) {
  return {
    lat,
    lng,
    provenance: 'nominatim-direct' as const,
    actionGeoDistanceKm: 0,
    displayName: 'mocked',
  };
}

// ---------------------------------------------------------------------------
// Shared beforeEach — reset cache + mocks.
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetGroundTruthCacheForTests();
  mockExistsSync.mockReset();
  mockReadFileSync.mockReset();
  vi.mocked(resolveLocation).mockReset();
  vi.mocked(updateProgress).mockReset();
  vi.mocked(cacheSetSafe).mockReset().mockResolvedValue(undefined);
  vi.mocked(callLLM).mockReset();
});

// ---------------------------------------------------------------------------
// loadGroundTruth — Tests 1-3.
// ---------------------------------------------------------------------------

describe('loadGroundTruth', () => {
  it('Test 1: returns parsed file and caches result so second call does not re-read FS', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(gtFileJson([gtEventOne]));

    const a = loadGroundTruth();
    const b = loadGroundTruth();

    expect(a).not.toBeNull();
    expect(a!.events).toHaveLength(1);
    expect(a!.events[0]!.id).toBe('gt-001');
    // Cache invariant — identity equality + no second read.
    expect(a).toBe(b);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('Test 2: returns null when file is absent; does NOT throw', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => loadGroundTruth()).not.toThrow();
    expect(loadGroundTruth()).toBeNull();
    // Should not attempt to read if file does not exist.
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it('Test 3: returns null when JSON parse fails OR structure is invalid', () => {
    // Sub-case A: unparseable JSON.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ not valid json');
    expect(loadGroundTruth()).toBeNull();

    // Reset cache between sub-cases so the second call re-reads.
    __resetGroundTruthCacheForTests();

    // Sub-case B: parseable JSON but wrong shape (events not an array).
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 1, events: 'oops' }));
    expect(loadGroundTruth()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runEval — Tests 4-11.
// ---------------------------------------------------------------------------

describe('runEval', () => {
  beforeEach(() => {
    // Default ground-truth file for all runEval tests — single gt-001 event.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(gtFileJson([gtEventOne]));
  });

  it('Test 4: ~0.5km distance increments all three buckets (5 / 20 / 100 km)', async () => {
    // gt-001 truth = 33.7225, 51.7261 ; resolved = 33.72, 51.73 → ~0.5km.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    const score = await runEval();

    expect(score.total).toBe(1);
    expect(score.within5km).toBe(1);
    expect(score.within20km).toBe(1);
    expect(score.within100km).toBe(1);
  });

  it('Test 5: ~15km distance increments within20km + within100km but NOT within5km', async () => {
    // Offset gt-001 by ~0.135 deg latitude ≈ 15 km.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.7225 + 0.135, 51.7261));

    const score = await runEval();

    expect(score.total).toBe(1);
    expect(score.within5km).toBe(0);
    expect(score.within20km).toBe(1);
    expect(score.within100km).toBe(1);
  });

  it('Test 6: ~75km distance increments ONLY within100km', async () => {
    // Offset by ~0.675 deg latitude ≈ 75 km.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.7225 + 0.675, 51.7261));

    const score = await runEval();

    expect(score.total).toBe(1);
    expect(score.within5km).toBe(0);
    expect(score.within20km).toBe(0);
    expect(score.within100km).toBe(1);
  });

  it('Test 7: ~200km distance increments NONE of the buckets', async () => {
    // Offset by ~1.8 deg latitude ≈ 200 km.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.7225 + 1.8, 51.7261));

    const score = await runEval();

    expect(score.total).toBe(1);
    expect(score.within5km).toBe(0);
    expect(score.within20km).toBe(0);
    expect(score.within100km).toBe(0);
  });

  it('Test 8: total === number of ground-truth events regardless of resolver failures', async () => {
    // Two-event fixture; second call throws.
    mockReadFileSync.mockReturnValue(gtFileJson([gtEventOne, gtEventTwo]));
    __resetGroundTruthCacheForTests();

    vi.mocked(resolveLocation)
      .mockResolvedValueOnce(resolvedLoc(33.72, 51.73)) // ~0.5 km, all buckets
      .mockRejectedValueOnce(new Error('resolver blew up'));

    const score = await runEval();

    expect(score.total).toBe(2);
    // First event scored at 0.5km → all three buckets incremented.
    expect(score.within5km).toBe(1);
    expect(score.within20km).toBe(1);
    expect(score.within100km).toBe(1);
  });

  it('Test 9 (A6 / Pitfall 8): runEval NEVER calls callLLM directly', async () => {
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    await runEval();

    // Resolver was called exactly once (one GT event in fixture).
    expect(vi.mocked(resolveLocation)).toHaveBeenCalledTimes(1);
    // The extractor/LLM path is FORBIDDEN by A6 — the harness must never go
    // to an LLM directly, only via the resolver (which may internally reach
    // for the reranker for low-confidence hierarchies, but that is NOT the
    // harness's concern).
    expect(vi.mocked(callLLM)).not.toHaveBeenCalled();
  });

  it('Test 10: writes evalScore to llmProgress via updateProgress', async () => {
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    await runEval();

    expect(vi.mocked(updateProgress)).toHaveBeenCalledWith(
      expect.objectContaining({
        evalScore: expect.objectContaining({
          within5km: expect.any(Number),
          within20km: expect.any(Number),
          within100km: expect.any(Number),
          total: expect.any(Number),
        }),
      }),
    );
  });

  it('Test 11: persists baseline to Redis key events:llm-eval-baseline:v3 on completion (no model arg)', async () => {
    // Phase 27.4.3 Plan 02b D-04 — baseline key bumped from v2 → v3 in
    // lockstep with the cache-version policy. Default no-arg invocation
    // continues to persist to the unsuffixed BASELINE_KEY.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    await runEval();

    expect(vi.mocked(cacheSetSafe)).toHaveBeenCalledWith(
      'events:llm-eval-baseline:v3',
      expect.objectContaining({
        within5km: expect.any(Number),
        within20km: expect.any(Number),
        within100km: expect.any(Number),
        total: expect.any(Number),
      }),
      // TTL: 90 days in seconds = 90 * 86400 = 7_776_000. Accept any positive integer.
      expect.any(Number),
    );
  });

  it('Test 11b: persists per-model baseline when runEval invoked with {model: "kimi-k2.5"} (Phase 27.4.3 D-08)', async () => {
    // Multi-model bake-off support — the model arg keys the baseline so
    // side-by-side comparisons can persist independently.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    await runEval({ model: 'kimi-k2.5' });

    expect(vi.mocked(cacheSetSafe)).toHaveBeenCalledWith(
      'events:llm-eval-baseline:v3:kimi-k2.5',
      expect.objectContaining({
        within5km: expect.any(Number),
        within20km: expect.any(Number),
        within100km: expect.any(Number),
        total: expect.any(Number),
      }),
      expect.any(Number),
    );
  });

  it('Test 11c: sanitizes slashes in OpenRouter-style model ids (e.g. moonshotai/kimi-k2.5 → moonshotai_kimi-k2.5)', async () => {
    // OpenRouter / NVIDIA NIM ids carry vendor prefixes separated by `/`
    // which would create unexpected key hierarchies in Redis. The harness
    // replaces `/` with `_` so the key stays single-segment by convention.
    vi.mocked(resolveLocation).mockResolvedValue(resolvedLoc(33.72, 51.73));

    await runEval({ model: 'moonshotai/kimi-k2.5' });

    expect(vi.mocked(cacheSetSafe)).toHaveBeenCalledWith(
      'events:llm-eval-baseline:v3:moonshotai_kimi-k2.5',
      expect.objectContaining({
        within5km: expect.any(Number),
        within20km: expect.any(Number),
        within100km: expect.any(Number),
        total: expect.any(Number),
      }),
      expect.any(Number),
    );
  });
});

// ---------------------------------------------------------------------------
// Null-fixture safety — runEval must not throw when ground-truth is absent.
// ---------------------------------------------------------------------------

describe('runEval with no ground-truth available', () => {
  it('returns zero totals and still calls updateProgress with a zero evalScore', async () => {
    mockExistsSync.mockReturnValue(false);

    const score = await runEval();

    expect(score).toEqual({ within5km: 0, within20km: 0, within100km: 0, total: 0 });
    // resolver never called when ground-truth is absent.
    expect(vi.mocked(resolveLocation)).not.toHaveBeenCalled();
    // updateProgress must still fire so DevApiStatus clears any stale score.
    expect(vi.mocked(updateProgress)).toHaveBeenCalledWith(
      expect.objectContaining({
        evalScore: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
      }),
    );
  });
});
