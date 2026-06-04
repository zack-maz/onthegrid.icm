// @vitest-environment node
/**
 * Phase 39 Plan 04 OBS-FLIGHT-03 / -06 — `GET /api/events/llm-history` route
 * contract test.
 *
 * Asserts (threat register T-39-04-S/I/D/T/I2):
 *   1. Bearer gate (OBS-FLIGHT-03 / T-39-04-S/I) — 401 without a valid Bearer,
 *      200 with the right Bearer. DASHBOARD_PASSWORD is set + NODE_ENV=production
 *      so dashboardAuth is ACTIVE (not dev-bypassed) — no history to anonymous.
 *   2. Happy path — `{ runs: [...], calls: [...] }` with both arrays.
 *   3. `?runId=X` filters calls to entries whose `runId === X` (back-correlation).
 *   4. `?limit=1000` is clamped (<=500, the LTRIM cap — T-39-04-D DoS mitigation):
 *      the list helpers receive at most 500.
 *   5. OBS-FLIGHT-06 cold-start hydrate — first request triggers exactly one
 *      hydrate (one LRANGE); a second request does NOT re-hydrate (flag
 *      short-circuit).
 *   6. Degrade-open (T-39-04-I2) — when the lib readers return [], the route
 *      returns 200 with empty arrays.
 *
 * The two flight-recorder lib modules are mocked. `hydrateCallHistoryIfCold` is
 * backed by a module-local flag + a single `lrangeSpy` call so the hydrate-once
 * contract is observable via the spy's call count.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { CallHistoryEntry, RunHistoryEntry } from '../../lib/llmProgress.js';

// --- Flight-recorder lib mocks -------------------------------------------------
// listCallHistory / listRunHistory are plain vi.fn() spies so we can assert the
// clamped `limit` argument. The hydrate helpers carry a module-local
// already-hydrated flag and only call `lrangeSpy` on the FIRST invocation —
// modelling the real flag-guarded single-LRANGE cold-start hydration.
const listCallHistorySpy = vi.fn<(limit?: number) => Promise<CallHistoryEntry[]>>();
const listRunHistorySpy = vi.fn<(limit?: number) => Promise<RunHistoryEntry[]>>();
const lrangeSpy = vi.fn();

let callHydrated = false;
let runHydrated = false;

vi.mock('../../lib/llmCallHistory.js', () => ({
  listCallHistory: (limit?: number) => listCallHistorySpy(limit),
  hydrateCallHistoryIfCold: async () => {
    if (callHydrated) return;
    callHydrated = true;
    lrangeSpy('llm:calls:history');
  },
}));

vi.mock('../../lib/llmRunHistory.js', () => ({
  listRunHistory: (limit?: number) => listRunHistorySpy(limit),
  hydrateRunHistoryIfCold: async () => {
    if (runHydrated) return;
    runHydrated = true;
  },
}));

const { eventsRouter } = await import('../events.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/events', eventsRouter);
  return app;
}

/** Build a minimal CallHistoryEntry fixture carrying a runId for filter tests. */
function call(runId: string, partial: Partial<CallHistoryEntry> = {}): CallHistoryEntry {
  return {
    timestamp: Date.now(),
    provider: 'nvidia_nim',
    ok: true,
    runId,
    ...partial,
  } as CallHistoryEntry;
}

/** Build a minimal RunHistoryEntry fixture. */
function run(runId: string): RunHistoryEntry {
  return {
    runId,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    outcome: 'completed',
    batchCount: 1,
    batchesCompleted: 1,
    batchesFailed: 0,
    tokenSpend: { nvidia_nim: 0 },
    evalScore: undefined,
    dlqDelta: 0,
    watchdogTimeouts: 0,
    durationMs: 100,
    pipelineVersion: 'v3',
  } as RunHistoryEntry;
}

describe('GET /api/events/llm-history (Phase 39 Plan 04 OBS-FLIGHT-03/06)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    callHydrated = false;
    runHydrated = false;
    listCallHistorySpy.mockResolvedValue([]);
    listRunHistorySpy.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.DASHBOARD_PASSWORD = ORIGINAL_DASHBOARD_PASSWORD;
  });

  it('Bearer gate (OBS-FLIGHT-03): 401 without a valid Bearer, 200 with the right Bearer', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'test-secret';

    const app = makeApp();

    // No Bearer -> 401 (no history to anonymous callers — T-39-04-S/I)
    const noAuth = await request(app).get('/api/events/llm-history');
    expect(noAuth.status).toBe(401);

    // Wrong Bearer -> 401
    const badAuth = await request(app)
      .get('/api/events/llm-history')
      .set('Authorization', 'Bearer wrong-secret');
    expect(badAuth.status).toBe(401);

    // Valid Bearer -> 200
    const auth = await request(app)
      .get('/api/events/llm-history')
      .set('Authorization', 'Bearer test-secret');
    expect(auth.status).toBe(200);
  });

  it('happy path: returns { runs, calls } with both arrays', async () => {
    process.env.NODE_ENV = 'development'; // dev-bypass auth; route logic identical
    listRunHistorySpy.mockResolvedValue([run('r1'), run('r2')]);
    listCallHistorySpy.mockResolvedValue([call('r1'), call('r2')]);

    const app = makeApp();
    const res = await request(app).get('/api/events/llm-history');
    expect(res.status).toBe(200);

    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(Array.isArray(res.body.calls)).toBe(true);
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.calls).toHaveLength(2);
  });

  it('?runId=X filters calls to only entries whose runId === X (back-correlation)', async () => {
    process.env.NODE_ENV = 'development';
    listRunHistorySpy.mockResolvedValue([run('r1'), run('r2')]);
    listCallHistorySpy.mockResolvedValue([call('r1'), call('r2'), call('r1')]);

    const app = makeApp();
    const res = await request(app).get('/api/events/llm-history?runId=r1');
    expect(res.status).toBe(200);

    const calls = res.body.calls as CallHistoryEntry[];
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.runId === 'r1')).toBe(true);
    // runs are NOT filtered by runId (only calls are back-correlated).
    expect(res.body.runs).toHaveLength(2);
  });

  it('?limit=1000 is clamped: the list helpers receive at most 500 (T-39-04-D)', async () => {
    process.env.NODE_ENV = 'development';

    const app = makeApp();
    const res = await request(app).get('/api/events/llm-history?limit=1000');
    expect(res.status).toBe(200);

    expect(listCallHistorySpy).toHaveBeenCalledWith(500);
    expect(listRunHistorySpy).toHaveBeenCalledWith(500);
  });

  it('?limit absent defaults to 200 (well under the cap)', async () => {
    process.env.NODE_ENV = 'development';

    const app = makeApp();
    await request(app).get('/api/events/llm-history');

    expect(listCallHistorySpy).toHaveBeenCalledWith(200);
    expect(listRunHistorySpy).toHaveBeenCalledWith(200);
  });

  it('OBS-FLIGHT-06 hydrate-once: first request hydrates (1 LRANGE), second does NOT re-hydrate', async () => {
    process.env.NODE_ENV = 'development';

    const app = makeApp();
    await request(app).get('/api/events/llm-history');
    await request(app).get('/api/events/llm-history');

    // Exactly one LRANGE across two requests — the flag short-circuits the second.
    expect(lrangeSpy).toHaveBeenCalledTimes(1);
  });

  it('degrade-open (T-39-04-I2): lib readers return [] -> route 200 with empty arrays', async () => {
    process.env.NODE_ENV = 'development';
    listRunHistorySpy.mockResolvedValue([]);
    listCallHistorySpy.mockResolvedValue([]);

    const app = makeApp();
    const res = await request(app).get('/api/events/llm-history');
    expect(res.status).toBe(200);
    expect(res.body.runs).toEqual([]);
    expect(res.body.calls).toEqual([]);
  });
});
