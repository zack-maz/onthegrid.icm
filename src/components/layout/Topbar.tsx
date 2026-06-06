import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { NotificationBell } from '@/components/layout/NotificationBell';
import { StatusDropdown } from '@/components/layout/StatusDropdown';
import { INITIAL_VIEW_STATE } from '@/components/map/constants';
import { TourTrigger } from '@/components/reveal/TourTrigger';
import { SearchModal } from '@/components/search/SearchModal';
import { effectiveStatus } from '@/lib/apiStatus';
import { hasDashboardKey } from '@/lib/dashboardAuth';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFlightStore } from '@/stores/flightStore';
import { useLayerStore } from '@/stores/layerStore';
import { useMarketStore } from '@/stores/marketStore';
import { useNewsStore } from '@/stores/newsStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useSearchStore } from '@/stores/searchStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import { useWeatherStore } from '@/stores/weatherStore';

function ResetButton() {
  const handleReset = useCallback(() => {
    // Reset UI state
    useUIStore.setState({
      selectedEntityId: null,
      hoveredEntityId: null,
      isDetailPanelOpen: false,
      expandedAlertSiteId: null,
    });

    // Reset visualization layers to defaults
    useLayerStore.getState().resetLayers();

    // Reset all filters
    useFilterStore.getState().clearAll();

    // Reset camera to initial view
    useNotificationStore.getState().setFlyToTarget({
      lng: INITIAL_VIEW_STATE.longitude,
      lat: INITIAL_VIEW_STATE.latitude,
      zoom: INITIAL_VIEW_STATE.zoom,
      pitch: INITIAL_VIEW_STATE.pitch,
      bearing: INITIAL_VIEW_STATE.bearing,
    });

    // In dev mode, reload the page
    if (import.meta.env.DEV) {
      setTimeout(() => window.location.reload(), 100);
    }
  }, []);

  return (
    <button
      data-testid="reset-button"
      onClick={handleReset}
      className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-white/5 hover:text-text-secondary transition-colors"
      title="Reset all settings"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12a9 9 0 1 1 9 9" />
        <polyline points="1 7 3 12 8 10" />
      </svg>
    </button>
  );
}

/**
 * Phase 27.3.1 Plan 12 G6 — dev-only DevApiStatus trigger badge.
 *
 * Renders in the Topbar right cluster between ResetButton and
 * NotificationBell. Production builds tree-shake the inner component via
 * the `if (!import.meta.env.DEV) return null;` guard in the thin wrapper —
 * Vite's DCE removes the conditional branch + the lazy-imported hook
 * subtree at build time, so there is no runtime cost in production.
 *
 * Split into two components (wrapper + inner) because the hooks in the
 * inner component must be called unconditionally per the rules-of-hooks;
 * the DEV check lives in the wrapper instead of before the hooks.
 *
 * Badge shows "API ~" (all healthy) or "API !" (red — at least one
 * connection in error/stuck/empty state) matching the pre-Plan-12
 * collapsed overlay behavior.
 */
function DevApiStatusTriggerInner() {
  const openDevApiStatus = useUIStore((s) => s.openDevApiStatus);
  const openDashboardAuth = useUIStore((s) => s.openDashboardAuth);

  // Phase 27.4.4 Plan 02 — in dev or when authed, the trigger opens
  // DevApiStatus directly. In prod with no stored key, the trigger opens
  // the dashboard auth modal first; on successful auth the modal itself
  // calls openDevApiStatus, so the next click behaves like dev.
  const onTriggerClick = useCallback(() => {
    if (import.meta.env.DEV || hasDashboardKey()) {
      openDevApiStatus();
    } else {
      openDashboardAuth();
    }
  }, [openDevApiStatus, openDashboardAuth]);

  const flights = useFlightStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.flightCount,
      lastFetch: s.lastFetchAt,
    })),
  );
  const ships = useShipStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.shipCount,
      lastFetch: s.lastFetchAt,
    })),
  );
  const events = useEventStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.eventCount,
      lastFetch: s.lastFetchAt,
    })),
  );
  const sites = useSiteStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.siteCount,
      lastFetch: null as number | null,
    })),
  );
  const news = useNewsStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.clusterCount,
      lastFetch: s.lastFetchAt,
    })),
  );
  const markets = useMarketStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.quotes.length,
      lastFetch: s.lastFetchAt,
    })),
  );
  const weather = useWeatherStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.grid.length,
      lastFetch: s.lastFetchAt,
    })),
  );
  const water = useWaterStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.facilities.length,
      lastFetch: s.lastFetchAt,
    })),
  );

  const hasIssue = [flights, ships, events, sites, news, markets, weather, water].some((r) => {
    const eff = effectiveStatus(r.status, r.count, r.lastFetch);
    return eff === 'error' || eff === 'stuck' || eff === 'empty';
  });

  return (
    <button
      data-testid="dev-api-status-trigger"
      onClick={onTriggerClick}
      className="rounded-md px-2 py-1 font-mono text-[10px] transition-colors hover:bg-white/5"
      style={{ color: hasIssue ? '#ef4444' : 'rgba(255,255,255,0.4)' }}
      title="Dev API Status"
    >
      API {hasIssue ? '!' : '~'}
    </button>
  );
}

function DevApiStatusTrigger() {
  // Phase 27.4.4 Plan 02 — trigger renders unconditionally so prod operators
  // can reach the auth modal. The inner button click routes to either
  // DevApiStatus (dev OR authed) or DashboardAuthModal (prod-not-authed).
  return <DevApiStatusTriggerInner />;
}

/**
 * Phase 29 Plan 08 D-02 part D — Topbar pipeline-version pill removed.
 * The pill's only function was querying the now-deleted
 * POST /api/events/llm-pipeline endpoint (Plan 04). Per RESEARCH Question 5
 * + A4 decision, the pill was deleted (not preserved as a static "v3"
 * indicator) — a UI element with no signal behind it would be deceptive.
 * Operators can confirm the active pipeline version via the DevApiStatus
 * Events tab callHistory display.
 */

export function Topbar() {
  return (
    <header
      data-testid="topbar"
      className="relative z-[var(--z-controls)] flex h-[var(--height-topbar)] w-full items-center justify-between border-b border-border bg-surface-overlay px-4 backdrop-blur-sm"
    >
      {/* Left: Status dropdown with title */}
      <StatusDropdown />

      {/* Center: Search hint */}
      <button
        data-testid="topbar-search-hint"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-text-muted hover:bg-white/5 transition-colors"
        aria-label="Open search"
        onClick={() => useSearchStore.getState().openSearchModal()}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <kbd className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          Cmd+K
        </kbd>
      </button>

      {/* Right: Tour + Reset + DevApiStatus trigger (dev-only) + Notification bell */}
      <div className="flex items-center gap-1">
        <TourTrigger />
        <ResetButton />
        <DevApiStatusTrigger />
        <NotificationBell />
      </div>

      {/* Search modal overlay (z-modal renders above everything) */}
      <SearchModal />
    </header>
  );
}
