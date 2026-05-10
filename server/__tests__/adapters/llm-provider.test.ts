/**
 * Phase 29 Plan 03 — narrowed llm-provider shim test surface.
 *
 * The legacy two-provider cascade test cases (cerebras/groq, breaker gates,
 * budget gates, retry/backoff, skip-entry telemetry) have been deleted with
 * their factories. What remains is a thin compatibility shim:
 *
 *   - `callLLM(messages, jsonSchema, opts?) => string | null` delegates to
 *     `freeClaudeRouter.callLLM` and returns `.content`.
 *   - `isLLMConfigured()` returns true when either `NVIDIA_NIM_API_KEY` or
 *     `OPENROUTER_API_KEY` is set in env.
 *
 * We mock the router and assert the shim's adapter contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the freeClaudeRouter callLLM so we can drive its return value and
// assert that the shim forwards its arguments and unwraps `.content`.
const routerCallLLM = vi.fn();
vi.mock('../../lib/freeClaudeRouter.js', () => ({
  callLLM: routerCallLLM,
}));

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

describe('llm-provider shim (Phase 29 Plan 03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('callLLM adapter', () => {
    it('forwards messages and opts to freeClaudeRouter and returns .content', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      routerCallLLM.mockResolvedValueOnce({
        content: '{"events":[]}',
        routing: [],
      });

      const result = await callLLM(
        [{ role: 'user', content: 'test' }],
        { type: 'object', properties: {} },
        { batchSize: 4 },
      );

      expect(result).toBe('{"events":[]}');
      expect(routerCallLLM).toHaveBeenCalledTimes(1);
      // The shim ignores the legacy jsonSchema object (router uses
      // response_format: json_object) — it passes an empty schemaText
      // and forwards the options through.
      const [messages, schemaText, opts] = routerCallLLM.mock.calls[0];
      expect(messages).toEqual([{ role: 'user', content: 'test' }]);
      expect(schemaText).toBe('');
      expect(opts).toEqual({ batchSize: 4 });
    });

    it('returns null when the router returns null content', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      routerCallLLM.mockResolvedValueOnce({
        content: null,
        routing: [],
      });

      const result = await callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });

      expect(result).toBeNull();
    });

    it('defaults opts to {} when caller omits the argument', async () => {
      const { callLLM } = await import('../../adapters/llm-provider.js');
      routerCallLLM.mockResolvedValueOnce({
        content: 'ok',
        routing: [],
      });

      await callLLM([{ role: 'user', content: 'test' }], {
        type: 'object',
        properties: {},
      });

      const opts = routerCallLLM.mock.calls[0]?.[2];
      expect(opts).toEqual({});
    });
  });

  describe('isLLMConfigured', () => {
    it('returns true when NIM + OpenRouter keys are set', async () => {
      const { isLLMConfigured } = await import('../../adapters/llm-provider.js');
      expect(isLLMConfigured()).toBe(true);
    });
  });
});
