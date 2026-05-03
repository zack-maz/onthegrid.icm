// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { AppError } from '../../middleware/errorHandler.js';
import { sendValidated } from '../../middleware/validateResponse.js';

import type { Response } from 'express';

/** Create a minimal mock Response that captures json calls */
function mockRes(path = '/api/test') {
  let body: unknown = undefined;
  const res = {
    req: { path } as unknown,
    json: vi.fn((data: unknown) => {
      body = data;
      return res;
    }),
    get body() {
      return body;
    },
  };
  return res as unknown as Response & {
    body: unknown;
    json: ReturnType<typeof vi.fn>;
    req: { path: string };
  };
}

const sampleSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      value: z.number(),
    }),
  ),
  stale: z.boolean(),
  lastFresh: z.number(),
});

describe('sendValidated middleware helper', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calls res.json(parsed.data) when payload matches schema', () => {
    const res = mockRes();
    const payload = {
      data: [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ],
      stale: false,
      lastFresh: 1000,
    };

    sendValidated(res, sampleSchema, payload);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual(payload);
  });

  it('strips unknown fields from payload via zod parsing (default behavior)', () => {
    const res = mockRes();
    const payload = {
      data: [{ id: 'a', value: 1 }],
      stale: false,
      lastFresh: 1000,
      bogusExtra: 'should be stripped',
    };

    sendValidated(res, sampleSchema, payload);

    expect(res.json).toHaveBeenCalledTimes(1);
    const sent = res.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toHaveProperty('data');
    expect(sent).toHaveProperty('stale');
    expect(sent).not.toHaveProperty('bogusExtra');
  });

  it('throws AppError(500, RESPONSE_SCHEMA_MISMATCH) when NODE_ENV is not production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = mockRes('/api/flights');
    const badPayload = {
      data: [{ id: 'a', value: 'not-a-number' }], // value should be number
      stale: false,
      lastFresh: 1000,
    };

    let thrown: unknown = null;
    try {
      sendValidated(res, sampleSchema, badPayload);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(AppError);
    const appErr = thrown as AppError;
    expect(appErr.statusCode).toBe(500);
    expect(appErr.code).toBe('RESPONSE_SCHEMA_MISMATCH');
    expect(appErr.message).toContain('/api/flights');
    // Should NOT have called res.json in dev mode — the error must propagate
    expect(res.json).not.toHaveBeenCalled();
  });

  it('throws AppError in test mode as well (NODE_ENV !== production)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    const res = mockRes();
    const badPayload = { data: [], stale: 'not-a-bool', lastFresh: 0 };

    expect(() => sendValidated(res, sampleSchema, badPayload)).toThrowError(AppError);
  });

  it('logs warn and sends original payload anyway when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = mockRes('/api/events');
    const badPayload = {
      data: [{ id: 'a', value: 'not-a-number' }],
      stale: false,
      lastFresh: 1000,
    };

    // Must not throw in prod
    expect(() => sendValidated(res, sampleSchema, badPayload)).not.toThrow();

    // Must fall through to res.json with the ORIGINAL (unvalidated) payload
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual(badPayload);
  });

  it('handles missing req.path gracefully', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = { json: vi.fn() } as unknown as Response;
    const badPayload = { data: 'wrong shape' };

    expect(() => sendValidated(res, sampleSchema, badPayload)).toThrowError(AppError);
  });
});
