import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError, errorHandler } from '../../middleware/errorHandler.js';

/** Create a mock Express req/res pair */
function createMocks(overrides: { id?: string; env?: string } = {}) {
  const req = {
    id: overrides.id ?? 'test-request-id',
    method: 'GET',
    path: '/api/test',
    log: {
      error: vi.fn(),
    },
  } as unknown as Request;

  const statusFn = vi.fn().mockReturnThis();
  const jsonFn = vi.fn();
  const res = {
    status: statusFn,
    json: jsonFn,
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next, statusFn, jsonFn };
}

describe('AppError', () => {
  it('creates error with statusCode, code, and message', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
    expect(err.name).toBe('AppError');
  });
});

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('sends consistent JSON shape { error, code, statusCode, requestId } on AppError', () => {
    const { req, res, next, statusFn, jsonFn } = createMocks();
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found');

    errorHandler(err, req, res, next);

    expect(statusFn).toHaveBeenCalledWith(404);
    const body = jsonFn.mock.calls[0][0];
    expect(body).toMatchObject({
      error: 'Resource not found',
      code: 'NOT_FOUND',
      statusCode: 404,
      requestId: 'test-request-id',
    });
  });

  it('includes stack trace when NODE_ENV !== "production"', () => {
    process.env.NODE_ENV = 'development';
    const { req, res, next, jsonFn } = createMocks();
    const err = new AppError(400, 'BAD_REQUEST', 'Bad input');

    errorHandler(err, req, res, next);

    const body = jsonFn.mock.calls[0][0];
    expect(body.stack).toBeDefined();
    expect(typeof body.stack).toBe('string');
  });

  it('strips stack trace when NODE_ENV === "production"', () => {
    process.env.NODE_ENV = 'production';
    const { req, res, next, jsonFn } = createMocks();
    const err = new AppError(400, 'BAD_REQUEST', 'Bad input');

    errorHandler(err, req, res, next);

    const body = jsonFn.mock.calls[0][0];
    expect(body.stack).toBeUndefined();
  });

  it('defaults to 500/INTERNAL_ERROR for generic Error', () => {
    const { req, res, next, statusFn, jsonFn } = createMocks();
    const err = new Error('Something broke');

    errorHandler(err, req, res, next);

    expect(statusFn).toHaveBeenCalledWith(500);
    const body = jsonFn.mock.calls[0][0];
    expect(body).toMatchObject({
      error: 'Something broke',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      requestId: 'test-request-id',
    });
  });

  it('logs via req.log.error with error object', () => {
    const { req, res, next } = createMocks();
    const err = new AppError(503, 'UPSTREAM_ERROR', 'Upstream down');

    errorHandler(err, req, res, next);

    const logError = (req as any).log.error;
    expect(logError).toHaveBeenCalledOnce();
    // First arg should include the error object
    const logArg = logError.mock.calls[0][0];
    expect(logArg.err).toBe(err);
    expect(logArg.statusCode).toBe(503);
    expect(logArg.code).toBe('UPSTREAM_ERROR');
  });

  it('uses "unknown" requestId when req.id is undefined', () => {
    const { req, res, next, jsonFn } = createMocks();
    (req as any).id = undefined;
    const err = new Error('fail');

    errorHandler(err, req, res, next);

    const body = jsonFn.mock.calls[0][0];
    expect(body.requestId).toBe('unknown');
  });

  // Restore env after all tests
  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });
});
