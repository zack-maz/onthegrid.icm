import { describe, it, expect } from 'vitest';

import { createLimit } from './concurrencyLimit.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLimit', () => {
  it('rejects non-positive maxConcurrent', () => {
    expect(() => createLimit(0)).toThrow();
    expect(() => createLimit(-1)).toThrow();
    expect(() => createLimit(1.5)).toThrow();
  });

  it('caps in-flight tasks at maxConcurrent', async () => {
    const limit = createLimit(2);
    let active = 0;
    let peakActive = 0;
    const deferreds = Array.from({ length: 5 }, () => deferred<number>());

    const tasks = deferreds.map((d, idx) =>
      limit(async () => {
        active++;
        peakActive = Math.max(peakActive, active);
        const value = await d.promise;
        active--;
        return value + idx;
      }),
    );

    // Settle synchronously to flush microtasks; only 2 of 5 should be running.
    await Promise.resolve();
    expect(active).toBe(2);
    expect(peakActive).toBe(2);

    // Resolve the first → frees a slot for the third.
    deferreds[0]!.resolve(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(peakActive).toBe(2);

    // Resolve all to drain.
    deferreds[1]!.resolve(101);
    deferreds[2]!.resolve(102);
    deferreds[3]!.resolve(103);
    deferreds[4]!.resolve(104);

    const results = await Promise.all(tasks);
    expect(results).toEqual([100, 102, 104, 106, 108]);
    expect(peakActive).toBe(2);
  });

  it('runs all tasks even when concurrency = 1 (sequential rollback)', async () => {
    const limit = createLimit(1);
    const order: number[] = [];

    const tasks = [1, 2, 3].map((n) =>
      limit(async () => {
        order.push(n);
        return n;
      }),
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('propagates rejected promises and continues processing the queue', async () => {
    const limit = createLimit(2);
    const r1 = limit(async () => {
      throw new Error('boom');
    });
    const r2 = limit(async () => 'ok');

    await expect(r1).rejects.toThrow('boom');
    await expect(r2).resolves.toBe('ok');
  });

  it('handles synchronously-throwing thunks', async () => {
    const limit = createLimit(2);
    const r = limit(() => {
      throw new Error('sync');
    });
    await expect(r).rejects.toThrow('sync');

    // Limiter should still be usable after a sync throw.
    const r2 = limit(async () => 42);
    await expect(r2).resolves.toBe(42);
  });

  it('handles a high-fan-in burst beyond maxConcurrent', async () => {
    const limit = createLimit(5);
    let active = 0;
    let peakActive = 0;

    const tasks = Array.from({ length: 50 }, (_, i) =>
      limit(async () => {
        active++;
        peakActive = Math.max(peakActive, active);
        // Yield to let other tasks land.
        await new Promise((r) => setTimeout(r, 0));
        active--;
        return i;
      }),
    );

    const results = await Promise.all(tasks);
    expect(results).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(peakActive).toBeLessThanOrEqual(5);
    expect(peakActive).toBeGreaterThan(0);
  });
});
