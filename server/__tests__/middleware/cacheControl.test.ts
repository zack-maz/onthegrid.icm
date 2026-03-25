// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { cacheControl } from '../../middleware/cacheControl.js';

function createMockRes(): { set: ReturnType<typeof vi.fn>; _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    set(name: string, value: string) {
      headers[name] = value;
      return this;
    },
  };
}

describe('cacheControl middleware', () => {
  it('sets public s-maxage and stale-while-revalidate for non-zero values', () => {
    const middleware = cacheControl(5, 25);
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res as unknown as Response, next);

    expect(res._headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=5, stale-while-revalidate=25',
    );
    expect(next).toHaveBeenCalled();
  });

  it('sets no-store when both values are 0', () => {
    const middleware = cacheControl(0, 0);
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res as unknown as Response, next);

    expect(res._headers['Cache-Control']).toBe('no-store');
    expect(next).toHaveBeenCalled();
  });

  it('handles large TTL values for sites endpoint', () => {
    const middleware = cacheControl(3600, 82800);
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res as unknown as Response, next);

    expect(res._headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=82800',
    );
    expect(next).toHaveBeenCalled();
  });

  it('handles events endpoint TTL values', () => {
    const middleware = cacheControl(300, 600);
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    middleware(req, res as unknown as Response, next);

    expect(res._headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    );
    expect(next).toHaveBeenCalled();
  });
});
