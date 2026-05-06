import React, { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useHealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { useLLMStatusPolling } from '@/hooks/useLLMStatusPolling';
import type { LLMStatus, RecentEnrichedEvent } from '@/hooks/useLLMStatusPolling';
import { effectiveStatus } from '@/lib/apiStatus';
import { shouldRenderDashboard, dashboardAuthHeaders } from '@/lib/dashboardAuth';
import type { EndpointHealth, HealthResponse, HealthStatus, HealthTier } from '@/lib/healthClient';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useFlightStore } from '@/stores/flightStore';
import { useMarketStore } from '@/stores/marketStore';
import { useNewsStore } from '@/stores/newsStore';
import { useShipStore } from '@/stores/shipStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUIStore } from '@/stores/uiStore';
import { useWaterStore } from '@/stores/waterStore';
import { useWeatherStore } from '@/stores/weatherStore';
// Phase 28.1 W2 — DevApiStatus All APIs tab consumes the shared
// HealthStatusProvider context. NEVER import useHealthStatus directly here
// (that would double the /api/health poll rate against HealthBanner).

interface FetchEntry {
  ok: boolean;
  durationMs: number;
  timestamp: number;
}

interface ApiRow {
  name: string;
  status: string;
  count: number;
  lastFetch: number | null;
  lastError: string | null;
  nextPollAt: number | null;
  recentFetches: FetchEntry[];
  isOneShot: boolean;
  note?: string;
  quality?: string;
}

/* ---------- Helpers ---------- */

function statusColor(eff: string): string {
  switch (eff) {
    case 'connected':
      return '#22c55e';
    case 'empty':
    case 'stale':
    case 'stuck':
      return '#f59e0b';
    case 'error':
      return '#ef4444';
    case 'init':
      return '#60a5fa';
    case 'idle':
      return '#6b7280';
    default:
      return '#60a5fa';
  }
}

function statusLabel(eff: string): string {
  switch (eff) {
    case 'empty':
      return 'EMPTY';
    case 'stuck':
      return 'STUCK';
    case 'init':
      return 'INIT';
    default:
      return eff.toUpperCase();
  }
}

function formatAge(ts: number | null): string {
  if (!ts) return '--';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function formatCountdown(nextPollAt: number | null, isOneShot: boolean, status: string): string {
  if (isOneShot) {
    if (status === 'loading' || status === 'idle') return 'Fetching...';
    if (status === 'error') return 'Failed';
    return 'Complete';
  }
  if (!nextPollAt) return '--';
  const sec = Math.max(0, Math.floor((nextPollAt - Date.now()) / 1000));
  return `${sec}s`;
}

function avgResponseTime(fetches: FetchEntry[]): string {
  if (fetches.length === 0) return '--';
  const avg = fetches.reduce((sum, f) => sum + f.durationMs, 0) / fetches.length;
  return `${Math.round(avg)}ms`;
}

function successRate(fetches: FetchEntry[]): string {
  if (fetches.length === 0) return '--';
  const ok = fetches.filter((f) => f.ok).length;
  return `${ok}/${fetches.length}`;
}

function formatElapsed(startedAt: number | null | undefined): string {
  if (!startedAt) return '--';
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  return `${sec}s`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Phase 27.3.1 R-08 D-30 — relative time helper for the WaterFiltersSection
 * provenance header. Renders "Xs ago" / "Xm ago" / "Xh ago" / "Xd ago".
 * Defensive: returns "--" for invalid/empty ISO strings rather than NaN.
 */
function relativeTime(iso: string): string {
  if (!iso) return '--';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '--';
  const delta = Date.now() - t;
  if (delta < 0) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

/* ---------- LLM Pipeline Section ---------- */

const PIPELINE_STAGES = ['grouping', 'llm-processing', 'geocoding', 'done'] as const;
const STAGE_LABELS: Record<string, string> = {
  grouping: 'Group',
  'llm-processing': 'LLM',
  geocoding: 'Geocode',
  done: 'Done',
  error: 'Error',
};
const STAGE_COLORS: Record<string, string> = {
  grouping: '#60a5fa',
  'llm-processing': '#a78bfa',
  geocoding: '#22c55e',
  done: '#22c55e',
  error: '#ef4444',
};

function ProgressBar({
  completed,
  total,
  barColor,
}: {
  completed: number;
  total: number;
  barColor?: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 flex-1 rounded-full bg-white/10">
        <div
          className="h-1 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor ?? '#a78bfa' }}
        />
      </div>
      <span className="text-[8px] text-white/40 tabular-nums">{pct}%</span>
    </div>
  );
}

function StageIndicator({ current }: { current: string }) {
  const activeIdx = PIPELINE_STAGES.indexOf(current as (typeof PIPELINE_STAGES)[number]);
  const isError = current === 'error';
  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((s, i) => {
        const isDone = !isError && activeIdx >= 0 && i < activeIdx;
        const isActive = !isError && s === current;
        const color = isError
          ? '#ef4444'
          : isDone
            ? '#22c55e'
            : isActive
              ? (STAGE_COLORS[s] ?? '#60a5fa')
              : 'rgba(255,255,255,0.15)';
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className="flex h-3 items-center justify-center rounded px-1 text-[7px] font-bold uppercase"
              style={{
                backgroundColor: isActive ? color : 'transparent',
                color: isDone ? color : isActive ? '#000' : color,
                border: `1px solid ${color}`,
              }}
            >
              {STAGE_LABELS[s]}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <span style={{ color: isDone ? '#22c55e' : 'rgba(255,255,255,0.15)' }}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LLMPipelineSection({ llmStatus }: { llmStatus: LLMStatus }) {
  const { stage } = llmStatus;

  if (stage === 'idle' && !llmStatus.lastRun) {
    return <span className="text-white/30">No LLM runs yet</span>;
  }

  if (stage === 'idle' && llmStatus.lastRun) {
    const lr = llmStatus.lastRun;
    return (
      <div className="space-y-1">
        <StageIndicator current="done" />
        <div className="text-white/50">
          Last: {formatAge(lr.lastRun)} ago · {lr.enrichedCount} enriched · {lr.geocodeCount}{' '}
          geocoded · {formatDuration(lr.durationMs)}
          {lr.source === 'dev-file-cache' && (
            <span className="ml-1 rounded bg-yellow-500/15 px-1 text-[8px] text-yellow-400">
              FILE CACHE
            </span>
          )}
        </div>
        {lr.error ? <div className="text-red-400">Error: {lr.error}</div> : null}
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="space-y-1">
        <StageIndicator current="done" />
        <div className="text-white/50">
          {llmStatus.enrichedCount ?? 0} enriched in {formatDuration(llmStatus.durationMs)}
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="space-y-1">
        <StageIndicator current="error" />
        <div className="text-white/50">Elapsed: {formatElapsed(llmStatus.startedAt)}</div>
        {llmStatus.errorMessage ? (
          <div className="text-red-400">{llmStatus.errorMessage}</div>
        ) : null}
      </div>
    );
  }

  // Active stages: grouping, llm-processing, geocoding
  const completed =
    stage === 'llm-processing'
      ? (llmStatus.completedBatches ?? 0)
      : stage === 'geocoding'
        ? (llmStatus.completedGeocodes ?? 0)
        : 0;
  const total =
    stage === 'llm-processing'
      ? (llmStatus.totalBatches ?? 0)
      : stage === 'geocoding'
        ? (llmStatus.totalGeocodes ?? 0)
        : 0;

  return (
    <div className="space-y-1">
      <StageIndicator current={stage} />
      <div className="text-white/50">
        Elapsed: {formatElapsed(llmStatus.startedAt)}
        {stage === 'grouping' && (
          <span>
            {' '}
            · {llmStatus.totalGroups ?? 0} groups, {llmStatus.newGroups ?? 0} new
          </span>
        )}
        {stage === 'llm-processing' && (
          <span>
            {' '}
            · Batch {completed}/{total}
          </span>
        )}
        {stage === 'geocoding' && (
          <span>
            {' '}
            · {completed}/{total} · {llmStatus.enrichedCount ?? 0} enriched
          </span>
        )}
      </div>
      {(stage === 'llm-processing' || stage === 'geocoding') && total > 0 && (
        <ProgressBar completed={completed} total={total} />
      )}
    </div>
  );
}

/* ---------- Tab Button (Plan 12 G6) ---------- */

function TabButton({
  active,
  onClick,
  indicator,
  testid,
  children,
}: {
  active: boolean;
  onClick: () => void;
  indicator?: 'red';
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      data-testid={testid}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-3 py-1 text-[10px] font-medium transition-colors ${
        active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
      }`}
    >
      {children}
      {indicator === 'red' && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/* ---------- Main Component ---------- */

/**
 * Dev-only API status modal. Shows connection status, data counts,
 * response times, success rates, poll countdowns, error indicators,
 * data quality metrics, LLM pipeline progress, and copy diagnostics.
 *
 * Phase 27.3.1 Plan 12 G6 — refactored from a fixed bottom-left overlay
 * into a centered modal at z-index var(--z-modal). Open state lives in
 * uiStore.isDevApiStatusOpen; the Topbar DevApiStatusTrigger opens it.
 *
 * Modal has a sticky tab bar with three tabs:
 *   - Overview: API source table + LLM Pipeline
 *   - Water:    WaterFiltersSection (R-08 observability)
 *   - Sites:    SitesFiltersSection (R-05 observability)
 *
 * Escape closes the modal FIRST (capture-phase listener) before bubbling
 * to nav-stack / detail-panel / search Escape handlers.
 *
 * Only renders visible UI when import.meta.env.DEV is true AND the modal
 * is open. When closed, returns null — AppShell's wrapper is harmless.
 */
export function DevApiStatus() {
  // Tick every 2s to update ages and countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const llmStatus = useLLMStatusPolling();

  // Store selectors — useShallow prevents infinite re-render from new object refs
  const flights = useFlightStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.flightCount,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
      unidentifiedCount: s.flights.filter((f) => f.data.unidentified).length,
      groundCount: s.flights.filter((f) => (f.data.altitude ?? 0) <= 0).length,
    })),
  );

  const ships = useShipStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.shipCount,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
    })),
  );

  const eventsRaw = useEventStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.eventCount,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
      events: s.events,
    })),
  );

  const eventQuality = useMemo(() => {
    const evts = eventsRaw.events;
    const llmCount = evts.filter((e) => e.data.llmProcessed).length;
    const rawCount = evts.length - llmCount;
    const exact = evts.filter((e) => e.data.precision === 'exact').length;
    const city = evts.filter((e) => e.data.precision === 'city').length;
    const region = evts.filter((e) => e.data.precision === 'region').length;
    return { llmCount, rawCount, exact, city, region };
  }, [eventsRaw.events]);

  const sites = useSiteStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.siteCount,
      lastFetch: null as number | null,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
      sites: s.sites,
    })),
  );

  const news = useNewsStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.clusterCount,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
      articleCount: s.articleCount,
    })),
  );

  const markets = useMarketStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.quotes.length,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
    })),
  );

  const weather = useWeatherStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.grid.length,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
    })),
  );

  const waterRaw = useWaterStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.facilities.length,
      lastFetch: s.lastFetchAt,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
      facilities: s.facilities,
    })),
  );

  const waterByType = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const f of waterRaw.facilities) {
      byType[f.facilityType] = (byType[f.facilityType] ?? 0) + 1;
    }
    return byType;
  }, [waterRaw.facilities]);

  const precip = useWaterStore(
    useShallow((s) => ({
      status: s.precipStatus,
      count: s.precipMatchedCount,
      lastFetch: s.precipLastFetchAt,
      lastError: s.precipLastError,
      nextPollAt: s.precipNextPollAt,
      recentFetches: s.precipRecentFetches,
      facilityCount: s.facilities.length,
    })),
  );

  const rows: ApiRow[] = [
    {
      name: 'Flights',
      ...flights,
      isOneShot: false,
      quality: `${flights.count} total, ${flights.unidentifiedCount} unid, ${flights.groundCount} gnd`,
    },
    {
      name: 'Ships',
      ...ships,
      isOneShot: false,
      quality: `${ships.count} total`,
    },
    {
      name: 'Events',
      status: eventsRaw.status,
      count: eventsRaw.count,
      lastFetch: eventsRaw.lastFetch,
      lastError: eventsRaw.lastError,
      nextPollAt: eventsRaw.nextPollAt,
      recentFetches: eventsRaw.recentFetches,
      isOneShot: false,
      note: eventQuality.llmCount > 0 ? `${eventQuality.llmCount} LLM` : 'raw',
      quality: `${eventsRaw.count} total, ${eventQuality.llmCount} LLM, ${eventQuality.rawCount} raw | ${eventQuality.exact} exact, ${eventQuality.city} city, ${eventQuality.region} region`,
    },
    {
      name: 'Sites',
      ...sites,
      isOneShot: true,
      quality: `${sites.count} total`,
    },
    {
      name: 'News',
      ...news,
      isOneShot: false,
      quality: `${news.count} clusters, ${news.articleCount} articles`,
    },
    {
      name: 'Markets',
      ...markets,
      isOneShot: false,
      quality: `${markets.count} instruments`,
    },
    {
      name: 'Weather',
      ...weather,
      isOneShot: false,
      quality: `${weather.count} grid points`,
    },
    {
      name: 'Water',
      ...waterRaw,
      isOneShot: true,
      quality: `${waterRaw.count} total | ${waterByType['dam'] ?? 0} dam, ${waterByType['reservoir'] ?? 0} res, ${waterByType['desalination'] ?? 0} desal`,
    },
    {
      name: 'Precip',
      ...precip,
      isOneShot: false,
      quality: `${precip.count}/${precip.facilityCount} matched`,
    },
  ];

  const hasIssue = rows.some((r) => {
    const eff = effectiveStatus(r.status, r.count, r.lastFetch);
    return eff === 'error' || eff === 'stuck' || eff === 'empty';
  });

  const copyDiagnostics = async () => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      sources: rows.map((r) => ({
        name: r.name,
        status: effectiveStatus(r.status, r.count, r.lastFetch),
        count: r.count,
        lastFetch: r.lastFetch,
        lastError: r.lastError,
        nextPollAt: r.nextPollAt,
        avgResponseMs:
          r.recentFetches.length > 0
            ? Math.round(
                r.recentFetches.reduce((s, f) => s + f.durationMs, 0) / r.recentFetches.length,
              )
            : null,
        successRate:
          r.recentFetches.length > 0
            ? r.recentFetches.filter((f) => f.ok).length / r.recentFetches.length
            : null,
        recentFetches: r.recentFetches,
        quality: r.quality,
      })),
      llmPipeline: llmStatus,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Clipboard may not be available
    }
  };

  // Phase 27.3.1 Plan 12 G6 — uiStore-backed modal state
  const isOpen = useUIStore((s) => s.isDevApiStatusOpen);
  const activeTab = useUIStore((s) => s.activeDevApiStatusTab);
  const setTab = useUIStore((s) => s.setDevApiStatusTab);
  const close = useUIStore((s) => s.closeDevApiStatus);

  // Phase 27.4.6 fix — Water + Events tabs are always visible to the operator.
  // The prior dynamic-state gates hid these tabs at cold start (Water until the
  // viz layer is toggled on; Events until the LLM pipeline reports a
  // schemaVersion), which surprised the operator after the Phase 27.4.6 cron
  // rollout. Sites stays gated on the explicit filter toggle since it is a
  // filter-driven surface, not an observability surface.
  const showWaterTab = true;
  const showSitesTab = useFilterStore((s) => s.showSites);
  const showEventsTab = shouldRenderDashboard();
  // Phase 28.2 W5 D-26 — merged API Health tab Bearer-gated via the canonical
  // `shouldRenderDashboard()` predicate. Replaces the prior W2 `showAllApisTab
  // = true` always-visible flag. HealthBanner (intentionally NOT gated)
  // continues to surface critical-tier outages to anonymous prod users.
  const showApiHealthTab = shouldRenderDashboard();

  // Phase 28.1 W2 — read shared health context. Single-poll guarantee:
  // HealthBanner + this tab BOTH consume from one HealthStatusProvider
  // instance wrapping AppShell, so /api/health is fetched once per cycle.
  const {
    health: aggregateHealth,
    loading: healthLoading,
    error: healthError,
  } = useHealthStatusContext();
  const hasCriticalUnhealthy = !!aggregateHealth && aggregateHealth.summary.critical.unhealthy > 0;

  // Escape key — capture-phase so DevApiStatus closes BEFORE nav-stack pop /
  // detail panel close / search modal close (Plan 12 G6 priority contract).
  // Gated on isOpen so the listener is only active while the modal is visible
  // (T-27.3.1.12-03 mitigation: listener cleanup on unmount or close).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [isOpen, close]);

  // Sites tab can still hide under the user when they toggle off `showSites`,
  // so keep its snap-back. Water + Events are always visible under the
  // Phase 27.4.6 contract — no snap-back needed.
  // Phase 28.2 W5 — fall back to the merged API Health tab key.
  useEffect(() => {
    if (activeTab === 'sites' && !showSitesTab) setTab('apiHealth');
  }, [activeTab, showSitesTab, setTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--z-modal)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Dev API Status"
      data-testid="dev-api-status-modal"
    >
      {/* Backdrop — click to close (T-27.3.1.12-04 mitigation: only backdrop
          clicks close; inner container stops propagation) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        data-testid="dev-api-status-backdrop"
      />

      {/* Modal container */}
      <div
        className="relative flex w-[min(92vw,960px)] max-h-[85vh] flex-col rounded-lg border border-white/10 bg-black/85 font-mono text-[10px] text-white/80 shadow-xl backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
        data-testid="dev-api-status-container"
      >
        {/* Sticky header with tabs */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-black/85 px-4 py-3 backdrop-blur-sm">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-white/50">
            API Status
          </h2>

          <div className="flex items-center gap-1" role="tablist">
            {/* Phase 28.2 W5 D-22/D-27 — merged API Health tab in first
                position. Indicator combines polling-store issue signal
                (formerly Overview) with critical-unhealthy signal (formerly
                All APIs) — both matter on the merged surface. */}
            {showApiHealthTab && (
              <TabButton
                active={activeTab === 'apiHealth'}
                onClick={() => setTab('apiHealth')}
                indicator={hasIssue || hasCriticalUnhealthy ? 'red' : undefined}
                testid="tab-api-health"
              >
                API Health
              </TabButton>
            )}
            {showWaterTab && (
              <TabButton
                active={activeTab === 'water'}
                onClick={() => setTab('water')}
                testid="tab-water"
              >
                Water
              </TabButton>
            )}
            {showSitesTab && (
              <TabButton
                active={activeTab === 'sites'}
                onClick={() => setTab('sites')}
                testid="tab-sites"
              >
                Sites
              </TabButton>
            )}
            {showEventsTab && (
              <TabButton
                active={activeTab === 'events'}
                onClick={() => setTab('events')}
                testid="tab-events"
              >
                Events
              </TabButton>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void copyDiagnostics()}
              className="text-white/40 hover:text-white"
              title="Copy diagnostics JSON"
              data-testid="copy-diagnostics"
            >
              {copyFeedback ? (
                <span className="text-[10px] text-green-400">Copied!</span>
              ) : (
                <CopyIcon />
              )}
            </button>
            <button
              onClick={close}
              className="text-white/40 hover:text-white"
              aria-label="Close dev API status"
              data-testid="dev-api-status-close"
            >
              ×
            </button>
          </div>
        </header>

        {/* Scrollable body — Plan 12 G6 fix: max-h-[85vh] + overflow-y-auto so
            populated byCountry tables + Overpass Health + per-type rejection
            buckets all fit without overflowing the viewport */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === 'apiHealth' && showApiHealthTab && (
            <DevApiStatusAllApisTab
              health={aggregateHealth}
              loading={healthLoading}
              error={healthError}
              rows={rows}
              llmStatus={llmStatus}
              expandedPollingRow={expandedRow}
              setExpandedPollingRow={setExpandedRow}
            />
          )}
          {activeTab === 'water' && showWaterTab && <WaterFiltersSection />}
          {activeTab === 'sites' && showSitesTab && <SitesFiltersSection />}
          {activeTab === 'events' &&
            showEventsTab &&
            // Phase 27.4.6 — V3 is the default body when schemaVersion is
            // unknown (cold start, post-deploy before first cron tick). V2
            // remains the explicit override; the V1 case drops out via the
            // shouldRenderDashboard() outer gate since V1 is no longer a
            // valid runtime pipeline. Prior version-routed switch hid the
            // body entirely when schemaVersion was undefined, leaving the
            // tab button visible with an empty body.
            (llmStatus?.schemaVersion === 'v2' ? (
              <EventsFiltersSection llmStatus={llmStatus} />
            ) : (
              <EventsFiltersSectionV3 llmStatus={llmStatus} />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Phase 28.1 W2 — All APIs Tab ---------- */

const STATUS_PILL_CLASSES: Record<HealthStatus, string> = {
  healthy: 'bg-accent-green/20 text-accent-green',
  degraded: 'bg-accent-yellow/20 text-accent-yellow',
  unhealthy: 'bg-accent-red/20 text-accent-red',
  unknown: 'bg-text-muted/20 text-text-muted',
};

const TIER_BORDER_CLASSES: Record<HealthTier, string> = {
  critical: 'border-accent-red',
  'non-critical': 'border-accent-yellow',
  static: 'border-text-muted',
  'probe-only': 'border-text-muted',
  cron: 'border-accent-blue',
};

const TIER_LABEL: Record<HealthTier, string> = {
  critical: 'CRITICAL',
  'non-critical': 'NON-CRITICAL',
  static: 'STATIC',
  'probe-only': 'PROBE',
  cron: 'CRON',
};

const TIER_GROUP_LABEL: Record<HealthTier, string> = {
  critical: 'Critical',
  'non-critical': 'Non-critical',
  static: 'Static',
  'probe-only': 'Probe-only',
  cron: 'Cron',
};

const STATUS_SORT_ORDER: Record<HealthStatus, number> = {
  unhealthy: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

const TIER_SORT_ORDER: Record<HealthTier, number> = {
  critical: 0,
  'non-critical': 1,
  static: 2,
  'probe-only': 3,
  cron: 4,
};

function freshnessText(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function freshnessCellClass(ep: EndpointHealth): string {
  if (ep.status === 'unhealthy') return 'text-accent-red';
  if (ep.status === 'degraded') return 'text-accent-yellow';
  return 'text-white/50';
}

function DevApiStatusAllApisTab({
  health,
  loading,
  error,
  rows,
  llmStatus,
  expandedPollingRow,
  setExpandedPollingRow,
}: {
  health: HealthResponse | null;
  loading: boolean;
  error: Error | null;
  rows: ApiRow[];
  llmStatus: LLMStatus;
  expandedPollingRow: string | null;
  setExpandedPollingRow: (s: string | null) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Phase 28.2 W5 Task 7 — confirm modal target ('v1' | 'v2' | null).
  // Set non-null when the operator clicks Pin to v1 / Pin to v2; the modal
  // intercepts the POST. Pin to v3 / Clear pin bypass the modal entirely
  // per UI-SPEC §6.1 (no friction for current production / clearing).
  const [confirmTarget, setConfirmTarget] = useState<'v1' | 'v2' | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  // Phase 28.2 W5 Task 7 — 429 quota alert state. Populated by replay
  // helper; cleared when a subsequent /llm-replay returns 200.
  const [quotaAlert, setQuotaAlert] = useState<{ resetsAt: string } | null>(null);

  // Phase 28.2 W5 Task 7 — pipeline-pin POST helper. Issued directly for
  // version 'v3' / null (clear); routed through confirm modal for v1/v2.
  const sendPipelinePin = async (version: 'v1' | 'v2' | 'v3' | null): Promise<void> => {
    setIsPinning(true);
    try {
      await fetch('/api/events/llm-pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...dashboardAuthHeaders(),
        },
        body: JSON.stringify({ version }),
      });
    } catch {
      // Swallow — the operator surfaces failure via the eval-score / DLQ blocks
    } finally {
      setIsPinning(false);
      setConfirmTarget(null);
    }
  };

  // Phase 28.2 W5 Task 7 — replay-quota probe helper. Used as the
  // observable trigger for the 429 alert. Test 28-30 wire fetch spies
  // around this; production callsites issue /llm-replay from elsewhere
  // in the operator-actions block (Task 7.5 + Plan 06 expand).
  const replayProbe = async (): Promise<void> => {
    try {
      const res = await fetch('/api/events/llm-replay/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...dashboardAuthHeaders(),
        },
      });
      if (res.status === 429) {
        const body = (await res.json()) as { resetsAt?: string };
        setQuotaAlert({ resetsAt: body.resetsAt ?? '' });
      } else if (res.ok) {
        setQuotaAlert(null);
      }
    } catch {
      // Network failure — don't update alert state
    }
  };

  // Phase 28.2 W5 Task 7 — Escape handler for the confirm modal. Capture-
  // phase so it wins over the outer DevApiStatus Escape (which closes the
  // whole modal). Active only when confirmTarget is non-null.
  useEffect(() => {
    if (confirmTarget === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirmTarget(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [confirmTarget]);

  // Phase 28.2 W5 D-23 block 2 — per-endpoint quality metrics. Sourced
  // directly from the matching client store rather than threaded as props
  // (DevApiStatusAllApisTab is the single consumer). Renders inside the
  // expanded row above the JSON dump for events / water / flights only;
  // other endpoints render no quality block per UI-SPEC §5.3.2.
  const qualityEvents = useEventStore(
    useShallow((s) => {
      const evts = s.events;
      const llmCount = evts.filter((e) => e.data.llmProcessed).length;
      const rawCount = evts.length - llmCount;
      const exact = evts.filter((e) => e.data.precision === 'exact').length;
      const city = evts.filter((e) => e.data.precision === 'city').length;
      const region = evts.filter((e) => e.data.precision === 'region').length;
      return { llmCount, rawCount, exact, city, region };
    }),
  );
  const qualityWaterStats = useWaterStore((s) => s.filterStats);
  const qualityFlights = useFlightStore(
    useShallow((s) => ({
      total: s.flights.length,
      unidentified: s.flights.filter((f) => f.data.unidentified).length,
    })),
  );

  // Phase 28.2 W5 D-23 block 3 — per-endpoint manual retry button.
  // Audit (Plan 05 Task 5): no store exposes a `fetchNow()` action, so all
  // retries fall through to the cache-bust query-param path
  // `fetch('/api/{endpoint}?_ts=...')`. The store's polling cycle picks up
  // the fresh cache on its next tick. Per CLAUDE.md (D-23) the retry MUST
  // NOT bust LLM cache keys — only polling-store cache keys. The ENDPOINT
  // map below intentionally omits any URL containing `events:llm:v3` or
  // `llm-replay`.
  const ENDPOINT_RETRY_PATH: Record<string, string> = {
    Flights: '/api/flights',
    Ships: '/api/ships',
    Events: '/api/events',
    Sites: '/api/sites',
    News: '/api/news',
    Markets: '/api/markets',
    Weather: '/api/weather',
    Water: '/api/water',
    Precip: '/api/water/precip',
  };
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const handleRefreshNow = (epName: string) => {
    const path = ENDPOINT_RETRY_PATH[epName];
    if (!path) return;
    setRefreshing((prev) => {
      const next = new Set(prev);
      next.add(epName);
      return next;
    });
    const url = `${path}?_ts=${Date.now()}`;
    fetch(url, { headers: { ...dashboardAuthHeaders() } })
      .catch(() => {
        // Swallow — the polling store handles the actual error reporting
      })
      .finally(() => {
        // Minimum visible delay so the operator sees `Refreshing...` state
        setTimeout(() => {
          setRefreshing((prev) => {
            const next = new Set(prev);
            next.delete(epName);
            return next;
          });
        }, 200);
      });
  };

  // Phase 28.2 W5 D-23 block 4 — recent-fetch sparkline. 10-dot strip
  // sourced from the matching store's `recentFetches[]` (every store exposes
  // this — see CLAUDE.md "Phase 4+ Polling"). Renders inline in the per-
  // endpoint row's cell, oldest-left -> newest-right; empty slots render as
  // bg-white/10 placeholder dots. Color sources from CSS-var tokens per
  // UI-SPEC §9.
  const sparklineFlights = useFlightStore((s) => s.recentFetches);
  const sparklineShips = useShipStore((s) => s.recentFetches);
  const sparklineEvents = useEventStore((s) => s.recentFetches);
  const sparklineSites = useSiteStore((s) => s.recentFetches);
  const sparklineNews = useNewsStore((s) => s.recentFetches);
  const sparklineMarkets = useMarketStore((s) => s.recentFetches);
  const sparklineWeather = useWeatherStore((s) => s.recentFetches);
  const sparklineWater = useWaterStore((s) => s.recentFetches);
  const sparklinePrecip = useWaterStore((s) => s.precipRecentFetches);

  const recentFetchesFor = (epName: string): FetchEntry[] => {
    switch (epName) {
      case 'Flights':
        return sparklineFlights;
      case 'Ships':
        return sparklineShips;
      case 'Events':
        return sparklineEvents;
      case 'Sites':
        return sparklineSites;
      case 'News':
        return sparklineNews;
      case 'Markets':
        return sparklineMarkets;
      case 'Weather':
        return sparklineWeather;
      case 'Water':
        return sparklineWater;
      case 'Precip':
        return sparklinePrecip;
      default:
        return [];
    }
  };

  const renderSparkline = (epName: string): JSX.Element => {
    const fetches = recentFetchesFor(epName);
    const last10 = fetches.slice(-10);
    const padding = Math.max(0, 10 - last10.length);
    return (
      <div className="flex gap-1" data-testid={`api-health-sparkline-${epName}`}>
        {Array.from({ length: 10 }, (_, i) => {
          if (i < padding) {
            return <span key={i} className="h-1 w-1 rounded-full bg-white/10" />;
          }
          const fetch = last10[i - padding];
          if (!fetch) {
            return <span key={i} className="h-1 w-1 rounded-full bg-white/10" />;
          }
          const bg = fetch.ok ? 'var(--color-site-healthy)' : 'var(--color-event-airstrike)';
          return <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: bg }} />;
        })}
      </div>
    );
  };

  const renderQualityBlock = (epName: string): JSX.Element | null => {
    if (epName === 'Events') {
      const total = qualityEvents.llmCount + qualityEvents.rawCount;
      const pct = total > 0 ? Math.round((qualityEvents.llmCount / total) * 100) : 0;
      return (
        <div className="text-[9px] text-white/70">
          <div>
            Precision: exact {qualityEvents.exact} / city {qualityEvents.city} / region{' '}
            {qualityEvents.region}
          </div>
          <div>LLM-vs-raw: {pct}%</div>
        </div>
      );
    }
    if (epName === 'Water' && qualityWaterStats) {
      const totalRaw = Object.values(qualityWaterStats.rawCounts).reduce((a, b) => a + b, 0);
      const totalKept = Object.values(qualityWaterStats.filteredCounts).reduce((a, b) => a + b, 0);
      const pct = totalRaw > 0 ? Math.round((totalKept / totalRaw) * 100) : 0;
      return (
        <div className="text-[9px] text-white/70">
          Admission: {totalKept} of {totalRaw} ({pct}%)
        </div>
      );
    }
    if (epName === 'Flights') {
      return (
        <div className="text-[9px] text-white/70">
          Unidentified: {qualityFlights.unidentified} of {qualityFlights.total}
        </div>
      );
    }
    return null;
  };

  // Sorted, tier-grouped row list. Stable across re-renders so the
  // expanded-row anchor doesn't jump as polling cycles update freshness.
  const groupedRows = useMemo(() => {
    if (!health) return [] as Array<{ tier: HealthTier; rows: EndpointHealth[] }>;
    const all = Object.values(health.endpoints);
    all.sort((a, b) => {
      const tierDelta = TIER_SORT_ORDER[a.tier] - TIER_SORT_ORDER[b.tier];
      if (tierDelta !== 0) return tierDelta;
      const statusDelta = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
      if (statusDelta !== 0) return statusDelta;
      // Tertiary: largest freshness first (most stale at top within status)
      const af = a.freshnessMs ?? -1;
      const bf = b.freshnessMs ?? -1;
      return bf - af;
    });
    const groups: Array<{ tier: HealthTier; rows: EndpointHealth[] }> = [];
    let current: { tier: HealthTier; rows: EndpointHealth[] } | null = null;
    for (const row of all) {
      if (!current || current.tier !== row.tier) {
        current = { tier: row.tier, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    }
    return groups;
  }, [health]);

  // Phase 28.2 W5 D-22 nothing-lost contract — header content (tier banner,
  // /api/health table) renders only when `health` is non-null; polling-store
  // rows + LLMPipelineSection + operator-actions ALWAYS render below so
  // operators retain visibility into the local-store + pipeline surfaces
  // even when /api/health is loading / errored / unreachable.
  return (
    <div data-testid="all-apis-tab">
      {/* Phase 28.2 W5 D-23 block 1 — tier-grouped summary banner. Renders
          a single horizontal row with three colored dots (healthy / degraded
          / unhealthy via CSS-var tokens per UI-SPEC §9) followed by the
          per-tier breakdown. Hidden when health is null (loading / error).
          Spacing values are multiples of 4 per UI-SPEC §7 W-1. */}
      {health &&
        (() => {
          const eps = Object.values(health.endpoints);
          const total = eps.length;
          const totalHealthy = eps.filter((e) => e.status === 'healthy').length;
          const totalDegraded = eps.filter((e) => e.status === 'degraded').length;
          const totalUnhealthy = eps.filter((e) => e.status === 'unhealthy').length;
          const sumTier = (rec: {
            healthy: number;
            unhealthy?: number;
            unknown?: number;
            degraded?: number;
          }): number => {
            const h = rec.healthy ?? 0;
            const d = rec.degraded ?? 0;
            const u = rec.unhealthy ?? 0;
            const k = rec.unknown ?? 0;
            return h + d + u + k;
          };
          const criticalTotal = sumTier(health.summary.critical);
          const nonCriticalTotal = sumTier(health.summary.nonCritical);
          const cronTotal = sumTier(health.summary.cron);
          return (
            <div
              className="mb-2 flex items-center gap-3 px-3 py-1 text-[10px]"
              data-testid="tier-summary-banner"
            >
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-site-healthy)' }}
                />
                {totalHealthy} of {total} healthy
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-site-attacked)' }}
                />
                {totalDegraded} degraded
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-event-airstrike)' }}
                />
                {totalUnhealthy} unhealthy
              </span>
              <span className="text-white/40">
                | critical: {health.summary.critical.healthy}/{criticalTotal} · non-critical:{' '}
                {health.summary.nonCritical.healthy}/{nonCriticalTotal} · cron:{' '}
                {health.summary.cron.healthy}/{cronTotal}
              </span>
            </div>
          );
        })()}
      {/* Phase 28.2 W6 D-25 — connectivity audit-result banner placeholder.
          Plan 06 populates the Redis sidecar `audit:connectivity:last-result`
          and the surface here reads it. Empty by design until W6 lands. */}
      <div data-testid="audit-result-banner" />

      {/* /api/health-driven block — renders only when the aggregate response
          is available. The polling-store / LLM / operator sections below
          render unconditionally so the merged tab stays useful while
          /api/health is loading / errored. */}
      {loading && !health && (
        <div className="space-y-2" data-testid="all-apis-loading">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      )}
      {error && !health && (
        <div className="py-6 text-center text-text-muted" data-testid="all-apis-error-no-data">
          /api/health unreachable since page load. Check server logs.
        </div>
      )}
      {!loading && !error && !health && (
        <div className="py-6 text-center text-text-muted" data-testid="all-apis-empty">
          No endpoints configured.
        </div>
      )}
      {error && health && (
        <div
          className="mb-2 border-l-2 border-accent-yellow bg-yellow-950/40 px-3 py-1 text-[10px] text-accent-yellow"
          data-testid="all-apis-stale-banner"
        >
          Last poll failed at {new Date().toUTCString()}. Showing cached values.
        </div>
      )}
      {health && (
        <table className="w-full">
          <thead>
            <tr className="text-white/40">
              <th className="pr-1 text-left font-normal">Endpoint</th>
              <th className="pr-1 text-left font-normal">Tier</th>
              <th className="pr-1 text-left font-normal">Status</th>
              <th className="pr-1 text-right font-normal">Freshness</th>
              <th className="pr-1 text-right font-normal">Latency</th>
              <th className="pr-1 text-left font-normal">Recent</th>
              <th className="text-left font-normal">Last error</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((group) => (
              <React.Fragment key={group.tier}>
                <tr>
                  <td
                    colSpan={7}
                    className="border-t border-white/10 py-1 text-[9px] uppercase tracking-wider text-white/40"
                  >
                    {TIER_GROUP_LABEL[group.tier]}
                  </td>
                </tr>
                {group.rows.map((ep) => {
                  const isExpanded = expandedRow === ep.name;
                  const errorTruncated =
                    ep.lastErrorReason && ep.lastErrorReason.length > 80
                      ? `…${ep.lastErrorReason.slice(-80)}`
                      : (ep.lastErrorReason ?? '');
                  return (
                    <React.Fragment key={ep.name}>
                      <tr
                        className="cursor-pointer hover:bg-white/5"
                        onClick={() => setExpandedRow(isExpanded ? null : ep.name)}
                        data-testid={`all-apis-row-${ep.name}`}
                      >
                        <td className="pr-1">{ep.name}</td>
                        <td className="pr-1">
                          <span
                            className={`rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${TIER_BORDER_CLASSES[ep.tier]}`}
                          >
                            {TIER_LABEL[ep.tier]}
                          </span>
                        </td>
                        <td className="pr-1">
                          <span
                            className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${STATUS_PILL_CLASSES[ep.status]}`}
                          >
                            {ep.status.toUpperCase()}
                          </span>
                        </td>
                        <td
                          className={`pr-1 text-right tabular-nums ${freshnessCellClass(ep)}`}
                          title={ep.lastSuccessTs ? new Date(ep.lastSuccessTs).toISOString() : ''}
                        >
                          {freshnessText(ep.freshnessMs)}
                        </td>
                        <td className="pr-1 text-right tabular-nums text-white/50">
                          {ep.latencyMs === null ? '--' : `${ep.latencyMs}ms`}
                        </td>
                        {/* Phase 28.2 W5 D-23 block 4 — recent-fetch
                            sparkline. Inline 10-dot strip from the matching
                            store's recentFetches[]; oldest-left to newest-
                            right. CSS-var color tokens per UI-SPEC §9. */}
                        <td className="pr-1">{renderSparkline(ep.name)}</td>
                        <td className="truncate text-white/40">{errorTruncated}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={7}
                            className="rounded border border-white/5 bg-white/5 p-1.5"
                            data-testid={`expanded-row-${ep.name}`}
                          >
                            {/* Phase 28.2 W5 D-23 block 2 — per-endpoint
                                quality metrics. Renders ABOVE the JSON dump
                                per UI-SPEC §5.3.2; null for non-quality
                                endpoints (silent — no "no metrics" copy). */}
                            {renderQualityBlock(ep.name)}
                            {/* Phase 28.2 W5 D-23 block 3 — per-endpoint
                                manual retry button. Class spec is verbatim
                                per UI-SPEC §5.3.3; py-1 (4px) per W-1 — NOT
                                the 6px DashboardAuthModal precedent (which
                                violates UI-SPEC §7 multiples-of-4 rule). */}
                            {ENDPOINT_RETRY_PATH[ep.name] && (
                              <div className="mt-1">
                                <button
                                  type="button"
                                  disabled={refreshing.has(ep.name)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefreshNow(ep.name);
                                  }}
                                  className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                                  data-testid={`api-health-retry-${ep.name}`}
                                >
                                  {refreshing.has(ep.name) ? 'Refreshing...' : 'Refresh now'}
                                </button>
                              </div>
                            )}
                            <pre
                              className="whitespace-pre-wrap text-[9px] text-white/60"
                              data-testid={`all-apis-row-expanded-${ep.name}`}
                            >
                              {JSON.stringify(ep, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {/* Phase 28.2 W5 D-22 nothing-lost contract — polling-store rows folded
          in from the deleted Overview tab. Per UI-SPEC §5.2, every Overview
          signal must land somewhere in the merged tab; the polling-store
          metrics (count / avg / success-rate / next-poll countdown / recent
          fetches) live in their own <section> beneath the per-endpoint table
          for clear visual hierarchy. */}
      <section className="mt-3 border-t border-white/10 pt-2" data-testid="polling-store-rows">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Polling Stores
        </span>
        <table className="mt-1 w-full">
          <thead>
            <tr className="text-white/40">
              <th className="pr-1 text-left font-normal">Source</th>
              <th className="pr-1 text-left font-normal">St</th>
              <th className="pr-1 text-right font-normal">Cnt</th>
              <th className="pr-1 text-right font-normal">Avg</th>
              <th className="pr-1 text-right font-normal">Rate</th>
              <th className="pr-1 text-right font-normal">Next</th>
              <th className="pr-1 text-right font-normal">Age</th>
              <th className="text-center font-normal">Err</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const eff = effectiveStatus(r.status, r.count, r.lastFetch);
              const color = statusColor(eff);
              const isExpanded = expandedPollingRow === r.name;
              return (
                <tr
                  key={r.name}
                  className="cursor-pointer hover:bg-white/5"
                  onClick={() => setExpandedPollingRow(isExpanded ? null : r.name)}
                >
                  <td className="pr-1">{r.name}</td>
                  <td className="pr-1 whitespace-nowrap">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />{' '}
                    <span style={{ color }} className="text-[9px]">
                      {statusLabel(eff)}
                    </span>
                  </td>
                  <td className="pr-1 text-right">{r.count}</td>
                  <td className="pr-1 text-right text-white/50">
                    {avgResponseTime(r.recentFetches)}
                  </td>
                  <td className="pr-1 text-right text-white/50">{successRate(r.recentFetches)}</td>
                  <td className="pr-1 text-right text-white/50">
                    {formatCountdown(r.nextPollAt, r.isOneShot, r.status)}
                  </td>
                  <td className="pr-1 text-right">{formatAge(r.lastFetch)}</td>
                  <td className="text-center">
                    {r.lastError ? (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                        title={r.lastError}
                      />
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Expanded polling-row error / quality detail */}
        {expandedPollingRow &&
          (() => {
            const row = rows.find((r) => r.name === expandedPollingRow);
            if (!row) return null;
            return (
              <div className="mt-1 rounded border border-white/5 bg-white/5 p-1.5">
                {row.quality && (
                  <div className="text-[9px] text-white/50">
                    <span className="font-bold text-white/40">Quality:</span> {row.quality}
                  </div>
                )}
                {row.lastError && (
                  <div className="mt-0.5 text-[9px] text-red-400">
                    <span className="font-bold">Error:</span> {row.lastError}
                  </div>
                )}
                {row.note && (
                  <div className="mt-0.5 text-[9px] text-white/40">
                    <span className="font-bold">Note:</span> {row.note}
                  </div>
                )}
              </div>
            );
          })()}
      </section>

      {/* Phase 28.2 W5 D-22 — LLMPipelineSection folded in from Overview.
          Heading text "LLM Pipeline" preserved verbatim per UI-SPEC §5.2. */}
      <section className="mt-2 border-t border-white/10 pt-2" data-testid="llm-pipeline-section">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          LLM Pipeline
        </span>
        <div className="mt-0.5 text-[9px]">
          <LLMPipelineSection llmStatus={llmStatus} />
        </div>
      </section>

      {/* Phase 28.2 W5 Task 7 — Operator Actions block. Plan 05 lands the
          baseline (Pin to v1/v2/v3 + Clear pin + 429 quota alert + replay
          test trigger); Task 7.5 expands with 24h count / per-Bearer
          breakdown / pin TTL countdown / adversarial eval row sourced from
          the new /api/operator-status endpoint. */}
      <section className="mt-4 px-3 py-2 text-xs" data-testid="operator-actions">
        <h3 className="mb-2 text-xs font-semibold text-text-primary">Operator Actions</h3>

        {/* Phase 28.2 W5 Task 7 (UI-SPEC §6.2) — 429 replay-quota alert.
            px-2 py-1 spacing — multiples of 4. Renders ABOVE the Pin
            buttons so the operator sees it before reissuing actions. */}
        {quotaAlert && (
          <div
            className="mb-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-400"
            data-testid="replay-quota-alert"
          >
            Replay quota reached: 50 of 50 in last 24h. Resets at {quotaAlert.resetsAt}. Quota
            protects daily token budget.
          </div>
        )}

        {/* Pin to {v1,v2,v3} + Clear pin buttons. v1/v2 route through the
            confirm modal per UI-SPEC §6.1; v3 + clear bypass it (no
            friction for production / clearing). */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmTarget('v1')}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="pin-pipeline-v1"
          >
            Pin to v1
          </button>
          <button
            type="button"
            onClick={() => setConfirmTarget('v2')}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="pin-pipeline-v2"
          >
            Pin to v2
          </button>
          <button
            type="button"
            onClick={() => void sendPipelinePin('v3')}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="pin-pipeline-v3"
          >
            Pin to v3
          </button>
          <button
            type="button"
            onClick={() => void sendPipelinePin(null)}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="pin-pipeline-clear"
          >
            Clear pin
          </button>
        </div>

        {/* Phase 28.2 W5 Task 7 — replay test trigger. Issues a
            /api/events/llm-replay/test probe so the operator can verify
            the 50/24h quota path. The probe never writes to events:llm:v3
            (Pitfall 6 dual-gate stays absolute — server-side enforcement). */}
        <div className="mt-2">
          <button
            type="button"
            onClick={() => void replayProbe()}
            className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            data-testid="replay-test-trigger"
          >
            Run replay probe
          </button>
        </div>
      </section>

      {/* Phase 28.2 W5 Task 7 — Pin-to-v1/v2 confirm modal (UI-SPEC §6.1).
          Reuses DashboardAuthModal shell pattern (backdrop, card, dual-button
          footer). W-1 spacing pinning: Cancel + destructive buttons use
          py-2 explicitly — NOT the 6px DashboardAuthModal precedent (which
          violates UI-SPEC §7 multiples-of-4 rule). */}
      {confirmTarget !== null && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          data-testid="confirm-pin-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmTarget(null);
          }}
        >
          <div className="w-[360px] rounded-lg border border-border bg-surface-overlay p-5 shadow-xl">
            <h2 className="mb-1 text-sm font-semibold text-text-primary">
              Confirm pipeline version pin
            </h2>
            <p className="mb-3 text-xs text-text-muted">
              Pin LLM pipeline to {confirmTarget} for 7 days.
              <br />
              <br />
              v3 is current production. Pinning to {confirmTarget} disables ongoing v3 enrichment
              until the pin clears or you revert.
              <br />
              <br />
              Continue?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-md px-3 py-2 text-xs text-text-muted hover:bg-white/5"
                data-testid="confirm-pin-cancel"
              >
                Keep v3
              </button>
              <button
                type="button"
                disabled={isPinning}
                onClick={() => void sendPipelinePin(confirmTarget)}
                className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                data-testid="confirm-pin-confirm"
              >
                {isPinning ? 'Pinning...' : `Pin to ${confirmTarget}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dev-only diagnostics for the water facility filter pipeline.
 *
 * Phase 27.3 D-04 baseline: raw vs filtered counts per OSM facility type,
 * rejection reason tallies, enrichment coverage, score histogram.
 *
 * Phase 27.3.1 R-08 expansion (D-28..D-31):
 *   - Provenance header (source + generatedAt relative time)
 *   - Per-country admission table (top 12 countries)
 *   - Per-type rejection breakdown (alongside the summed totals)
 *   - Overpass health attempt rows (mirror, status, duration, ok)
 *
 * Block layout: provenance → raw/kept summary → per-type counts → byCountry →
 * per-type rejections → total rejections → enrichment → overpass health →
 * score histogram.
 */
function WaterFiltersSection() {
  const filterStats = useWaterStore((s) => s.filterStats);

  // Phase 27.3 Plan 05 / UAT Test 6 — truth 21 regression guard. Kept as
  // defensive fallback. Post-R-08 D-30, all response paths attach
  // filterStats (cached, dev-cache, fresh, error-with-cache, error-without-
  // cache), so this branch only fires for a brief moment during the first
  // fetch after page load (before useWaterFetch resolves).
  if (!filterStats) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Water Filters
        </span>
        <div className="mt-0.5 text-[9px] italic text-white/40">loading filter stats…</div>
      </div>
    );
  }

  const totalRaw = Object.values(filterStats.rawCounts).reduce((a, b) => a + b, 0);
  const totalKept = Object.values(filterStats.filteredCounts).reduce((a, b) => a + b, 0);
  const keepPct = totalRaw > 0 ? Math.round((totalKept / totalRaw) * 100) : 0;

  const typeKeys = Array.from(
    new Set([...Object.keys(filterStats.rawCounts), ...Object.keys(filterStats.filteredCounts)]),
  ).sort();

  // Phase 27.3.1 R-08 D-28 — top 12 countries by total admitted facilities.
  // Cap prevents arbitrary render blowup if byCountry ever grows beyond the
  // 29-centroid table (T-27.3.1.03-04 mitigation).
  const byCountrySorted = Object.entries(filterStats.byCountry)
    .sort(
      ([, a], [, b]) =>
        Object.values(b).reduce((s, n) => s + n, 0) - Object.values(a).reduce((s, n) => s + n, 0),
    )
    .slice(0, 12);

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Water Filters
      </span>

      {/* Phase 27.3.1 R-08 D-30 — provenance header */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Source:</span> {filterStats.source} ·{' '}
        <span className="font-bold text-white/40">Generated:</span>{' '}
        {relativeTime(filterStats.generatedAt)}
      </div>

      {/* Raw vs filtered summary */}
      <div className="mt-0.5 text-[9px] text-white/60">
        {totalRaw} raw → {totalKept} kept ({keepPct}%)
      </div>

      {/* Per-type breakdown */}
      <table className="mt-0.5 w-full text-[9px]">
        <tbody>
          {typeKeys.map((type) => (
            <tr key={type}>
              <td className="text-white/40">{type}</td>
              <td className="text-right tabular-nums text-white/60">
                {filterStats.filteredCounts[type] ?? 0} / {filterStats.rawCounts[type] ?? 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phase 27.3.1 R-08 D-28 — per-country admission table */}
      {byCountrySorted.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            By Country
          </div>
          <table className="mt-0.5 w-full text-[9px]">
            <tbody>
              {byCountrySorted.map(([country, perType]) => (
                <tr key={country}>
                  <td className="text-white/40">{country}</td>
                  <td className="text-right tabular-nums text-white/60">
                    {Object.entries(perType)
                      .map(([t, n]) => `${t}=${n}`)
                      .join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Phase 27.3.1 R-08 D-31 — per-type rejection breakdown
          Phase 27.3.1 Plan 10 (G2) — added `turkey=` bucket display. */}
      {Object.keys(filterStats.byTypeRejections).length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            Rejections by Type
          </div>
          {Object.entries(filterStats.byTypeRejections).map(([type, buckets]) => (
            <div key={type} className="text-[9px] text-white/60">
              <span className="text-white/40">{type}:</span> excl={buckets.excluded_location}{' '}
              turkey={buckets.excluded_turkey} nn={buckets.not_notable} nname={buckets.no_name}{' '}
              nores={buckets.no_resolved_name} dup=
              {buckets.duplicate} low={buckets.low_score} nocity={buckets.no_city}
            </div>
          ))}
        </>
      )}

      {/* Total rejections (back-compat + quick-scan view).
          Phase 27.3.1 Plan 10 (G2) — added `turkey=` summed bucket. */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Total rejections:</span> excl=
        {filterStats.rejections.excluded_location} turkey={filterStats.rejections.excluded_turkey}{' '}
        nn={filterStats.rejections.not_notable} nname={filterStats.rejections.no_name} nores=
        {filterStats.rejections.no_resolved_name} dup=
        {filterStats.rejections.duplicate} low={filterStats.rejections.low_score} nocity=
        {filterStats.rejections.no_city}
      </div>

      {/* Enrichment coverage */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Enriched:</span> cap=
        {filterStats.enrichment.withCapacity} city={filterStats.enrichment.withCity} river=
        {filterStats.enrichment.withRiver}
      </div>

      {/* Phase 27.3.1 R-08 D-29 — Overpass health rows */}
      {filterStats.overpass.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            Overpass Health
          </div>
          {filterStats.overpass.map((rec, i) => (
            <div key={i} className={`text-[9px] ${rec.ok ? 'text-white/60' : 'text-red-400'}`}>
              {rec.facilityType} · {rec.mirror} · status={rec.status} · {rec.durationMs}ms ·
              attempts={rec.attempts} {rec.ok ? 'OK' : 'FAIL'}
            </div>
          ))}
        </>
      )}

      {/* Score histogram */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Scores:</span>{' '}
        {filterStats.scoreHistogram.map((b) => `${b.bucket}:${b.count}`).join(' ')}
      </div>
    </div>
  );
}

/**
 * Phase 27.3.1 R-05 D-19 — Dev-only diagnostics for the sites pipeline.
 *
 * Mirrors WaterFiltersSection layout: provenance header (source +
 * generatedAt), raw/kept summary, per-type counts, per-country top-12 table,
 * rejection bucket row, Overpass health rows. Null-renders a placeholder
 * when filterStats is absent (cached or pre-fetch state — matches water
 * truth-21 regression guard pattern).
 *
 * Intentional asymmetries vs WaterFiltersSection (see Plan 07 SUMMARY
 * §"R-05 Observability Asymmetry"):
 *   - 4 rejection buckets (excluded_turkey / no_coords / no_type / duplicate)
 *     vs water's 6 — sites adapter is simpler (single Overpass query, no
 *     compound admission gate, no scoring, no nearestCity requirement).
 *     Do NOT invent placeholder buckets (no_name / not_notable / low_score /
 *     no_city) — they would always be zero and are misleading.
 *   - No per-type rejection split (sites has one combined query across all 5
 *     types; water has per-type queries with per-type rejection tallies).
 *
 * Per-country table is capped at top-12 (same T-27.3.1.03-04 DoS mitigation
 * as water — `.slice(0, 12)`).
 */
function SitesFiltersSection() {
  const filterStats = useSiteStore((s) => s.filterStats);

  if (!filterStats) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Sites Filters
        </span>
        <div className="mt-0.5 text-[9px] italic text-white/40">loading filter stats…</div>
      </div>
    );
  }

  const keepPct =
    filterStats.rawCount > 0
      ? Math.round((filterStats.filteredCount / filterStats.rawCount) * 100)
      : 0;

  // Per-type entries sorted by count desc for at-a-glance scannability
  const typeEntries = Object.entries(filterStats.byType).sort(([, a], [, b]) => b - a);

  // Top 12 countries by total admitted sites (DoS cap matches water D-28)
  const byCountrySorted = Object.entries(filterStats.byCountry)
    .sort(
      ([, a], [, b]) =>
        Object.values(b).reduce((s, n) => s + n, 0) - Object.values(a).reduce((s, n) => s + n, 0),
    )
    .slice(0, 12);

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Sites Filters
      </span>

      {/* Phase 27.3.1 R-05 D-30 parity — provenance header */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Source:</span> {filterStats.source} ·{' '}
        <span className="font-bold text-white/40">Generated:</span>{' '}
        {relativeTime(filterStats.generatedAt)}
      </div>

      {/* Raw vs filtered summary */}
      <div className="mt-0.5 text-[9px] text-white/60">
        {filterStats.rawCount} raw → {filterStats.filteredCount} kept ({keepPct}%)
      </div>

      {/* Per-type breakdown */}
      {typeEntries.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            By Type
          </div>
          <table className="mt-0.5 w-full text-[9px]">
            <tbody>
              {typeEntries.map(([type, count]) => (
                <tr key={type}>
                  <td className="text-white/40">{type}</td>
                  <td className="text-right tabular-nums text-white/60">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Phase 27.3.1 R-05 D-28 parity — per-country admission table */}
      {byCountrySorted.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            By Country
          </div>
          <table className="mt-0.5 w-full text-[9px]">
            <tbody>
              {byCountrySorted.map(([country, perType]) => (
                <tr key={country}>
                  <td className="text-white/40">{country}</td>
                  <td className="text-right tabular-nums text-white/60">
                    {Object.entries(perType)
                      .map(([t, n]) => `${t}=${n}`)
                      .join(' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Rejections — 4 buckets only (sites adapter register; see JSDoc above) */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-bold text-white/40">Rejections:</span> turkey=
        {filterStats.rejections.excluded_turkey} nocoords=
        {filterStats.rejections.no_coords} notype={filterStats.rejections.no_type} dup=
        {filterStats.rejections.duplicate}
      </div>

      {/* Phase 27.3.1 R-05 D-29 parity — Overpass health rows */}
      {filterStats.overpass.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">
            Overpass Health
          </div>
          {filterStats.overpass.map((rec, i) => (
            <div key={i} className={`text-[9px] ${rec.ok ? 'text-white/60' : 'text-red-400'}`}>
              {rec.facilityType} · {rec.mirror} · status={rec.status} · {rec.durationMs}ms ·
              attempts={rec.attempts} {rec.ok ? 'OK' : 'FAIL'}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- Events (Phase 27.4 Plan 09) ---------- */

/**
 * Phase 27.4 Plan 09 — per-provenance color swatch mapping. The six
 * provenance tags are color-coded so ops can spot which resolver path
 * served each event at a glance: green = own snapshot, blue = Overpass
 * POI, cyan = direct Nominatim, purple = verified two-pass, amber =
 * GDELT ActionGeo fallback, orange = Bellingcat passthrough.
 */
const PROVENANCE_COLORS: Record<string, string> = {
  'own-site-snapshot': 'text-green-400',
  'poi-amenity-nominatim': 'text-blue-400',
  'nominatim-direct': 'text-cyan-400',
  'nominatim-verified-2pass': 'text-purple-400',
  'gdelt-actiongeo-fallback': 'text-amber-400',
  'bellingcat-coord-passthrough': 'text-orange-400',
};

// Phase 27.4.3 D-12: per-provider semantic colors for v3 routing-trace + latency + headroom blocks.
const PROVIDER_COLORS: Record<'nvidia_nim' | 'openrouter', string> = {
  nvidia_nim: 'text-green-400',
  openrouter: 'text-blue-400',
};

/**
 * Phase 27.4 Plan 09 D-16 — pipeline waterfall. Four rows (Grouping →
 * LLM → Geocoding → Done) with completed/total counters and a ProgressBar
 * per row. Mirrors the StageIndicator but adds completion percentages
 * so ops can see how far each stage got when the pipeline is mid-flight.
 */
function WaterfallBlock({ llmStatus }: { llmStatus: LLMStatus }) {
  const stages = [
    {
      key: 'grouping',
      label: 'Grouping',
      completed: llmStatus.totalGroups ?? 0,
      total: llmStatus.totalGroups ?? 0,
    },
    {
      key: 'llm-processing',
      label: 'LLM',
      completed: llmStatus.completedBatches ?? 0,
      total: llmStatus.totalBatches ?? 0,
    },
    {
      key: 'geocoding',
      label: 'Geocoding',
      completed: llmStatus.completedGeocodes ?? 0,
      total: llmStatus.totalGeocodes ?? 0,
    },
    {
      key: 'done',
      label: 'Done',
      completed: llmStatus.enrichedCount ?? 0,
      total: llmStatus.enrichedCount ?? 0,
    },
  ];
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Pipeline Waterfall
      </div>
      {stages.map((s) => (
        <div key={s.key} className="mt-1">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-white/60">{s.label}</span>
            <span className="text-white/40 tabular-nums">
              {s.completed}/{s.total}
            </span>
          </div>
          <ProgressBar completed={s.completed} total={s.total || 1} />
        </div>
      ))}
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-17 — provenance distribution + LLM call success
 * rate. Each provenance tag is rendered as a ProgressBar over the
 * aggregate total; success rate is the okCount / callHistory length
 * ratio (non-ok calls counted against the denominator).
 */
function HistogramsBlock({
  provenanceCounts,
  callHistory,
}: {
  provenanceCounts: Record<string, number>;
  callHistory: NonNullable<LLMStatus['callHistory']>;
}) {
  const provEntries = Object.entries(provenanceCounts).sort((a, b) => b[1] - a[1]);
  const totalProv = provEntries.reduce((s, [, n]) => s + n, 0);
  const okCount = callHistory.filter((c) => c.ok).length;
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Provenance Distribution
      </div>
      {provEntries.length === 0 ? (
        <div className="text-[9px] text-white/40">no data</div>
      ) : (
        provEntries.map(([key, n]) => (
          <div key={key} className="mt-0.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className={PROVENANCE_COLORS[key] ?? 'text-white/60'}>{key}</span>
              <span className="text-white/40 tabular-nums">
                {n} / {totalProv}
              </span>
            </div>
            <ProgressBar completed={n} total={totalProv || 1} />
          </div>
        ))
      )}
      <div className="mt-2 text-[9px] text-white/60">
        LLM Call Success:{' '}
        <span className="text-white/80 tabular-nums">
          {okCount}/{callHistory.length}
        </span>
      </div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 B4 — per-event drill-down row. Summary line shows
 * city / admin1 / country, precision, confidence, and weapon/target.
 * Expanded view reveals full location hierarchy, reasoning, per-event
 * tokens, provenance (color-coded), and clickable source links.
 *
 * The Copy prompt+response JSON button POSTs to /api/events/llm-replay/
 * :groupKey (dev-only endpoint wired in Plan 08) and writes the returned
 * {old, new} JSON to the clipboard; success renders "Copied!" for 2s.
 */
function DrillDownRow({ ev }: { ev: RecentEnrichedEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  async function copyPromptResponse() {
    try {
      // Phase 27.4.4 Plan 02 — replay route is Bearer-auth gated in prod.
      // dashboardAuthHeaders() supplies the Authorization header from
      // localStorage; in dev the server middleware bypasses and absent
      // headers are fine.
      const res = await fetch(`/api/events/llm-replay/${encodeURIComponent(ev.groupKey)}`, {
        method: 'POST',
        headers: dashboardAuthHeaders(),
      });
      const text = res.ok ? await res.text() : JSON.stringify({ error: res.statusText });
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copied!');
    } catch {
      setCopyFeedback('Unavailable');
    }
    setTimeout(() => setCopyFeedback(null), 2000);
  }

  const summaryLabel =
    ev.location.city ??
    ev.location.admin1 ??
    ev.location.country ??
    ev.location.landmark ??
    'unknown';
  const weaponTarget = `${ev.weaponType ?? '—'}/${ev.targetType ?? '—'}`;

  return (
    <div className="mt-1 border-t border-white/5 pt-1">
      <button
        className="flex w-full items-center gap-1 text-left text-[9px] text-white/60 hover:text-white/80"
        onClick={() => setExpanded((v) => !v)}
        data-testid="drill-down-row-toggle"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span className="truncate">{summaryLabel}</span>
        <span className="text-white/40">· precision={ev.precision}</span>
        <span className="text-white/40">· conf={ev.confidence.toFixed(2)}</span>
        <span className="text-white/40">· {weaponTarget}</span>
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 text-[9px] text-white/60">
          <div>
            country: <span className="text-white/80">{ev.location.country ?? '—'}</span>
            {' · '}admin1: <span className="text-white/80">{ev.location.admin1 ?? '—'}</span>
            {' · '}city: <span className="text-white/80">{ev.location.city ?? '—'}</span>
            {' · '}neighborhood:{' '}
            <span className="text-white/80">{ev.location.neighborhood ?? '—'}</span>
            {' · '}landmark: <span className="text-white/80">{ev.location.landmark ?? '—'}</span>
          </div>
          {ev.reasoning && <div className="italic text-white/50">reasoning: {ev.reasoning}</div>}
          <div>
            tokensIn: <span className="text-white/80">{ev.tokensIn ?? '—'}</span>
            {' · '}tokensOut: <span className="text-white/80">{ev.tokensOut ?? '—'}</span>
            {' · '}provenance:{' '}
            <span className={PROVENANCE_COLORS[ev.provenance] ?? 'text-white/80'}>
              {ev.provenance}
            </span>
          </div>
          {ev.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span>sources:</span>
              {ev.sources.slice(0, 5).map((u, i) => (
                <a
                  key={u + i}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  [{i + 1}]
                </a>
              ))}
            </div>
          )}
          {/* Phase 27.4.3 D-13 Lineage extension — reasoning trace + lineage hash chip.
              Optional fields; v1/v2 cached events lack them so chips simply don't render
              (intended graceful degradation across pipeline versions, not a hand-wave). */}
          {ev.reasoningTrace ? (
            <div className="mt-1">
              <div className="text-[9px] uppercase tracking-wider text-white/40">
                Reasoning trace
              </div>
              <pre className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[9px] italic text-white/40">
                {ev.reasoningTrace}
              </pre>
            </div>
          ) : null}
          {ev.lineageHash ? (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-white/40">Lineage</span>
              <span className="font-mono text-[9px] text-cyan-400" title={ev.lineageHash}>
                hash: {ev.lineageHash.slice(0, 8)}…
              </span>
            </div>
          ) : null}
          <button
            className="text-white/60 hover:text-white/80"
            onClick={copyPromptResponse}
            data-testid="drill-down-copy"
          >
            {copyFeedback ?? 'Copy prompt+response JSON'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-18 — drill-down wrapper. Collapsed by default to
 * avoid rendering 50 rows eagerly when ops is only glancing at the
 * overview blocks above. Click the heading to expand; empty list shows
 * the zero-state message.
 */
function DrillDownBlock({ llmStatus }: { llmStatus: LLMStatus }) {
  const events = llmStatus.recentEvents ?? [];
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2">
      <button
        className="text-[9px] font-bold uppercase tracking-wider text-white/40 hover:text-white/80"
        onClick={() => setExpanded((v) => !v)}
        data-testid="drill-down-expand"
      >
        Drill-down ({events.length} events) {expanded ? '▾' : '▸'}
      </button>
      {expanded && events.length === 0 && (
        <div className="mt-1 text-[9px] text-white/40">No recent enriched events.</div>
      )}
      {expanded &&
        events.map((ev) => <DrillDownRow key={`${ev.groupKey}-${ev.fetchedAt}`} ev={ev} />)}
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-19 — last N LLM calls. Each row shows the
 * provider, total tokens (in+out), wall duration, batch size, and
 * relative timestamp. Green dot = ok, red dot = non-ok (retry or dead
 * letter). Capped via max-h-32 overflow-y-auto.
 */
function CallLogBlock({ callHistory }: { callHistory: NonNullable<LLMStatus['callHistory']> }) {
  if (callHistory.length === 0) {
    return (
      <div className="mt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          LLM Call Log (0)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No LLM calls yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        LLM Call Log (last {callHistory.length})
      </div>
      <div className="mt-1 max-h-32 overflow-y-auto">
        {callHistory.map((c, i) => (
          <div
            key={`${c.timestamp}-${i}`}
            className="flex items-center justify-between gap-1 text-[9px]"
          >
            <span
              className={c.skipReason ? 'text-amber-400' : c.ok ? 'text-green-400' : 'text-red-400'}
            >
              {c.skipReason ? '⊘' : '●'}
            </span>
            <span className="text-white/60">{c.provider}</span>
            {c.skipReason ? (
              <span className="rounded bg-amber-500/20 px-1 text-amber-300">
                skip:{c.skipReason}
              </span>
            ) : (
              <>
                <span className="text-white/40 tabular-nums">{c.tokensIn + c.tokensOut}t</span>
                <span className="text-white/40 tabular-nums">{c.durationMs}ms</span>
              </>
            )}
            <span className="text-white/40">bs{c.batchSize}</span>
            <span className="ml-auto text-white/30 tabular-nums">
              {relativeTime(new Date(c.timestamp).toISOString())}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-36 — per-provider daily token budget. Bars scale
 * against DAILY_LIMITS (cerebras 1M, groq 200k) which mirror the
 * server-side budget enforced in llmTokenBudget.ts. ⏸ glyph appears
 * next to the provider name when the circuit breaker is paused.
 */
function BudgetBarsBlock({
  tokenCounters,
  breakerState,
}: {
  tokenCounters: { cerebras: number; groq: number };
  breakerState: { cerebras: 'ok' | 'paused'; groq: 'ok' | 'paused' };
}) {
  const CEREBRAS_MAX = 1_000_000;
  const GROQ_MAX = 200_000;
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Token Budget (daily)
      </div>
      <div className="mt-1 text-[9px]">
        <div className="flex items-center justify-between">
          <span className="text-white/60">
            Cerebras {breakerState.cerebras === 'paused' ? '⏸' : ''}
          </span>
          <span className="text-white/40 tabular-nums">
            {tokenCounters.cerebras.toLocaleString()}/{CEREBRAS_MAX.toLocaleString()} (
            {Math.round((tokenCounters.cerebras / CEREBRAS_MAX) * 100)}%)
          </span>
        </div>
        <ProgressBar completed={tokenCounters.cerebras} total={CEREBRAS_MAX} />
      </div>
      <div className="mt-1 text-[9px]">
        <div className="flex items-center justify-between">
          <span className="text-white/60">Groq {breakerState.groq === 'paused' ? '⏸' : ''}</span>
          <span className="text-white/40 tabular-nums">
            {tokenCounters.groq.toLocaleString()}/{GROQ_MAX.toLocaleString()} (
            {Math.round((tokenCounters.groq / GROQ_MAX) * 100)}%)
          </span>
        </div>
        <ProgressBar completed={tokenCounters.groq} total={GROQ_MAX} />
      </div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-20 — accuracy eval summary. Three concentric
 * accuracy tiers (5km / 20km / 100km) against a ground-truth set. The
 * D-25 gate (≥80% @ 20km) decides whether pipelineV2 can flip to prod;
 * PASS/FAIL is visualized next to the 20km counter.
 */
function EvalScoreBlock({ evalScore }: { evalScore: LLMStatus['evalScore'] }) {
  if (!evalScore || evalScore.total === 0) {
    return <div className="mt-2 text-[9px] text-white/40">Eval: no ground-truth loaded</div>;
  }
  const pct20 = Math.round((evalScore.within20km / evalScore.total) * 100);
  const gatePass = pct20 >= 80;
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Accuracy Eval (ground-truth {evalScore.total})
      </div>
      <div className="mt-0.5 text-[9px] text-white/60">
        5km:{' '}
        <span className="text-white/80 tabular-nums">
          {evalScore.within5km}/{evalScore.total}
        </span>
        {' · '}20km:{' '}
        <span className={gatePass ? 'text-green-400' : 'text-red-400'}>
          {evalScore.within20km}/{evalScore.total} ({pct20}%)
        </span>
        {' · '}100km:{' '}
        <span className="text-white/80 tabular-nums">
          {evalScore.within100km}/{evalScore.total}
        </span>
      </div>
      <div className="mt-0.5 text-[9px]">
        D-25 gate (≥80% @20km):{' '}
        {gatePass ? (
          <span className="text-green-400">PASS</span>
        ) : (
          <span className="text-red-400">FAIL</span>
        )}
      </div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-30 — dead-letter queue recent entries. Capped to
 * the first 10 (from the server-side limit of 50) so the block stays
 * scannable; `DLQ: 0 entries` when empty. Each row shows reason (ZOD
 * fail / LLM null / retry exhausted), truncated group id, and relative
 * timestamp.
 */
function DlqBlock({ entries }: { entries: NonNullable<LLMStatus['dlqRecent']> }) {
  if (entries.length === 0) {
    return <div className="mt-2 text-[9px] text-white/40">DLQ: 0 entries</div>;
  }
  return (
    <div className="mt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-red-400">
        DLQ ({entries.length})
      </div>
      <div className="mt-1 max-h-20 overflow-y-auto">
        {entries.slice(0, 10).map((e) => (
          <div
            key={e.id + e.timestamp}
            className="flex items-center gap-1 text-[9px] text-white/60"
          >
            <span className="text-red-400">●</span>{' '}
            <span className="text-white/80">{e.reason}</span>
            {' · '}
            <span className="truncate">{e.id.slice(0, 32)}</span>
            <span className="ml-auto tabular-nums text-white/30">
              {relativeTime(new Date(e.timestamp).toISOString())}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 D-23 — suspect event count. "Suspect" means the
 * resolver flagged the event as potentially wrong (e.g., country
 * mismatch, neighborhood precision without landmark, etc.). Amber when
 * non-zero so the number pops.
 */
function SuspectBlock({ count }: { count: number }) {
  return (
    <div className="mt-2 text-[9px]">
      <span className="font-bold uppercase tracking-wider text-white/40">Suspect events: </span>
      <span className={count > 0 ? 'tabular-nums text-amber-400' : 'tabular-nums text-white/60'}>
        {count}
      </span>
    </div>
  );
}

/* ========================================================================
 * Phase 27.4.3 Plan 04 — v3 observability blocks (D-12 / D-13 / D-14 / D-15
 * / D-19). All blocks below are gated upstream by `EventsFiltersSectionV3`
 * which renders only when llmStatus.schemaVersion === 'v3' && import.meta.env.DEV.
 * Each block defends against missing data with verbatim UI-SPEC empty-state
 * copy so the v3 surface is render-safe even on first poll / cold cache.
 * ======================================================================== */

/**
 * Phase 27.4.3 D-12 §1 — Routing Trace block. Analog: CallLogBlock.
 * One row per routing decision (last 50 from server-side ring buffer).
 * Each row shows time, batch index, provider/model, and routing reason
 * with green chip on `primary`, amber chip on cascade fall-through.
 */
function RoutingTraceBlock({ trace }: { trace?: LLMStatus['routingTrace'] }) {
  const rows = trace ?? [];
  if (rows.length === 0) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Routing Trace (last 50)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No routing decisions yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Routing Trace (last 50)
      </div>
      <div className="mt-1 max-h-32 overflow-y-auto">
        {rows.slice(0, 50).map((r) => {
          const ts = new Date(r.ts);
          const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`;
          const isPrimary = r.reason === 'primary';
          const reasonClass = isPrimary
            ? 'bg-green-500/20 text-green-300 px-1 rounded'
            : 'bg-amber-500/20 text-amber-300 px-1 rounded';
          return (
            <div
              key={`${r.ts}-${r.batch}`}
              className="flex items-center gap-1 text-[9px] text-white/60 tabular-nums"
            >
              <span className="text-white/40">[{time}]</span>
              <span>batch={r.batch}</span>
              <span>→</span>
              <span className={PROVIDER_COLORS[r.provider]}>
                {r.provider}/{r.model}
              </span>
              <span className={reasonClass}>{r.reason}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phase 27.4.3 D-12 §2 — Latency histogram block. Analog: BudgetBarsBlock.
 * Per-provider P50/P95/P99 line + sparkline of recent latency samples.
 * Amber warning chip when P99 exceeds the 60s soft watchdog warn threshold.
 */
function LatencyHistogramBlock({ latency }: { latency?: LLMStatus['latency'] }) {
  const providers = latency ? (Object.keys(latency) as Array<'nvidia_nim' | 'openrouter'>) : [];
  const empty =
    providers.length === 0 ||
    providers.every((p) => {
      const s = latency?.[p];
      return !s || s.sparkline.length === 0;
    });
  if (empty) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Latency (P50/P95/P99)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No LLM calls yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Latency (P50/P95/P99)
      </div>
      {providers.map((p) => {
        const stats = latency?.[p];
        if (!stats) return null;
        const overWatchdog = stats.p99 > 60_000;
        return (
          <div key={p} className="mt-1">
            <div
              className={`flex items-center justify-between gap-1 text-[9px] tabular-nums ${PROVIDER_COLORS[p]}`}
            >
              <span>
                {p}: P50 {stats.p50}ms · P95 {stats.p95}ms · P99 {stats.p99}ms
              </span>
              {overWatchdog ? (
                <span className="text-amber-400">⚠ over watchdog warn (60s)</span>
              ) : null}
            </div>
            <Sparkline points={stats.sparkline} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 27.4.3 D-12 §2 — sparkline helper. Inline SVG polyline; min 2 points.
 * Caller decides container height; this scales 0..max → full height.
 */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const xStep = 100 / (points.length - 1);
  const path = points.map((y, i) => `${i * xStep},${100 - (y / max) * 100}`).join(' ');
  return (
    <svg className="h-4 w-full text-blue-400" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * Phase 27.4.3 D-12 §3 — Rate-limit headroom block. Analog: BudgetBarsBlock.
 * Per-provider used/cap progress bar with green/amber/red color rules:
 *   ratio ≥ 0.95 → red bar + "Capped — falling through" badge
 *   ratio ≥ 0.80 → amber bar + "≥80% — fall-through likely" badge
 *   else         → green bar (no badge)
 */
function RateLimitHeadroomBlock({ rateLimit }: { rateLimit?: LLMStatus['rateLimit'] }) {
  const providers = rateLimit ? (Object.keys(rateLimit) as Array<'nvidia_nim' | 'openrouter'>) : [];
  if (providers.length === 0) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Rate-Limit Headroom
        </div>
        <div className="mt-1 text-[9px] text-white/40">No requests this window.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Rate-Limit Headroom
      </div>
      {providers.map((p) => {
        const r = rateLimit?.[p];
        if (!r) return null;
        const ratio = r.cap > 0 ? r.used / r.cap : 0;
        const barColor = ratio >= 0.95 ? '#f87171' : ratio >= 0.8 ? '#fbbf24' : '#34d399';
        // W-4 fix: 27.4.1 D-15 local-bind pattern (avoid Object.values()[0] under noUncheckedIndexedAccess)
        const firstModel = r.perModel ? Object.entries(r.perModel)[0] : undefined;
        const firstModelName = firstModel?.[0] ?? 'kimi-k2.5';
        const firstModelUsed = firstModel?.[1]?.used ?? 0;
        const labelText =
          p === 'nvidia_nim'
            ? `NVIDIA NIM: ${r.used}/${r.cap} req/min · ${firstModelUsed} req today`
            : `OpenRouter: ${r.used}/${r.cap} req on ${firstModelName}`;
        const badge =
          ratio >= 0.95 ? (
            <span className="text-red-400">Capped — falling through</span>
          ) : ratio >= 0.8 ? (
            <span className="text-amber-400">≥80% — fall-through likely</span>
          ) : null;
        return (
          <div key={p} className="mt-1">
            <div className="flex items-center justify-between gap-1 text-[9px] tabular-nums text-white/80">
              <span>{labelText}</span>
              {badge}
            </div>
            <ProgressBar completed={r.used} total={r.cap} barColor={barColor} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 27.4.3 D-12 §4 — Schema-strict failure block. Analog: HistogramsBlock.
 * Per-provider {total, malformedJson, missingField, typeMismatch} counters.
 * Renders only providers with non-zero failure counts; zero-state empty
 * line otherwise (no per-provider noise when v3 is healthy).
 */
function SchemaStrictFailureBlock({
  schemaFailures,
  callHistory,
}: {
  schemaFailures?: LLMStatus['schemaFailures'];
  callHistory?: LLMStatus['callHistory'];
}) {
  const sf = schemaFailures;
  const providers = sf ? (Object.keys(sf) as Array<'nvidia_nim' | 'openrouter'>) : [];
  const totalAcrossAll = providers.reduce((acc, p) => acc + (sf?.[p]?.total ?? 0), 0);
  if (totalAcrossAll === 0) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Schema-Strict Failure Rate
        </div>
        <div className="mt-1 text-[9px] text-white/40">No schema rejections.</div>
      </div>
    );
  }
  const totalCalls = (callHistory ?? []).length;
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Schema-Strict Failure Rate
      </div>
      {providers.map((p) => {
        const f = sf?.[p];
        if (!f || f.total === 0) return null;
        const pct = totalCalls > 0 ? ((f.total / totalCalls) * 100).toFixed(1) : '—';
        return (
          <div key={p} className={`mt-1 text-[9px] tabular-nums ${PROVIDER_COLORS[p]}`}>
            {p}: {f.total} of {totalCalls} ({pct}%) — malformed_json={f.malformedJson} ·
            missing_field={f.missingField} · type_mismatch={f.typeMismatch}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 27.4.3 D-14 — Error Taxonomy block. Analog: HistogramsBlock.
 * Per-provider 7-bucket counters (rate_limit / timeout / malformed_json /
 * schema_fail / network / upstream_500 / other) flowed from
 * freeClaudeRouter B-1 instrumentation. Empty-state when zero across all
 * providers + all buckets.
 */
function ErrorTaxonomyBlock({ taxonomy }: { taxonomy?: LLMStatus['errorTaxonomy'] }) {
  const t = taxonomy;
  const providers = t ? (Object.keys(t) as Array<'nvidia_nim' | 'openrouter'>) : [];
  const totalAcrossAll = providers.reduce(
    (acc, p) => acc + Object.values(t?.[p] ?? {}).reduce((a, b) => a + b, 0),
    0,
  );
  if (totalAcrossAll === 0) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Error Taxonomy (today UTC)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No errors today.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Error Taxonomy (today UTC)
      </div>
      {providers.map((p) => {
        const buckets = t?.[p];
        if (!buckets) return null;
        const cells = Object.entries(buckets).map(([k, n]) => {
          const cls = n > 0 ? 'text-white/80' : 'text-white/30';
          return (
            <span key={k} className={`${cls} tabular-nums`}>
              {k}={n}
            </span>
          );
        });
        return (
          <div
            key={p}
            className={`mt-1 flex flex-wrap items-center gap-1 text-[9px] ${PROVIDER_COLORS[p]}`}
          >
            <span>{p}:</span>
            {cells.flatMap((c, i) =>
              i > 0
                ? [
                    <span key={`s${i}`} className="text-white/30">
                      ·
                    </span>,
                    c,
                  ]
                : [c],
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 27.4.3 D-15 — Pipeline Flips block. Analog: CallLogBlock + DlqBlock.
 * Each entry shows ISO timestamp, from→to version, trigger, operator,
 * optional reason. Auto-flip triggers (auto:eval_drop, auto:watchdog_recurrence)
 * are color-coded amber/red so on-call eyes are drawn to them.
 */
function PipelineFlipsBlock({ flips }: { flips?: LLMStatus['pipelineFlips'] }) {
  const rows = flips ?? [];
  if (rows.length === 0) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          Pipeline Flips (last 200)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No flips recorded.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Pipeline Flips (last 200)
      </div>
      <div className="mt-1 max-h-32 overflow-y-auto">
        {rows.slice(0, 50).map((f) => {
          const iso = new Date(f.ts).toISOString();
          const triggerClass =
            f.trigger === 'auto:eval_drop'
              ? 'text-amber-400'
              : f.trigger === 'auto:watchdog_recurrence'
                ? 'text-red-400'
                : 'text-white/60';
          return (
            <div key={`${f.ts}-${f.from}-${f.to}`} className="text-[9px]">
              <div className={`flex items-center gap-1 tabular-nums ${triggerClass}`}>
                <span>[{iso}]</span>
                <span>
                  {f.from} → {f.to}
                </span>
                <span>·</span>
                <span>{f.trigger}</span>
                <span>·</span>
                <span>{f.operator}</span>
              </div>
              {f.reason ? <div className="text-[9px] italic text-white/50">{f.reason}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phase 27.4.3 D-19 — Cost Shadow block. Analog: EvalScoreBlock.
 * Shows what the v3 run would cost at Anthropic Sonnet rates if the
 * pipeline were on the paid path; tagline reaffirms that free-claude-code
 * routing avoided that spend. Three counters on one line.
 */
function CostShadowBlock({ cost }: { cost?: LLMStatus['costShadow'] }) {
  const c = cost;
  if (!c || (c.tokensIn === 0 && c.tokensOut === 0)) {
    return (
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          v3 Cost Shadow (last 24h)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No tokens billed this window.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        v3 Cost Shadow (last 24h)
      </div>
      <div className="mt-1 text-[9px] tabular-nums text-white/80">
        Tokens in: ~{c.tokensIn.toLocaleString()} · Tokens out: ~{c.tokensOut.toLocaleString()} ·
        Shadow cost: ${c.usd.toFixed(3)}
      </div>
      <div className="text-[9px] italic text-green-400">↳ saved by free-claude-code routing</div>
    </div>
  );
}

/**
 * Phase 27.4 Plan 09 — dev-only Events tab. Renders the 8-block v2
 * observability surface that makes every 27.4 decision visible in a
 * single pane of glass. CONTEXT.md: "If you can't see it in the panel,
 * it effectively doesn't exist."
 *
 * Block order (per RESEARCH.md lines 1117-1131):
 *   1. Pipeline Waterfall (D-16)
 *   2. Provenance Distribution + LLM success histogram (D-17)
 *   3. Per-event drill-down (D-18 / B4)
 *   4. LLM Call Log (D-19)
 *   5. Token Budget bars (D-36)
 *   6. Accuracy Eval (D-20 / D-25 gate)
 *   7. Dead-letter queue (D-30)
 *   8. Suspect count badge (D-23)
 *
 * Threat mitigations:
 *   - T-27.4-09-01: dual dev gate (schemaVersion + import.meta.env.DEV)
 *   - T-27.4-09-02/03: React escapes all strings — no dangerouslySetInnerHTML
 *   - T-27.4-09-04: DLQ capped at 10 visible rows + max-h overflow; call
 *     history capped at 20 on the server side + max-h-32 here.
 */
interface EventsFiltersSectionProps {
  llmStatus: LLMStatus | null;
}

function EventsFiltersSection({ llmStatus }: EventsFiltersSectionProps) {
  if (!llmStatus) {
    return <div className="mt-2 p-2 text-[9px] text-white/40">No LLM status available.</div>;
  }
  const ch = llmStatus.callHistory ?? [];
  const tc = llmStatus.tokenCounters ?? { cerebras: 0, groq: 0 };
  const bk = llmStatus.breakerState ?? { cerebras: 'ok' as const, groq: 'ok' as const };
  const es = llmStatus.evalScore;
  const pc = llmStatus.provenanceCounts ?? {};
  const sc = llmStatus.suspectCount ?? 0;
  const dlq = llmStatus.dlqRecent ?? [];

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        Events Pipeline (v2)
      </span>
      <div className="mt-0.5 text-[9px] text-white/60">
        Schema: <span className="text-white/80">{llmStatus.schemaVersion ?? 'unknown'}</span>
        {' · '}Stage: <span className="text-white/80">{llmStatus.stage}</span>
        {llmStatus.durationMs ? (
          <>
            {' · '}Last run:{' '}
            <span className="text-white/80">{Math.round(llmStatus.durationMs / 1000)}s</span>
          </>
        ) : null}
        {llmStatus.paused === true && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-1 text-[9px] text-amber-400">
            Paused — soft cap
          </span>
        )}
      </div>

      {/* Block 1: Pipeline Waterfall (D-16) */}
      <WaterfallBlock llmStatus={llmStatus} />

      {/* Block 2: Histograms — provenance + call success (D-17) */}
      <HistogramsBlock provenanceCounts={pc} callHistory={ch} />

      {/* Block 3: Per-event drill-down (D-18 / B4) */}
      <DrillDownBlock llmStatus={llmStatus} />

      {/* Block 4: LLM call log (D-19) */}
      <CallLogBlock callHistory={ch} />

      {/* Block 5: Budget bars (D-36) */}
      <BudgetBarsBlock tokenCounters={tc} breakerState={bk} />

      {/* Block 6: Eval score + D-25 gate (D-20) */}
      <EvalScoreBlock evalScore={es} />

      {/* Block 7: DLQ list (D-30) */}
      <DlqBlock entries={dlq} />

      {/* Block 8: Suspect count badge (D-23) */}
      <SuspectBlock count={sc} />
    </div>
  );
}

/**
 * Phase 27.4.3 Plan 04 — sibling of EventsFiltersSection, gated on
 * schemaVersion === 'v3' && import.meta.env.DEV by the parent render switch.
 * Renders the 8-block v3 observability stack per UI-SPEC §"Component
 * Inventory" + §"Render switch".
 *
 * Block order (per UI-SPEC §"Section headers" lines 169-180):
 *   1. Routing Trace (D-12 §1)
 *   2. Latency P50/P95/P99 (D-12 §2)
 *   3. Rate-Limit Headroom (D-12 §3)
 *   4. Schema-Strict Failure Rate (D-12 §4)
 *   5. Error Taxonomy (D-14)
 *   6. Pipeline Flips (D-15)
 *   7. v3 Cost Shadow (D-19)
 *   + Lineage drill-down (D-13) — rendered IN-PLACE inside DrillDownRow under
 *     the existing event-list block (DrillDownRow auto-detects v3 fields).
 *     No separate block here; that's the entire v3 lineage UX surface.
 *
 * Threat mitigations:
 *   - T-27.4.3-04-01: production tree-shake gate via parent showEventsTab
 *   - T-27.4.3-04-02: pill stays read-only (Topbar.tsx, separate file)
 *   - T-27.4.3-04-03: lineage prompt/response only inside DEV gate
 *   - T-27.4.3-04-04: regression tests assert empty-state copy verbatim
 */
function EventsFiltersSectionV3({ llmStatus }: { llmStatus: LLMStatus }) {
  return (
    <section className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] text-white/60">
        Schema: v3 · Stage: {llmStatus.stage ?? 'idle'}
      </div>
      <RoutingTraceBlock trace={llmStatus.routingTrace} />
      <LatencyHistogramBlock latency={llmStatus.latency} />
      <RateLimitHeadroomBlock rateLimit={llmStatus.rateLimit} />
      <SchemaStrictFailureBlock
        schemaFailures={llmStatus.schemaFailures}
        callHistory={llmStatus.callHistory}
      />
      <ErrorTaxonomyBlock taxonomy={llmStatus.errorTaxonomy} />
      <PipelineFlipsBlock flips={llmStatus.pipelineFlips} />
      <CostShadowBlock cost={llmStatus.costShadow} />
      {/* Phase 27.4.4 — A9 atomic dev cells. Each renders an "—" placeholder
          for any field that is undefined / null so a v2 fallback or a fresh
          run that hasn't populated stats yet doesn't crash. */}
      <PrewarmCell llmStatus={llmStatus} />
      <AdaptiveBatchCell llmStatus={llmStatus} />
      <LineagePrefilterCell llmStatus={llmStatus} />
      {/* D-13 Lineage drill-down: per-event drill-down rows include the v3
          lineage extension (reasoning trace + lineage hash chip). DrillDownRow
          auto-detects v3 fields on RecentEnrichedEvent — they're optional, so
          v2-cached events under the same surface degrade gracefully (no chips).
          Rule 2 deviation from Plan 04 Task 4: the v3 composer needs to mount
          DrillDownBlock so the lineage UX surface is actually reachable when
          v3 is active (the v2 composer is replaced, not stacked, by the
          version-routed render switch). */}
      <DrillDownBlock llmStatus={llmStatus} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Phase 27.4.4 Plan 01 Task 10 (A9 atomic) — 3 dev-only v3 cells.
//
// Each cell mirrors a Phase 27.4.4 telemetry cluster:
//   - PrewarmCell: D-21 NIM cold-start pre-warm — prewarmCount + lastPrewarmTs
//     + prewarmState (warm | cold-fired | unknown).
//   - AdaptiveBatchCell: D-04 split-on-timeout — adaptiveBatchEnabled flag plus
//     splitCount / retrySuccess / retryFail / dlqEnqueueCount strip.
//   - LineagePrefilterCell: D-18 group-level pre-filter — lineagePrefilterEnabled
//     flag plus hitCount / missCount.
//
// Field reads fall back across:
//   1. mid-run top-level (server spreads llmProgress when stage !== 'idle')
//   2. cold-start lastRun (server places summary fields under .lastRun when idle)
// so cold-start dashboard reads remain populated.
// ---------------------------------------------------------------------------

function PrewarmCell({ llmStatus }: { llmStatus: LLMStatus }) {
  const last = llmStatus.lastRun;
  const count = llmStatus.prewarmCount ?? last?.prewarmCount ?? 0;
  const tsRaw = llmStatus.lastPrewarmTs ?? last?.lastPrewarmTs ?? null;
  const state = llmStatus.prewarmState ?? last?.prewarmState ?? 'unknown';
  const stateColor =
    state === 'warm'
      ? 'text-green-300'
      : state === 'cold-fired'
        ? 'text-amber-300'
        : 'text-white/40';
  const rel = tsRaw ? relativeTime(new Date(tsRaw).toISOString()) : '—';
  return (
    <div className="mt-2 flex items-baseline gap-2 text-[9px] text-white/60">
      <span className="font-bold uppercase tracking-wider text-white/40">Prewarm (D-21)</span>
      <span className="text-white/80">{count} fired</span>
      <span className={stateColor}>({state})</span>
      <span className="text-white/40">last: {rel}</span>
    </div>
  );
}

function AdaptiveBatchCell({ llmStatus }: { llmStatus: LLMStatus }) {
  const last = llmStatus.lastRun;
  const enabled = llmStatus.adaptiveBatchEnabled ?? last?.adaptiveBatchEnabled ?? false;
  const stats = llmStatus.adaptiveBatchStats ?? last?.adaptiveBatchStats;
  const enabledBadge = enabled ? (
    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-300">ON</span>
  ) : (
    <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] text-white/40">OFF</span>
  );
  return (
    <div className="mt-2 flex items-baseline gap-2 text-[9px] text-white/60">
      <span className="font-bold uppercase tracking-wider text-white/40">
        Adaptive batch (D-04)
      </span>
      {enabledBadge}
      {stats ? (
        <span className="text-white/80">
          split {stats.splitCount} · ✓ {stats.retrySuccess} · ✗ {stats.retryFail} · DLQ{' '}
          {stats.dlqEnqueueCount}
        </span>
      ) : (
        <span className="text-white/40">—</span>
      )}
    </div>
  );
}

function LineagePrefilterCell({ llmStatus }: { llmStatus: LLMStatus }) {
  const last = llmStatus.lastRun;
  const enabled = llmStatus.lineagePrefilterEnabled ?? last?.lineagePrefilterEnabled ?? false;
  const stats = llmStatus.lineagePrefilterStats ?? last?.lineagePrefilterStats;
  const enabledBadge = enabled ? (
    <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-300">ON</span>
  ) : (
    <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] text-white/40">OFF</span>
  );
  return (
    <div className="mt-2 flex items-baseline gap-2 text-[9px] text-white/60">
      <span className="font-bold uppercase tracking-wider text-white/40">
        Lineage prefilter (D-18)
      </span>
      {enabledBadge}
      {stats ? (
        <span className="text-white/80">
          hit {stats.hitCount} · miss {stats.missCount}
        </span>
      ) : (
        <span className="text-white/40">—</span>
      )}
    </div>
  );
}
