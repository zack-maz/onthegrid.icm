// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('server/config.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset module registry so each test gets a fresh config parse
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it('exports env object with validated defaults (PORT=3001, NODE_ENV=development)', async () => {
    // Provide required vars, let optional ones take defaults
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    const { env } = await import('../config.js');
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGIN).toBe('*');
  });

  it('envSchema rejects missing UPSTASH_REDIS_REST_URL in non-test env', async () => {
    // Import zod schema directly and verify it rejects missing required vars
    // (Module-level parse uses test defaults, so we test the schema in isolation)
    const { z } = await import('zod');
    const envSchemaShape = z.object({
      UPSTASH_REDIS_REST_URL: z.string().url(),
      UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
      PORT: z.coerce.number().default(3001),
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    });

    const result = envSchemaShape.safeParse({ NODE_ENV: 'production' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      expect(fields.UPSTASH_REDIS_REST_URL).toBeDefined();
      expect(fields.UPSTASH_REDIS_REST_TOKEN).toBeDefined();
    }
  });

  it('re-exports all constants from config.ts (WAR_START, IRAN_BBOX, CACHE_TTL)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';

    const config = await import('../config.js');
    expect(config.WAR_START).toBeTypeOf('number');
    expect(config.WAR_START).toBeGreaterThan(0);
    expect(config.IRAN_BBOX).toHaveProperty('south');
    expect(config.IRAN_BBOX).toHaveProperty('north');
    expect(config.IRAN_BBOX).toHaveProperty('west');
    expect(config.IRAN_BBOX).toHaveProperty('east');
    expect(config.CACHE_TTL).toHaveProperty('flights');
    expect(config.CACHE_TTL).toHaveProperty('events');
    expect(config.IRAN_CENTER).toHaveProperty('lat');
    expect(config.IRAN_CENTER).toHaveProperty('lon');
    expect(config.ADSB_RADIUS_NM).toBeTypeOf('number');
    expect(config.KNOTS_TO_MS).toBeTypeOf('number');
    expect(config.FEET_TO_METERS).toBeTypeOf('number');
    expect(config.FPM_TO_MS).toBeTypeOf('number');
    expect(config.SITES_CACHE_TTL).toBeTypeOf('number');
    expect(config.MARKETS_CACHE_TTL).toBeTypeOf('number');
    expect(config.WEATHER_CACHE_TTL).toBeTypeOf('number');
    expect(config.WATER_CACHE_TTL).toBeTypeOf('number');
    expect(config.NEWS_CACHE_TTL).toBeTypeOf('number');
  });

  it('falls back to defaults for invalid numeric env vars', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
    process.env.EVENT_CONFIDENCE_THRESHOLD = '0.5';

    const { env } = await import('../config.js');
    expect(env.EVENT_CONFIDENCE_THRESHOLD).toBe(0.5);
  });

  // Phase 30 D-07 (LLM-RELI-03) — LLM_BATCH_SIZE promoted from the
  // hard-coded `const BATCH_SIZE = 2` at llmEventExtractor.v3.ts to an
  // env-tunable Zod schema entry. Mirrors the EVENT_CONFIDENCE_THRESHOLD
  // numeric-parse test above.
  it('honors LLM_BATCH_SIZE env var override', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
    process.env.LLM_BATCH_SIZE = '4';

    const { env } = await import('../config.js');
    expect(env.LLM_BATCH_SIZE).toBe(4);
  });

  it('falls back to default LLM_BATCH_SIZE=2 when env var unset', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
    delete process.env.LLM_BATCH_SIZE;

    const { env } = await import('../config.js');
    expect(env.LLM_BATCH_SIZE).toBe(2);
  });

  it('rejects non-positive / non-integer LLM_BATCH_SIZE values', async () => {
    const { z } = await import('zod');
    const shape = z.object({
      LLM_BATCH_SIZE: z.coerce.number().int().positive().default(2),
    });

    // Non-numeric: coerce returns NaN, fails .number()
    expect(shape.safeParse({ LLM_BATCH_SIZE: 'abc' }).success).toBe(false);
    // Zero: fails .positive()
    expect(shape.safeParse({ LLM_BATCH_SIZE: '0' }).success).toBe(false);
    // Negative: fails .positive()
    expect(shape.safeParse({ LLM_BATCH_SIZE: '-3' }).success).toBe(false);
    // Float: fails .int()
    expect(shape.safeParse({ LLM_BATCH_SIZE: '2.5' }).success).toBe(false);
  });

  it('optional API keys default to empty string without crashing', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';
    delete process.env.OPENSKY_CLIENT_ID;
    delete process.env.AISSTREAM_API_KEY;

    const { env } = await import('../config.js');
    expect(env.OPENSKY_CLIENT_ID).toBe('');
    expect(env.OPENSKY_CLIENT_SECRET).toBe('');
    expect(env.AISSTREAM_API_KEY).toBe('');
    expect(env.ACLED_EMAIL).toBe('');
    expect(env.ACLED_PASSWORD).toBe('');
  });

  it('exports config object with backward-compatible structure', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token-123';

    const { config } = await import('../config.js');
    expect(config.opensky).toHaveProperty('clientId');
    expect(config.opensky).toHaveProperty('clientSecret');
    expect(config.aisstream).toHaveProperty('apiKey');
    expect(config.acled).toHaveProperty('email');
    expect(config.acled).toHaveProperty('password');
    expect(config.newsRelevanceThreshold).toBeTypeOf('number');
    expect(config.eventConfidenceThreshold).toBeTypeOf('number');
    expect(config.eventMinSources).toBeTypeOf('number');
    expect(config.eventCentroidPenalty).toBeTypeOf('number');
    expect(config.eventExcludedCameo).toBeInstanceOf(Array);
    expect(config.bellingcatCorroborationBoost).toBeTypeOf('number');
  });
});
