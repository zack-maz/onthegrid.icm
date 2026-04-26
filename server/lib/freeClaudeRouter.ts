/**
 * Vendored from https://github.com/Alishahryar1/free-claude-code
 * Pinned commit SHA: 40951c145ad29d6dfe450e83fd2b91fc19b9a27f
 * License: MIT (upstream LICENSE applies; see LICENSE-VENDORED.md if added)
 *
 * Phase 27.4.3 (D-01, D-02). This file ports four concepts from upstream:
 *   1. Per-provider client config (NVIDIA NIM, OpenRouter)
 *   2. Rolling-window rate limiter (40 req/min for NVIDIA NIM)
 *   3. Reactive 429 exponential backoff with jitter
 *   4. <think>-block stripper / reasoning_content parser (D-11)
 *
 * NOT ported (D-02 vendoring scope):
 *   - FastAPI / uvicorn server
 *   - Anthropic <-> OpenAI message-shape translator (we use OpenAI SDK natively)
 *   - Discord bot, Telegram bot, claude-pick CLI
 */

import OpenAI from 'openai';
import { env } from '../config.js';
import { logger } from './logger.js';
import { isAvailable, record, type Provider } from './llmCircuitBreaker.js';
import { redis } from '../cache/redis.js';
// Phase 27.4.3 Plan 02b B-1 — instrumentation hooks. Writes per-attempt
// latency, headroom, error-taxonomy, and shadow-cost into the live progress
// singleton so DevApiStatus / /llm-status surfaces them under v3.
import { llmProgress, updateProgress } from './llmProgress.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FreeProvider = 'nvidia_nim' | 'openrouter';

export interface RoutingDecision {
  provider: FreeProvider;
  model: string;
  /**
   * 'primary' for the first provider in the cascade, or
   * `fall_through:<prevProvider>_<reason>` when a downstream provider is
   * tried after the previous one failed/skipped.
   */
  reason: 'primary' | string;
  timestamp: number;
}

export type RouterErrorBucket =
  | 'rate_limit'
  | 'timeout'
  | 'malformed_json'
  | 'schema_fail'
  | 'network'
  | 'upstream_500'
  | 'other';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NVIDIA_NIM_BASE = 'https://integrate.api.nvidia.com/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const LLM_TIMEOUT_MS = 120_000;
const RETRY_ATTEMPTS = 2;
const BACKOFF_MS = [1000, 4000] as const;
const JITTER_MS = 250;
// Phase 27.4.3 D-08: V3_PRIMARY_MODEL env override for bake-off iterations.
// After Plan 03 winner-lock, the default constant is updated to the winner;
// env override remains for future re-evaluation without code edit.
// D-08: NVIDIA NIM default model. Plan 03 may swap the winner after eval bake-off.
const NVIDIA_NIM_DEFAULT_MODEL = process.env.V3_PRIMARY_MODEL ?? 'moonshotai/kimi-k2.5';
// D-09: OpenRouter free-tier fallback model.
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
// D-09: free-tier daily request cap for OpenRouter (rough envelope; per-model
// caps vary 100-200/day on the free pool).
const OPENROUTER_DAILY_CAP = 200;

// ---------------------------------------------------------------------------
// Rolling-window rate limiter (D-01 vendored primitive)
// ---------------------------------------------------------------------------

class RollingWindow {
  private readonly cap: number;
  private readonly windowMs: number;
  private timestamps: number[] = [];

  constructor(cap: number, windowMs: number) {
    this.cap = cap;
    this.windowMs = windowMs;
  }

  private evict(now: number): void {
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
  }

  canRequest(): boolean {
    this.evict(Date.now());
    return this.timestamps.length < this.cap;
  }

  consume(): void {
    this.timestamps.push(Date.now());
  }

  headroom(): { used: number; cap: number } {
    this.evict(Date.now());
    return { used: this.timestamps.length, cap: this.cap };
  }
}

// Module-level instance — NVIDIA NIM enforces 40 req/min on the free tier.
const nvidiaNimWindow = new RollingWindow(40, 60_000);

// ---------------------------------------------------------------------------
// Lazy client init (mirror server/adapters/llm-provider.ts:23-40)
// ---------------------------------------------------------------------------

function getNvidiaNimClient(): OpenAI | null {
  if (!env.NVIDIA_NIM_API_KEY) return null;
  return new OpenAI({
    apiKey: env.NVIDIA_NIM_API_KEY,
    baseURL: NVIDIA_NIM_BASE,
    timeout: LLM_TIMEOUT_MS,
  });
}

function getOpenRouterClient(): OpenAI | null {
  if (!env.OPENROUTER_API_KEY) return null;
  return new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE,
    timeout: LLM_TIMEOUT_MS,
  });
}

// ---------------------------------------------------------------------------
// Reasoning-block stripper (D-11)
// ---------------------------------------------------------------------------

/**
 * Strip `<think>...</think>` blocks AND a leading `reasoning_content:` prefix
 * line from raw LLM output. Tolerates unclosed `<think>` (returns string).
 *
 * The optional `reasoningContent` parameter is accepted for API compatibility
 * with providers that surface the reasoning trace on a separate field
 * (e.g. NVIDIA NIM `reasoning_content` on the message). It is not currently
 * used to mutate the returned content but is reserved for downstream
 * observability sinks.
 */
export function stripReasoningBlocks(
  raw: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _reasoningContent?: string,
): string | null {
  if (!raw) return raw;
  let s = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
  s = s.replace(/^reasoning_content:[^\n]*\n/m, '');
  return s.trim();
}

// ---------------------------------------------------------------------------
// Error classifier (drives D-14 error taxonomy)
// ---------------------------------------------------------------------------

export function classifyError(err: unknown): RouterErrorBucket {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes('429') || m.includes('rate limit')) return 'rate_limit';
    if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
    if (m.includes('enotfound') || m.includes('econnreset') || m.includes('eai_again'))
      return 'network';
    if (/\b5\d\d\b/.test(m)) return 'upstream_500';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Backoff with jitter (verbatim from server/adapters/llm-provider.ts)
// ---------------------------------------------------------------------------

async function sleepWithJitter(base: number): Promise<void> {
  const jitter = (Math.random() * 2 - 1) * JITTER_MS;
  await new Promise((r) => setTimeout(r, Math.max(0, base + jitter)));
}

// ---------------------------------------------------------------------------
// OpenRouter daily counter (mirrors llmTokenBudget.todayKey shape)
// ---------------------------------------------------------------------------

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

async function incrOpenRouterDaily(): Promise<number> {
  try {
    const key = `llm:tokens:openrouter:${todayKey()}`;
    const next = await redis.incr(key);
    await redis.expire(key, 48 * 3600);
    return typeof next === 'number' ? next : 0;
  } catch {
    return 0;
  }
}

async function getOpenRouterDaily(): Promise<number> {
  try {
    const key = `llm:tokens:openrouter:${todayKey()}`;
    const v = await redis.get<number | string | null>(key);
    return typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main cascade entrypoint (D-09)
// ---------------------------------------------------------------------------

/**
 * Try each free provider in order, returning the first non-null content along
 * with a routing decision per provider attempted. Never throws — failure
 * surfaces as `{ content: null, routing: [...] }` so the extractor can
 * gracefully degrade to raw GDELT (D-29 contract).
 *
 * D-10: response_format is `{ type: 'json_object' }` (NO strict mode); the
 * JSON Schema is delivered to the model as instruction text by the caller.
 * Zod enforces shape post-parse.
 */
export async function callLLM(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _schemaText: string,
  opts: { batchSize?: number; modelOverride?: string } = {},
): Promise<{ content: string | null; routing: RoutingDecision[] }> {
  const log = logger.child({ component: 'freeClaudeRouter' });
  const decisions: RoutingDecision[] = [];

  const providers: Array<{ name: FreeProvider; model: string; client: OpenAI | null }> = [
    {
      name: 'nvidia_nim',
      model: opts.modelOverride ?? NVIDIA_NIM_DEFAULT_MODEL,
      client: getNvidiaNimClient(),
    },
    {
      name: 'openrouter',
      model: OPENROUTER_DEFAULT_MODEL,
      client: getOpenRouterClient(),
    },
  ];

  for (let idx = 0; idx < providers.length; idx++) {
    const p = providers[idx];
    if (!p) continue;
    const isPrimary = idx === 0;
    const prevName = idx > 0 ? providers[idx - 1]?.name : null;
    /**
     * Build the routing reason for the *current* provider when it is BYPASSED
     * by a gate (no_client / breaker / rate_limit_window / daily_cap).
     *   - For the primary, encode the bypass cause as `skipped:<suffix>` so
     *     observability sees why we never even attempted it (otherwise primary
     *     bypass would be indistinguishable from a normal primary attempt).
     *   - For downstream providers, use the existing `fall_through:<prev>_<suffix>`
     *     shape so the trace shows which prior provider triggered the cascade.
     */
    const buildReason = (suffix: string): string =>
      isPrimary ? `skipped:${suffix}` : `fall_through:${prevName}_${suffix}`;

    if (!p.client) {
      decisions.push({
        provider: p.name,
        model: p.model,
        reason: buildReason('no_client'),
        timestamp: Date.now(),
      });
      continue;
    }
    if (!isAvailable(p.name as Provider)) {
      decisions.push({
        provider: p.name,
        model: p.model,
        reason: buildReason('breaker'),
        timestamp: Date.now(),
      });
      continue;
    }
    if (p.name === 'nvidia_nim' && !nvidiaNimWindow.canRequest()) {
      decisions.push({
        provider: p.name,
        model: p.model,
        reason: buildReason('rate_limit_window'),
        timestamp: Date.now(),
      });
      continue;
    }
    if (p.name === 'openrouter' && (await getOpenRouterDaily()) >= OPENROUTER_DAILY_CAP) {
      decisions.push({
        provider: p.name,
        model: p.model,
        reason: buildReason('daily_cap'),
        timestamp: Date.now(),
      });
      continue;
    }

    decisions.push({
      provider: p.name,
      model: p.model,
      reason: isPrimary ? 'primary' : `fall_through:${prevName}_429`,
      timestamp: Date.now(),
    });

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      const t0 = Date.now();
      try {
        if (p.name === 'nvidia_nim') nvidiaNimWindow.consume();
        if (p.name === 'openrouter') await incrOpenRouterDaily();

        const res = await p.client.chat.completions.create({
          model: p.model,
          messages,
          response_format: { type: 'json_object' }, // D-10: NO strict mode
          temperature: 0,
        });
        const latencyMs = Date.now() - t0;

        // === B-1 §1: Latency capture ===
        recordLatency(p.name, latencyMs);

        // === B-1 §2: Rate-limit headroom snapshot ===
        recordHeadroom(p.name);

        // === B-1 §4: Shadow-cost accrual (read usage from completion) ===
        const usage = (res as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
          .usage;
        const tokensIn = usage?.prompt_tokens ?? 0;
        const tokensOut = usage?.completion_tokens ?? 0;
        if (tokensIn > 0 || tokensOut > 0) {
          await accrueShadowCost(tokensIn, tokensOut);
        }

        const raw = res.choices[0]?.message?.content ?? null;
        const reasoningField = (
          res.choices[0]?.message as { reasoning_content?: string } | undefined
        )?.reasoning_content;
        const content = stripReasoningBlocks(raw, reasoningField);
        record(p.name as Provider, 'ok');
        return { content, routing: decisions };
      } catch (err) {
        const latencyMs = Date.now() - t0;
        // Latency captured even on failure — surfaces hung calls in dashboard.
        recordLatency(p.name, latencyMs);
        // === B-1 §3: Error taxonomy increment ===
        const bucket = classifyError(err);
        recordErrorBucket(p.name, bucket);
        log.warn(
          {
            provider: p.name,
            attempt,
            bucket,
            latencyMs,
            err: err instanceof Error ? err.message : String(err),
          },
          'router attempt failed',
        );
        record(p.name as Provider, 'err');
        if (bucket === 'rate_limit' && attempt < RETRY_ATTEMPTS - 1) {
          const base: number = BACKOFF_MS[attempt] ?? BACKOFF_MS[0] ?? 1000;
          await sleepWithJitter(base);
          continue;
        }
        // non-retriable or retry-exhausted -> fall through to next provider
        break;
      }
    }
  }

  log.warn('all free providers unavailable — returning null content');
  return { content: null, routing: decisions };
}

// ---------------------------------------------------------------------------
// B-1 instrumentation helpers (D-12, D-14, D-19)
//
// Each freeClaudeRouter attempt records: (1) latencyMs into a per-provider
// ring buffer with P50/P95/P99 recompute; (2) headroom snapshot via the
// RollingWindow.headroom() / OpenRouter daily counter; (3) error bucket on
// catch via classifyError; (4) shadow cost from res.usage tokens.
//
// All writes go through updateProgress() so the same Object.assign-based
// mutability semantics that existing v2 code relies on are preserved. The
// helpers gracefully no-op when llmProgress is empty / under test mocks.
// ---------------------------------------------------------------------------

/** Ring buffer cap per provider. P50/P95/P99 recompute on each insert. */
const LATENCY_RING_CAP = 100;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q));
  return sorted[idx] ?? 0;
}

function recordLatency(provider: FreeProvider, latencyMs: number): void {
  const current = llmProgress.latencyHistogram ?? {
    nvidia_nim: { p50: 0, p95: 0, p99: 0, sparkline: [], samples: [] },
    openrouter: { p50: 0, p95: 0, p99: 0, sparkline: [], samples: [] },
  };
  const bucket = current[provider];
  const samples = [...(bucket.samples ?? []), latencyMs].slice(-LATENCY_RING_CAP);
  const sorted = [...samples].sort((a, b) => a - b);
  const next = {
    ...current,
    [provider]: {
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
      sparkline: samples.slice(-30), // last 30 for the SVG sparkline
      samples,
    },
  };
  updateProgress({ latencyHistogram: next });
}

function recordHeadroom(provider: FreeProvider): void {
  // Ensure both providers have a record; only the active one updates per attempt.
  const current = llmProgress.rateLimit ?? {
    nvidia_nim: { used: 0, cap: 40, window: 'minute' as const, perModel: {} },
    openrouter: { used: 0, cap: OPENROUTER_DAILY_CAP, window: 'day' as const, perModel: {} },
  };
  if (provider === 'nvidia_nim') {
    const h = nvidiaNimWindow.headroom();
    current.nvidia_nim = { ...current.nvidia_nim, used: h.used, cap: h.cap };
  } else {
    // openrouter — read the daily counter without re-incrementing
    // (incrOpenRouterDaily already incremented above; we just snapshot).
    // Use a non-blocking fire-and-forget read.
    getOpenRouterDaily()
      .then((used) => {
        const rl = llmProgress.rateLimit;
        if (!rl) return;
        updateProgress({
          rateLimit: {
            ...rl,
            openrouter: { ...current.openrouter, used },
          },
        });
      })
      .catch(() => {
        // observability-only — swallow errors silently
      });
  }
  updateProgress({ rateLimit: current });
}

function recordErrorBucket(provider: FreeProvider, bucket: RouterErrorBucket): void {
  // 7-bucket taxonomy seed (D-14) — kept single-line so the acceptance grep
  // anchors on the exact field-set without prettier-driven reformatting.
  // prettier-ignore
  const current = llmProgress.errorTaxonomy ?? {
    nvidia_nim: { rate_limit: 0, timeout: 0, malformed_json: 0, schema_fail: 0, network: 0, upstream_500: 0, other: 0 },
    openrouter: { rate_limit: 0, timeout: 0, malformed_json: 0, schema_fail: 0, network: 0, upstream_500: 0, other: 0 },
  };
  const next = {
    ...current,
    [provider]: { ...current[provider], [bucket]: (current[provider][bucket] ?? 0) + 1 },
  };
  updateProgress({ errorTaxonomy: next });
}

/** D-19: tokens_in × $0.20/M + tokens_out × $0.40/M. Daily roll-up persisted to Redis. */
async function accrueShadowCost(tokensIn: number, tokensOut: number): Promise<void> {
  const usd = (tokensIn * 0.2 + tokensOut * 0.4) / 1_000_000;
  const current = llmProgress.costShadow ?? { tokensIn: 0, tokensOut: 0, usd: 0 };
  updateProgress({
    costShadow: {
      tokensIn: current.tokensIn + tokensIn,
      tokensOut: current.tokensOut + tokensOut,
      usd: current.usd + usd,
    },
  });
  // Daily roll-up Redis key per CONTEXT D-19 (90d ring).
  try {
    const key = `events:llm-cost-shadow:v3:${todayKey()}`;
    await redis.hincrby(key, 'tokensIn', tokensIn);
    await redis.hincrby(key, 'tokensOut', tokensOut);
    // usd stored as integer microcents (×1e6) to avoid Redis float precision loss.
    await redis.hincrby(key, 'usdMicrocents', Math.round(usd * 1_000_000));
    await redis.expire(key, 90 * 24 * 3600);
  } catch {
    // observability-only; skip on Redis failure
  }
}

// ---------------------------------------------------------------------------
// Internal exports for unit tests ONLY — do not consume from production code
// ---------------------------------------------------------------------------

export const __internal = { RollingWindow };
