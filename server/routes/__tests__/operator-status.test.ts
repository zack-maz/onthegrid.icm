// @vitest-environment node
/**
 * Phase 28.2 W5 Plan 05 Task 7.5 — `/api/operator-status` route tests.
 *
 * Asserts:
 *   1. Bearer required (401 without token; 200 with valid token)
 *   2. Aggregator shape: audit24h + byBearer + advEval
 *   3. advEval is null when sidecar key is empty
 *
 * Phase 29 D-02 part A — pin-version override block removed from route +
 * tests. The TTL-countdown probe is gone with it.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock redis BEFORE importing the route module.
// Phase 29 D-02 part A — `ttl` reader removed; pinned override TTL probe
// is no longer read by the route.
// Phase 32 Plan 04 — extended with `scan` (for `buildDeadUrlSample` SCAN
// over `events:url-liveness:*`) and `cacheGetSafe` (for per-event liveness
// reads inside the SCAN loop). MEDIUM-01 plan-checker pin: `scan` mock
// returns `[string | number, string[]]` matching `@upstash/redis ^1.37.0`.
const mockRedis = {
  smembers: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
};
const mockCacheGetSafe = vi.fn();
vi.mock('../../cache/redis.js', () => ({
  redis: mockRedis,
  cacheGetSafe: mockCacheGetSafe,
}));

const { operatorStatusRouter } = await import('../operator-status.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', operatorStatusRouter);
  return app;
}

describe('/api/operator-status route (Phase 28.2 W5 Task 7.5)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.DASHBOARD_PASSWORD = ORIGINAL_DASHBOARD_PASSWORD;
  });

  it('Test 1 (Bearer required, prod): returns 401 without Bearer, 200 with valid Bearer', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'test-secret';
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.get.mockResolvedValue(null);

    const app = makeApp();

    // No Bearer -> 401
    const noAuth = await request(app).get('/api/operator-status');
    expect(noAuth.status).toBe(401);

    // Valid Bearer -> 200
    const auth = await request(app)
      .get('/api/operator-status')
      .set('Authorization', 'Bearer test-secret');
    expect(auth.status).toBe(200);
  });

  it('Test 2 (shape): aggregates audit24h + byBearer + advEval', async () => {
    // Use dev mode to bypass auth; route logic is identical.
    process.env.NODE_ENV = 'development';

    const now = Date.now();
    const audit = [
      JSON.stringify({
        timestamp: now - 1_000,
        bearerFingerprint: 'abc12345',
        operation: 'pipeline-swap',
      }),
      JSON.stringify({
        timestamp: now - 2_000,
        bearerFingerprint: 'abc12345',
        operation: 'replay',
      }),
      JSON.stringify({
        timestamp: now - 3_000,
        bearerFingerprint: 'abc12345',
        operation: 'replay',
      }),
      // Older than 24h — excluded from rolling count
      JSON.stringify({
        timestamp: now - 86_400_001 - 1_000,
        bearerFingerprint: 'old00001',
        operation: 'replay',
      }),
    ];
    mockRedis.smembers.mockResolvedValue(audit);
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:llm-eval-adversarial:v3') {
        return JSON.stringify({ total: 10, blocked: 9, leaked: 1, score: 0.9 });
      }
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);

    const body = res.body as {
      audit24h: number;
      byBearer: Array<{
        bearerFingerprint: string;
        actions: number;
        swaps: number;
        replays: number;
      }>;
      advEval: { total: number; blocked: number; leaked: number } | null;
    };

    // 3 entries within 24h, 1 older (excluded)
    expect(body.audit24h).toBe(3);
    expect(body.byBearer).toHaveLength(1);
    expect(body.byBearer[0].bearerFingerprint).toBe('abc12345');
    expect(body.byBearer[0].actions).toBe(3);
    expect(body.byBearer[0].swaps).toBe(1);
    expect(body.byBearer[0].replays).toBe(2);

    expect(body.advEval).not.toBeNull();
    expect(body.advEval?.total).toBe(10);
    expect(body.advEval?.blocked).toBe(9);
    expect(body.advEval?.leaked).toBe(1);
  });

  // Phase 29 D-02 part A — Test 3 removed (probed pin-version null branches;
  // the render block + Redis TTL read are deleted from the route).

  it('Test 4 (advEval absent): returns null when sidecar key is empty', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.get.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.advEval).toBeNull();
  });
});

/**
 * Phase 32 Plan 04 — `prune` sibling block on `/api/operator-status`.
 *
 * The aggregator now surfaces dead-URL ghost-event observability + a
 * bounded drill-down list so the API Health dashboard (Plan 32-05) can
 * render a count + first-20 entries without an additional API call:
 *
 *   prune: {
 *     deadUrlCount: number;       // events:url-liveness-count sidecar (O(1))
 *     last24hPrunes: number;      // in-memory pass over already-parsed audit
 *     deadUrlSample: Array<{      // SCAN events:url-liveness:* (cap 20)
 *       eventId: string;
 *       url: string;
 *       status: 'dead-host' | '403' | '404';
 *     }>;
 *   }
 *
 * Tests pin (a) sidecar-read happy path + degrade-open paths, (b) audit
 * pass derives `last24hPrunes` correctly, (c) `byBearer[].prunes` counter
 * widens to count prune-dead-urls entries, and (d) the SCAN-backed
 * drill-down sample respects the LIMIT_DRILL_DOWN=20 + MAX_SCAN_KEYS=200
 * budget guards and degrades-open on Redis throw.
 */
describe('/api/operator-status — Phase 32 Plan 04 `prune` block', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty audit log + empty SCAN; individual tests override.
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.scan.mockResolvedValue([0, []]);
    mockCacheGetSafe.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.DASHBOARD_PASSWORD = ORIGINAL_DASHBOARD_PASSWORD;
  });

  // ---------------------------------------------------------------------------
  // prune.deadUrlCount — sidecar key reader (Pitfall 3 mitigation)
  // ---------------------------------------------------------------------------

  it('prune.deadUrlCount: reads sidecar key when present as a number', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:url-liveness-count') return 5;
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.prune).toBeDefined();
    expect(res.body.prune.deadUrlCount).toBe(5);
  });

  it('prune.deadUrlCount: defaults to 0 when sidecar key absent (null)', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.prune.deadUrlCount).toBe(0);
  });

  it('prune.deadUrlCount: defaults to 0 when sidecar returns NaN garbage', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:url-liveness-count') return 'not-a-number';
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.prune.deadUrlCount).toBe(0);
  });

  it('prune.deadUrlCount: defaults to 0 when redis.get throws (degrade-open, 200 preserved)', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:url-liveness-count') {
        throw new Error('Redis death');
      }
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    // GET handler must still return 200 — count failure is per-block isolated.
    expect(res.status).toBe(200);
    expect(res.body.prune.deadUrlCount).toBe(0);
  });

  it('prune.deadUrlCount: floors negative counts at 0 (underflow defense)', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:url-liveness-count') return -3;
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.prune.deadUrlCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // prune.last24hPrunes — derived from already-parsed audit entries
  // (zero additional Redis round-trips)
  // ---------------------------------------------------------------------------

  it('prune.last24hPrunes: counts only `prune-dead-urls` entries in the last 24h window', async () => {
    process.env.NODE_ENV = 'development';
    const now = Date.now();
    const audit = [
      JSON.stringify({
        timestamp: now - 1_000,
        bearerFingerprint: 'fp-a',
        operation: 'prune-dead-urls',
      }),
      JSON.stringify({
        timestamp: now - 2_000,
        bearerFingerprint: 'fp-a',
        operation: 'prune-dead-urls',
      }),
      // > 24h ago — excluded from the rolling window.
      JSON.stringify({
        timestamp: now - 86_400_001 - 1_000,
        bearerFingerprint: 'fp-old',
        operation: 'prune-dead-urls',
      }),
      // Different operation — must NOT count toward last24hPrunes.
      JSON.stringify({
        timestamp: now - 3_000,
        bearerFingerprint: 'fp-a',
        operation: 'replay',
      }),
    ];
    mockRedis.smembers.mockResolvedValue(audit);
    mockRedis.get.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.prune.last24hPrunes).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // byBearer[].prunes — local AuditEntry union widening + aggregator counter
  // ---------------------------------------------------------------------------

  it('byBearer[].prunes: increments per prune-dead-urls entry, attributed to bearer fingerprint', async () => {
    process.env.NODE_ENV = 'development';
    const now = Date.now();
    const audit = [
      // 3 manual prunes by fp-a
      JSON.stringify({
        timestamp: now - 1_000,
        bearerFingerprint: 'fp-a',
        operation: 'prune-dead-urls',
      }),
      JSON.stringify({
        timestamp: now - 2_000,
        bearerFingerprint: 'fp-a',
        operation: 'prune-dead-urls',
      }),
      JSON.stringify({
        timestamp: now - 3_000,
        bearerFingerprint: 'fp-a',
        operation: 'prune-dead-urls',
      }),
      // 1 cron-origin prune (literal bearerFingerprint per RESEARCH A8)
      JSON.stringify({
        timestamp: now - 4_000,
        bearerFingerprint: 'cron:refresh-events',
        operation: 'prune-dead-urls',
      }),
    ];
    mockRedis.smembers.mockResolvedValue(audit);
    mockRedis.get.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);

    const byBearer = res.body.byBearer as Array<{
      bearerFingerprint: string;
      actions: number;
      swaps: number;
      replays: number;
      prunes: number;
    }>;

    const fpA = byBearer.find((b) => b.bearerFingerprint === 'fp-a');
    expect(fpA).toBeDefined();
    expect(fpA?.prunes).toBe(3);
    expect(fpA?.actions).toBe(3);

    const cron = byBearer.find((b) => b.bearerFingerprint === 'cron:refresh-events');
    expect(cron).toBeDefined();
    expect(cron?.prunes).toBe(1);
    expect(cron?.actions).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // prune.deadUrlSample — SCAN over events:url-liveness:* (LOW-03 drill-down)
  // ---------------------------------------------------------------------------

  it('prune.deadUrlSample: returns terminal-dead entries with {eventId, url, status} shape', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockResolvedValue(null);

    // 25 keys total, mixed statuses — only 10 are terminal-dead.
    const keys: string[] = [];
    const statuses: Array<'live' | 'unknown' | '404' | 'dead-host' | '403'> = [
      // 10 live (excluded)
      ...Array<'live'>(10).fill('live'),
      // 5 unknown (excluded)
      ...Array<'unknown'>(5).fill('unknown'),
      // 5 '404' + 3 'dead-host' + 2 '403' = 10 terminal-dead
      ...Array<'404'>(5).fill('404'),
      ...Array<'dead-host'>(3).fill('dead-host'),
      ...Array<'403'>(2).fill('403'),
    ];
    const valueByKey: Record<string, unknown> = {};
    for (let i = 0; i < 25; i++) {
      const key = `events:url-liveness:event-${i}`;
      keys.push(key);
      valueByKey[key] = {
        data: {
          status: statuses[i],
          lastProbedAt: new Date().toISOString(),
          attemptCount: 1,
          lastUrlProbed: `https://example.com/article-${i}`,
          lastHttpStatus: statuses[i] === 'live' ? 200 : 404,
        },
        stale: false,
        lastFresh: Date.now(),
      };
    }
    mockRedis.scan.mockResolvedValueOnce([0, keys]);
    mockCacheGetSafe.mockImplementation(async (key: string) => valueByKey[key] ?? null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);

    const sample = res.body.prune.deadUrlSample as Array<{
      eventId: string;
      url: string;
      status: 'dead-host' | '403' | '404';
    }>;

    // 10 terminal-dead — under the LIMIT_DRILL_DOWN=20 cap.
    expect(sample).toHaveLength(10);
    for (const entry of sample) {
      expect(typeof entry.eventId).toBe('string');
      expect(entry.eventId.length).toBeGreaterThan(0);
      // eventId is the bare ID (no `events:url-liveness:` prefix leaked).
      expect(entry.eventId.startsWith('events:url-liveness:')).toBe(false);
      expect(typeof entry.url).toBe('string');
      expect(['dead-host', '403', '404']).toContain(entry.status);
    }
    // No 'live' or 'unknown' bleeds through.
    expect(sample.every((e) => e.status !== ('live' as unknown))).toBe(true);
    expect(sample.every((e) => e.status !== ('unknown' as unknown))).toBe(true);
  });

  it('prune.deadUrlSample: caps at 20 entries when more than 20 terminal-dead exist', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockResolvedValue(null);

    const keys: string[] = [];
    const valueByKey: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      const key = `events:url-liveness:event-${i}`;
      keys.push(key);
      valueByKey[key] = {
        data: {
          status: '404',
          lastProbedAt: new Date().toISOString(),
          attemptCount: 1,
          lastUrlProbed: `https://example.com/article-${i}`,
          lastHttpStatus: 404,
        },
        stale: false,
        lastFresh: Date.now(),
      };
    }
    mockRedis.scan.mockResolvedValueOnce([0, keys]);
    mockCacheGetSafe.mockImplementation(async (key: string) => valueByKey[key] ?? null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);

    const sample = res.body.prune.deadUrlSample as Array<unknown>;
    expect(sample).toHaveLength(20);
  });

  it('prune.deadUrlSample: defaults to [] when SCAN throws (degrade-open, deadUrlCount still populated)', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'events:url-liveness-count') return 5;
      return null;
    });
    mockRedis.scan.mockRejectedValue(new Error('SCAN unavailable'));

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    // GET still returns 200 — sample failure is isolated.
    expect(res.status).toBe(200);
    expect(res.body.prune.deadUrlSample).toEqual([]);
    // Sidecar read succeeded independently of SCAN failure.
    expect(res.body.prune.deadUrlCount).toBe(5);
  });

  it('prune.deadUrlSample: short-circuits SCAN at MAX_SCAN_KEYS=200 to bound budget', async () => {
    process.env.NODE_ENV = 'development';
    mockRedis.get.mockResolvedValue(null);

    // Seed paginated SCAN returning 300 keys total across 6 pages of 50.
    // All keys are non-terminal-dead (`unknown`) so the LIMIT_DRILL_DOWN
    // sample cap doesn't short-circuit before MAX_SCAN_KEYS does.
    let scannedKeysTotal = 0;
    const PAGE_SIZE = 50;
    const TOTAL = 300;
    mockRedis.scan.mockImplementation(async (cursor: number | string) => {
      const cur = typeof cursor === 'string' ? Number(cursor) : cursor;
      const start = cur;
      const end = Math.min(start + PAGE_SIZE, TOTAL);
      const page: string[] = [];
      for (let i = start; i < end; i++) page.push(`events:url-liveness:event-${i}`);
      const nextCursor = end >= TOTAL ? 0 : end;
      return [nextCursor, page];
    });
    mockCacheGetSafe.mockImplementation(async (_key: string) => {
      scannedKeysTotal += 1;
      // All `unknown` — never matches the terminal-dead filter, so LIMIT_DRILL_DOWN=20 cap never trips.
      return {
        data: {
          status: 'unknown',
          lastProbedAt: new Date().toISOString(),
          attemptCount: 0,
          lastUrlProbed: 'https://example.com/x',
          lastHttpStatus: null,
        },
        stale: false,
        lastFresh: Date.now(),
      };
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    // MAX_SCAN_KEYS=200 short-circuit prevents loading >200 entries.
    expect(scannedKeysTotal).toBeLessThanOrEqual(200);
    // No terminal-dead entries — sample stays empty.
    expect(res.body.prune.deadUrlSample).toEqual([]);
  });
});
