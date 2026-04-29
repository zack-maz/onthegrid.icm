// Consolidated server configuration — env validation (Zod) + constants
// Single source of truth for all server environment variables and constants.

import { z } from 'zod';
import type { BoundingBox } from './types.js';

// ---------------------------------------------------------------------------
// Env schema — Zod validates at module load (fail-fast on bad config)
// ---------------------------------------------------------------------------

export const envSchema = z.object({
  // Required (crash if missing in non-test environments)
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Optional with defaults
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Optional API keys (graceful degradation — empty string means unconfigured)
  OPENSKY_CLIENT_ID: z.string().default(''),
  OPENSKY_CLIENT_SECRET: z.string().default(''),
  ADSB_EXCHANGE_API_KEY: z.string().default(''),
  AISSTREAM_API_KEY: z.string().default(''),
  ACLED_EMAIL: z.string().default(''),
  ACLED_PASSWORD: z.string().default(''),
  // LLM provider API keys (Phase 27 — graceful degradation, empty string means unconfigured)
  CEREBRAS_API_KEY: z.string().default(''),
  GROQ_API_KEY: z.string().default(''),

  // Phase 27.4.3 (D-04, D-22): free-claude-code routing providers.
  // NVIDIA NIM is the v3 primary (40 req/min free tier, no documented
  // daily token cap). OpenRouter is the v3 fallback (~100-200 req/day per
  // free model). Both are graceful — empty string means unconfigured and
  // the v3 cascade falls through to the next provider (or returns null,
  // letting the extractor degrade to raw GDELT per D-29).
  NVIDIA_NIM_API_KEY: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),

  // Phase 27.4.3 (D-07): toggles between v2 extractor (current default)
  // and v3 extractor (free-claude-code routing). Default 'false' until
  // the D-16 cutover gate is met. Read at request-time (not module-init)
  // so flag flips take effect without a rebuild. Runtime override via
  // POST /api/events/llm-pipeline {version: 'v3'} takes precedence.
  LLM_PIPELINE_V3: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Phase 27.4 (D-24): toggles between v1 extractor (legacy rollback path)
  // and v2 extractor (structured hierarchy + richer prompts, current default).
  // Read at request-time (not module-init) so flag flips take effect without
  // a rebuild. Default flipped to 'true' on 2026-04-21 after live verification
  // — v1 remains reachable via the runtime Topbar toggle or
  // `LLM_PIPELINE_V2=false` env override. An in-memory override set via
  // POST /api/events/llm-pipeline takes precedence over this env default.
  LLM_PIPELINE_V2: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Phase 27.4.1 (D-01/D-02/D-03): per-batch timeout for the LLM extractor
  // watchdog. Default 90_000 ms hard-kills a batch that Cerebras never
  // returns from; the DLQ absorbs the group and the loop continues.
  // Soft-warn at 60_000 ms is hard-coded in the watchdog helper; only the
  // hard cap is env-tunable for in-incident rescue without a redeploy.
  LLM_BATCH_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  // Phase 27.4.4 Plan 02 — v3 batch concurrency. Sequential processing was
  // ~2 batches/min against a NIM ceiling of 40 req/min, leaving ~95% of the
  // rate budget unused. With ~27s/batch latency, default concurrency = 12
  // lands roughly 26 req/min steady-state — well under the 40 cap, with
  // enough headroom to absorb cold-start spikes and per-batch latency
  // variance. Drives 197-batch dev runs from ~95 min → ~10 min.
  //
  // Tuning knob:
  //   - LLM_V3_CONCURRENCY=1 reverts to fully sequential (rollback path)
  //   - LLM_V3_CONCURRENCY=20 saturates NIM but risks 429s mid-run
  //   - default=12 balances throughput against rate-limit safety
  //
  // The setting only affects the per-batch fan-out; resolver geocoding is
  // still serialized at 1 req/s for Nominatim regardless of this value.
  LLM_V3_CONCURRENCY: z.coerce.number().int().positive().default(12),

  // Phase 27.4.4 D-04 / D-13 / D-18: opt-in feature flags for v3 latency remediation.
  // Default OFF for D-04 + D-18 keeps Gate B telemetry pure; activated post-cutover when
  // ops cost > telemetry purity (D-04, D-18).
  V3_ADAPTIVE_BATCH: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  V3_LINEAGE_PREFILTER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Phase 27.4.4 D-13: env-tunable Trigger 1 (auto-rollback) threshold. Default 2
  // (lowered from hardcoded 3 to keep consistent with strict Gate B watchdog=0
  // while letting single timeouts recover without spurious flip).
  V3_WATCHDOG_ROLLBACK_THRESHOLD: z.coerce.number().int().positive().default(2),
  // Phase 27.4.4 D-14: Vercel cron secret. Empty default preserves existing
  // un-authed cron-warm/cron-health behavior; eval-cron route 401s when set.
  CRON_SECRET: z.string().default(''),

  // Phase 27.4.4 Plan 02 — Bearer-token gate for the dashboard surfaces:
  //   - GET  /api/events/llm-pipeline    (state read)
  //   - POST /api/events/llm-pipeline    (cutover flip — the v3 deploy gate)
  //   - POST /api/events/llm-replay/:id  (single-group replay; fires upstream LLM tokens)
  //   - GET  /api/dashboard/auth-check   (client-side gate validation)
  //
  // Behavior (server/middleware/dashboardAuth.ts):
  //   - NODE_ENV !== 'production'           → bypass auth (dev convenience)
  //   - NODE_ENV === 'production' + empty   → 503 auth_not_configured (fail-closed)
  //   - NODE_ENV === 'production' + matches → next()
  //
  // Operator generates the value with `openssl rand -hex 32` and sets it in
  // both `.env.local` (dev parity) and `vercel env add DASHBOARD_PASSWORD
  // production` (prod gate). Replaces the previous `NODE_ENV === 'production'`
  // 404 gates which made the cutover endpoint physically unreachable from the
  // operator's laptop.
  DASHBOARD_PASSWORD: z.string().default(''),

  // Phase 27.4.4 D-20 Option B (RESEARCH §6) — dev/prod Redis key isolation
  // when a separate Upstash database is unavailable. When set (e.g. `dev:`),
  // every key passing through the wrapped `redis` instance + cacheGet/Set
  // helpers gets the prefix applied. Production never sets this so prod keys
  // remain unsuffixed (`events:llm:v3`); dev sets `CACHE_KEY_PREFIX=dev:` in
  // .env.local so dev runs land at `dev:events:llm:v3` and never collide with
  // the live prod cache. Defense-in-depth — survives operator forgetting to
  // swap Upstash databases.
  CACHE_KEY_PREFIX: z.string().default(''),

  // Tuning parameters
  EVENT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
  EVENT_MIN_SOURCES: z.coerce.number().int().min(1).default(2),
  EVENT_CENTROID_PENALTY: z.coerce.number().min(0).max(1).default(0.7),
  EVENT_EXCLUDED_CAMEO: z
    .string()
    .default('180,192')
    .transform((s) =>
      s
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  BELLINGCAT_CORROBORATION_BOOST: z.coerce.number().min(0).max(1).default(0.2),
  NEWS_RELEVANCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export type Env = z.infer<typeof envSchema>;

// Parse eagerly — crashes at startup if required vars are missing.
// In test environments, provide safe defaults for Redis vars so unit tests
// that don't have real Redis don't crash on import.
function parseEnv(): Env {
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTest) {
    // In test: provide safe defaults for Redis vars, but let real env vars override
    const merged = { ...process.env };
    if (!merged.UPSTASH_REDIS_REST_URL)
      merged.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io';
    if (!merged.UPSTASH_REDIS_REST_TOKEN) merged.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    return envSchema.parse(merged);
  }
  return envSchema.parse(process.env);
}

export const env = parseEnv();

// ---------------------------------------------------------------------------
// Backward-compatible config object (replaces old AppConfig / getConfig)
// ---------------------------------------------------------------------------

export interface AppConfig {
  port: number;
  corsOrigin: string;
  opensky: { clientId: string; clientSecret: string };
  aisstream: { apiKey: string };
  acled: { email: string; password: string };
  cerebras: { apiKey: string };
  groq: { apiKey: string };
  newsRelevanceThreshold: number;
  eventConfidenceThreshold: number;
  eventMinSources: number;
  eventCentroidPenalty: number;
  eventExcludedCameo: string[];
  bellingcatCorroborationBoost: number;
}

export const config: AppConfig = {
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  opensky: {
    clientId: env.OPENSKY_CLIENT_ID,
    clientSecret: env.OPENSKY_CLIENT_SECRET,
  },
  aisstream: {
    apiKey: env.AISSTREAM_API_KEY,
  },
  acled: {
    email: env.ACLED_EMAIL,
    password: env.ACLED_PASSWORD,
  },
  cerebras: {
    apiKey: env.CEREBRAS_API_KEY,
  },
  groq: {
    apiKey: env.GROQ_API_KEY,
  },
  newsRelevanceThreshold: env.NEWS_RELEVANCE_THRESHOLD,
  eventConfidenceThreshold: env.EVENT_CONFIDENCE_THRESHOLD,
  eventMinSources: env.EVENT_MIN_SOURCES,
  eventCentroidPenalty: env.EVENT_CENTROID_PENALTY,
  eventExcludedCameo: env.EVENT_EXCLUDED_CAMEO,
  bellingcatCorroborationBoost: env.BELLINGCAT_CORROBORATION_BOOST,
};

/** @deprecated Use `config` directly — kept for backward compat during migration */
export function getConfig(): AppConfig {
  return config;
}

/** @deprecated Use `config` directly */
export function loadConfig(): AppConfig {
  return config;
}

// ---------------------------------------------------------------------------
// Constants (moved from server/constants.ts — same export names)
// ---------------------------------------------------------------------------

/** Start of the US-Iran war — earliest date for historical event data */
export const WAR_START = Date.UTC(2026, 1, 28); // Feb 28, 2026 00:00Z

// Greater Middle East + Mediterranean + Arabian Sea
// Covers full visible map area for ship/event subscriptions
export const IRAN_BBOX: BoundingBox = {
  south: 0.0,
  north: 50.0,
  west: 20.0,
  east: 80.0,
};

// adsb.lol center point for radius query (centered on region)
export const IRAN_CENTER = { lat: 28.0, lon: 45.0 } as const;
export const ADSB_RADIUS_NM = 1200;

// Unit conversion constants (adsb.lol v2 API uses imperial units)
export const KNOTS_TO_MS = 0.514444;
export const FEET_TO_METERS = 0.3048;
export const FPM_TO_MS = 0.00508; // feet per minute to meters per second

// Sites cache TTL (24 hours -- static infrastructure data)
export const SITES_CACHE_TTL = 86_400_000;

// Cache TTL values per data source (milliseconds)
export const CACHE_TTL = {
  flights: 10_000, // 10s -- OpenSky polling interval
  adsblolFlights: 30_000, // 30s -- adsb.lol community API (respectful polling)
  ships: 0, // N/A for WebSocket push
  events: 900_000, // 15min -- GDELT updates every 15 minutes
  news: 900_000, // 15min -- news feed TTL
} as const;

// Markets cache TTL (5 minutes -- matches client polling interval)
export const MARKETS_CACHE_TTL = 300_000; // 5 min logical TTL
export const MARKETS_REDIS_TTL_SEC = 3000; // 50 min hard TTL (10x logical)

// Weather cache TTL (30 minutes -- Open-Meteo hourly update frequency)
export const WEATHER_CACHE_TTL = 1_800_000; // 30 min logical TTL
export const WEATHER_REDIS_TTL_SEC = 18_000; // 5h hard TTL (10x logical)
export const WEATHER_CACHE_KEY = 'weather:open-meteo';

// Water infrastructure cache TTLs
export const WATER_CACHE_TTL = 86_400_000; // 24h logical TTL
export const WATER_REDIS_TTL_SEC = 604_800; // 7 days hard TTL
export const WATER_PRECIP_CACHE_TTL = 21_600_000; // 6h logical TTL
export const WATER_PRECIP_REDIS_TTL_SEC = 86_400; // 1 day hard TTL

// News aggregation constants
export const NEWS_CACHE_TTL = 900_000; // 15 min logical TTL
export const NEWS_REDIS_TTL_SEC = 9000; // 2.5h hard TTL (10x logical)
export const NEWS_SLIDING_WINDOW_MS = 7 * 86_400_000; // 7 days
export const NEWS_CLUSTER_WINDOW_MS = 86_400_000; // 24h fuzzy match window
export const NEWS_JACCARD_THRESHOLD = 0.8;
export const NEWS_MIN_TOKENS_FOR_FUZZY = 5;

// ---------------------------------------------------------------------------
// Phase 27.4 flag readers
// ---------------------------------------------------------------------------

/**
 * Phase 27.4 (D-24) W4 fix: single-source-of-truth reader for the
 * LLM_PIPELINE_V2 flag. Read at request-time (not module-init) so a Vercel
 * dashboard flip takes effect without a rebuild. Every consumer MUST use
 * this helper rather than `process.env.LLM_PIPELINE_V2 === 'true'` —
 * centralization prevents string-literal drift and eases the 27.5 flag
 * deletion.
 *
 * Post-debug 2026-04-21: `isPipelineV2()` now ALSO honors an in-memory
 * override (`setPipelineOverride('v1' | 'v2' | null)`) that takes precedence
 * over the env var. The override is hydrated from Redis at request boundary
 * via `refreshPipelineOverride()` — called from the /api/events route
 * handler — and written through by the POST /api/events/llm-pipeline
 * toggle endpoint. This keeps the dev pipeline switchable at runtime
 * without a restart while preserving the sync call surface that ~5 call
 * sites depend on.
 *
 * Precedence:  override > env var  (env default flipped to 'true' 2026-04-21)
 */
let pipelineOverride: 'v1' | 'v2' | 'v3' | null = null;

export function setPipelineOverride(v: 'v1' | 'v2' | 'v3' | null): void {
  pipelineOverride = v;
}

export function getPipelineOverride(): 'v1' | 'v2' | 'v3' | null {
  return pipelineOverride;
}

export function isPipelineV2(): boolean {
  if (pipelineOverride === 'v2') return true;
  if (pipelineOverride === 'v1' || pipelineOverride === 'v3') return false;
  // Phase 27.4.3 (D-07): when LLM_PIPELINE_V3 is true, v3 wins; v2 is off.
  if (process.env.LLM_PIPELINE_V3 === 'true') return false;
  return process.env.LLM_PIPELINE_V2 === 'true';
}

/**
 * Phase 27.4.3 (D-07) v3 pipeline activation. Same precedence ladder as
 * isPipelineV2 — runtime override beats env. Returns true ONLY when the
 * v3 path is the active extractor; consumers must use this helper rather
 * than reading the env directly so the override stays consistent across
 * all 3-4 call sites.
 */
export function isPipelineV3(): boolean {
  if (pipelineOverride === 'v3') return true;
  if (pipelineOverride === 'v1' || pipelineOverride === 'v2') return false;
  return process.env.LLM_PIPELINE_V3 === 'true';
}

/** Convenience helper for barrels and route handlers. */
export function getPipelineVersion(): 'v1' | 'v2' | 'v3' {
  if (isPipelineV3()) return 'v3';
  if (isPipelineV2()) return 'v2';
  return 'v1';
}
