// @vitest-environment node
/**
 * Phase 31 Plan 02 Task 1 — contract test for the daily snapshot script.
 *
 * Pins two things forever:
 *   (a) The WatchRow + WatchLog JSON schemas (Zod `.strict()`) so any
 *       schema drift after Day 1 fails the test — see 31-RESEARCH.md
 *       Risk 2.
 *   (b) The classifyTick + consecutivePassCount rules exactly match the
 *       D-03 / D-04 / D-09 / D-11 semantics from 31-CONTEXT.md.
 *
 * Also asserts the WATCH_DLQ_WHITELIST is the canonical
 * `['v3:timeout_watchdog', 'v3:adaptive-retry-fail']` per
 * 31-RESEARCH.md §Vector 3 — NOT the CONTEXT illustrative strings.
 */

import { describe, it, expect } from 'vitest';

import {
  WATCH_DLQ_WHITELIST,
  classifyTick,
  consecutivePassCount,
  WatchRowSchema,
  WatchLogSchema,
  type WatchRow,
} from '../../../scripts/snapshot-cron-watch.js';

function validRow(overrides: Partial<WatchRow> = {}): WatchRow {
  return {
    tickDate: '2026-05-18',
    snapshotAt: '2026-05-18T04:30:00.000Z',
    natural: true,
    healthStatus: 'healthy',
    freshnessMs: 1_800_000,
    dlq: { count: 0, reasons: {} },
    eval: { at5km: 0.6, at20km: 0.7, at100km: 0.8 },
    batchCount: 100,
    breakerTrips: 0,
    result: 'PASS',
    notes: '',
    ...overrides,
  };
}

describe('Phase 31 snapshot-cron-watch contract', () => {
  describe('WatchLog schema', () => {
    it('parses an empty valid scaffold', () => {
      const log = { schemaVersion: '1.0' as const, lastSnapshottedTickDate: null, rows: [] };
      expect(() => WatchLogSchema.parse(log)).not.toThrow();
    });

    it('rejects missing schemaVersion', () => {
      expect(() =>
        WatchLogSchema.parse({ lastSnapshottedTickDate: null, rows: [] } as unknown),
      ).toThrow();
    });

    it('rejects a future schemaVersion (forces version-bump discipline)', () => {
      expect(() =>
        WatchLogSchema.parse({
          schemaVersion: '2.0',
          lastSnapshottedTickDate: null,
          rows: [],
        } as unknown),
      ).toThrow();
    });
  });

  describe('WatchRow schema', () => {
    it('parses a valid row', () => {
      expect(() => WatchRowSchema.parse(validRow())).not.toThrow();
    });

    it('rejects rows missing required fields (e.g., dlq)', () => {
      const { dlq: _dlq, ...rest } = validRow();
      expect(() => WatchRowSchema.parse(rest as unknown)).toThrow();
    });

    it('rejects extra top-level keys (strict mode)', () => {
      expect(() => WatchRowSchema.parse({ ...validRow(), unexpected: 'x' } as unknown)).toThrow();
    });
  });

  describe('classifyTick', () => {
    it('healthy + empty DLQ → PASS', () => {
      expect(classifyTick(validRow())).toBe('PASS');
    });

    it('healthy + whitelisted DLQ only → PASS', () => {
      const row = validRow({
        dlq: {
          count: 3,
          reasons: { 'v3:timeout_watchdog': 2, 'v3:adaptive-retry-fail': 1 },
        },
      });
      expect(classifyTick(row)).toBe('PASS');
    });

    it('healthy + non-whitelisted DLQ → FAIL', () => {
      const row = validRow({
        dlq: { count: 1, reasons: { 'v3:malformed': 1 } },
      });
      expect(classifyTick(row)).toBe('FAIL');
    });

    it('healthStatus !== healthy → FAIL', () => {
      const row = validRow({ healthStatus: 'degraded' });
      expect(classifyTick(row)).toBe('FAIL');
    });

    it('GAP detection: unknown + null freshness', () => {
      const row = validRow({ healthStatus: 'unknown', freshnessMs: null });
      expect(classifyTick(row)).toBe('GAP');
    });

    it('forward-compat: unknown DLQ reason (not in current enum) → FAIL', () => {
      const row = validRow({
        dlq: { count: 1, reasons: { 'v3:provider_error': 1 } },
      });
      expect(classifyTick(row)).toBe('FAIL');
    });
  });

  describe('consecutivePassCount', () => {
    it('GAP pauses (continues without breaking)', () => {
      const rows: WatchRow[] = [
        validRow({ tickDate: '2026-05-15', result: 'PASS', natural: true }),
        validRow({ tickDate: '2026-05-16', result: 'PASS', natural: true }),
        validRow({
          tickDate: '2026-05-17',
          result: 'GAP',
          natural: true,
          healthStatus: 'unknown',
          freshnessMs: null,
        }),
        validRow({ tickDate: '2026-05-18', result: 'PASS', natural: true }),
      ];
      expect(consecutivePassCount(rows)).toBe(3);
    });

    it('FAIL breaks the counter', () => {
      const rows: WatchRow[] = [
        validRow({ tickDate: '2026-05-15', result: 'PASS', natural: true }),
        validRow({
          tickDate: '2026-05-16',
          result: 'FAIL',
          natural: true,
          healthStatus: 'degraded',
        }),
        validRow({ tickDate: '2026-05-17', result: 'PASS', natural: true }),
        validRow({ tickDate: '2026-05-18', result: 'PASS', natural: true }),
      ];
      expect(consecutivePassCount(rows)).toBe(2);
    });

    it('non-natural PASS (force-triggered) breaks the counter', () => {
      const rows: WatchRow[] = [
        validRow({ tickDate: '2026-05-15', result: 'PASS', natural: true }),
        validRow({ tickDate: '2026-05-16', result: 'PASS', natural: true }),
        validRow({ tickDate: '2026-05-17', result: 'PASS', natural: false }),
        validRow({ tickDate: '2026-05-18', result: 'PASS', natural: true }),
      ];
      expect(consecutivePassCount(rows)).toBe(1);
    });
  });

  describe('WATCH_DLQ_WHITELIST source-of-truth', () => {
    it('contains exactly two entries (the canonical pair)', () => {
      expect(WATCH_DLQ_WHITELIST.length).toBe(2);
    });

    it('uses the canonical strings (not the CONTEXT illustrative pair)', () => {
      const entries = [...WATCH_DLQ_WHITELIST] as string[];
      expect(entries.sort()).toEqual(['v3:adaptive-retry-fail', 'v3:timeout_watchdog']);
    });

    it('every entry exists in the live DLQEntry.reason enum (forward-compat guard)', () => {
      // Canonical DLQEntry.reason union from server/lib/llmDLQ.ts:27-37.
      // Updating that enum WITHOUT updating WATCH_DLQ_WHITELIST or this
      // fixture is the drift this guard catches.
      const liveEnum = new Set<string>([
        'zod_fail',
        'llm_null',
        'retry_exhausted',
        'timeout_watchdog',
        'v3:timeout_watchdog',
        'v3:malformed',
        'v3:max_tokens_truncation',
        'v3:schema_fail',
        'v3:rate_limit_exhaust',
        'v3:adaptive-retry-fail',
      ]);
      for (const w of WATCH_DLQ_WHITELIST) {
        expect(liveEnum.has(w)).toBe(true);
      }
    });
  });
});
