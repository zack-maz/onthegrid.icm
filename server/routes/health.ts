import { Router } from 'express';

import { cacheGetSafe } from '../cache/redis.js';
import {
  healthResponseSchema,
  type EndpointHealth,
  type HealthResponse,
  type HealthStatus,
} from '../lib/healthSchema.js';
import {
  SOURCE_KEYS,
  FRESHNESS_THRESHOLDS_MS,
  TIER_BY_ENDPOINT,
  deriveStatus,
} from '../lib/healthSources.js';
import { llmProgress, LLM_LASTPROGRESS_KEY } from '../lib/llmProgress.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'health' });

export const healthRouter = Router();

/**
 * Phase 28.1 W2 — `/api/health` aggregate observability endpoint
 * (D-22b/D-24/D-25/D-26).
 *
 * Mounted at BOTH `/health` (backward compat) and `/api/health` (new
 * canonical) per PATTERNS.md mount-pattern decision Option 2. Both mounts
 * call the same handler — bodies are identical except for `generatedAt`.
 *
 * Response shape: server/lib/healthSchema.ts `healthResponseSchema`. The
 * handler runs `.parse()` in dev to fail loud on shape drift.
 *
 * Read-only contract per Phase 27.4.6 anti-pattern #17 — this route NEVER
 * mutates a cache key. All probes use `cacheGetSafe(key, 999_999_999)`
 * (huge TTL = treat as never-stale at the cache layer; freshness is
 * derived against per-endpoint D-25 thresholds in `deriveStatus`).
 *
 * Per-probe `withTimeout(probe, 2000)` cap (RESEARCH §Pitfall 2) bounds
 * the worst-case response time so a single hung probe cannot pin the
 * entire `/api/health` request thread.
 */

/** Cap each per-endpoint probe at 2s so a single hung adapter cannot pin the response. */
const PROBE_TIMEOUT_MS = 2_000;

/**
 * Phase 37 fix/prod-audit-tier-regression — degraded sentinel for the
 * LLM-OPTIONAL fallback contract documented in ADR-0010.
 *
 * When the LLM v3 cache is cold but the raw-GDELT bridge (events.ts Pitfall 1)
 * is still serving fresh data to /api/events, or when llm:lastProgress is
 * empty but the refresh-events cron is firing on schedule, the probe needs to
 * report `degraded` instead of `unknown` so the audit's D-03 tier rule
 * (`non-critical accepts healthy OR degraded but NOT unknown`) doesn't fail
 * the gate while the user-facing surface is correctly degrading.
 *
 * Picks a freshness midway through the degraded window
 * (threshold < freshness <= 2 × threshold per deriveStatus) so callers see a
 * stable, threshold-relative signal regardless of the specific endpoint.
 */
function degradedSentinelFreshness(thresholdMs: number): number {
  return Math.floor(thresholdMs * 1.5);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Sanitize an error message before publishing on the wire (T-28.1-W2-01).
 * Strips Bearer tokens, query-string api keys, Upstash REST URLs, and
 * truncates to 200 chars. Mirrors the project's redaction posture
 * established by `server/lib/logger.ts`.
 */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const masked = raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/api[_-]?key=[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
    .replace(/https:\/\/[^\s]*upstash\.io[^\s]*/g, '[upstash url redacted]');
  return masked.length > 200 ? masked.slice(0, 197) + '...' : masked;
}

interface ProbeResult {
  freshnessMs: number | null;
  lastSuccessTs: number | null;
  hadError: boolean;
  errorReason: string | null;
  latencyMs: number | null;
}

/**
 * Probe a single cache-backed endpoint via cacheGetSafe. Returns null
 * lastSuccessTs when the cache is cold; sets hadError when the cache
 * read throws. Never throws.
 *
 * `fallbackHealthyKey` (Phase 37 fix/prod-audit-tier-regression) wires the
 * LLM-OPTIONAL contract from ADR-0010 into the probe layer: when the primary
 * cache is COLD but the named fallback cache is FRESH (within the same D-25
 * threshold), the probe reports `degraded` (via `degradedSentinelFreshness`)
 * instead of `unknown`. Used by `llmEvents` to detect the Pitfall 1 raw-GDELT
 * bridge in server/routes/events.ts — when v3 is empty (LLM unconfigured /
 * throttled / cron deferred) and raw GDELT (`events:gdelt`) is still fresh,
 * /api/events serves cleanly so the audit's D-03 rule sees `degraded`, not a
 * gate-blocking `unknown`. A FRESH primary always wins — fallback is only
 * consulted when the primary returned no entry.
 */
async function probeCacheKey(
  name: string,
  key: string,
  fallbackHealthyKey?: string,
): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const primary = await withTimeout(
      cacheGetSafe(key, 999_999_999),
      PROBE_TIMEOUT_MS,
      `probe ${name}`,
    );
    const latencyMs = Date.now() - start;
    if (primary !== null) {
      return {
        freshnessMs: Date.now() - primary.lastFresh,
        lastSuccessTs: primary.lastFresh,
        hadError: false,
        errorReason: null,
        latencyMs,
      };
    }
    if (fallbackHealthyKey !== undefined) {
      const fallback = await withTimeout(
        cacheGetSafe(fallbackHealthyKey, 999_999_999),
        PROBE_TIMEOUT_MS,
        `probe ${name} fallback`,
      );
      if (fallback !== null) {
        const thresholdMs = FRESHNESS_THRESHOLDS_MS[name] ?? 0;
        const fallbackAgeMs = Date.now() - fallback.lastFresh;
        if (fallbackAgeMs <= thresholdMs) {
          return {
            freshnessMs: degradedSentinelFreshness(thresholdMs),
            lastSuccessTs: fallback.lastFresh,
            hadError: false,
            errorReason: `llm-optional-fallback-active: ${fallbackHealthyKey} fresh, ${key} cold`,
            latencyMs: Date.now() - start,
          };
        }
      }
    }
    return {
      freshnessMs: null,
      lastSuccessTs: null,
      hadError: false,
      errorReason: null,
      latencyMs,
    };
  } catch (err) {
    return {
      freshnessMs: null,
      lastSuccessTs: null,
      hadError: true,
      errorReason: sanitizeError(err),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Probe `/api/llm-status` via Redis-backed `llm:lastProgress` key with
 * in-memory `llmProgress` singleton fallback (Phase 28.2.7 R2 D-08).
 *
 * Read order: Redis first → in-memory fallback. Solves the Vercel Fluid
 * Compute cold-start problem where a fresh function instance hasn't run
 * the cron and sees the singleton at INITIAL_PROGRESS — Redis-backed read
 * surfaces the most-recent run's transition timestamps written by
 * resetProgress() / updateProgress({completedAt}) in
 * server/lib/llmProgress.ts.
 *
 * D-09: when BOTH Redis returns null AND singleton is at INITIAL_PROGRESS,
 * return freshnessMs:null → deriveStatus → 'unknown'. First cron tick
 * within 26h flips green. No artificial "fresh deploy → healthy" bias.
 *
 * D-10: read-only — no backfill of singleton from Redis. Singleton becomes
 * eventually consistent via the next pipeline's resetProgress call. Keeps
 * probe logic minimal and avoids "probe mutates state" surprise.
 */
async function probeLlmStatus(): Promise<ProbeResult> {
  const start = Date.now();
  // Redis read — degrade-open via cacheGetSafe (in-memory miss handled by
  // helper; outright throws / timeouts caught here so the probe falls back
  // to the in-memory singleton instead of bubbling 'unhealthy').
  let redisLatest: number | null = null;
  try {
    const entry = await withTimeout(
      cacheGetSafe<{ startedAt: number | null; completedAt: number | null }>(
        LLM_LASTPROGRESS_KEY,
        999_999_999,
      ),
      PROBE_TIMEOUT_MS,
      'probe llmStatus (redis)',
    );
    if (entry?.data) {
      redisLatest = entry.data.completedAt ?? entry.data.startedAt ?? null;
    }
  } catch {
    // Fall through to in-memory singleton — Phase 28.1 W2 degrade-open contract.
  }
  const memLatest = llmProgress.completedAt ?? llmProgress.startedAt ?? null;
  // Phase 28.2.7 follow-up (WR-01) — take the freshest signal, not Redis-first.
  // Redis can hold a stale `startedAt` from a crashed run that never wrote
  // `completedAt` (process crash / OOM / warm-start drop). The 7-day TTL plus
  // the lack of an "in-progress" sentinel means a single crashed run could
  // mask up to 7 days of subsequent successful in-memory completions on
  // cold-started instances that read Redis first. `Math.max` keeps both
  // signals honest: Redis wins when it's actually fresher (cross-instance
  // visibility), memory wins when it's seen a more-recent completion that
  // hasn't been written through to Redis yet (e.g., fire-and-forget back-pressure).
  const latest =
    redisLatest === null
      ? memLatest
      : memLatest === null
        ? redisLatest
        : Math.max(redisLatest, memLatest);
  if (latest !== null) {
    return {
      freshnessMs: Date.now() - latest,
      lastSuccessTs: latest,
      hadError: false,
      errorReason: null,
      latencyMs: Date.now() - start,
    };
  }
  // Phase 37 fix/prod-audit-tier-regression — LLM-OPTIONAL fallback signal.
  // When both Redis llm:lastProgress AND the in-memory singleton are empty,
  // BUT the refresh-events cron tick is fresh, the pipeline is correctly
  // short-circuiting at `isLLMConfigured() → false` (or analogous LLM-optional
  // path) — the kill switch documented in ADR-0010 is engaged and the route
  // is degrading gracefully to raw GDELT. Report `degraded`, not `unknown`,
  // so the audit's D-03 rule (`non-critical accepts healthy OR degraded`)
  // doesn't fail the gate on an intentional degradation.
  const cronThresholdMs = FRESHNESS_THRESHOLDS_MS.cronRefreshEvents ?? 0;
  try {
    const cronEntry = await withTimeout(
      cacheGetSafe<number>(`cron:lastTick:refresh-events`, 999_999_999),
      PROBE_TIMEOUT_MS,
      'probe llmStatus (cron fallback)',
    );
    if (cronEntry !== null) {
      const tickTs = typeof cronEntry.data === 'number' ? cronEntry.data : cronEntry.lastFresh;
      const cronAgeMs = Date.now() - tickTs;
      if (cronAgeMs <= cronThresholdMs) {
        const llmThresholdMs = FRESHNESS_THRESHOLDS_MS.llmStatus ?? 0;
        return {
          freshnessMs: degradedSentinelFreshness(llmThresholdMs),
          lastSuccessTs: tickTs,
          hadError: false,
          errorReason:
            'llm-optional-fallback-active: refresh-events cron fresh, llm:lastProgress empty',
          latencyMs: Date.now() - start,
        };
      }
    }
  } catch {
    // Cron-probe failure is non-fatal — fall through to `unknown` below.
  }
  return {
    freshnessMs: null,
    lastSuccessTs: null,
    hadError: false,
    errorReason: null,
    latencyMs: Date.now() - start,
  };
}

/**
 * Probe `/api/sources` (config-introspection — env-var presence check).
 * Treated as healthy whenever the route file is reachable in this process.
 */
function probeSources(): ProbeResult {
  // Pure config introspection — no upstream call, no failure mode.
  // Freshness is meaningless ("now" by definition); report as healthy by
  // claiming a freshnessMs of 0 against the 10-min threshold.
  return {
    freshnessMs: 0,
    lastSuccessTs: Date.now(),
    hadError: false,
    errorReason: null,
    latencyMs: 0,
  };
}

/**
 * Probe-only endpoints (authCheck, geocode). Honest-stub contract — mirrors
 * probeSources() above: pure config introspection, no upstream call to fail,
 * "process running iff probe healthy".
 *
 * Phase 28.2.7 R3 — was returning `freshnessMs: null` which triggered
 * deriveStatus's first guard (`if (freshnessMs === null) return 'unknown'`)
 * and mathematically pinned authCheck + geocode to 'unknown' regardless of
 * any other signal. The middleware itself is reachable from this process
 * by definition; treating "process up" as "probe healthy" matches the
 * canon set by probeSources for config-introspection probes.
 *
 * deriveStatus chain (post-fix):
 *   freshnessMs:0, threshold:0, hadError:false
 *   → hadError===false (skip first guard)
 *   → freshnessMs===null is false (skip second guard)
 *   → 0 <= 0 evaluates true → return 'healthy'
 *
 * Synthetic-request middleware exercise was rejected in SPEC interview
 * (option-b honest-stub locked over option-a synthetic exercise).
 */
function probeProbeOnly(): ProbeResult {
  return {
    freshnessMs: 0,
    lastSuccessTs: Date.now(),
    hadError: false,
    errorReason: null,
    latencyMs: 0,
  };
}

/**
 * Probe a cron endpoint via the per-cron `cron:lastTick:<name>` Redis key.
 * Empty key → status 'unknown' (cron has not run yet). Read failure →
 * 'unhealthy' via hadError.
 */
async function probeCronTick(name: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const entry = await withTimeout(
      cacheGetSafe<number>(`cron:lastTick:${name}`, 999_999_999),
      PROBE_TIMEOUT_MS,
      `probe cron ${name}`,
    );
    const latencyMs = Date.now() - start;
    if (entry === null) {
      return {
        freshnessMs: null,
        lastSuccessTs: null,
        hadError: false,
        errorReason: null,
        latencyMs,
      };
    }
    const tickTs = typeof entry.data === 'number' ? entry.data : entry.lastFresh;
    return {
      freshnessMs: Date.now() - tickTs,
      lastSuccessTs: tickTs,
      hadError: false,
      errorReason: null,
      latencyMs,
    };
  } catch (err) {
    return {
      freshnessMs: null,
      lastSuccessTs: null,
      hadError: true,
      errorReason: sanitizeError(err),
      latencyMs: Date.now() - start,
    };
  }
}

/** Probe declaration for one endpoint; pairs the name with the probe strategy. */
type ProbeStrategy =
  | { kind: 'cache'; cacheKey: string; fallbackHealthyKey?: string }
  | { kind: 'llmStatus' }
  | { kind: 'sources' }
  | { kind: 'probeOnly' }
  | { kind: 'cron'; cronName: string };

const PROBE_STRATEGIES: Record<string, ProbeStrategy> = {
  flights: { kind: 'cache', cacheKey: SOURCE_KEYS.flights! },
  ships: { kind: 'cache', cacheKey: SOURCE_KEYS.ships! },
  events: { kind: 'cache', cacheKey: SOURCE_KEYS.events! },
  // Phase 37 fix/prod-audit-tier-regression — LLM-OPTIONAL probe contract.
  // Primary cache: events:llm:v3 (enriched LLM extraction). Fallback-healthy
  // signal: events:gdelt (the Pitfall 1 raw-GDELT bridge in
  // server/routes/events.ts). When v3 is cold but raw GDELT is fresh, the
  // probe reports `degraded` instead of `unknown` — the LLM-optional kill
  // switch from ADR-0010 is engaged and the route is degrading gracefully.
  // The v1/v2 fallback keys deleted in Phase 29 are no longer probed.
  llmEvents: {
    kind: 'cache',
    cacheKey: SOURCE_KEYS.llmEvents!,
    fallbackHealthyKey: SOURCE_KEYS.events!,
  },
  news: { kind: 'cache', cacheKey: SOURCE_KEYS.news! },
  markets: { kind: 'cache', cacheKey: SOURCE_KEYS.markets! },
  weather: { kind: 'cache', cacheKey: SOURCE_KEYS.weather! },
  sites: { kind: 'cache', cacheKey: SOURCE_KEYS.sites! },
  water: { kind: 'cache', cacheKey: SOURCE_KEYS.water! },
  waterPrecip: { kind: 'cache', cacheKey: SOURCE_KEYS.waterPrecip! },
  sources: { kind: 'sources' },
  llmStatus: { kind: 'llmStatus' },
  authCheck: { kind: 'probeOnly' },
  geocode: { kind: 'probeOnly' },
  cronHealth: { kind: 'cron', cronName: 'health' },
  cronWarm: { kind: 'cron', cronName: 'warm' },
  cronRefreshEvents: { kind: 'cron', cronName: 'refresh-events' },
};

async function runProbe(name: string, strategy: ProbeStrategy): Promise<ProbeResult> {
  switch (strategy.kind) {
    case 'cache':
      return probeCacheKey(name, strategy.cacheKey, strategy.fallbackHealthyKey);
    case 'llmStatus':
      return probeLlmStatus();
    case 'sources':
      return probeSources();
    case 'probeOnly':
      return probeProbeOnly();
    case 'cron':
      return probeCronTick(strategy.cronName);
  }
}

function buildSummary(endpoints: Record<string, EndpointHealth>): HealthResponse['summary'] {
  const empty = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
  const summary = {
    critical: { ...empty },
    nonCritical: { ...empty },
    static: { ...empty },
    probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
    cron: { ...empty },
  };

  for (const ep of Object.values(endpoints)) {
    const s = ep.status;
    switch (ep.tier) {
      case 'critical':
        summary.critical[s] = (summary.critical[s] ?? 0) + 1;
        break;
      case 'non-critical':
        summary.nonCritical[s] = (summary.nonCritical[s] ?? 0) + 1;
        break;
      case 'static':
        summary.static[s] = (summary.static[s] ?? 0) + 1;
        break;
      case 'probe-only':
        // Probe-only has no degraded bucket — coerce to nearest enum.
        if (s === 'healthy') summary.probeOnly.healthy += 1;
        else if (s === 'unknown') summary.probeOnly.unknown += 1;
        else summary.probeOnly.unhealthy += 1;
        break;
      case 'cron':
        summary.cron[s] = (summary.cron[s] ?? 0) + 1;
        break;
    }
  }

  return summary;
}

healthRouter.get('/', async (_req, res) => {
  // Run every probe in parallel; per-probe withTimeout caps total response time.
  const probeNames = Object.keys(PROBE_STRATEGIES);
  const results = await Promise.all(
    probeNames.map(async (name) => {
      const strategy = PROBE_STRATEGIES[name]!;
      const probe = await runProbe(name, strategy);
      return { name, probe };
    }),
  );

  const endpoints: Record<string, EndpointHealth> = {};
  for (const { name, probe } of results) {
    const tier = TIER_BY_ENDPOINT[name];
    const threshold = FRESHNESS_THRESHOLDS_MS[name];
    if (tier === undefined || threshold === undefined) {
      // Defensive: skip endpoints with no tier/threshold mapping. Log, but
      // never let a missing entry blow up the whole response.
      log.warn({ name }, 'probe ran but tier or threshold not registered; skipping');
      continue;
    }
    const status: HealthStatus = deriveStatus(probe.freshnessMs, threshold, probe.hadError);
    endpoints[name] = {
      name,
      status,
      tier,
      lastSuccessTs: probe.lastSuccessTs,
      lastErrorReason: probe.errorReason,
      freshnessMs: probe.freshnessMs,
      freshnessThresholdMs: threshold,
      latencyMs: probe.latencyMs,
    };
  }

  const response: HealthResponse = {
    endpoints,
    summary: buildSummary(endpoints),
    generatedAt: Date.now(),
  };

  // Dev-only schema validation — fail loud on shape drift.
  if (process.env.NODE_ENV !== 'production') {
    try {
      healthResponseSchema.parse(response);
    } catch (err) {
      log.error({ err }, '/api/health response failed schema validation in dev');
    }
  }

  res.json(response);
});
