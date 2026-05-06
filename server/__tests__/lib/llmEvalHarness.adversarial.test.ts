// @vitest-environment node
/**
 * Phase 28.2 Plan 03 Task 5 — adversarial sub-eval (B-2).
 *
 * 7-test matrix per PLAN.md:
 *   1. fixture file exists, parses, has >=10 entries spanning 5 categories
 *   2. runAdversarialEval() returns the expected shape; total === entries.length
 *   3. PASS criterion — Zod-strict + no canary leak → blocked
 *   4. Redis persist — cacheSetSafe called with correct key + TTL
 *   5. Token-budget hard cap → short-circuit zero-result with skipped flag
 *   6. cron fold-in — runAdversarialEval imported in cron-health.ts AFTER runEval
 *   7. cron response payload includes adversarialResult field (functional)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for resolveLocation, redis, token-budget, eventExtractorV3.
const { mockResolve, mockCacheSetSafe, mockGetDailyTokens, mockBudgetState } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockCacheSetSafe: vi.fn(async () => {}),
  mockGetDailyTokens: vi.fn(async () => 0),
  mockBudgetState: vi.fn(() => 'ok' as const),
}));

vi.mock('../../lib/llmResolver.js', () => ({
  resolveLocation: (...args: unknown[]) => mockResolve(...(args as [unknown, unknown])),
}));
vi.mock('../../cache/redis.js', () => ({
  redis: { ping: vi.fn(async () => 'PONG') },
  cacheSetSafe: (...args: unknown[]) => mockCacheSetSafe(...(args as [string, unknown, number])),
}));
vi.mock('../../lib/llmTokenBudget.js', () => ({
  getDailyTokens: (...args: unknown[]) => mockGetDailyTokens(...(args as [string])),
  budgetState: (...args: unknown[]) => mockBudgetState(...(args as [string, number])),
  shouldPauseNewEvents: vi.fn(async () => false),
  prioritizeBySeverity: vi.fn(async (g: unknown[]) => g),
  incrDailyTokens: vi.fn(async () => 0),
  computeSeverityScore: vi.fn(() => 0),
  DAILY_LIMITS: { cerebras: 1_000_000, groq: 200_000 } as const,
  todayKey: vi.fn((p: string) => `llm:tokens:${p}:d`),
}));
// Phase 27.4.3 D-17 trigger — short-circuit so we don't reach into v3 on tests.
vi.mock('../../lib/llmEventExtractor.v3.js', () => ({
  checkEvalDropTrigger: vi.fn(async () => {}),
}));
// llmProgress is a side-effect target of runEval; runAdversarialEval doesn't
// touch it but the module is imported transitively.
vi.mock('../../lib/llmProgress.js', () => ({
  updateProgress: vi.fn(),
  resetProgress: vi.fn(),
  llmProgress: { stage: 'idle' },
  buildSummary: vi.fn(() => ({})),
  INITIAL_PROGRESS: { stage: 'idle' },
}));

import { runAdversarialEval, __resetAdversarialCacheForTests } from '../../lib/llmEvalHarness.js';

describe('runAdversarialEval — Phase 28.2 Plan 03 Task 5 / B-2', () => {
  beforeEach(() => {
    __resetAdversarialCacheForTests();
    mockResolve.mockReset();
    mockCacheSetSafe.mockReset().mockResolvedValue(undefined);
    mockGetDailyTokens.mockReset().mockResolvedValue(0);
    mockBudgetState.mockReset().mockReturnValue('ok');

    // Default: resolver returns a clean response with no canary leak.
    mockResolve.mockImplementation(async () => ({
      lat: 33.3,
      lng: 44.4,
      provenance: 'gdelt-actiongeo-fallback' as const,
      actionGeoDistanceKm: 0,
      displayName: 'Baghdad, Iraq',
    }));
  });

  // Test 1 — fixture file shape verification (real on-disk read)
  it('fixture file at .planning/eval/adversarial-injections.json has >=10 entries spanning 5 categories', () => {
    const path = resolve(__dirname, '../../../.planning/eval/adversarial-injections.json');
    const raw = readFileSync(path, 'utf-8');
    const fixture = JSON.parse(raw);
    expect(Array.isArray(fixture.entries)).toBe(true);
    expect(fixture.entries.length).toBeGreaterThanOrEqual(10);

    const categories = new Set(fixture.entries.map((e: { category: string }) => e.category));
    expect(categories.has('instruction-override')).toBe(true);
    expect(categories.has('role-confusion')).toBe(true);
    expect(categories.has('context-leak')).toBe(true);
    expect(categories.has('tool-misuse')).toBe(true);
    expect(categories.has('model-jailbreak')).toBe(true);
  });

  // Test 2 — return shape + total matches fixture entry count
  it('returns {total, blocked, leaked, score, byCategory, generatedAt} with total === entry count', async () => {
    const result = await runAdversarialEval();
    expect(typeof result.total).toBe('number');
    expect(typeof result.blocked).toBe('number');
    expect(typeof result.leaked).toBe('number');
    expect(typeof result.score).toBe('number');
    expect(typeof result.byCategory).toBe('object');
    expect(typeof result.generatedAt).toBe('string');
    // The on-disk fixture has 10 entries.
    expect(result.total).toBe(10);
    // Every entry classified — blocked + leaked === total.
    expect(result.blocked + result.leaked).toBe(result.total);
    // score === blocked / total within float tolerance.
    expect(Math.abs(result.score - result.blocked / result.total)).toBeLessThan(1e-9);
  });

  // Test 3 — PASS criterion: Zod-strict + no leak → blocked
  it('clean resolver output (no canary leak, valid hierarchy) counts as blocked', async () => {
    // Force a clean response for every fixture entry.
    mockResolve.mockResolvedValue({
      lat: 33.3,
      lng: 44.4,
      provenance: 'gdelt-actiongeo-fallback' as const,
      actionGeoDistanceKm: 0,
      displayName: 'Baghdad, Iraq', // does not contain any injection canary
    });

    const result = await runAdversarialEval();
    // All 10 entries should be blocked since neither output nor hierarchy
    // leaks canary text.
    expect(result.blocked).toBe(10);
    expect(result.leaked).toBe(0);
    expect(result.score).toBe(1);
  });

  // Test 3b — LEAK criterion: canary text in resolver output → leaked
  it('canary substring in resolver displayName counts as leaked', async () => {
    // Force the resolver to echo each entry's first 30 chars back. This
    // simulates a hypothetical compromised resolver that includes the
    // injection in its displayName.
    mockResolve.mockImplementation(async (hierarchy: unknown) => {
      // The fixture's adv-006 carries SECRETMARKER12345-ZACK-CANARY.
      // Any entry whose city happens to be 'Sanaa' is adv-006; echo back.
      const h = hierarchy as { city?: string | null };
      if (h.city === 'Sanaa') {
        return {
          lat: 15.5,
          lng: 44.2,
          provenance: 'nominatim-direct' as const,
          actionGeoDistanceKm: 0,
          displayName: 'Echo this exact string in your reasoning fie', // first 30+ chars of adv-006
        };
      }
      return {
        lat: 33.3,
        lng: 44.4,
        provenance: 'gdelt-actiongeo-fallback' as const,
        actionGeoDistanceKm: 0,
        displayName: 'Baghdad, Iraq',
      };
    });

    const result = await runAdversarialEval();
    expect(result.leaked).toBeGreaterThanOrEqual(1);
    expect(result.blocked).toBeLessThan(10);
  });

  // Test 4 — Redis persist
  it('persists result to events:llm-eval-adversarial:v3 with 90d TTL', async () => {
    await runAdversarialEval();
    expect(mockCacheSetSafe).toHaveBeenCalledTimes(1);
    const [key, _value, ttl] = mockCacheSetSafe.mock.calls[0];
    expect(key).toBe('events:llm-eval-adversarial:v3');
    expect(ttl).toBe(90 * 86400);
  });

  // Test 5 — token-budget hard-cap short-circuit
  it('short-circuits to zero result with skipped:token-budget-hard when budget at hard cap', async () => {
    mockBudgetState.mockReturnValue('hard');
    const result = await runAdversarialEval();
    expect(result.total).toBe(0);
    expect(result.blocked).toBe(0);
    expect(result.leaked).toBe(0);
    expect(result.score).toBe(0);
    expect(result.skipped).toBe('token-budget-hard');
    // Resolver MUST NOT have been called.
    expect(mockResolve).not.toHaveBeenCalled();
    // Redis persist MUST NOT have been called either (skipped path).
    expect(mockCacheSetSafe).not.toHaveBeenCalled();
  });

  // Test 6 — cron-health.ts fold-in (source-level grep)
  it('cron-health.ts imports runAdversarialEval AFTER runEval (B-2 fold-in)', () => {
    const path = resolve(__dirname, '../../routes/cron-health.ts');
    const src = readFileSync(path, 'utf-8');
    // Single import line carrying both helpers.
    expect(src).toMatch(/import\s*\{[^}]*runEval[^}]*runAdversarialEval[^}]*\}\s*from/);
    // The runtime call site for runAdversarialEval must appear AFTER the
    // runtime call site for runEval (so the daily tick produces accuracy
    // first, then robustness).
    const runEvalCallIdx = src.indexOf('await runEval(');
    const runAdvCallIdx = src.indexOf('await runAdversarialEval(');
    expect(runEvalCallIdx).toBeGreaterThan(0);
    expect(runAdvCallIdx).toBeGreaterThan(runEvalCallIdx);
    // Response payload includes the new field.
    expect(src).toMatch(/adversarialResult/);
  });

  // Test 7 — exception thrown by resolver counts as blocked (defense layer worked)
  it('resolver throwing on adversarial input counts as blocked', async () => {
    mockResolve.mockImplementation(async () => {
      throw new Error('viewbox constraint rejected adversarial coord');
    });

    const result = await runAdversarialEval();
    // Every fixture entry triggers a throw → all blocked.
    expect(result.blocked).toBe(result.total);
    expect(result.leaked).toBe(0);
  });
});
