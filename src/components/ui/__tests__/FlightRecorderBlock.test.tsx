/**
 * Phase 39 SC39-3 gap closure — FlightRecorderBlock honest-render coverage
 * (WR-01 + WR-05).
 *
 * These tests would have CAUGHT the two client-side flight-recorder defects:
 *
 *   WR-05 — `normalizeEvalScore` read `evalScore.score`, a key the server eval
 *           shape (`{ within5km, within20km, within100km, total }`) does not
 *           carry, so the eval pill NEVER rendered. We assert the pill renders
 *           the real `within20km / total` accuracy metric and degrades-open
 *           (hidden) on a zero/absent total.
 *
 *   WR-01 — `outcomeBand` returns 'partial' (yellow) only when
 *           `batchesFailed > 0 || dlqDelta > 0`. Before the server fix those
 *           were structurally ~0 so the 'partial' band was dead code. Here we
 *           feed run records that exercise EACH band (success / partial / error
 *           / running) and assert the badge text + fill color fire correctly —
 *           proving the bands are reachable given honest server input.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlightRecorderBlock } from '@/components/ui/FlightRecorderBlock';

vi.mock('@/lib/dashboardAuth', () => ({
  dashboardAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));

type RunOutcome =
  | 'running'
  | 'completed'
  | 'watchdog_aborted'
  | 'breaker_paused'
  | 'budget_hit'
  | 'error';

interface ServerEvalScore {
  within5km: number;
  within20km: number;
  within100km: number;
  total: number;
  actorMatchRate?: number | null;
}

function makeRun(over: Partial<Record<string, unknown>> = {}) {
  return {
    runId: 'run-aaaaaaaa-1111',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    completedAt: new Date().toISOString(),
    outcome: 'completed' as RunOutcome,
    batchCount: 10,
    batchesCompleted: 10,
    batchesFailed: 0,
    tokenSpend: { nvidia_nim: 4321 },
    evalScore: null as ServerEvalScore | number | null,
    dlqDelta: 0,
    watchdogTimeouts: 0,
    durationMs: 60_000,
    pipelineVersion: 'v3' as const,
    ...over,
  };
}

function mockHistory(runs: unknown[], calls: unknown[] = []) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ runs, calls }),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useRealTimers();
});

describe('FlightRecorderBlock — eval pill (WR-05)', () => {
  it('renders within20km/total accuracy from the REAL server eval shape', async () => {
    mockHistory([
      makeRun({
        runId: 'run-eval-1',
        evalScore: { within5km: 30, within20km: 45, within100km: 49, total: 50 },
      }),
    ]);
    render(<FlightRecorderBlock />);

    // 45/50 = 0.90 → "eval 90% @20km" (NOT blank, NOT crashing on missing .score)
    const pill = await screen.findByTestId('flight-recorder-eval-run-eval-1');
    expect(pill.textContent).toContain('90%');
    expect(pill.textContent).toContain('@20km');
    // 0.90 is in the yellow band (≥0.80, <0.95).
    expect(pill.className).toContain('text-accent-yellow');
  });

  it('colors a ≥0.95 accuracy green', async () => {
    mockHistory([
      makeRun({
        runId: 'run-eval-green',
        evalScore: { within5km: 48, within20km: 49, within100km: 50, total: 50 },
      }),
    ]);
    render(<FlightRecorderBlock />);
    const pill = await screen.findByTestId('flight-recorder-eval-run-eval-green');
    expect(pill.textContent).toContain('98%');
    expect(pill.className).toContain('text-accent-green');
  });

  it('hides the eval pill (degrade-open) when total is 0 — no ground truth', async () => {
    mockHistory([
      makeRun({
        runId: 'run-eval-zero',
        evalScore: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
      }),
    ]);
    render(<FlightRecorderBlock />);
    // The run row renders, but the eval pill must be absent (never a crash).
    await screen.findByTestId('flight-recorder-run-run-eval-zero');
    expect(screen.queryByTestId('flight-recorder-eval-run-eval-zero')).toBeNull();
  });

  it('hides the eval pill when evalScore is absent (undefined)', async () => {
    mockHistory([makeRun({ runId: 'run-eval-absent', evalScore: undefined })]);
    render(<FlightRecorderBlock />);
    await screen.findByTestId('flight-recorder-run-run-eval-absent');
    expect(screen.queryByTestId('flight-recorder-eval-run-eval-absent')).toBeNull();
  });
});

describe('FlightRecorderBlock — outcome bands (WR-01)', () => {
  it('a clean completed run renders SUCCESS / green', async () => {
    mockHistory([makeRun({ runId: 'run-ok', batchesFailed: 0, dlqDelta: 0 })]);
    render(<FlightRecorderBlock />);
    const row = await screen.findByTestId('flight-recorder-run-run-ok');
    expect(row.textContent).toContain('SUCCESS');
    const badge = row.querySelector('span');
    expect(badge?.className).toContain('text-accent-green');
  });

  it('a completed run with failed batches renders PARTIAL / yellow (previously dead band)', async () => {
    mockHistory([
      makeRun({ runId: 'run-partial', outcome: 'completed', batchesFailed: 3, dlqDelta: 3 }),
    ]);
    render(<FlightRecorderBlock />);
    const row = await screen.findByTestId('flight-recorder-run-run-partial');
    // The badge TEXT must read PARTIAL — not SUCCESS — now that the band fires.
    expect(row.textContent).toContain('PARTIAL');
    const badge = row.querySelector('span');
    expect(badge?.className).toContain('text-accent-yellow');
  });

  it('a completed run with only DLQ growth (no failed batches) still reads PARTIAL', async () => {
    mockHistory([
      makeRun({ runId: 'run-dlq', outcome: 'completed', batchesFailed: 0, dlqDelta: 2 }),
    ]);
    render(<FlightRecorderBlock />);
    const row = await screen.findByTestId('flight-recorder-run-run-dlq');
    expect(row.textContent).toContain('PARTIAL');
  });

  it('an error outcome renders ERROR / red', async () => {
    mockHistory([makeRun({ runId: 'run-err', outcome: 'error', batchesFailed: 5 })]);
    render(<FlightRecorderBlock />);
    const row = await screen.findByTestId('flight-recorder-run-run-err');
    expect(row.textContent).toContain('ERROR');
    const badge = row.querySelector('span');
    expect(badge?.className).toContain('text-accent-red');
  });

  it('a running outcome renders RUNNING / blue', async () => {
    mockHistory([
      makeRun({ runId: 'run-live', outcome: 'running', completedAt: null, batchesCompleted: 4 }),
    ]);
    render(<FlightRecorderBlock />);
    const row = await screen.findByTestId('flight-recorder-run-run-live');
    expect(row.textContent).toContain('RUNNING');
    const badge = row.querySelector('span');
    expect(badge?.className).toContain('text-accent-blue');
  });
});

describe('FlightRecorderBlock — degrade-open', () => {
  it('renders nothing on a non-200 history response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const { container } = render(<FlightRecorderBlock />);
    // Block stays hidden (data === null) — give the effect a tick to settle.
    await waitFor(() => {
      expect(container.querySelector('[data-testid="flight-recorder"]')).toBeNull();
    });
  });
});
