// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { validateQuery } from '../../middleware/validate.js';

/** Create a minimal mock Request with given query params */
function mockReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

/** Create a minimal mock Response that captures status, json, and locals */
function mockRes() {
  let statusCode = 200;
  let body: unknown = undefined;
  const locals: Record<string, unknown> = {};
  const res = {
    locals,
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: unknown) {
      body = data;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; locals: Record<string, unknown> };
}

describe('validateQuery middleware', () => {
  const schema = z.object({
    source: z.enum(['opensky', 'adsblol']).default('adsblol'),
  });

  it('passes valid params and populates res.locals.validatedQuery with parsed values', () => {
    const req = mockReq({ source: 'opensky' });
    const res = mockRes();
    let nextCalled = false;

    validateQuery(schema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.locals.validatedQuery).toEqual({ source: 'opensky' });
  });

  it('returns 400 with VALIDATION_ERROR for invalid params', () => {
    const req = mockReq({ source: 'invalid_source' });
    const res = mockRes();
    let nextCalled = false;

    validateQuery(schema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('VALIDATION_ERROR');
    expect((res.body as Record<string, unknown>).statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).error).toBe('Invalid query parameters');
    expect((res.body as Record<string, unknown>).details).toBeDefined();
  });

  it('coerces string "true" to boolean true when schema uses transform', () => {
    const boolSchema = z.object({
      refresh: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
    });

    const req = mockReq({ refresh: 'true' });
    const res = mockRes();
    let nextCalled = false;

    validateQuery(boolSchema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect((res.locals.validatedQuery as Record<string, unknown>).refresh).toBe(true);
  });

  it('uses schema defaults for missing optional params', () => {
    const req = mockReq({}); // no source param
    const res = mockRes();
    let nextCalled = false;

    validateQuery(schema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.locals.validatedQuery).toEqual({ source: 'adsblol' });
  });

  it('validates numeric params with coercion', () => {
    const numSchema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
    });

    const req = mockReq({ lat: '33.5', lon: '51.2' });
    const res = mockRes();
    let nextCalled = false;

    validateQuery(numSchema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect((res.locals.validatedQuery as Record<string, unknown>).lat).toBe(33.5);
    expect((res.locals.validatedQuery as Record<string, unknown>).lon).toBe(51.2);
  });

  it('rejects out-of-range numeric params', () => {
    const numSchema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
    });

    const req = mockReq({ lat: '200', lon: '51.2' });
    const res = mockRes();
    let nextCalled = false;

    validateQuery(numSchema)(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('VALIDATION_ERROR');
  });
});
