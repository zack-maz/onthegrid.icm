import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StatusDropdown } from '@/components/layout/StatusDropdown';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { SearchModal } from '@/components/search/SearchModal';
import { useSearchStore } from '@/stores/searchStore';
import { useUIStore } from '@/stores/uiStore';
import { useFilterStore } from '@/stores/filterStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useLayerStore } from '@/stores/layerStore';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useNewsStore } from '@/stores/newsStore';
import { useMarketStore } from '@/stores/marketStore';
import { useWeatherStore } from '@/stores/weatherStore';
import { useWaterStore } from '@/stores/waterStore';
import { effectiveStatus } from '@/lib/apiStatus';
import { INITIAL_VIEW_STATE } from '@/components/map/constants';
import { hasDashboardKey, shouldRenderDashboard, dashboardAuthHeaders } from '@/lib/dashboardAuth';

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
 * Dev-only pipeline version pill. Shows the currently-effective v1/v2/v3 LLM
 * pipeline version as a READ-ONLY indicator. Phase 27.4.1 D-20: the
 * click-to-swap behavior has been stripped; operators who need to flip
 * versions should POST /api/events/llm-pipeline directly (the endpoint
 * remains available for scripted use). This passive pill answers
 * "which version's data am I seeing right now?" without the footgun
 * of accidentally swapping from dev clicks.
 *
 * The endpoint is dual-gated (NODE_ENV + 404 fallback); the UI is
 * DEV-only via the parent wrapper so production builds tree-shake it.
 *
 * Phase 27.4.3 Plan 04 — version union widened to admit 'v3', rendered
 * in blue rgb(96,165,250) per UI-SPEC §"Pipeline-version pill". PILL_COLORS
 * lookup record replaces the inline ternary so adding future versions is
 * a one-line change.
 */
const PILL_COLORS: Record<'v1' | 'v2' | 'v3', string> = {
  v1: 'rgb(234,179,8)', // yellow (existing)
  v2: 'rgb(74,222,128)', // green (existing)
  v3: 'rgb(96,165,250)', // blue accent-blue family (UI-SPEC new)
};

function PipelineVersionPillInner() {
  const [version, setVersion] = useState<'v1' | 'v2' | 'v3' | 'unknown'>('unknown');

  const fetchVersion = useCallback(async () => {
    try {
      // Phase 27.4.4 Plan 02 — /api/events/llm-pipeline is now Bearer-auth
      // gated in prod (dev bypasses). dashboardAuthHeaders() returns the
      // stored key as Authorization; in dev it's an empty object and the
      // server ignores absence.
      const res = await fetch('/api/events/llm-pipeline', {
        headers: dashboardAuthHeaders(),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { effective?: 'v1' | 'v2' | 'v3' };
      if (json.effective === 'v1' || json.effective === 'v2' || json.effective === 'v3') {
        setVersion(json.effective);
      }
    } catch {
      // leave as unknown
    }
  }, []);

  useEffect(() => {
    void fetchVersion();
  }, [fetchVersion]);

  if (version === 'unknown') return null;

  return (
    <span
      data-testid="pipeline-version-pill"
      className="rounded-md px-2 py-1 font-mono text-[10px]"
      style={{ color: PILL_COLORS[version] }}
      title={`LLM pipeline: ${version} (read-only — use POST /api/events/llm-pipeline to swap)`}
    >
      {version}
    </span>
  );
}

function PipelineVersionPill() {
  // Phase 27.4.4 Plan 02 — pill renders in dev OR when an operator has
  // stored a dashboard key. The fetch inside PipelineVersionPillInner
  // sends the Bearer header; in prod-not-authed it 401s and the pill
  // stays hidden via its own `version === 'unknown'` short-circuit.
  if (!shouldRenderDashboard()) return null;
  return <PipelineVersionPillInner />;
}

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

      {/* Right: Reset + DevApiStatus trigger (dev-only) + pipeline-version pill (dev-only) + Notification bell */}
      <div className="flex items-center gap-1">
        <ResetButton />
        <DevApiStatusTrigger />
        <PipelineVersionPill />
        <NotificationBell />
      </div>

      {/* Search modal overlay (z-modal renders above everything) */}
      <SearchModal />
    </header>
  );
}
