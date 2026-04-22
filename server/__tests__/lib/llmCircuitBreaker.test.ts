// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  record,
  isAvailable,
  getBreakerState,
  __resetBreakerForTests,
} from '../../lib/llmCircuitBreaker.js';

describe('llmCircuitBreaker (D-31)', () => {
  beforeEach(() => {
    __resetBreakerForTests();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CB1: isAvailable(cerebras) returns true initially', () => {
    expect(isAvailable('cerebras')).toBe(true);
    expect(isAvailable('groq')).toBe(true);
  });

  it('CB2: 4 errors in a row does NOT trip (window of 10 not yet full)', () => {
    for (let i = 0; i < 4; i++) record('cerebras', 'err');
    expect(isAvailable('cerebras')).toBe(true);
  });

  it('CB3: 10 errors in a row DOES trip — isAvailable returns false', () => {
    for (let i = 0; i < 10; i++) record('cerebras', 'err');
    expect(isAvailable('cerebras')).toBe(false);
  });

  it('CB4: after trip, advancing 5 minutes + 1s, isAvailable returns true again', () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    for (let i = 0; i < 10; i++) record('cerebras', 'err');
    expect(isAvailable('cerebras')).toBe(false);

    // Advance 5 minutes + 1s
    vi.setSystemTime(t0 + 5 * 60_000 + 1000);
    expect(isAvailable('cerebras')).toBe(true);
  });

  it('CB5: 3 errors + 7 successes does NOT trip (30% == threshold, not > threshold)', () => {
    // Record pattern: 3 errs then 7 oks (any order; outcome count is what matters)
    for (let i = 0; i < 3; i++) record('cerebras', 'err');
    for (let i = 0; i < 7; i++) record('cerebras', 'ok');
    expect(isAvailable('cerebras')).toBe(true);
  });

  it('CB6: 4 errors + 6 successes DOES trip (40% > 30%)', () => {
    for (let i = 0; i < 4; i++) record('cerebras', 'err');
    for (let i = 0; i < 6; i++) record('cerebras', 'ok');
    expect(isAvailable('cerebras')).toBe(false);
  });

  it('CB7: on trip, outcomes buffer is cleared to prevent immediate re-trip', () => {
    // Trip the breaker first
    for (let i = 0; i < 10; i++) record('cerebras', 'err');
    expect(isAvailable('cerebras')).toBe(false);

    // Advance past pause window
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0 + 5 * 60_000 + 1000);
    expect(isAvailable('cerebras')).toBe(true);

    // Record a few errors — should NOT immediately re-trip because outcomes was cleared
    for (let i = 0; i < 3; i++) record('cerebras', 'err');
    expect(isAvailable('cerebras')).toBe(true);
  });

  it('CB8: getBreakerState returns per-provider ok/paused for llmProgress mirror', () => {
    expect(getBreakerState()).toEqual({ cerebras: 'ok', groq: 'ok' });

    // Trip cerebras
    for (let i = 0; i < 10; i++) record('cerebras', 'err');
    expect(getBreakerState()).toEqual({ cerebras: 'paused', groq: 'ok' });

    // Trip groq too
    for (let i = 0; i < 10; i++) record('groq', 'err');
    expect(getBreakerState()).toEqual({ cerebras: 'paused', groq: 'paused' });
  });
});
