// @vitest-environment node
/**
 * Phase 32 Plan 32-01 Task 3 — D-22 literal-path shim.
 *
 * CONTEXT D-22 specifies the schema contract test at the literal path
 * `src/__tests__/lib/urlLiveness.schema.test.ts`. Per 32-RESEARCH.md A5
 * recommendation (b), the canonical test lives under
 * `server/__tests__/lib/urlLiveness.schema.test.ts` (matches the codebase
 * convention — e.g., `server/__tests__/scripts/snapshot-cron-watch.test.ts`)
 * AND this file at the literal CONTEXT path re-runs the same TTL
 * upper-bound assertions so a future shape drift fails both files.
 *
 * Shim form: cross-boundary import via vitest discovery.
 *
 * Rather than re-import the canonical test file (which would attempt to
 * resolve `.test.ts` cross-package and is brittle under vitest's
 * environment switching), this shim independently imports the
 * `ttlSecForStatus` function from the server-side module and re-asserts
 * the D-20 upper bounds plus the Zod schema strictness. Both forms exit 0
 * under `npx vitest run` and any future schema / TTL drift causes ALL
 * five tests below to fail — providing the exact "fail loudly in both
 * test locations" semantic D-22 mandates.
 *
 * The schema parse assertions are duplicated minimally (a single round-trip
 * + a single strict() rejection) so this file genuinely exercises the same
 * contract surface, not just the numeric TTL ceilings. The full 14-test
 * matrix lives in the canonical location.
 */

import { describe, it, expect } from 'vitest';

import { UrlLivenessSchema, ttlSecForStatus } from '../../../server/lib/urlLiveness.js';

describe('Phase 32 D-22 — literal CONTEXT-path shim', () => {
  it('UrlLivenessSchema parses a valid live entry', () => {
    expect(() =>
      UrlLivenessSchema.parse({
        status: 'live',
        lastProbedAt: '2026-05-21T01:58:35.303Z',
        attemptCount: 0,
        lastUrlProbed: 'https://example.com/a',
        lastHttpStatus: 200,
        // Phase 43 D-16 — required-but-nullable evidence field.
        evidence: null,
      }),
    ).not.toThrow();
  });

  it('UrlLivenessSchema is strict() — rejects extra keys', () => {
    expect(() =>
      UrlLivenessSchema.parse({
        status: 'live',
        lastProbedAt: '2026-05-21T01:58:35.303Z',
        attemptCount: 0,
        lastUrlProbed: 'https://example.com/a',
        lastHttpStatus: 200,
        evidence: null,
        extra: true,
      } as unknown),
    ).toThrow();
  });

  it('D-20 TTL upper bound: live ≤ 7 days', () => {
    expect(ttlSecForStatus('live')).toBeLessThanOrEqual(7 * 86400);
  });

  it('D-20 TTL upper bound: 404 / 403 / dead-host ≤ 24h', () => {
    expect(ttlSecForStatus('404')).toBeLessThanOrEqual(86400);
    expect(ttlSecForStatus('403')).toBeLessThanOrEqual(86400);
    expect(ttlSecForStatus('dead-host')).toBeLessThanOrEqual(86400);
  });

  it('D-20 TTL upper bound: unknown ≤ 24h (WR-02 — raised from 1h)', () => {
    expect(ttlSecForStatus('unknown')).toBeLessThanOrEqual(86400);
  });

  it('Phase 43 D-04 TTL upper bound: soft-404 / no-url ≤ 24h', () => {
    expect(ttlSecForStatus('soft-404')).toBeLessThanOrEqual(86400);
    expect(ttlSecForStatus('no-url')).toBeLessThanOrEqual(86400);
  });
});
