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
import { llmProgress } from '../lib/llmProgress.js';
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
 */
async function probeCacheKey(name: string, key: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const entry = await withTimeout(
      cacheGetSafe(key, 999_999_999),
      PROBE_TIMEOUT_MS,
      `probe ${name}`,
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
    const lastFresh = entry.lastFresh;
    return {
      freshnessMs: Date.now() - lastFresh,
      lastSuccessTs: lastFresh,
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
 * Probe `/api/llm-status` via the in-memory `llmProgress` singleton (no
 * upstream HTTP fetch — RESEARCH Pitfall 8). Freshness derives from the
 * pipeline's most recent activity timestamp.
 */
function probeLlmStatus(): ProbeResult {
  const start = Date.now();
  const latest = llmProgress.completedAt ?? llmProgress.startedAt ?? null;
  return {
    freshnessMs: latest === null ? null : Date.now() - latest,
    lastSuccessTs: latest,
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
 * Probe-only endpoints (authCheck, geocode). No freshness concept — the
 * tier already classifies them as 'probe-only'. Status is derived from
 * `hadError` alone via the `deriveStatus` contract (threshold=0 means
 * any non-null freshnessMs immediately becomes degraded/unhealthy; we
 * report freshnessMs=null and rely on healthy/unhealthy via hadError).
 *
 * For now we report 'healthy' optimistically — backing systems are
 * reachable from this process by definition. A future iteration could
 * exercise the middleware via a synthetic local request.
 */
function probeProbeOnly(): ProbeResult {
  return {
    freshnessMs: null,
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
  | { kind: 'cache'; cacheKey: string }
  | { kind: 'llmStatus' }
  | { kind: 'sources' }
  | { kind: 'probeOnly' }
  | { kind: 'cron'; cronName: string };

const PROBE_STRATEGIES: Record<string, ProbeStrategy> = {
  flights: { kind: 'cache', cacheKey: SOURCE_KEYS.flights! },
  ships: { kind: 'cache', cacheKey: SOURCE_KEYS.ships! },
  events: { kind: 'cache', cacheKey: SOURCE_KEYS.events! },
  news: { kind: 'cache', cacheKey: SOURCE_KEYS.news! },
  markets: { kind: 'cache', cacheKey: SOURCE_KEYS.markets! },
  weather: { kind: 'cache', cacheKey: SOURCE_KEYS.weather! },
  sites: { kind: 'cache', cacheKey: SOURCE_KEYS.sites! },
  water: { kind: 'cache', cacheKey: SOURCE_KEYS.water! },
  waterPrecip: { kind: 'cache', cacheKey: 'water:precip' },
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
      return probeCacheKey(name, strategy.cacheKey);
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
