import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

// Mock the openai module with a proper class constructor
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: Record<string, unknown>) {
      // noop - just captures the config
    }
  }
  return { default: MockOpenAI };
});

// Mock config to provide API keys
vi.mock('../../config.js', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    env: {
      ...(orig.env as Record<string, unknown>),
      CEREBRAS_API_KEY: 'test-cerebras-key',
      GROQ_API_KEY: 'test-groq-key',
    },
  };
});

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('llm-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed content when Cerebras succeeds', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"events":[]}' } }],
      usage: { total_tokens: 100 },
    });

    const result = await callLLM(
      [{ role: 'user', content: 'test' }],
      { type: 'object', properties: {} },
    );

    expect(result).toBe('{"events":[]}');
    expect(createMock).toHaveBeenCalledTimes(1);
    // Verify Cerebras model is used
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-oss-120b' }),
    );
  });

  it('falls back to Groq when Cerebras throws', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    // Cerebras fails
    createMock.mockRejectedValueOnce(new Error('Cerebras down'));
    // Groq succeeds
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"events":[{"id":"1"}]}' } }],
      usage: { total_tokens: 150 },
    });

    const result = await callLLM(
      [{ role: 'user', content: 'test' }],
      { type: 'object', properties: {} },
    );

    expect(result).toBe('{"events":[{"id":"1"}]}');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when both providers fail', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    createMock.mockRejectedValueOnce(new Error('Cerebras down'));
    createMock.mockRejectedValueOnce(new Error('Groq down'));

    const result = await callLLM(
      [{ role: 'user', content: 'test' }],
      { type: 'object', properties: {} },
    );

    expect(result).toBeNull();
  });

  it('uses gpt-oss-120b for Cerebras and openai/gpt-oss-120b for Groq', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    // Cerebras fails so Groq is tried
    createMock.mockRejectedValueOnce(new Error('Cerebras down'));
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { total_tokens: 50 },
    });

    await callLLM(
      [{ role: 'user', content: 'test' }],
      { type: 'object', properties: {} },
    );

    // First call: Cerebras with 'gpt-oss-120b'
    expect(createMock.mock.calls[0][0].model).toBe('gpt-oss-120b');
    // Second call: Groq with 'openai/gpt-oss-120b'
    expect(createMock.mock.calls[1][0].model).toBe('openai/gpt-oss-120b');
  });
});
