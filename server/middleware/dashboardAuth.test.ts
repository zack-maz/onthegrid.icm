import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { dashboardAuth } from './dashboardAuth.js';

function makeReq(authHeader?: string): Request {
  return { headers: authHeader ? { authorization: authHeader } : {} } as unknown as Request;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('dashboardAuth middleware', () => {
  const ORIG_NODE_ENV = process.env.NODE_ENV;
  const ORIG_PASSWORD = process.env.DASHBOARD_PASSWORD;

  beforeEach(() => {
    delete process.env.DASHBOARD_PASSWORD;
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIG_NODE_ENV;
    if (ORIG_PASSWORD === undefined) {
      delete process.env.DASHBOARD_PASSWORD;
    } else {
      process.env.DASHBOARD_PASSWORD = ORIG_PASSWORD;
    }
  });

  it('bypasses auth in dev (NODE_ENV !== production)', () => {
    process.env.NODE_ENV = 'development';
    const req = makeReq();
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('bypasses auth in test (NODE_ENV === test)', () => {
    process.env.NODE_ENV = 'test';
    const req = makeReq();
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 503 in prod when DASHBOARD_PASSWORD is unset', () => {
    process.env.NODE_ENV = 'production';
    const req = makeReq('Bearer anything');
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: 'auth_not_configured' });
  });

  it('returns 401 in prod when Authorization header is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-value-32chars';
    const req = makeReq();
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('returns 401 in prod when header lacks Bearer prefix', () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-value-32chars';
    const req = makeReq('Basic secret-value-32chars');
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('returns 401 in prod on length mismatch', () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-value-32chars';
    const req = makeReq('Bearer too-short');
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('returns 401 in prod on bytewise mismatch', () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-value-32chars';
    const req = makeReq('Bearer secret-value-32CHARS'); // case differs
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
  });

  it('calls next() in prod when Bearer matches', () => {
    process.env.NODE_ENV = 'production';
    process.env.DASHBOARD_PASSWORD = 'secret-value-32chars';
    const req = makeReq('Bearer secret-value-32chars');
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;
    dashboardAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});
