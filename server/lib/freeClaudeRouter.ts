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
// Phase 27.4.4 D-01 — bake-off winner re-confirmed via combo path
// (operator-approved 2026-04-28 against 27.4.4-01-BAKEOFF.md). qwen/qwen3.5-397b-a17b
// remains the v3 primary after the 4-candidate 20-event preflight at
// 27.4.4-PREFLIGHT-CHARACTERIZATION.md showed:
//   - qwen: 16/20 within20km (0.80) — best of the 4 LIVE candidates.
//   - llama: 15/20 (0.75), gen-duration p95=564.4s (2.1× worse than qwen's 264.9s).
//   - nemotron: 0/20 — schema-fails despite envelope-shape PROMPT_OVERRIDES.
//   - glm: 0/20 — 400 status on every call (NIM catalog drift or extra_body rejection).
// 0/4 cleared the D-03 dual hard floor (within20km ≥ 0.890 AND p95 ≤ 30s).
// Combo path means qwen + V3_ADAPTIVE_BATCH=true at Gate B (Plan 02).
//
// In-incident reversion: temporarily set V3_PRIMARY_MODEL=<NVIDIA_NIM_FALLBACK_MODEL>.
// In 27.4.4 the fallback is itself qwen (no other viable NIM candidate); fall-back
// becomes meaningful again when a future phase re-baselines and a different model
// passes.
//
// Per-candidate baselines persisted at events:llm-eval-baseline:v3:<sanitized-model-id> (90d TTL).
// See .planning/phases/27.4.4-v3-latency-remediation-and-cutover/27.4.4-01-BAKEOFF.md.
const NVIDIA_NIM_DEFAULT_MODEL = process.env.V3_PRIMARY_MODEL ?? 'qwen/qwen3.5-397b-a17b';

// Phase 27.4.4 D-01 in-incident reversion handle. 27.4.3's qwen incumbent is the
// only viable NIM candidate after 27.4.4's bake-off — fallback is itself qwen
// for now. A future phase that re-baselines should update this to the next-best
// LIVE candidate. Set V3_PRIMARY_MODEL=<this value> to revert without code edit.
export const NVIDIA_NIM_FALLBACK_MODEL = 'qwen/qwen3.5-397b-a17b';

// D-09: OpenRouter free-tier fallback model.
const OPENROUTER_DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
// D-09: free-tier daily request cap for OpenRouter (rough envelope; per-model
// caps vary 100-200/day on the free pool).
const OPENROUTER_DAILY_CAP = 200;

// Phase 27.4.4 D-06: data-driven per-model max_tokens cap (MAX_TOKENS_PER_MODEL).
// Values seeded from 27.4.4-PREFLIGHT-CHARACTERIZATION.md per-model p99(tokens-out)
// + 20% buffer. Hard ceiling 4096. Falls back to MAX_TOKENS_DEFAULT for
// un-cataloged models.
//
// Cheapest defense against runaway reasoning. For 27.4.4's candidates the
// observed p99 tokens-out is well under any cap — the long-tail is generation-
// rate collapse, NOT truncation (zero finish_reason: "length" across 39
// successful preflight calls). These caps are defensive ceilings, not load-
// bearing for p95 latency.
const MAX_TOKENS_PER_MODEL: Record<string, number> = {
  // Phase 27.4.4 Plan 02 dev-pass bump: 425 → 2048 after live dev /api/events?force=true
  // showed ~89% truncation rate (50 v3:malformed DLQ in 7 batches) — the
  // 20-event preflight characterization underestimated production hierarchy
  // verbosity. 2048 keeps a 5× safety margin against the 4096 default.
  'qwen/qwen3.5-397b-a17b': 2048,
  'meta/llama-3.3-70b-instruct': 380, // p99 315 + 20% buffer
  'nvidia/nemotron-3-super-120b-a12b': 1240, // p99 1031 + 20% buffer (verbose, schema-fails)
  'z-ai/glm4.7': 1024, // conservative — no traceable records (NIM 400s)
};
const MAX_TOKENS_DEFAULT = 4096;

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
// Phase 27.4.4 D-21 — NIM cold-start pre-warm.
//
// In-memory timestamp of the most recent NIM call (any call, not just
// pre-warm). Persisted ONLY in module memory — RESEARCH §8 explicitly forbids
// Redis backing because (a) cross-instance staleness would defeat the
// 60s window and (b) Vercel Fluid Compute warm starts share module state
// already, so the in-memory value is the cheapest correct signal.
// ---------------------------------------------------------------------------
let lastNimCallTs = 0;
const PREWARM_COLD_THRESHOLD_MS = 60_000;

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
// Phase 27.4.4 Plan 02 dev-pass: surface OpenAI-style finish_reason so the
// v3 extractor can classify max_tokens truncations distinctly from other
// JSON parse failures. 'length' = response cut at max_tokens cap; 'stop' =
// natural completion; null/undefined = provider didn't supply the field.
export type RouterFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

export async function callLLM(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],

  _schemaText: string,
  opts: { batchSize?: number; modelOverride?: string; skipOpenRouter?: boolean } = {},
): Promise<{
  content: string | null;
  routing: RoutingDecision[];
  finishReason?: RouterFinishReason;
}> {
  const log = logger.child({ component: 'freeClaudeRouter' });
  const decisions: RoutingDecision[] = [];

  // Phase 27.4.4 Plan 02 — `skipOpenRouter` lets the v3 extractor opt out of
  // the OpenRouter fallback. Free-tier OR rate-limits ~every call (~16
  // attempts × 16 rate_limit errors observed in dev), and a 100%-failing
  // fallback is worse than no fallback: it amplifies the breaker error
  // rate and burns the per-call retry budget on a guaranteed loser. v2
  // keeps OR enabled so the legacy rollback path is unchanged.
  const includeOpenRouter = !opts.skipOpenRouter;

  const allProviders: Array<{ name: FreeProvider; model: string; client: OpenAI | null }> = [
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
  const providers = includeOpenRouter
    ? allProviders
    : allProviders.filter((p) => p.name !== 'openrouter');

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

    // Phase 27.4.4 Plan 02 — `record(p.name, 'err')` is moved out of the per-
    // attempt catch block (was at the old line 441). Counting every retry
    // attempt as a breaker-window failure was tripping the breaker on
    // rate-limit storms even when the SAME call eventually succeeded on
    // retry — the breaker's 30%-error-rate threshold treats a 429-then-
    // success as a failure, which is wrong. The fix records `'ok'` on the
    // success path (existing behavior) and records `'err'` exactly once if
    // ALL retries are exhausted (non-retriable error or retry budget
    // burned). recordErrorBucket still increments per-attempt because that
    // is a raw failure counter, not a breaker signal.
    let callFailed = false;
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
          max_tokens: MAX_TOKENS_PER_MODEL[p.model] ?? MAX_TOKENS_DEFAULT, // D-06
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
        // Phase 27.4.4 Plan 02 dev-pass: capture OpenAI-style finish_reason.
        // 'length' indicates max_tokens cap was hit; downstream JSON.parse
        // catch uses this to tag DLQ entries as v3:max_tokens_truncation
        // (vs. the generic v3:malformed bucket).
        const finishReason: RouterFinishReason =
          (res.choices[0]?.finish_reason as RouterFinishReason | undefined) ?? null;
        record(p.name as Provider, 'ok');
        // Phase 27.4.4 D-21 — stamp lastNimCallTs on every successful NIM
        // call so prewarmIfCold() correctly detects > 60s of NIM idleness.
        if (p.name === 'nvidia_nim') lastNimCallTs = Date.now();
        return { content, routing: decisions, finishReason };
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
        if (bucket === 'rate_limit' && attempt < RETRY_ATTEMPTS - 1) {
          const base: number = BACKOFF_MS[attempt] ?? BACKOFF_MS[0] ?? 1000;
          await sleepWithJitter(base);
          continue;
        }
        // non-retriable or retry-exhausted -> mark call as failed, fall
        // through to next provider. Single 'err' record per call (not per
        // attempt) so a single rate-limit-then-retry-succeeds doesn't pollute
        // the breaker window.
        callFailed = true;
        break;
      }
    }
    if (callFailed) {
      record(p.name as Provider, 'err');
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
// Phase 27.4.4 D-21 — prewarmIfCold.
//
// Fires a 1-token synthetic NIM call when the in-memory `lastNimCallTs`
// indicates the NIM client has gone cold (>60s idle). The synthetic call
// is intentionally small (max_tokens=1, 1-message prompt) so the cost is
// negligible vs. the latency cliff that follows a cold start. Failures are
// swallowed — pre-warm is best-effort observability, never a hard gate.
//
// Side-effects on llmProgress (mirrored to DevApiStatus's pre-warm cell):
//   - prewarmCount: total prewarmIfCold() calls that fired a request this run.
//   - lastPrewarmTs: timestamp of most recent fired prewarm.
//   - prewarmState: 'warm' (recent NIM activity) | 'cold-fired' (this call
//     fired a warmup) | 'unknown' (no NIM client configured).
//
// Caller is `processEventGroupsV3` before the main batch loop; the helper
// is also re-exported here so unit tests can drive its branches directly.
// ---------------------------------------------------------------------------
export async function prewarmIfCold(): Promise<void> {
  const log = logger.child({ component: 'freeClaudeRouter.prewarmIfCold' });
  const client = getNvidiaNimClient();
  if (!client) {
    updateProgress({ prewarmState: 'unknown' });
    return;
  }
  const now = Date.now();
  const elapsed = lastNimCallTs > 0 ? now - lastNimCallTs : Number.POSITIVE_INFINITY;
  if (elapsed <= PREWARM_COLD_THRESHOLD_MS) {
    updateProgress({ prewarmState: 'warm' });
    return;
  }
  // Cold — fire a 1-token synthetic warmup. Best-effort, never throws out.
  try {
    await client.chat.completions.create({
      model: NVIDIA_NIM_DEFAULT_MODEL,
      messages: [{ role: 'user', content: 'ok' }],
      max_tokens: 1,
      temperature: 0,
    });
    lastNimCallTs = Date.now();
    updateProgress({
      prewarmCount: (llmProgress.prewarmCount ?? 0) + 1,
      lastPrewarmTs: lastNimCallTs,
      prewarmState: 'cold-fired',
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'prewarmIfCold synthetic call failed (non-fatal)',
    );
    updateProgress({
      prewarmCount: (llmProgress.prewarmCount ?? 0) + 1,
      lastPrewarmTs: Date.now(),
      prewarmState: 'cold-fired',
    });
  }
}

// ---------------------------------------------------------------------------
// Internal exports for unit tests ONLY — do not consume from production code
// ---------------------------------------------------------------------------

export const __internal = { RollingWindow };
