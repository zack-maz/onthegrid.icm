/**
 * LLM configuration probe.
 *
 * The active LLM call path is NVIDIA NIM (primary) with OpenRouter as a
 * dormant key-gated fallback, routed through `server/lib/freeClaudeRouter.ts`
 * (Phase 27.4.3+). The reranker in `server/lib/llmResolver.ts` and the v3
 * extractor call `freeClaudeRouter.callLLM` directly, so this module no longer
 * carries a `callLLM` compatibility shim.
 *
 * Phase 38 LLM-PURGE-02: the legacy `callLLM` shim (re-export of
 * `routerCallLLM`) was removed — it had no remaining live importers after the
 * v1 + v2 extractors were deleted in Phase 29. `isLLMConfigured` is the sole
 * remaining export; it is consumed by `llmExtractionPipeline.ts` + `events.ts`.
 */
import { env } from '../config.js';

/**
 * Returns true if at least one of NIM / OpenRouter is configured.
 *
 * NIM is the primary provider; OpenRouter remains a dormant key-gated
 * fallback (ADR-0010) — either key being present means the LLM pipeline can run.
 */
export function isLLMConfigured(): boolean {
  return Boolean(env.NVIDIA_NIM_API_KEY || env.OPENROUTER_API_KEY);
}
