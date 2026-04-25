import OpenAI from 'openai';
import { env, isPipelineV2 } from '../config.js';
import { logger } from '../lib/logger.js';
import { record, isAvailable, getBreakerState, type Provider } from '../lib/llmCircuitBreaker.js';
import { incrDailyTokens, getDailyTokens, budgetState } from '../lib/llmTokenBudget.js';
import { updateProgress, llmProgress } from '../lib/llmProgress.js';

const log = logger.child({ module: 'llm' });
// Cerebras: gpt-oss-120b is gated to higher tiers; qwen-3-235b-a22b is open on
// the default tier and gives comparable reasoning quality for structured output.
// If access to gpt-oss-120b is later granted, swap this constant back.
export const CEREBRAS_MODEL = 'qwen-3-235b-a22b-instruct-2507';
export const GROQ_MODEL = 'openai/gpt-oss-120b';
const LLM_TIMEOUT_MS = 30_000;

// Phase 27.4 D-28 retry budget: 2 attempts per provider with
// exponential backoff (1s, 4s) plus ±250ms jitter (A5).
const RETRY_ATTEMPTS = 2;
const BACKOFF_MS = [1000, 4000] as const;
const JITTER_MS = 250;
const CALL_HISTORY_MAX = 20;

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

async function sleepWithJitter(base: number): Promise<void> {
  const jitter = (Math.random() * 2 - 1) * JITTER_MS;
  await new Promise((r) => setTimeout(r, Math.max(0, base + jitter)));
}

function appendCallHistory(entry: {
  provider: Provider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  ok: boolean;
  batchSize: number;
  timestamp: number;
  skipReason?: 'breaker' | 'hard_cap' | 'no_client';
}): void {
  const history = llmProgress.callHistory ?? [];
  const next = [entry, ...history].slice(0, CALL_HISTORY_MAX);
  updateProgress({ callHistory: next });
}

/**
 * Record a synthetic call history entry for a skipped provider attempt.
 * Used when a provider is bypassed without any network activity: circuit
 * breaker paused, daily token hard cap reached, or no API key configured.
 * Without this, `completedBatches=N, enrichedCount=0` runs leave an empty
 * call history with no actionable diagnosis on DevApiStatus.
 */
function recordSkippedAttempt(
  provider: Provider,
  batchSize: number,
  skipReason: 'breaker' | 'hard_cap' | 'no_client',
): void {
  const model = provider === 'cerebras' ? CEREBRAS_MODEL : GROQ_MODEL;
  appendCallHistory({
    provider,
    model,
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 0,
    ok: false,
    batchSize,
    timestamp: Date.now(),
    skipReason,
  });
}

interface ProviderAttemptResult {
  content: string | null;
  tokens: number;
}

async function tryProviderOnce(
  provider: Provider,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  jsonSchema: Record<string, unknown>,
  batchSize: number,
): Promise<ProviderAttemptResult> {
  const client = provider === 'cerebras' ? getCerebrasClient() : getGroqClient();
  if (!client) {
    recordSkippedAttempt(provider, batchSize, 'no_client');
    return { content: null, tokens: 0 };
  }
  const model = provider === 'cerebras' ? CEREBRAS_MODEL : GROQ_MODEL;
  const t0 = Date.now();
  try {
    const res = await client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          // Pattern 1 (RESEARCH.md): bump schema name on v2 rollout so the
          // provider's structured-output validator can be introspected.
          name: isPipelineV2() ? 'event_extraction_v2' : 'event_extraction',
          strict: true,
          schema: jsonSchema,
        },
      },
    });
    const content = res.choices[0]?.message?.content ?? null;
    const tokens = res.usage?.total_tokens ?? 0;
    const durationMs = Date.now() - t0;
    if (content) {
      record(provider, 'ok');
      // D-32: only increment token counter on success — failed retries
      // must not count against the daily budget (RESEARCH.md Pitfall 3).
      await incrDailyTokens(provider, tokens);
      appendCallHistory({
        provider,
        model,
        tokensIn: res.usage?.prompt_tokens ?? 0,
        tokensOut: res.usage?.completion_tokens ?? 0,
        durationMs,
        ok: true,
        batchSize,
        timestamp: Date.now(),
      });
      // Mirror current provider counters onto llmProgress for DevApiStatus
      // fast-reads (Plan 09 renders these from the singleton).
      updateProgress({
        tokenCounters: {
          cerebras: await getDailyTokens('cerebras'),
          groq: await getDailyTokens('groq'),
        },
        breakerState: getBreakerState(),
      });
      return { content, tokens };
    }
    record(provider, 'err');
    appendCallHistory({
      provider,
      model,
      tokensIn: 0,
      tokensOut: 0,
      durationMs,
      ok: false,
      batchSize,
      timestamp: Date.now(),
    });
    return { content: null, tokens: 0 };
  } catch (err) {
    record(provider, 'err');
    appendCallHistory({
      provider,
      model,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: Date.now() - t0,
      ok: false,
      batchSize,
      timestamp: Date.now(),
    });
    log.warn({ err, provider }, 'LLM call threw');
    throw err;
  }
}

// Phase 27.4.2 P6 — D-07 hang-recurrence response. Wave-scoped in-memory
// override mirrors the setPipelineOverride pattern in server/config.ts:230-242.
// No Redis persistence per D-07 (ops-managed, not user-toggled).
//
// Usage from operator scripts or wave runbook:
//   import { setProviderOrderOverride } from './server/adapters/llm-provider.js'
//   setProviderOrderOverride(['groq', 'cerebras'])  // D-07 flip
//   setProviderOrderOverride(null)                   // restore default
let _providerOrderOverride: readonly Provider[] | null = null;

export function setProviderOrderOverride(order: readonly Provider[] | null): void {
  _providerOrderOverride = order;
}

export function getProviderOrder(): readonly Provider[] {
  if (_providerOrderOverride) return _providerOrderOverride;
  return ['cerebras', 'groq'] as const;
}

/**
 * Call an LLM with structured JSON Schema output.
 *
 * Phase 27.4 (D-28/D-29/D-31/D-32): every attempt is gated on
 *   - circuit breaker `isAvailable(provider)`
 *   - budget `budgetState(provider, used) !== 'hard'`
 * On failure the retry loop runs up to RETRY_ATTEMPTS times with
 * 1s / 4s backoff + ±250ms jitter before falling to the next provider.
 *
 * Returns null only when every attempt fails — upstream then falls back
 * to raw GDELT (D-29 graceful degradation contract).
 */
export async function callLLM(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  jsonSchema: Record<string, unknown>,
  opts: { batchSize?: number } = {},
): Promise<string | null> {
  const batchSize = opts.batchSize ?? 1;
  const providers: readonly Provider[] = getProviderOrder();

  for (const provider of providers) {
    if (!isAvailable(provider)) {
      log.info({ provider }, 'circuit breaker paused, skipping provider');
      recordSkippedAttempt(provider, batchSize, 'breaker');
      continue;
    }
    const used = await getDailyTokens(provider);
    if (budgetState(provider, used) === 'hard') {
      log.warn({ provider, used }, 'hard cap reached, skipping provider');
      recordSkippedAttempt(provider, batchSize, 'hard_cap');
      continue;
    }

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await tryProviderOnce(provider, messages, jsonSchema, batchSize);
        if (result.content) {
          log.info({ provider, tokens: result.tokens, attempt }, 'LLM call succeeded');
          return result.content;
        }
        // Null content with no throw → don't retry same provider.
        break;
      } catch {
        // Transient error — backoff and retry same provider on the next
        // iteration (if there is one).
        if (attempt < RETRY_ATTEMPTS - 1) {
          // Phase 27.4.1: BACKOFF_MS is `readonly [1000, 4000]`; under
          // noUncheckedIndexedAccess both index reads narrow to `number | undefined`,
          // so the nullish-chain would produce `number | undefined`. `attempt` is
          // bounded by the loop guard (`attempt < RETRY_ATTEMPTS - 1`, RETRY_ATTEMPTS=2)
          // which means only attempt=0 ever reaches this code path. Use a literal
          // fallback of BACKOFF_MS[0] so the compiler sees `number` and not an
          // undefined-union.
          const base: number = BACKOFF_MS[attempt] ?? BACKOFF_MS[0] ?? 1000;
          await sleepWithJitter(base);
        }
      }
    }
    // Provider exhausted — reflect current breaker state before falling to
    // the next provider so DevApiStatus sees the transition.
    updateProgress({ breakerState: getBreakerState() });
  }

  log.warn('both LLM providers unavailable — falling back to raw GDELT');
  return null;
}

/** Check if any LLM provider is configured */
export function isLLMConfigured(): boolean {
  return !!(env.CEREBRAS_API_KEY || env.GROQ_API_KEY);
}
