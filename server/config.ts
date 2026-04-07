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
