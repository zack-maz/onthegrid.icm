/**
 * Phase 38 LLM-PURGE-02 — narrowed llm-provider test surface.
 *
 * The legacy two-provider cascade test cases (cerebras/groq, breaker gates,
 * budget gates, retry/backoff, skip-entry telemetry) were deleted in Phase 29
 * with their factories. The `callLLM` compatibility shim (re-export of
 * `freeClaudeRouter.callLLM`) was removed in Phase 38 — it had no remaining
 * live importers after the v1 + v2 extractors were deleted.
 *
 *   - `isLLMConfigured()` returns true when either `NVIDIA_NIM_API_KEY` or
 *     `OPENROUTER_API_KEY` is set in env.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config to control env-var presence for isLLMConfigured.
vi.mock('../../config.js', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    env: {
      ...(orig.env as Record<string, unknown>),
      NVIDIA_NIM_API_KEY: 'test-nim-key',
      OPENROUTER_API_KEY: 'test-or-key',
    },
  };
});

describe('llm-provider (Phase 38 LLM-PURGE-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isLLMConfigured', () => {
    it('returns true when NIM + OpenRouter keys are set', async () => {
      const { isLLMConfigured } = await import('../../adapters/llm-provider.js');
      expect(isLLMConfigured()).toBe(true);
    });
  });
});
