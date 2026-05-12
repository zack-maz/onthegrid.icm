/**
 * Phase 29 Plan 03 — LLM Provider Chain Narrowing (SIMPLIFY-04 / D-01 / LLM-RELI-01).
 *
 * The prior two-provider cascade has been removed. The active LLM call path is
 * NVIDIA NIM + OpenRouter via `server/lib/freeClaudeRouter.ts` (Phase 27.4.3+).
 *
 * This module is now a thin compatibility shim: `callLLM` adapts the legacy
 * `(messages, jsonSchema, opts) => string | null` contract used by the
 * remaining v1 + v2 extractors (deleted in Plan 05+06) and downstream tests.
 * The schema argument is ignored — freeClaudeRouter uses
 * `response_format: { type: 'json_object' }` and the caller's Zod validation
 * enforces shape post-parse.
 *
 * `isLLMConfigured` is narrowed to the NIM + OpenRouter env-var pair. The
 * legacy provider env vars remain in `server/config.ts` for one deploy
 * window so `git revert` can roll back without a config schema change;
 * Phase 30 prunes them per RESEARCH.md Open Question 4.
 */
import type OpenAI from 'openai';

import { env } from '../config.js';

import { callLLM as routerCallLLM } from '../lib/freeClaudeRouter.js';

/**
 * Legacy `(messages, jsonSchema, opts) => string | null` adapter for v1 + v2
 * extractors. The reranker in `server/lib/llmResolver.ts` is repointed at
 * `freeClaudeRouter.callLLM` directly (Pitfall 3 fix) and does NOT go through
 * this shim. Plan 05+06 delete the v1 + v2 callers; at that point this export
 * can be removed entirely.
 */
export async function callLLM(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  _jsonSchema: Record<string, unknown>,
  opts: { batchSize?: number } = {},
): Promise<string | null> {
  const result = await routerCallLLM(messages, '', opts);
  return result.content;
}

/**
 * Returns true if at least one of NIM / OpenRouter is configured.
 *
 * Phase 28.2.5 hot-fix temporarily widened this to also accept legacy
 * provider keys; Phase 29 narrows it back to the active two-provider chain
 * since legacy providers are no longer routed.
 */
export function isLLMConfigured(): boolean {
  return Boolean(env.NVIDIA_NIM_API_KEY || env.OPENROUTER_API_KEY);
}
