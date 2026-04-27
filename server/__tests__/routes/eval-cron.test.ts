// @vitest-environment node
/**
 * Phase 27.4.4 Plan 01 Task 0a / Task 9 (D-14) — /api/cron/eval auth + happy
 * path unit tests.
 *
 * Stub file: four pending cases. Task 9 flips them green when the cron route
 * lands at server/routes/eval-cron.ts.
 *
 * Pattern copied verbatim from server/__tests__/routes/health.test.ts.
 */

import { describe, it, vi } from 'vitest';
import { Router } from 'express';

// Mock the eval harness so the route can be imported without spinning up
// a real LLM run. Default returns a healthy 50-event score.
const mockRunEval = vi.fn().mockResolvedValue({
  within5km: 5,
  within20km: 47,
  within100km: 50,
  total: 50,
});
vi.mock('../../lib/llmEvalHarness.js', () => ({
  runEval: (...args: unknown[]) => mockRunEval(...args),
}));

// Helper: minimal request/response pair for Express handler testing.
// Re-exported from health.test.ts pattern with optional headers support so
// auth tests can populate Authorization without instantiating real Express.
function createReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as import('express').Request;
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
  } as unknown as import('express').Response;
  return { req, res, getStatus: () => statusCode, getBody: () => body as Record<string, unknown> };
}

interface RouteLayer {
  route?: {
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
}

function extractHandler(router: ReturnType<typeof Router>) {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  for (const layer of stack) {
    if (layer.route?.methods.get || layer.route?.methods.post) {
      return layer.route.stack[0].handle as (
        req: import('express').Request,
        res: import('express').Response,
      ) => Promise<void>;
    }
  }
  throw new Error('No GET/POST handler found on router');
}

// Silence helpers referenced by the soon-to-exist route file.

const _silence = { createReqRes, extractHandler };

// ---------------------------------------------------------------------------
// Test cases — four placeholders flipped green by Task 9.
// ---------------------------------------------------------------------------

describe('/api/cron/eval auth gate (D-14)', () => {
  it.todo(
    'CRON_SECRET set + Authorization missing → 401 {error: "unauthorized"}; runEval NOT called',
  );
  it.todo(
    'CRON_SECRET set + Authorization wrong → 401 {error: "unauthorized"}; runEval NOT called',
  );
  it.todo(
    'CRON_SECRET set + Authorization "Bearer <secret>" → 200 {status: "ok", score, durationMs, ratioWithin20km: 0.94}; runEval called exactly once',
  );
  it.todo(
    'CRON_SECRET unset/empty → request allowed through (preserves existing un-authed cron-warm/cron-health behavior); runEval called',
  );
});
