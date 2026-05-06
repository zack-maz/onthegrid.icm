/**
 * Phase 28.2 W5 Plan 05 Task 7 — Pin-to-v1/v2 confirm modal + 429 replay
 * quota alert tests.
 *
 * Confirm modal (UI-SPEC §6.1):
 *   21. Click `Pin to v1` -> modal renders with verbatim copy
 *   22. W-1 spacing pinning: Cancel + destructive buttons use py-2 NOT py-1.5
 *   23. Click `Keep v3` -> modal closes; POST NOT issued
 *   24. Click `Pin to v1` -> POST issued with body {version:'v1'} + Bearer
 *   25. Press Escape -> modal closes
 *   26. Click `Pin to v3` -> NO modal (current production version)
 *   27. Click `Clear pin` -> NO modal
 *
 * 429 quota alert (UI-SPEC §6.2):
 *   28. POST /llm-replay returning 429 -> alert renders verbatim copy
 *   29. Subsequent /llm-replay returning 200 -> alert disappears
 *   30. Spacing — alert has px-2 py-1 (no py-0.5 / py-1.5)
 */
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { HealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { DevApiStatus } from '@/components/ui/DevApiStatus';
import type { HealthResponse, EndpointHealth } from '@/lib/healthClient';
import { useFilterStore } from '@/stores/filterStore';
import { useUIStore } from '@/stores/uiStore';

vi.mock('@/lib/dashboardAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboardAuth')>('@/lib/dashboardAuth');
  return {
    ...actual,
    shouldRenderDashboard: vi.fn(() => true),
    dashboardAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-key' })),
  };
});

function makeEndpoint(overrides: Partial<EndpointHealth>): EndpointHealth {
  return {
    name: 'Flights',
    status: 'healthy',
    tier: 'critical',
    lastSuccessTs: Date.now() - 1_000,
    lastErrorReason: null,
    freshnessMs: 1_000,
    freshnessThresholdMs: 120_000,
    latencyMs: 8,
    ...overrides,
  };
}

function makeResponse(): HealthResponse {
  return {
    endpoints: { Flights: makeEndpoint({ name: 'Flights' }) },
    summary: {
      critical: { healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
      nonCritical: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      static: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
      probeOnly: { healthy: 0, unhealthy: 0, unknown: 0 },
      cron: { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 },
    },
    generatedAt: Date.now(),
  };
}

function renderModal() {
  const value = {
    health: makeResponse(),
    loading: false,
    error: null,
    lastSuccessAt: Date.now(),
  };
  useUIStore.setState({
    isDevApiStatusOpen: true,
    activeDevApiStatusTab: 'apiHealth',
  });
  return render(
    <HealthStatusContext.Provider value={value}>
      <DevApiStatus />
    </HealthStatusContext.Provider>,
  );
}

describe('DevApiStatus confirm modal + 429 alert (Phase 28.2 W5 Task 7)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    useFilterStore.setState({ showSites: true });
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Confirm modal (UI-SPEC §6.1)', () => {
    it('Test 21: Click `Pin to v1` button -> modal appears with verbatim title + body', () => {
      renderModal();
      fireEvent.click(screen.getByTestId('pin-pipeline-v1'));
      const modal = screen.getByTestId('confirm-pin-modal');
      expect(modal).toBeDefined();
      expect(modal.textContent).toContain('Confirm pipeline version pin');
      expect(modal.textContent).toContain('Pin LLM pipeline to v1 for 7 days.');
      expect(modal.textContent).toContain('v3 is current production');
      expect(modal.textContent).toContain('Continue?');
    });

    it('Test 22 (W-1 spacing pinning): Cancel + destructive buttons use py-2 NOT py-1.5', () => {
      renderModal();
      fireEvent.click(screen.getByTestId('pin-pipeline-v1'));
      const cancel = screen.getByTestId('confirm-pin-cancel');
      const confirm = screen.getByTestId('confirm-pin-confirm');
      expect(cancel.textContent).toBe('Keep v3');
      expect(confirm.textContent).toBe('Pin to v1');
      // py-2 multiple-of-4 (not py-1.5)
      expect(cancel.className).toContain('py-2');
      expect(cancel.className).not.toContain('py-1.5');
      expect(confirm.className).toContain('py-2');
      expect(confirm.className).not.toContain('py-1.5');
    });

    it('Test 23: Click `Keep v3` -> modal closes; POST NOT issued', () => {
      renderModal();
      fireEvent.click(screen.getByTestId('pin-pipeline-v1'));
      fireEvent.click(screen.getByTestId('confirm-pin-cancel'));
      expect(screen.queryByTestId('confirm-pin-modal')).toBeNull();
      const pipelineCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('/llm-pipeline'),
      );
      expect(pipelineCalls.length).toBe(0);
    });

    it('Test 24: Click `Pin to v1` confirm -> POST issued with version + Bearer', async () => {
      renderModal();
      fireEvent.click(screen.getByTestId('pin-pipeline-v1'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-pin-confirm'));
      });
      const pipelineCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('/api/events/llm-pipeline'),
      );
      expect(pipelineCalls.length).toBe(1);
      const init = pipelineCalls[0][1] as RequestInit;
      const body = JSON.parse(String(init.body ?? '{}'));
      expect(body.version).toBe('v1');
      const headers = (init.headers ?? {}) as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Bearer /);
    });

    it('Test 25: Press Escape -> modal closes', () => {
      renderModal();
      fireEvent.click(screen.getByTestId('pin-pipeline-v1'));
      expect(screen.getByTestId('confirm-pin-modal')).toBeDefined();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('confirm-pin-modal')).toBeNull();
    });

    it('Test 26: Click `Pin to v3` -> NO modal (current production)', async () => {
      renderModal();
      await act(async () => {
        fireEvent.click(screen.getByTestId('pin-pipeline-v3'));
      });
      expect(screen.queryByTestId('confirm-pin-modal')).toBeNull();
      const pipelineCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('/api/events/llm-pipeline'),
      );
      expect(pipelineCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('Test 27: Click `Clear pin` -> NO modal', async () => {
      renderModal();
      await act(async () => {
        fireEvent.click(screen.getByTestId('pin-pipeline-clear'));
      });
      expect(screen.queryByTestId('confirm-pin-modal')).toBeNull();
      const pipelineCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0] ?? '').includes('/api/events/llm-pipeline'),
      );
      expect(pipelineCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('429 replay quota alert (UI-SPEC §6.2)', () => {
    it('Test 28: 429 from /llm-replay -> alert renders verbatim copy', async () => {
      const replayFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: 'replay_quota_exceeded',
            resetsAt: '2026-05-05T00:00:00.000Z',
          }),
      });
      vi.stubGlobal('fetch', replayFetch);
      renderModal();
      await act(async () => {
        fireEvent.click(screen.getByTestId('replay-test-trigger'));
        await new Promise((r) => setTimeout(r, 0));
      });
      const alert = screen.getByTestId('replay-quota-alert');
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain('Replay quota reached: 50 of 50 in last 24h');
      expect(alert.textContent).toContain('2026-05-05T00:00:00.000Z');
      expect(alert.textContent).toContain('Quota protects daily token budget');
    });

    it('Test 29: subsequent 200 from /llm-replay -> alert disappears', async () => {
      // First mock: always 429 — verify alert appears
      const replay429Only = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: 'replay_quota_exceeded',
            resetsAt: '2026-05-05T00:00:00.000Z',
          }),
      });
      vi.stubGlobal('fetch', replay429Only);
      renderModal();
      await act(async () => {
        fireEvent.click(screen.getByTestId('replay-test-trigger'));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.getByTestId('replay-quota-alert')).toBeDefined();

      // Now swap fetch to always-200 — verify alert clears
      const replay200Only = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ old: {}, new: {} }),
      });
      vi.stubGlobal('fetch', replay200Only);
      await act(async () => {
        fireEvent.click(screen.getByTestId('replay-test-trigger'));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByTestId('replay-quota-alert')).toBeNull();
    });

    it('Test 30: alert spacing — px-2 py-1 (multiples of 4)', async () => {
      const replay429 = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: 'replay_quota_exceeded',
            resetsAt: '2026-05-05T00:00:00.000Z',
          }),
      });
      vi.stubGlobal('fetch', replay429);
      renderModal();
      await act(async () => {
        fireEvent.click(screen.getByTestId('replay-test-trigger'));
        await new Promise((r) => setTimeout(r, 0));
      });
      const alert = screen.getByTestId('replay-quota-alert');
      expect(alert.className).toContain('px-2');
      expect(alert.className).toContain('py-1');
      expect(alert.className).not.toContain('py-0.5');
      expect(alert.className).not.toContain('py-1.5');
    });
  });
});
