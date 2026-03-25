// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';

// Mock the logger module
const mockLog = vi.fn();
vi.mock('../../lib/logger.js', () => ({
  log: (...args: unknown[]) => mockLog(...args),
}));

// Import after mock
const { requestLogger } = await import('../../middleware/requestLogger.js');

describe('requestLogger middleware', () => {
  beforeEach(() => {
    mockLog.mockReset();
  });

  function createMockReqRes(method: string, path: string, statusCode: number) {
    const req = { method, path } as Request;
    const resEmitter = new EventEmitter();
    const res = Object.assign(resEmitter, { statusCode }) as unknown as Response;
    return { req, res };
  }

  it('logs method, path, status, and durationMs on response finish', () => {
    const { req, res } = createMockReqRes('GET', '/api/flights', 200);
    const next = vi.fn() as unknown as NextFunction;

    requestLogger(req, res, next);
    expect(next).toHaveBeenCalled();

    // Simulate response completion
    res.emit('finish');

    expect(mockLog).toHaveBeenCalledTimes(1);
    const entry = mockLog.mock.calls[0][0];
    expect(entry.method).toBe('GET');
    expect(entry.path).toBe('/api/flights');
    expect(entry.status).toBe(200);
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.level).toBe('info');
  });

  it('logs level error for 500+ status codes', () => {
    const { req, res } = createMockReqRes('POST', '/api/events', 500);
    const next = vi.fn() as unknown as NextFunction;

    requestLogger(req, res, next);
    res.emit('finish');

    const entry = mockLog.mock.calls[0][0];
    expect(entry.level).toBe('error');
    expect(entry.status).toBe(500);
  });

  it('logs level warn for 400-499 status codes', () => {
    const { req, res } = createMockReqRes('GET', '/api/flights', 429);
    const next = vi.fn() as unknown as NextFunction;

    requestLogger(req, res, next);
    res.emit('finish');

    const entry = mockLog.mock.calls[0][0];
    expect(entry.level).toBe('warn');
    expect(entry.status).toBe(429);
  });

  it('includes message field in log entry', () => {
    const { req, res } = createMockReqRes('GET', '/health', 200);
    const next = vi.fn() as unknown as NextFunction;

    requestLogger(req, res, next);
    res.emit('finish');

    const entry = mockLog.mock.calls[0][0];
    expect(entry.message).toBeDefined();
    expect(typeof entry.message).toBe('string');
  });
});
