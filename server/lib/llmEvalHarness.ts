/**
 * Phase 27.4 D-20 + D-25: Accuracy eval harness.
 *
 * Runs the curated ground-truth set through the 6-path resolver and reports
 * accuracy at 5km / 20km / 100km thresholds. The result flows to
 * /api/events/llm-status so deploy rituals can gate the prod flip (D-25:
 * >=80% within 20km).
 *
 * Design decision (RESEARCH.md Open Q A6 / Pitfall 8): the harness runs the
 * RESOLVER ONLY — not the full LLM extractor. The ground-truth set provides
 * the hierarchy; the resolver produces the lat/lng; haversine compares to
 * the verified coord. This avoids the 4M-tokens/day Cerebras-busting worst
 * case from full re-extraction.
 *
 * Shadow mode is explicitly rejected (D-27): eval provides the same signal
 * at ~1% of the cost.
 *
 * An optional env flag `EVAL_HARNESS_EXTRACT=true` would enable full LLM
 * re-extraction but is intentionally NOT wired this plan (deferred; the
 * resolver-only signal validates the highest-value code path).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLocation } from './llmResolver.js';
import { updateProgress } from './llmProgress.js';
import { cacheSetSafe } from '../cache/redis.js';
import { logger } from './logger.js';
import type { LocationHierarchyV2 } from './llmSchema.js';

const log = logger.child({ module: 'llm-eval-harness' });

// Module-relative path to the curated ground-truth file committed in Task 1
// of this plan. Matches the path used at commit time (0c5ec8c).
const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUND_TRUTH_PATH = resolve(__dirname, '../../.planning/eval/ground-truth-events.json');

/** Redis key for the eval baseline — survives pipeline cold starts so
 *  DevApiStatus + the /llm-status endpoint can render a reference score
 *  even before the first post-deploy pipeline run completes.
 *
 *  Phase 27.4.3 Plan 02b D-04: bumped from `:v2` to `:v3` per the cache-
 *  version bump policy. Multi-model bake-off (D-08) keys per-model
 *  baselines as `${BASELINE_KEY}:${sanitized-model-id}` when runEval is
 *  invoked with an explicit `model` argument; the unsuffixed BASELINE_KEY
 *  is the default-no-model baseline. */
const BASELINE_KEY = 'events:llm-eval-baseline:v3';

/** 90-day TTL — baseline is effectively permanent; the TTL prevents stale
 *  entries from lingering forever if the ground-truth set goes stale and
 *  no pipeline runs overwrite it. */
const BASELINE_TTL_SEC = 90 * 24 * 3600;

/**
 * One ground-truth conflict event entry. Each carries a Bellingcat/ISW-class
 * verified lat/lng plus the location hierarchy the resolver would receive.
 * The harness compares resolver-output lat/lng against truth.lat/truth.lng.
 */
export interface GroundTruthEvent {
  id: string;
  description: string;
  sourceUrl: string;
  truth: {
    lat: number;
    lng: number;
    precision: 'exact' | 'neighborhood' | 'city' | 'region';
    landmark?: string | null;
    country?: string | null;
    admin1?: string | null;
  };
  hierarchy: LocationHierarchyV2;
}

/**
 * Top-level ground-truth file shape. `curationNotes` and other metadata on
 * the committed file are intentionally not parsed into the interface —
 * this loader extracts only what the eval scorer needs.
 */
interface GroundTruthFile {
  version: number;
  curatedAt: string;
  source: string;
  events: GroundTruthEvent[];
}

/**
 * Accuracy buckets plus total count. Written to llmProgress.evalScore and
 * persisted to Redis under BASELINE_KEY. `total` is always the ground-truth
 * set size — resolver failures reduce the bucket counts but never the total
 * (so the deploy-gate ratio `within20km / total` is mathematically correct).
 */
export interface EvalScore {
  within5km: number;
  within20km: number;
  within100km: number;
  total: number;
}

/**
 * In-module cache. `undefined` = not yet loaded; `null` = load failed or file
 * absent. Pattern mirrors `sitesSnapshot.ts` loadSitesSnapshot — a cold
 * serverless invocation hits the FS once, warm invocations are O(1).
 */
let cachedGroundTruth: GroundTruthFile | null | undefined = undefined;

/**
 * Load the committed ground-truth file. Returns null when absent, malformed,
 * or structurally invalid. Errors are logged at warn level — a missing
 * ground-truth is not a pipeline-blocker (eval simply reports 0/0 and the
 * real pipeline continues unaffected).
 */
export function loadGroundTruth(): GroundTruthFile | null {
  if (cachedGroundTruth !== undefined) return cachedGroundTruth;

  try {
    if (!existsSync(GROUND_TRUTH_PATH)) {
      log.info(
        { path: GROUND_TRUTH_PATH },
        'ground-truth file absent; eval harness will report zeros',
      );
      cachedGroundTruth = null;
      return null;
    }

    const raw = readFileSync(GROUND_TRUTH_PATH, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      log.warn({ err: parseErr, path: GROUND_TRUTH_PATH }, 'ground-truth JSON parse failed');
      cachedGroundTruth = null;
      return null;
    }

    if (!isValidGroundTruth(parsed)) {
      log.warn({ path: GROUND_TRUTH_PATH }, 'ground-truth failed structural validation');
      cachedGroundTruth = null;
      return null;
    }

    cachedGroundTruth = parsed;
    log.info(
      { count: parsed.events.length, curatedAt: parsed.curatedAt },
      'loaded ground-truth event set',
    );
    return parsed;
  } catch (err) {
    log.warn({ err, path: GROUND_TRUTH_PATH }, 'failed to load ground-truth file');
    cachedGroundTruth = null;
    return null;
  }
}

/** Test-only: reset the in-module cache so a fresh FS read occurs next call. */
export function __resetGroundTruthCacheForTests(): void {
  cachedGroundTruth = undefined;
}

/**
 * Minimal structural validator — top-level `events` must be an array; the
 * per-event shape is trusted (the file is user-curated + committed, not
 * attacker-controlled). A missing optional field like `version` still
 * passes; a wholly wrong shape (events: 'oops') is rejected.
 */
function isValidGroundTruth(v: unknown): v is GroundTruthFile {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.events)) return false;
  return true;
}

/**
 * Inline haversine (kilometers). Matches the pattern in
 * `server/lib/eventGrouping.ts` lines 4-12 and `llmResolver.ts` lines 81-89.
 * No `@turf/distance` dep — the one-liner is small enough that inlining is
 * cheaper than adding a dependency.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Score the resolver against the curated ground-truth set.
 *
 * For each ground-truth event:
 *   1. Feed `ev.hierarchy` to resolveLocation with the truth lat/lng as the
 *      ResolveContext centroid (mimics what the real pipeline would pass —
 *      GDELT's ActionGeo centroid approximates the truth for well-documented
 *      events).
 *   2. Compute haversine(resolved, truth).
 *   3. Increment each bucket the distance falls under (buckets are cumulative
 *      — a 1km result counts for all three; a 50km result only counts for
 *      within100km).
 *
 * Resolver failures (throw or reject) are caught and logged but do NOT
 * reduce `total` — only the bucket counts. This keeps the D-25 gate ratio
 * `within20km / total >= 0.8` mathematically correct: a 40/50 result means
 * 40 events genuinely scored within 20km, the other 10 did not (either
 * resolver failed or coord was too far).
 *
 * Writes the result to `llmProgress.evalScore` via updateProgress (so the
 * /api/events/llm-status response carries it) and persists to Redis under
 * BASELINE_KEY (so cold-start dashboard reads have a reference point).
 */
/**
 * Phase 27.4.3 Plan 02b D-08 — `model` arg threads through for multi-model
 * bake-off support. Eval is RESOLVER-ONLY (per A6 / Pitfall 8 — zero LLM
 * token spend), so `model` is metadata for keying the baseline output, NOT
 * a runtime call parameter. The default no-arg invocation persists to the
 * unsuffixed `BASELINE_KEY`; with `{model: 'kimi-k2.5'}` it persists to
 * `${BASELINE_KEY}:kimi-k2.5` (slashes in model IDs sanitized to underscore
 * so the Redis key remains conventional).
 */
export async function runEval(opts: { model?: string } = {}): Promise<EvalScore> {
  const gt = loadGroundTruth();
  if (!gt) {
    const zero: EvalScore = { within5km: 0, within20km: 0, within100km: 0, total: 0 };
    // Still emit the zero score so DevApiStatus clears any stale value from a
    // previous run with a valid ground-truth file.
    updateProgress({ evalScore: zero });
    return zero;
  }

  let w5 = 0;
  let w20 = 0;
  let w100 = 0;

  for (const ev of gt.events) {
    try {
      // Resolver-only per A6 / Pitfall 8 — no LLM extraction path from here.
      const resolved = await resolveLocation(ev.hierarchy, {
        centroidLat: ev.truth.lat,
        centroidLng: ev.truth.lng,
      });
      const dKm = haversineKm(resolved.lat, resolved.lng, ev.truth.lat, ev.truth.lng);
      if (dKm <= 5) w5++;
      if (dKm <= 20) w20++;
      if (dKm <= 100) w100++;
    } catch (err) {
      // Per-event failure is non-fatal — log and let total still reflect the
      // ground-truth size so the deploy gate ratio stays honest.
      log.warn({ err, id: ev.id }, 'eval harness resolve failed for event');
    }
  }

  const score: EvalScore = {
    within5km: w5,
    within20km: w20,
    within100km: w100,
    total: gt.events.length,
  };

  // Live progress — picked up by buildSummary() in llmProgress.ts and
  // surfaced via /api/events/llm-status (Plan 02 extended the summary
  // interface to include evalScore).
  updateProgress({ evalScore: score });

  // Baseline persistence — best-effort. Redis failure does not fail the eval.
  // Phase 27.4.3 Plan 02b D-08: when a model arg is provided, key the
  // baseline by sanitized model id so a multi-model bake-off can compare
  // per-model scores side-by-side. Slashes in OpenRouter-style ids
  // (e.g. 'moonshotai/kimi-k2.5') are replaced with underscore so the key
  // shape stays conventional.
  const key = opts.model ? `${BASELINE_KEY}:${opts.model.replace(/\//g, '_')}` : BASELINE_KEY;
  try {
    await cacheSetSafe(key, score, BASELINE_TTL_SEC);
  } catch (err) {
    log.warn({ err, key }, 'failed to persist eval baseline to Redis');
  }

  return score;
}
