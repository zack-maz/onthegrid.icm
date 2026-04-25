#!/usr/bin/env node
/**
 * Phase 27.4.2 P6 — manual ground-truth eval replay (resolver-only).
 *
 * Runs runEval() against the 50-event ground-truth corpus and prints the
 * per-distance counts (5km / 20km / 100km / total) plus the D-25 deploy
 * gate ratio. Used as the inner-loop signal during Wave 2 tuning per D-12.
 *
 * Usage:  npm run eval:replay
 *
 * Cost: ~50s on cold Nominatim cache (50 events × 1 req/s throttle), instant
 * on warm cache. Resolver-only per A6 / Pitfall 8 — does NOT call the LLM
 * extractor, so it does not consume Cerebras/Groq token budget.
 */

import { runEval } from '../server/lib/llmEvalHarness.js';

async function main(): Promise<void> {
  const score = await runEval();
  console.log(JSON.stringify(score, null, 2));
  const ratio = score.total > 0 ? (score.within20km / score.total).toFixed(3) : 'n/a';
  console.log(`within20km/total = ${ratio} (D-25 deploy gate: >= 0.8)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
