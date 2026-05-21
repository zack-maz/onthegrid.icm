// @vitest-environment node
/**
 * Phase 32 Plan 32-01 Task 3 — D-22 canonical schema contract test.
 *
 * Pins the UrlLivenessSchema BEFORE any writer / reader exists in the
 * codebase (Plan 32-02 adds the probe writer; this contract test lives
 * upstream so schema drift fails the next `vitest run`).
 *
 * Asserts:
 *   - z.object({...}).strict() round-trips a valid entry
 *   - missing fields throw (attemptCount removed)
 *   - extra keys throw (strict() rejection)
 *   - unknown status enum values throw
 *   - D-20 TTL upper bounds:
 *       live      ≤ 7 days
 *       404/403/dead-host ≤ 24h
 *       unknown   ≤ 1h
 *
 * Mirrors the schema-pinning pattern of
 * `server/__tests__/scripts/snapshot-cron-watch.test.ts:1-110` (Phase 31).
 *
 * Companion shim at `src/__tests__/lib/urlLiveness.schema.test.ts`
 * satisfies CONTEXT D-22's literal placement directive per 32-RESEARCH.md
 * A5 recommendation (b).
 */

import { describe, it, expect } from 'vitest';

import { UrlLivenessSchema, type UrlLiveness, ttlSecForStatus } from '../../lib/urlLiveness.js';

function validEntry(overrides: Partial<UrlLiveness> = {}): UrlLiveness {
  return {
    status: 'live',
    lastProbedAt: '2026-05-21T01:58:35.303Z',
    attemptCount: 0,
    lastUrlProbed: 'https://example.com/a',
    lastHttpStatus: 200,
    ...overrides,
  };
}

describe('Phase 32 D-22 — UrlLiveness schema contract', () => {
  describe('UrlLivenessSchema parse round-trip', () => {
    it('parses a valid entry without throwing', () => {
      expect(() => UrlLivenessSchema.parse(validEntry())).not.toThrow();
    });

    it('returns the parsed value (round-trip identity for valid input)', () => {
      const entry = validEntry();
      const parsed = UrlLivenessSchema.parse(entry);
      expect(parsed).toEqual(entry);
    });

    it('rejects missing required field (attemptCount)', () => {
      const { attemptCount: _omit, ...rest } = validEntry();
      // Explicit `as unknown` cast — TS already infers the omission as a
      // type error; the runtime guard is what matters at the contract level.
      expect(() => UrlLivenessSchema.parse(rest as unknown)).toThrow();
    });

    it('rejects extra keys (strict() mode)', () => {
      expect(() => UrlLivenessSchema.parse({ ...validEntry(), extra: true } as unknown)).toThrow();
    });

    it('rejects unknown status enum value', () => {
      expect(() =>
        UrlLivenessSchema.parse({ ...validEntry(), status: 'gone' } as unknown),
      ).toThrow();
    });

    it('rejects malformed lastUrlProbed (non-URL)', () => {
      expect(() =>
        UrlLivenessSchema.parse({ ...validEntry(), lastUrlProbed: 'not a url' }),
      ).toThrow();
    });

    it('rejects negative attemptCount (nonnegative() constraint)', () => {
      expect(() => UrlLivenessSchema.parse({ ...validEntry(), attemptCount: -1 })).toThrow();
    });

    it('parses each valid status enum value', () => {
      for (const status of ['live', '404', '403', 'dead-host', 'unknown'] as const) {
        expect(() => UrlLivenessSchema.parse(validEntry({ status }))).not.toThrow();
      }
    });
  });

  describe('ttlSecForStatus — D-20 TTL upper bounds', () => {
    it('live ≤ 7 days', () => {
      expect(ttlSecForStatus('live')).toBeLessThanOrEqual(7 * 86400);
    });

    it('404 ≤ 24h', () => {
      expect(ttlSecForStatus('404')).toBeLessThanOrEqual(86400);
    });

    it('403 ≤ 24h', () => {
      expect(ttlSecForStatus('403')).toBeLessThanOrEqual(86400);
    });

    it('dead-host ≤ 24h', () => {
      expect(ttlSecForStatus('dead-host')).toBeLessThanOrEqual(86400);
    });

    it('unknown ≤ 1h', () => {
      expect(ttlSecForStatus('unknown')).toBeLessThanOrEqual(3600);
    });

    it('returns exact D-20 ceilings (no silent reduction)', () => {
      // D-20 intent: ceilings are exactly the value RESEARCH Common
      // Operation 4 specifies. Drift here would still pass the upper-bound
      // tests above but indicates the planner / executor changed the tier
      // without updating CONTEXT — assert exact equality to catch that.
      expect(ttlSecForStatus('live')).toBe(7 * 24 * 3600);
      expect(ttlSecForStatus('404')).toBe(24 * 3600);
      expect(ttlSecForStatus('403')).toBe(24 * 3600);
      expect(ttlSecForStatus('dead-host')).toBe(24 * 3600);
      expect(ttlSecForStatus('unknown')).toBe(3600);
    });
  });
});
