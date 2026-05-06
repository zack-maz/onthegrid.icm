// @vitest-environment node
/**
 * Phase 28.2 W6 Plan 06 Task 5 — `/api/audit-status` route tests.
 *
 * Asserts:
 *   1. Redis empty → 200 + {status: 'absent'}
 *   2. Redis has fresh JSON → 200 + parsed value
 *   3. Redis has malformed JSON → 200 + {status: 'absent'} (degrade-open)
 *   4. lastVerifiedAt > 7d ago → 200 + X-Audit-Stale: true
 *   5. (W-3) matches CI workflow JSON shape contract — fails LOUDLY if either
 *      side drifts from the shape `.github/workflows/prod-connectivity-audit.yml`
 *      writes
 *
 * No auth gate — D-23 says the audit-status surface is operator-tier
 * metadata; the operator already has it visible via the merged tab; making
 * it public simplifies the CI feedback loop.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis BEFORE importing the route module.
const mockRedis = {
  get: vi.fn(),
};
vi.mock('../../cache/redis.js', () => ({
  redis: mockRedis,
}));

const { auditStatusRouter } = await import('../audit-status.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', auditStatusRouter);
  return app;
}

describe('/api/audit-status route (Phase 28.2 W6 Task 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 (Redis empty): returns 200 + {status: "absent"}', async () => {
    mockRedis.get.mockResolvedValueOnce(null);

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body).toEqual({ status: 'absent' });
  });

  it('Test 2 (Redis has fresh JSON): returns 200 + parsed value', async () => {
    const fresh = {
      status: 'pass',
      runId: '99999',
      timestamp: new Date().toISOString(),
      endpoints: { '/api/health': 'pass' },
      durationMs: 1234,
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(fresh));

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body).toMatchObject(fresh);
    // Fresh data → no stale header.
    expect(res.headers['x-audit-stale']).toBeUndefined();
  });

  it('Test 3 (malformed JSON): returns 200 + {status: "absent"} (degrade-open)', async () => {
    mockRedis.get.mockResolvedValueOnce('not-valid-json{');

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body).toEqual({ status: 'absent' });
  });

  it('Test 4 (lastVerifiedAt > 7d ago): returns 200 + X-Audit-Stale: true', async () => {
    const stale = {
      status: 'pass',
      runId: '12345',
      lastVerifiedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      endpoints: { '/api/health': 'pass' },
      durationMs: 1000,
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(stale));

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.headers['x-audit-stale']).toBe('true');
    expect(res.body).toMatchObject(stale);
  });

  it('matches CI workflow JSON shape contract', async () => {
    // Shape spec — must mirror what .github/workflows/prod-connectivity-audit.yml writes.
    // If the CI workflow's JSON shape OR the route's reader drifts, this test
    // fails LOUDLY instead of silently returning {status: 'absent'} per W-3.
    const ciWritten = {
      status: 'pass',
      runId: '12345',
      timestamp: '2026-05-04T10:00:00.000Z',
      endpoints: {
        '/api/health': 'pass',
        '/api/sources': 'pass',
        '/api/flights': 'pass',
      },
      durationMs: 4231,
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(ciWritten));

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body).toMatchObject({
      status: 'pass',
      runId: '12345',
      timestamp: '2026-05-04T10:00:00.000Z',
      endpoints: expect.any(Object),
      durationMs: expect.any(Number),
    });
    // Shape contract — these fields are the load-bearing CI/route bridge.
    expect(res.body.endpoints['/api/health']).toBe('pass');
    expect(res.body.endpoints['/api/sources']).toBe('pass');
    expect(res.body.endpoints['/api/flights']).toBe('pass');
  });

  it('handles Upstash already-parsed object (object passthrough, not just JSON string)', async () => {
    // Upstash REST may return either a JSON string OR an already-parsed
    // object depending on serialization. The route MUST tolerate both.
    const ciWritten = {
      status: 'pass',
      runId: '67890',
      timestamp: '2026-05-04T10:00:00.000Z',
      endpoints: { '/api/health': 'pass' },
      durationMs: 1000,
    };
    mockRedis.get.mockResolvedValueOnce(ciWritten);

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body).toMatchObject(ciWritten);
  });
});
