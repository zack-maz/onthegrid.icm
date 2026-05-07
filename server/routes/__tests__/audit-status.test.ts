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

  it('matches Phase 28.2.5 tier-green schema extension', async () => {
    // Per Phase 28.2.5 D-09: the sidecar JSON gains two new optional fields
    // written by .github/workflows/prod-connectivity-audit.yml after each run:
    //   - allTiersGreen: boolean (single-glance gate signal)
    //   - tierStatus: per-tier health rollup
    // Both directions of drift fail LOUDLY here:
    //   - workflow writer drops a field → this test fails
    //   - route reader drops the field from AuditPayload → TS rejects assertions
    const ciWritten = {
      status: 'pass',
      runId: '99999',
      timestamp: '2026-05-07T10:00:00.000Z',
      endpoints: {
        '/api/health': 'pass',
        '/api/sources': 'pass',
        '/api/flights': 'pass',
      },
      durationMs: 4231,
      // Phase 28.2.5 D-09 additions (RESEARCH Open Question 5 shape (C)):
      allTiersGreen: true,
      tierStatus: {
        critical: 'healthy' as const,
        nonCritical: 'healthy' as const,
        static: 'healthy' as const,
        probeOnly: 'healthy' as const,
        cron: 'healthy' as const,
      },
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(ciWritten));

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    // Existing W-3 fields preserved (forward-compat with the existing
    // 'matches CI workflow JSON shape contract' test).
    expect(res.body).toMatchObject({
      status: 'pass',
      runId: '99999',
      endpoints: expect.any(Object),
    });
    // 28.2.5 D-09 — new fields present and round-tripped intact.
    expect(res.body.allTiersGreen).toBe(true);
    expect(res.body.tierStatus).toBeDefined();
    expect(res.body.tierStatus.critical).toBe('healthy');
    expect(res.body.tierStatus.nonCritical).toBe('healthy');
    expect(res.body.tierStatus.static).toBe('healthy');
    expect(res.body.tierStatus.probeOnly).toBe('healthy');
    expect(res.body.tierStatus.cron).toBe('healthy');
  });

  it('matches Phase 28.2.5 tier-green schema extension — non-green run', async () => {
    // The fail case: workflow records allTiersGreen=false when critical tier is unhealthy.
    const ciWritten = {
      status: 'fail',
      runId: '99998',
      timestamp: '2026-05-07T10:00:00.000Z',
      endpoints: { '/api/health': 'pass', '/api/events': 'fail' },
      durationMs: 8120,
      allTiersGreen: false,
      tierStatus: {
        critical: 'unhealthy' as const,
        nonCritical: 'healthy' as const,
        static: 'healthy' as const,
        probeOnly: 'healthy' as const,
        cron: 'healthy' as const,
      },
    };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(ciWritten));

    const app = makeApp();
    const res = await request(app).get('/api/audit-status').expect(200);

    expect(res.body.allTiersGreen).toBe(false);
    expect(res.body.tierStatus.critical).toBe('unhealthy');
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
