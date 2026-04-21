/**
 * LLM Event Extractor entry point.
 *
 * Phase 27.4: Barrel re-exports the v1 extractor by default. Plan 02 replaces
 * this with a flag-gated router that switches between v1 and v2 based on
 * LLM_PIPELINE_V2 (D-24). v1 preserved under .v1.ts per D-26; will be removed
 * in phase 27.5.
 */
export * from './llmEventExtractor.v1.js';
