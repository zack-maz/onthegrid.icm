// @vitest-environment node
/**
 * Phase 33 Plan 33-04 — D-08 + D-10 unit tests.
 *
 * Drives the GREEN implementation of `applyCatalogToEvents` (D-08 catalog
 * post-mapping) and `repairActorConfidence` (D-10 server-side defense-in-depth)
 * inside `server/lib/llmEventExtractor.v3.ts`.
 *
 * Mocking pattern mirrors `freeClaudeRouter.test.ts:1-57` — vi.mock registers
 * the canonicalize() stub BEFORE the dynamic import resolves the
 * extractor module, so the helpers under test pick up the mock catalog.
 *
 * The helpers operate on a small slice of EnrichedEventV3 (actors[] +
 * actorConfidence) — full v3 shape isn't needed for unit-level coverage.
 * Casts use `as never` to keep the test body focused on the contract under
 * test.
 */
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the canonical catalog BEFORE importing the module-under-test.
// Mapping covers the two aliases driven by the D-08 test cases: 'idf' →
// "Israeli Defense Forces" and 'irgc' → "Islamic Revolutionary Guard Corps".
// Unmatched lookups return null so `applyCatalogToEvents` passes them through
// unchanged (the D-08 pass-through contract).
// ---------------------------------------------------------------------------
vi.mock('../../data/actor-catalog.js', () => ({
  canonicalize: (name: string) => {
    const map: Record<string, { canonicalName: string }> = {
      idf: { canonicalName: 'Israeli Defense Forces' },
      irgc: { canonicalName: 'Islamic Revolutionary Guard Corps' },
    };
    return map[name.trim().toLowerCase()] ?? null;
  },
}));

// Stub the heavyweight transitive dependencies the extractor pulls in at
// import-time. Without these, importing llmEventExtractor.v3.js boots the
// real Redis client, freeClaudeRouter, logger, etc.
vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
  redis: {},
}));

vi.mock('../../config.js', () => ({
  env: { LLM_BATCH_SIZE: 2, LLM_BATCH_TIMEOUT_MS: 90_000 },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: vi.fn(),
  prewarmIfCold: vi.fn(),
}));

// Dynamic import AFTER mocks register (mirrors freeClaudeRouter.test.ts:48-49).
const { applyCatalogToEvents, repairActorConfidence } =
  await import('../../lib/llmEventExtractor.v3.js');

describe('applyCatalogToEvents (D-08)', () => {
  it('replaces matched aliases with canonical names', () => {
    const input = [{ actors: ['IDF', 'irgc'] }];
    const output = applyCatalogToEvents(input as never);
    expect(output[0].actors).toEqual([
      'Israeli Defense Forces',
      'Islamic Revolutionary Guard Corps',
    ]);
  });

  it('passes unmatched actors through unchanged (D-08 pass-through contract)', () => {
    const input = [{ actors: ['UnknownGroup'] }];
    const output = applyCatalogToEvents(input as never);
    expect(output[0].actors).toEqual(['UnknownGroup']);
  });
});

describe('repairActorConfidence (D-10)', () => {
  it('fills missing actorConfidence with low defaults', () => {
    const event = { actors: ['A', 'B'], actorConfidence: undefined };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['low', 'low']);
  });

  it('repairs length mismatch by overwriting with low defaults', () => {
    const event = { actors: ['A', 'B'], actorConfidence: ['high'] };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['low', 'low']);
  });

  it('passes through valid length-matched arrays unchanged', () => {
    const event = { actors: ['A', 'B'], actorConfidence: ['high', 'medium'] };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['high', 'medium']);
  });
});
