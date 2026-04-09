import OpenAI from 'openai';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'llm' });
const CEREBRAS_MODEL = 'gpt-oss-120b';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const LLM_TIMEOUT_MS = 30_000;

/** Lazy init — only create clients when API keys are configured */
function getCerebrasClient(): OpenAI | null {
  if (!env.CEREBRAS_API_KEY) return null;
  return new OpenAI({
    apiKey: env.CEREBRAS_API_KEY,
    baseURL: 'https://api.cerebras.ai/v1',
    timeout: LLM_TIMEOUT_MS,
  });
}

function getGroqClient(): OpenAI | null {
  if (!env.GROQ_API_KEY) return null;
  return new OpenAI({
    apiKey: env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    timeout: LLM_TIMEOUT_MS,
  });
}

/**
 * Call an LLM with structured JSON Schema output.
 *
 * Tries Cerebras first, falls back to Groq, returns null on total failure.
 * Both providers use the OpenAI-compatible API with baseURL swap.
 */
export async function callLLM(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  jsonSchema: Record<string, unknown>,
): Promise<string | null> {
  const cerebras = getCerebrasClient();
  if (cerebras) {
    try {
      const res = await cerebras.chat.completions.create({
        model: CEREBRAS_MODEL,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'event_extraction', strict: true, schema: jsonSchema },
        },
      });
      const content = res.choices[0]?.message?.content ?? null;
      if (content) {
        log.info({ provider: 'cerebras', tokens: res.usage?.total_tokens }, 'LLM call succeeded');
        return content;
      }
    } catch (err) {
      log.warn({ err, provider: 'cerebras' }, 'LLM call failed, trying Groq');
    }
  }

  const groq = getGroqClient();
  if (groq) {
    try {
      const res = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'event_extraction', strict: true, schema: jsonSchema },
        },
      });
      const content = res.choices[0]?.message?.content ?? null;
      if (content) {
        log.info({ provider: 'groq', tokens: res.usage?.total_tokens }, 'LLM fallback succeeded');
        return content;
      }
    } catch (err) {
      log.warn({ err, provider: 'groq' }, 'LLM fallback failed');
    }
  }

  log.warn('both LLM providers unavailable — falling back to raw GDELT');
  return null;
}

/** Check if any LLM provider is configured */
export function isLLMConfigured(): boolean {
  return !!(env.CEREBRAS_API_KEY || env.GROQ_API_KEY);
}
