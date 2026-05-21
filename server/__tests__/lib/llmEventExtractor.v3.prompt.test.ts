// @vitest-environment node
/**
 * Phase 33 Plan 33-04 — D-09 SYSTEM_PROMPT_V3 substring assertions.
 *
 * Snapshot-style test pinning two prompt extensions:
 *   1. Line 143 actors instruction extended with the "canonical full names"
 *      hint + "Server-side mapping handles known variants" disclaimer (D-09).
 *   2. New numbered instruction line for actorConfidence (Open Q §2 —
 *      NIM wire-required forcing function); enum shape `"high" | "medium" |
 *      "low"` must appear verbatim in the prompt body.
 *
 * SYSTEM_PROMPT_V3 is exported as a `.join('\n')` string from
 * `llmEventExtractor.v3.ts` (line ~160), so toContain / toMatch work directly.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub heavyweight transitive deps so the module import is cheap.
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

const { SYSTEM_PROMPT_V3 } = await import('../../lib/llmEventExtractor.v3.js');

describe('SYSTEM_PROMPT_V3 (D-09)', () => {
  it('contains the canonical-full-names hint for actors', () => {
    expect(SYSTEM_PROMPT_V3).toContain('canonical full names');
    expect(SYSTEM_PROMPT_V3).toContain('Server-side mapping handles known variants');
  });

  it('contains the actorConfidence instruction with enum shape', () => {
    expect(SYSTEM_PROMPT_V3).toContain('actorConfidence');
    expect(SYSTEM_PROMPT_V3).toMatch(/"high"\s*\|\s*"medium"\s*\|\s*"low"/);
  });
});
