import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { Topbar } from '@/components/layout/Topbar';
import { useEventStore } from '@/stores/eventStore';
import { useFlightStore } from '@/stores/flightStore';
import { useMarketStore } from '@/stores/marketStore';
import { useNewsStore } from '@/stores/newsStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import { useWeatherStore } from '@/stores/weatherStore';

const now = Date.now();

/**
 * Phase 27.3.1 Plan 12 G6 — seed the 8 data-source stores so the
 * DevApiStatusTrigger's `hasIssue` computation has deterministic input.
 * Default fixture: all healthy (count > 0, connected).
 */
function resetAllStoresHealthy() {
  useFlightStore.setState({
    connectionStatus: 'connected',
    flightCount: 10,
    lastFetchAt: now - 5000,
    lastError: null,
    nextPollAt: now + 3000,
    recentFetches: [{ ok: true, durationMs: 150, timestamp: now }],
    flights: [],
  });
  useShipStore.setState({
    connectionStatus: 'connected',
    shipCount: 5,
    lastFetchAt: now - 10000,
    lastError: null,
    nextPollAt: now + 25000,
    recentFetches: [{ ok: true, durationMs: 300, timestamp: now }],
    ships: [],
  });
  useEventStore.setState({
    connectionStatus: 'connected',
    eventCount: 8,
    lastFetchAt: now - 60000,
    lastError: null,
    nextPollAt: now + 840000,
    recentFetches: [{ ok: true, durationMs: 500, timestamp: now }],
    events: [],
  });
  useSiteStore.setState({
    connectionStatus: 'connected',
    siteCount: 20,
    lastError: null,
    nextPollAt: null,
    recentFetches: [{ ok: true, durationMs: 1200, timestamp: now }],
    sites: [],
  });
  useNewsStore.setState({
    connectionStatus: 'connected',
    clusterCount: 12,
    articleCount: 45,
    lastFetchAt: now - 30000,
    lastError: null,
    nextPollAt: now + 870000,
    recentFetches: [{ ok: true, durationMs: 800, timestamp: now }],
    clusters: [],
  });
  useMarketStore.setState({
    connectionStatus: 'connected',
    lastFetchAt: now - 20000,
    lastError: null,
    nextPollAt: now + 280000,
    recentFetches: [{ ok: true, durationMs: 400, timestamp: now }],
    quotes: Array.from({ length: 5 }, (_, i) => ({
      symbol: `SYM${i}`,
      name: `Symbol ${i}`,
      price: 100 + i,
      change: 0.5,
      changePercent: 0.5,
      previousClose: 99.5 + i,
      timestamp: now,
      sparkline: [],
    })),
  });
  useWeatherStore.setState({
    connectionStatus: 'connected',
    lastFetchAt: now - 120000,
    lastError: null,
    nextPollAt: now + 1680000,
    recentFetches: [{ ok: true, durationMs: 600, timestamp: now }],
    grid: Array.from({ length: 100 }, (_, i) => ({
      lat: 30 + i * 0.1,
      lng: 50 + i * 0.1,
      temperature: 25,
      windSpeed: 10,
      windDirection: 180,
      humidity: 50,
    })),
  });
  useWaterStore.setState({
    connectionStatus: 'connected',
    lastError: null,
    nextPollAt: null,
    recentFetches: [{ ok: true, durationMs: 2000, timestamp: now }],
    facilities: [{ id: 'w1', name: 'Test Dam', lat: 33, lng: 51 }] as never[],
  });
}

describe('Phase 27.3.1 Plan 12 — Topbar DevApiStatusTrigger (G6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStoresHealthy();
    useUIStore.setState({
      isDevApiStatusOpen: false,
      activeDevApiStatusTab: 'apiHealth',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the DevApiStatusTrigger button when import.meta.env.DEV is true', () => {
    // In test mode Vite sets import.meta.env.DEV = true — the dev guard
    // passes, so the trigger mounts.
    render(<Topbar />);
    expect(screen.getByTestId('dev-api-status-trigger')).toBeInTheDocument();
  });

  it('clicking the trigger opens the modal (sets isDevApiStatusOpen to true)', () => {
    render(<Topbar />);
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(false);
    fireEvent.click(screen.getByTestId('dev-api-status-trigger'));
    expect(useUIStore.getState().isDevApiStatusOpen).toBe(true);
  });

  it('trigger text matches /API [~!]/ (either healthy or issue indicator)', () => {
    render(<Topbar />);
    const btn = screen.getByTestId('dev-api-status-trigger');
    expect(btn.textContent).toMatch(/API [~!]/);
  });

  it('trigger shows "API ~" when all sources are healthy', () => {
    render(<Topbar />);
    const btn = screen.getByTestId('dev-api-status-trigger');
    expect(btn.textContent).toMatch(/API ~/);
  });

  it('trigger shows "API !" when a source has an error', () => {
    useFlightStore.setState({ connectionStatus: 'error', flightCount: 0 });
    render(<Topbar />);
    const btn = screen.getByTestId('dev-api-status-trigger');
    expect(btn.textContent).toMatch(/API !/);
  });

  it('trigger is placed between ResetButton and NotificationBell in the right cluster', () => {
    render(<Topbar />);
    const resetBtn = screen.getByTestId('reset-button');
    const triggerBtn = screen.getByTestId('dev-api-status-trigger');
    // Same parent (right-cluster flex container)
    expect(resetBtn.parentElement).toBe(triggerBtn.parentElement);
    // DOM order: reset → trigger → (notification bell sibling)
    const children = Array.from(resetBtn.parentElement!.children);
    expect(children.indexOf(resetBtn)).toBeLessThan(children.indexOf(triggerBtn));
  });
});
