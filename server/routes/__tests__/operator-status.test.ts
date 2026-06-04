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
import { z } from 'zod';

// Mock redis BEFORE importing the route module.
// Phase 29 D-02 part A — `ttl` reader removed; pinned override TTL probe
// is no longer read by the route.
// Phase 32 Plan 04 — extended with `scan` (for `buildDeadUrlSample` SCAN
// over `events:url-liveness:*`) and `cacheGetSafe` (for per-event liveness
// reads inside the SCAN loop). MEDIUM-01 plan-checker pin: `scan` mock
// returns `[string | number, string[]]` matching `@upstash/redis ^1.37.0`.
// Phase 39 Plan 03 — extended with `hgetall` for the tokenBudget block's
// `events:llm-cost-shadow:v3:{date}` cost-shadow roll-up read.
const mockRedis = {
  smembers: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
  hgetall: vi.fn(),
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
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      // Phase 33 Plan 06 — `/api/operator-status` aggregator also reads
      // `events:llm:v3` for the actorQuality block. Scope the SCAN-budget
      // counter to URL-liveness keys only, otherwise the actorQuality
      // cacheGetSafe call inflates `scannedKeysTotal` past the
      // `MAX_SCAN_KEYS` contract by 1 (off-by-one observed in CI 2026-05-21).
      if (key.startsWith('events:url-liveness:')) {
        scannedKeysTotal += 1;
      }
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

/**
 * Phase 33 Plan 06 — `/api/operator-status` actorQuality block (D-16).
 *
 * The aggregator surfaces actor-metadata health from the LLM-enriched events
 * cache (`events:llm:v3`) so the API Health dashboard (Plan 33-07) can render
 * continuous bucket counts + low-confidence counters without re-running the
 * one-shot audit script (Plan 33-01).
 *
 *   actorQuality: {
 *     totalEvents: number;
 *     nullActors: number;       // bucket (a) — null/empty/whitespace
 *     rawCameoActors: number;   // bucket (b) — raw CAMEO ∩ codebook
 *     ambiguousActors: number;  // bucket (c) — ambiguous deny-list
 *     lowConfidenceActors: number; // actorConfidence.includes('low')
 *     sample: Array<{           // capped at LIMIT_DRILL_DOWN (20)
 *       eventId: string;
 *       actors: string[];
 *       actorConfidence: ('high'|'medium'|'low')[];
 *       issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
 *     }>;
 *   } | null
 *
 * PATTERNS critical risk #3 — the codebook subset is INLINE in the route
 * (not loaded from .planning/) because .planning/ is NOT bundled into the
 * Vercel server build artifact.
 *
 * T-33-05b — degrade-open: any Redis flap inside the actorQuality block
 * leaves `actorQuality: null` on a 200 response, never bubbles a 500.
 */
describe('/api/operator-status — Phase 33 Plan 06 actorQuality block (D-16)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty audit log + empty SCAN + null sidecar reads.
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.scan.mockResolvedValue([0, []]);
    mockRedis.get.mockResolvedValue(null);
    // Default cacheGetSafe: null (cache miss). Individual tests override
    // to supply ConflictEventEntity[] payloads for the actorQuality block.
    mockCacheGetSafe.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.DASHBOARD_PASSWORD = ORIGINAL_DASHBOARD_PASSWORD;
  });

  // ---------------------------------------------------------------------------
  // Shape + bucket counts — D-16 verbatim
  // ---------------------------------------------------------------------------

  it('actorQuality: returns block with computed counts when events:llm:v3 cache populated', async () => {
    process.env.NODE_ENV = 'development';

    // 4 events covering 4 buckets:
    //   - actors:[]                      → 'null'
    //   - actors:['ISRMIL'] (raw CAMEO)  → 'raw-cameo'
    //   - actors:['forces'] (ambiguous)  → 'ambiguous'
    //   - actors:['Israeli Defense Forces'] (clean), conf high → no bucket-a/b/c
    const payload = {
      data: [
        {
          id: 'llm-v3-evt-1',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'evt-1',
          data: { actors: [], actorConfidence: [] },
        },
        {
          id: 'llm-v3-evt-2',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'evt-2',
          data: { actors: ['ISRMIL'], actorConfidence: ['low'] },
        },
        {
          id: 'llm-v3-evt-3',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'evt-3',
          data: { actors: ['forces'], actorConfidence: ['low'] },
        },
        {
          id: 'llm-v3-evt-4',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'evt-4',
          data: { actors: ['Israeli Defense Forces'], actorConfidence: ['high'] },
        },
      ],
      stale: false,
      lastFresh: Date.now(),
    };
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') return payload;
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);

    expect(res.body.actorQuality).toBeDefined();
    expect(res.body.actorQuality).not.toBeNull();
    const aq = res.body.actorQuality as {
      totalEvents: number;
      nullActors: number;
      rawCameoActors: number;
      ambiguousActors: number;
      lowConfidenceActors: number;
      sample: Array<{
        eventId: string;
        actors: string[];
        actorConfidence: ('high' | 'medium' | 'low')[];
        issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
      }>;
    };

    expect(aq.totalEvents).toBe(4);
    expect(aq.nullActors).toBe(1);
    expect(aq.rawCameoActors).toBe(1);
    expect(aq.ambiguousActors).toBe(1);
    // 3 events carry 'low' in actorConfidence (evt-2, evt-3 explicit; evt-1 is empty actors[]
    // and the implementation default-substitutes 'low' for missing confidence only when
    // actors is non-empty — evt-1's empty actorConfidence is empty too).
    expect(aq.lowConfidenceActors).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(aq.sample)).toBe(true);
    // 3 of the 4 events are bucket-a/b/c hits → at least 3 sample entries.
    expect(aq.sample.length).toBeGreaterThanOrEqual(3);
  });

  // ---------------------------------------------------------------------------
  // Sample cap = LIMIT_DRILL_DOWN (20)
  // ---------------------------------------------------------------------------

  it('actorQuality.sample: capped at LIMIT_DRILL_DOWN (20) when more issues exist', async () => {
    process.env.NODE_ENV = 'development';

    // 30 events all with actors:[] → all bucket-a hits.
    const entities = Array.from({ length: 30 }, (_, i) => ({
      id: `llm-v3-evt-${i}`,
      type: 'airstrike',
      lat: 32,
      lng: 35,
      timestamp: Date.now(),
      label: `evt-${i}`,
      data: { actors: [], actorConfidence: [] },
    }));
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') {
        return { data: entities, stale: false, lastFresh: Date.now() };
      }
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.actorQuality.sample.length).toBe(20);
    // All 30 events count toward bucket-a, regardless of sample cap.
    expect(res.body.actorQuality.nullActors).toBe(30);
    expect(res.body.actorQuality.totalEvents).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Sample entry shape
  // ---------------------------------------------------------------------------

  it('actorQuality.sample: entries carry eventId, actors, actorConfidence, issue (one of 4 union members)', async () => {
    process.env.NODE_ENV = 'development';

    const payload = {
      data: [
        {
          id: 'llm-v3-bad',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'bad',
          data: { actors: ['forces'], actorConfidence: ['low'] },
        },
      ],
      stale: false,
      lastFresh: Date.now(),
    };
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') return payload;
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.actorQuality.sample.length).toBeGreaterThanOrEqual(1);

    const s = res.body.actorQuality.sample[0] as {
      eventId: string;
      actors: string[];
      actorConfidence: string[];
      issue: string;
    };
    expect(s).toHaveProperty('eventId');
    expect(s).toHaveProperty('actors');
    expect(s).toHaveProperty('actorConfidence');
    expect(s).toHaveProperty('issue');
    expect(['null', 'raw-cameo', 'ambiguous', 'low-confidence']).toContain(s.issue);
    expect(s.eventId).toBe('llm-v3-bad');
  });

  // ---------------------------------------------------------------------------
  // T-33-05b — degrade-open contract (Redis throw / null cache)
  // ---------------------------------------------------------------------------

  it('actorQuality: degrade-open when cacheGetSafe throws → actorQuality === null, route 200', async () => {
    process.env.NODE_ENV = 'development';
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') throw new Error('redis down');
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    // Per Pitfall 6 dual-gate: degrade-open must not 500.
    expect(res.status).toBe(200);
    expect(res.body.actorQuality).toBeNull();
  });

  it('actorQuality: degrade-open when cacheGetSafe returns null → actorQuality === null, route 200', async () => {
    process.env.NODE_ENV = 'development';
    // cacheGetSafe returns null when both Redis and memCache miss.
    mockCacheGetSafe.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    // Per D-16 + T-33-05b: no payload → degrade-open with actorQuality === null.
    expect(res.body.actorQuality).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Low-confidence detection (actorConfidence.includes('low'))
  // ---------------------------------------------------------------------------

  it('actorQuality.lowConfidenceActors: increments for every event whose actorConfidence carries a low entry', async () => {
    process.env.NODE_ENV = 'development';

    const payload = {
      data: [
        {
          id: 'low-1',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'low-1',
          data: { actors: ['Israeli Defense Forces'], actorConfidence: ['low'] },
        },
        {
          id: 'low-2',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'low-2',
          data: {
            actors: ['Quds Force', 'Hezbollah'],
            actorConfidence: ['high', 'low'],
          },
        },
        {
          id: 'high-only',
          type: 'airstrike',
          lat: 32,
          lng: 35,
          timestamp: Date.now(),
          label: 'high-only',
          data: { actors: ['Hamas'], actorConfidence: ['high'] },
        },
      ],
      stale: false,
      lastFresh: Date.now(),
    };
    mockCacheGetSafe.mockImplementation(async (key: string) => {
      if (key === 'events:llm:v3') return payload;
      return null;
    });

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.actorQuality.lowConfidenceActors).toBe(2);
    // The 'high-only' event has no bucket-a/b/c hit AND no 'low' confidence,
    // so the sample should not include it.
    const sampleIds = (res.body.actorQuality.sample as Array<{ eventId: string }>).map(
      (s) => s.eventId,
    );
    expect(sampleIds).not.toContain('high-only');
  });
});

/**
 * Phase 39 Plan 03 — `/api/operator-status` tokenBudget block (BUDGET-03/04).
 *
 * The aggregator surfaces per-provider token used/cap/soft/hard/state +
 * today's cost-shadow USD so the BudgetBlock dashboard (Plan 39-05) renders
 * the operator's live spend without an extra API call.
 *
 *   tokenBudget: {
 *     providers: { nvidia_nim: { used, cap, soft, hard, state } };
 *     costShadow: { tokensIn, tokensOut, usd };
 *   } | null
 *
 * Tests pin:
 *   - GA-4 shape via a Zod `.strict()` schema that REJECTS extra keys
 *     (BUDGET-04 dashboard regression lock).
 *   - microcents->USD conversion (30000 microcents → 0.03 USD).
 *   - degrade-open on Redis throw → tokenBudget === null, route 200
 *     (BUDGET-03, mirrors actorQuality T-39-03-D).
 */
describe('/api/operator-status — Phase 39 Plan 03 tokenBudget block (BUDGET-03/04)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

  // Zod `.strict()` schema mirroring the GA-4 provider-keyed map shape. Every
  // object level is `.strict()` so an extra key anywhere makes `.parse` throw.
  const providerSchema = z
    .object({
      used: z.number(),
      cap: z.number(),
      soft: z.number(),
      hard: z.number(),
      state: z.enum(['ok', 'soft', 'hard']),
    })
    .strict();
  const tokenBudgetSchema = z
    .object({
      providers: z.object({ nvidia_nim: providerSchema }).strict(),
      costShadow: z
        .object({
          tokensIn: z.number(),
          tokensOut: z.number(),
          usd: z.number(),
        })
        .strict(),
    })
    .strict();

  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: empty audit + SCAN, null sidecar reads, null cache.
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.scan.mockResolvedValue([0, []]);
    mockRedis.get.mockResolvedValue(null);
    mockCacheGetSafe.mockResolvedValue(null);
    // Cost-shadow HSET fixture: 30000 microcents → 0.03 USD.
    mockRedis.hgetall.mockResolvedValue({
      tokensIn: 100,
      tokensOut: 50,
      usdMicrocents: 30000,
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.DASHBOARD_PASSWORD = ORIGINAL_DASHBOARD_PASSWORD;
  });

  it('tokenBudget Zod .strict() pin: matches GA-4 shape AND rejects extra keys', async () => {
    process.env.NODE_ENV = 'development';

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.tokenBudget).not.toBeNull();

    // Happy path: the live shape parses cleanly under `.strict()`.
    expect(() => tokenBudgetSchema.parse(res.body.tokenBudget)).not.toThrow();

    // Conversion correctness: 30000 microcents / 1e6 === 0.03 USD.
    expect(res.body.tokenBudget.costShadow.usd).toBe(0.03);
    expect(res.body.tokenBudget.costShadow.tokensIn).toBe(100);
    expect(res.body.tokenBudget.costShadow.tokensOut).toBe(50);

    // Provider map: dormant v3 counter reads 0/1000000 (ok) — see Open Q1.
    expect(res.body.tokenBudget.providers.nvidia_nim.used).toBe(0);
    expect(res.body.tokenBudget.providers.nvidia_nim.cap).toBe(1_000_000);
    expect(res.body.tokenBudget.providers.nvidia_nim.soft).toBe(800_000);
    expect(res.body.tokenBudget.providers.nvidia_nim.hard).toBe(950_000);
    expect(res.body.tokenBudget.providers.nvidia_nim.state).toBe('ok');

    // BUDGET-04 regression lock: an extra key anywhere makes `.strict()` THROW.
    const withExtraTop = { ...res.body.tokenBudget, leakedKey: 'oops' };
    expect(() => tokenBudgetSchema.parse(withExtraTop)).toThrow();

    const withExtraNested = {
      ...res.body.tokenBudget,
      costShadow: { ...res.body.tokenBudget.costShadow, leakedKey: 'oops' },
    };
    expect(() => tokenBudgetSchema.parse(withExtraNested)).toThrow();
  });

  it('tokenBudget degrade-open on Redis throw: null + route 200 (BUDGET-03)', async () => {
    process.env.NODE_ENV = 'development';
    // The cost-shadow hgetall read throws — block must degrade-open.
    mockRedis.hgetall.mockRejectedValue(new Error('Redis death'));

    const app = makeApp();
    const res = await request(app).get('/api/operator-status');
    // Per T-39-03-D: a Redis throw inside the block must not 500.
    expect(res.status).toBe(200);
    expect(res.body.tokenBudget).toBeNull();
  });
});
