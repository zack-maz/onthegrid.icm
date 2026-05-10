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
const mockRedis = {
  smembers: vi.fn(),
  get: vi.fn(),
};
vi.mock('../../cache/redis.js', () => ({
  redis: mockRedis,
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
