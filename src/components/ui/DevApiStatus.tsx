import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useHealthStatusContext } from '@/components/providers/HealthStatusProvider';
import { BudgetBlock, type TokenBudgetBlock } from '@/components/ui/BudgetBlock';
import { FlightRecorderBlock } from '@/components/ui/FlightRecorderBlock';
import { MetricRow } from '@/components/ui/MetricRow';
import { Sparkline } from '@/components/ui/Sparkline';
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

function formatAge(ts: number | null): string {
  if (!ts) return '--';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
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
  id,
  children,
}: {
  active: boolean;
  onClick: () => void;
  indicator?: 'red';
  testid: string;
  /**
   * Phase 40-03 (D-04) — stable element id so the matching panel container can
   * point at this tab via `aria-labelledby` (WAI-ARIA tablist/tabpanel link).
   */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      id={id}
      aria-selected={active}
      data-testid={testid}
      onClick={onClick}
      // Phase 40-03 (D-04) — roving tabindex: only the active tab is in the
      // natural Tab order; arrow keys move focus among the others (handled by
      // the tablist onKeyDown). Inactive tabs are tabindex=-1.
      tabIndex={active ? 0 : -1}
      // Phase 40-03 (D-04 / D-04b lockdown): chrome (px-3 py-1 / rounded-md /
      // active bg-white/10 text-white / font) is UNCHANGED — Phase 41
      // REVEAL-SITE-01 owns the visual reveal. The additions below are
      // INTERACTION AFFORDANCES ONLY:
      //   • focus-visible:* — keyboard-only focus ring (no ring on mouse click)
      //   • when active: border-b-2 border-accent-blue — a 2px accent-blue
      //     bottom indicator that stays readable in a greyscale screenshot.
      //     PHASE 41: preserve this active-indicator affordance through the
      //     chrome restyle.
      className={`flex items-center gap-1 rounded-md px-3 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black ${
        active
          ? 'border-b-2 border-accent-blue bg-white/10 text-white'
          : 'border-b-2 border-transparent text-white/50 hover:bg-white/5 hover:text-white/80'
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

  // Phase 28.1 W2 — read shared health context. Single-poll guarantee:
  // HealthBanner + this tab BOTH consume from one HealthStatusProvider
  // instance wrapping AppShell, so /api/health is fetched once per cycle.
  // Phase 28.2.5 D-08 — moved above the rows[] array so the Precip-row IIFE
  // (below) can read aggregateHealth.endpoints.waterPrecip without hitting
  // a temporal-dead-zone ReferenceError. The original L588-593 site is
  // collapsed into a re-binding so all downstream consumers (L675/L740-742)
  // continue to see the same names.
  const {
    health: aggregateHealth,
    loading: healthLoading,
    error: healthError,
  } = useHealthStatusContext();
  const hasCriticalUnhealthy = !!aggregateHealth && aggregateHealth.summary.critical.unhealthy > 0;

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
      // Phase 28.2.5 D-07 — was 'Events'; renamed to 'Events (raw)' and split
      // out sibling 'Events (LLM)' row below. The `note` field is dropped
      // because the LLM count now has its own row; the `quality` string
      // narrative is trimmed to drop the LLM-vs-raw split.
      name: 'Events (raw)',
      status: eventsRaw.status,
      count: eventsRaw.count,
      lastFetch: eventsRaw.lastFetch,
      lastError: eventsRaw.lastError,
      nextPollAt: eventsRaw.nextPollAt,
      recentFetches: eventsRaw.recentFetches,
      isOneShot: false,
      quality: `${eventsRaw.count} total, ${eventQuality.rawCount} raw | ${eventQuality.exact} exact, ${eventQuality.city} city, ${eventQuality.region} region`,
    },
    // Phase 28.2.5 D-07 — sibling row sources from /api/health endpoints.llmEvents
    // (the new SOURCE_KEYS entry per D-06). Operator signal: 'healthy' = enriched
    // LLM events serving; 'unknown' = v3 cache cold and Pitfall 1 fallback to raw
    // GDELT is active.
    //
    // Variable-name binding: the destructure at L471-475 aliases `health` to
    // `aggregateHealth`. We reference `aggregateHealth?.endpoints?.llmEvents` here
    // (NOT `health?.…` — that symbol is not in scope and would silently evaluate
    // to undefined, making the row perpetually 'unknown').
    ((): ApiRow => {
      const ep = aggregateHealth?.endpoints?.llmEvents;
      return {
        name: 'Events (LLM)',
        status: ep?.status ?? 'unknown',
        count: eventQuality.llmCount,
        lastFetch: ep?.lastSuccessTs ?? null,
        lastError: ep?.lastErrorReason ?? null,
        nextPollAt: null,
        recentFetches: [],
        isOneShot: false,
        quality: `${eventQuality.llmCount} LLM | ${eventQuality.exact} exact, ${eventQuality.city} city, ${eventQuality.region} region`,
      };
    })(),
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
    // Phase 28.2.5 D-08 — Precip row sources freshness from /api/health aggregate.
    // The HealthStatusContext destructure at L588-593 aliases `health` → `aggregateHealth`,
    // so we reference `aggregateHealth?.endpoints?.waterPrecip` here (NOT `health?.…` —
    // that symbol is not in scope and would silently evaluate to undefined).
    // Counts (precip.count, precip.facilityCount) stay from the store because they
    // describe content quality, not freshness. Pattern matches Events row keeping
    // eventQuality.llmCount alongside health-derived freshness.
    ((): ApiRow => {
      const ep = aggregateHealth?.endpoints?.waterPrecip;
      return {
        name: 'Precip',
        status: ep?.status ?? 'unknown',
        count: precip.count,
        lastFetch: ep?.lastSuccessTs ?? null,
        lastError: ep?.lastErrorReason ?? null,
        nextPollAt: null,
        recentFetches: [],
        isOneShot: false,
        quality: `${precip.count}/${precip.facilityCount} matched`,
      };
    })(),
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

  // Phase 44 (EVENTS-TAB-02, D-10) — prune data for the events-subtab
  // DeadLinkBucketsBlock. The canonical operator-status fetch lives inside the
  // sibling `DevApiStatusAllApisTab` (API-Health tab), which only mounts when
  // that tab is active. Because the API-Health and events tabpanels are
  // mutually-exclusive `activeTab` branches, only one fetcher is ever mounted
  // at a time — so this events-tab-scoped fetch never runs CONCURRENTLY with
  // the API-Health one (honoring D-10's no-double-fetch intent). It extracts
  // ONLY `prune` (threaded down to EventsFiltersSectionV3), degrades open on
  // any failure (network / non-200 / missing Bearer → null → block self-hides),
  // and only runs while the events tab is the active, Bearer-unlocked surface.
  //
  // Phase 44 WR-02 — two failure-handling guarantees, pinned here:
  //   1. Failures NULL the state (not keep-last-good): a Bearer expiry or
  //      server failure after one successful fetch must hide the block, not
  //      leave it rendering progressively staler data with no indicator.
  //   2. Out-of-order guard: a monotonically increasing per-effect request id
  //      is checked before every setEventsPrune so a slow first response
  //      resolving after a faster interval tick cannot clobber newer data.
  const [eventsPrune, setEventsPrune] = useState<PruneSummary | null>(null);
  // Phase 45 DASH-READ-05 (Plan 04) — the Plan-01 bounded dashboard:trends:history
  // ring, surfaced as `trendHistory` on the SAME already-fetched /api/operator-status
  // response. Threaded into EventsFiltersSectionV3 as the source for the four trend
  // sparklines (cron freshness ×3 + dead-link count). NO new fetch (plan prohibition):
  // it rides the existing events-scoped operator-status poll alongside `prune`, with
  // the identical WR-02 out-of-order + degrade-open contract.
  const [eventsTrend, setEventsTrend] = useState<TrendSample[] | null>(null);
  useEffect(() => {
    if (activeTab !== 'events' || !showEventsTab) {
      setEventsPrune(null);
      setEventsTrend(null);
      return;
    }
    let cancelled = false;
    let latestRequestId = 0;
    const fetchPrune = async (): Promise<void> => {
      const requestId = ++latestRequestId;
      // Only the most recent in-flight request may write state (WR-02 §2).
      const mayWrite = () => !cancelled && requestId === latestRequestId;
      try {
        const res = await fetch('/api/operator-status', {
          headers: { ...dashboardAuthHeaders() },
        });
        if (!res.ok) {
          // Degrade-open (WR-02 §1) — non-200 nulls the state; block self-hides.
          if (mayWrite()) {
            setEventsPrune(null);
            setEventsTrend(null);
          }
          return;
        }
        const data = (await res.json()) as {
          prune?: PruneSummary | null;
          trendHistory?: TrendSample[] | null;
        };
        if (mayWrite()) {
          setEventsPrune(data?.prune ?? null);
          // Forward-compat: absent on servers pre-dating Plan 45-01 → null →
          // the trend block self-hides (degrade-open).
          setEventsTrend(data?.trendHistory ?? null);
        }
      } catch {
        // Degrade-open (WR-02 §1) — network failure nulls the state too.
        if (mayWrite()) {
          setEventsPrune(null);
          setEventsTrend(null);
        }
      }
    };
    void fetchPrune();
    const id = setInterval(() => {
      void fetchPrune();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTab, showEventsTab]);

  // Phase 28.2.5 D-08 — `aggregateHealth` / `healthLoading` / `healthError`
  // and `hasCriticalUnhealthy` are now declared earlier in the component
  // body (just above the `rows[]` array) so the Precip-row IIFE inside
  // `rows[]` can reference `aggregateHealth.endpoints.waterPrecip` without
  // hitting a temporal-dead-zone ReferenceError. The original site at this
  // location was the consumer of last resort; the move is name-preserving
  // so the existing TabButton indicator (L675) and DevApiStatusAllApisTab
  // mount (L740-742) keep their references unchanged.

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

  // Phase 40-03 (D-04) — roving-tabindex keyboard navigation over the tablist.
  // Manual-activation pattern (WAI-ARIA tablist): Arrow/Home/End move FOCUS
  // only; Enter/Space activate the focused tab. The visible tab set is dynamic
  // (showApiHealthTab / showWaterTab / showSitesTab / showEventsTab), so we
  // operate over the currently-rendered `[role="tab"]` elements scoped to the
  // tablist rather than a hard-coded id list.
  const tablistRef = useRef<HTMLDivElement>(null);

  // Map a tab element's testid → the uiStore tab key consumed by setTab.
  const TAB_TESTID_TO_KEY: Record<string, 'apiHealth' | 'water' | 'sites' | 'events'> = useMemo(
    () => ({
      'tab-api-health': 'apiHealth',
      'tab-water': 'water',
      'tab-sites': 'sites',
      'tab-events': 'events',
    }),
    [],
  );

  const handleTablistKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const list = tablistRef.current;
      if (!list) return;
      const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      if (tabs.length === 0) return;

      // The focused tab (the roving tabindex=0 one), else the active tab as a
      // fallback when focus has not yet landed inside the tablist.
      const currentIndex = Math.max(
        0,
        tabs.findIndex((t) => t === document.activeElement),
      );

      const focusAt = (idx: number) => {
        e.preventDefault();
        tabs[idx]?.focus();
      };

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          focusAt((currentIndex + 1) % tabs.length); // wrap at end
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          focusAt((currentIndex - 1 + tabs.length) % tabs.length); // wrap at start
          break;
        case 'Home':
          focusAt(0);
          break;
        case 'End':
          focusAt(tabs.length - 1);
          break;
        case 'Enter':
        case ' ': // Space
        case 'Spacebar': {
          e.preventDefault();
          const testid = tabs[currentIndex]?.getAttribute('data-testid') ?? '';
          const key = TAB_TESTID_TO_KEY[testid];
          if (key) setTab(key);
          break;
        }
        default:
          break; // Tab falls through — roving tabindex moves focus into the panel
      }
    },
    [TAB_TESTID_TO_KEY, setTab],
  );

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

          <div
            className="flex items-center gap-1"
            role="tablist"
            ref={tablistRef}
            onKeyDown={handleTablistKeyDown}
          >
            {/* Phase 28.2 W5 D-22/D-27 — merged API Health tab in first
                position. Indicator combines polling-store issue signal
                (formerly Overview) with critical-unhealthy signal (formerly
                All APIs) — both matter on the merged surface.
                Phase 40-03 (D-04): each tab carries a stable `id` so its
                panel container can reference it via `aria-labelledby`. */}
            {showApiHealthTab && (
              <TabButton
                active={activeTab === 'apiHealth'}
                onClick={() => setTab('apiHealth')}
                indicator={hasIssue || hasCriticalUnhealthy ? 'red' : undefined}
                testid="tab-api-health"
                id="tab-api-health"
              >
                API Health
              </TabButton>
            )}
            {showWaterTab && (
              <TabButton
                active={activeTab === 'water'}
                onClick={() => setTab('water')}
                testid="tab-water"
                id="tab-water"
              >
                Water
              </TabButton>
            )}
            {showSitesTab && (
              <TabButton
                active={activeTab === 'sites'}
                onClick={() => setTab('sites')}
                testid="tab-sites"
                id="tab-sites"
              >
                Sites
              </TabButton>
            )}
            {showEventsTab && (
              <TabButton
                active={activeTab === 'events'}
                onClick={() => setTab('events')}
                testid="tab-events"
                id="tab-events"
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
          {/* Phase 40-03 (D-04) — each active panel is a role="tabpanel"
              labelled by its owning tab's id (WAI-ARIA tablist/tabpanel link).
              Within the API Health panel, the group-header collapse buttons +
              drawer controls stay in normal DOM tab order (no roving), so Tab
              walks them top-to-bottom after exiting the tablist. */}
          {activeTab === 'apiHealth' && showApiHealthTab && (
            <div role="tabpanel" aria-labelledby="tab-api-health">
              <DevApiStatusAllApisTab
                health={aggregateHealth}
                loading={healthLoading}
                error={healthError}
                llmStatus={llmStatus}
              />
            </div>
          )}
          {activeTab === 'water' && showWaterTab && (
            <div role="tabpanel" aria-labelledby="tab-water">
              <WaterFiltersSection />
            </div>
          )}
          {activeTab === 'sites' && showSitesTab && (
            <div role="tabpanel" aria-labelledby="tab-sites">
              <SitesFiltersSection />
            </div>
          )}
          {activeTab === 'events' && showEventsTab && (
            <div role="tabpanel" aria-labelledby="tab-events">
              {/* Phase 27.4.6 — V3 is the default body when schemaVersion is
                  unknown (cold start, post-deploy before first cron tick). V2
                  remains the explicit override; the V1 case drops out via the
                  shouldRenderDashboard() outer gate since V1 is no longer a
                  valid runtime pipeline. Prior version-routed switch hid the
                  body entirely when schemaVersion was undefined, leaving the
                  tab button visible with an empty body. */}
              {llmStatus?.schemaVersion === 'v2' ? (
                <EventsFiltersSection llmStatus={llmStatus} />
              ) : (
                <EventsFiltersSectionV3
                  llmStatus={llmStatus}
                  prune={eventsPrune}
                  trendHistory={eventsTrend}
                />
              )}
            </div>
          )}
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

/* ---------- Phase 40 (UI-POLISH-01/02/03) — API Health consolidation ---------- */

/**
 * Phase 40 — relative-time formatter for the hero "last run" field.
 * Compact "Nh ago" / "Nm ago" / "Ns ago" form; "—" when no timestamp.
 */
function heroRelativeTime(ts: number | null | undefined): string {
  if (ts == null) return '—';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86_400)}d ago`;
}

/**
 * Phase 40 (D-06) — canonical muted-placeholder for honest degraded render.
 * `text-[10px] text-white/30 italic` + copy `— no data ({reason})`. Used for
 * every group/hero field whose data source is null so the GROUP shell + hero
 * never silently vanish. Degrade-open semantics unchanged (no throw, route 200).
 */
function MutedPlaceholder({ testid, reason }: { testid: string; reason: string }) {
  return (
    <div className="text-[10px] italic text-white/30" data-testid={testid}>
      — no data ({reason})
    </div>
  );
}

/**
 * Phase 40 (D-01) — collapsible grouped `<section>`. Default EXPANDED (the
 * `devApiGroupCollapsed` slice defaults `{}`). Header is a real `<button>` with
 * `aria-expanded`/`aria-controls`; chevron rotates ▸→▾. Group-header type role
 * (11px/600 uppercase tracking-wider) per UI-SPEC §Typography. Inter-group
 * break `mt-4` (lg) + top hairline. Collapse state is session-scoped in uiStore.
 */
function CollapsibleGroup({
  slug,
  title,
  collapsed,
  onToggle,
  children,
}: {
  slug: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mt-4 border-t border-white/10"
      data-testid={`group-${slug}`}
      aria-labelledby={`group-${slug}-header`}
    >
      <button
        type="button"
        id={`group-${slug}-header`}
        aria-expanded={!collapsed}
        aria-controls={`group-${slug}-body`}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/70 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black"
      >
        <span aria-hidden="true" className="inline-block w-3 text-[12px] text-white/40">
          {collapsed ? '▸' : '▾'}
        </span>
        {title}
      </button>
      <div id={`group-${slug}-body`} hidden={collapsed} className="mt-2 px-4">
        {children}
      </div>
    </section>
  );
}

function DevApiStatusAllApisTab({
  health,
  loading,
  error,
  llmStatus,
}: {
  health: HealthResponse | null;
  loading: boolean;
  error: Error | null;
  llmStatus: LLMStatus;
}) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Phase 40 (D-01/D-02a) — collapsible group + operator-drawer view-state
  // (Plan 01 uiStore slice; session-scoped, no localStorage). Selector form
  // per CLAUDE.md to minimize re-renders.
  const devApiGroupCollapsed = useUIStore((s) => s.devApiGroupCollapsed);
  const toggleDevApiGroup = useUIStore((s) => s.toggleDevApiGroup);
  const isOperatorDrawerOpen = useUIStore((s) => s.isOperatorDrawerOpen);
  const toggleOperatorDrawer = useUIStore((s) => s.toggleOperatorDrawer);
  const setOperatorDrawerOpen = useUIStore((s) => s.setOperatorDrawerOpen);

  // Phase 28.2 W5 Task 7.5 — Operator Actions block state. Sourced from
  // /api/operator-status (Bearer-gated read-only aggregator). One fetch
  // on mount + every 30s while the tab is open.
  //
  // Phase 32 Plan 05 — `prune` field added (optional; older servers that
  // pre-date Plan 32-04 still type-check + render without it). The shape
  // mirrors the server contract pinned by operator-status.test.ts (Plan 04
  // Task 1): `deadUrlCount` is the O(1) sidecar read, `last24hPrunes` is
  // derived from the audit-log pass, `deadUrlSample` is the bounded SCAN
  // drill-down (cap 20). `byBearer[].prunes` is also optional — server may
  // include it once Plan 32-04 lands but older deploys won't.
  interface OperatorStatus {
    audit24h: number;
    byBearer: Array<{
      bearerFingerprint: string;
      actions: number;
      swaps: number;
      replays: number;
      prunes?: number;
    }>;
    advEval: { total: number; blocked: number; leaked: number } | null;
    prune?: {
      deadUrlCount: number;
      last24hPrunes: number;
      // Phase 44 D-01 — optional, forward-compat (Phase 32 D-10 pattern):
      // older servers pre-dating the D-01 extension omit it, so the dashboard
      // must not break. SAMPLED per-status tally (≤MAX_SCAN_KEYS=200), NOT
      // authoritative — deadUrlCount is. Render "of N scanned" caveat (D-03).
      countsByStatus?: Record<string, number>;
      deadUrlSample: Array<{
        eventId: string;
        // Phase 43 drift close — `soft-404` joins the terminal-dead union.
        status: 'dead-host' | '403' | '404' | 'soft-404';
        // Phase 44 WR-04 — nullable in lockstep with the server's
        // DeadUrlSampleEntry.url (string | null, Phase 43 D-07/CR-01).
        url: string | null;
        // Phase 44 D-01 — optional forward-compat (Phase 32 D-10 pattern).
        // `evidence` renders as TEXT, not HTML (D-11 / T-43-16).
        evidence?: string | null;
        lastProbedAt?: string;
        attemptCount?: number;
      }>;
    } | null;
    // Phase 33 D-17 — actor metadata quality counts from /api/operator-status
    // (Plan 33-06 server surface). `null` (or field absent) when the server
    // has not yet shipped Plan 33-06 — silent skip in the render gate below
    // mirrors the Phase 32 D-10 forward-compat pattern for the `prune` block.
    actorQuality?: {
      totalEvents: number;
      nullActors: number;
      rawCameoActors: number;
      ambiguousActors: number;
      lowConfidenceActors: number;
      sample: Array<{
        eventId: string;
        actors: string[];
        actorConfidence: Array<'high' | 'medium' | 'low'>;
        issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
      }>;
    } | null;
    // Phase 39 Plan 03/05 (BUDGET-01/02) — token-budget proximity + today's
    // cost-shadow USD. GA-4 provider-keyed map mirrored from the Plan-03 server
    // shape (server/routes/operator-status.ts TokenBudgetBlock). `null` (or
    // absent) when the server has not shipped Plan 03 or the Redis read threw
    // (degrade-open) — BudgetBlock's render gate hides the block in that case.
    tokenBudget?: TokenBudgetBlock | null;
    // Phase 45 DASH-READ-05 (CONTEXT D-01) — bounded dashboard:trends:history
    // ring (up to 30 daily samples, newest-first) read through this aggregator.
    // Backs the four trend sparklines (cron freshness ×3 + dead-link count).
    // Optional forward-compat (Phase 32 D-10): older servers pre-dating Plan
    // 45-01 omit it; `null` (or absent) on degrade-open. Interface-only here —
    // the sparkline render that consumes it lands in Plan 04.
    trendHistory?: TrendSample[] | null;
    // Phase 46 HARD-01 (46-04) — per-tier rate-limiter config + recent HTTP-429
    // counts, mirrored byte-for-byte from the 46-01 server `RateLimiterBlock`
    // (server/routes/operator-status.ts: `tiers` array of
    // `{ tier, max, windowSec, recent429 }`). Optional forward-compat (Phase 32
    // D-10), same as `tokenBudget?:` / `trendHistory?:` above: older servers
    // pre-dating Plan 46-01 omit it; `null` (or absent) on per-block
    // degrade-open. NOT gated in `fetchOpStatus` — the render block self-hides
    // to a muted placeholder when it is null/absent.
    rateLimiter?: RateLimiterBlock | null;
  }
  const [opStatus, setOpStatus] = useState<OperatorStatus | null>(null);
  // Phase 32 Plan 05 MEDIUM-03 — `fetchOpStatus` hoisted out of the
  // useEffect closure into a named useCallback so the prune button handler
  // can trigger an immediate refresh after a successful prune (200) without
  // waiting for the next 30s poll cycle. No-op refactor: the body is the
  // same as the prior inline closure, just named + memoized.
  const fetchOpStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/operator-status', {
        headers: { ...dashboardAuthHeaders() },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<OperatorStatus>;
      // Defensive shape check — if the response doesn't carry the
      // operator-status fields (e.g., a test fetch spy returning a
      // /api/health body, or a mid-deploy schema regression) hide
      // the block entirely instead of crashing on missing fields.
      // `prune` is optional (Phase 32 Plan 04) — not gated here.
      if (
        typeof data?.audit24h !== 'number' ||
        !Array.isArray(data?.byBearer) ||
        !('advEval' in data)
      ) {
        return;
      }
      setOpStatus(data as OperatorStatus);
    } catch {
      // Network failure — block hides gracefully (degrade-open)
    }
  }, []);
  useEffect(() => {
    void fetchOpStatus();
    const id = setInterval(() => {
      void fetchOpStatus();
    }, 30_000);
    return () => {
      clearInterval(id);
    };
  }, [fetchOpStatus]);

  // Phase 28.2 W6 Plan 06 Task 7 — audit-result banner state.
  // Sourced from /api/audit-status (no auth gate; sidecar key written by
  // .github/workflows/prod-connectivity-audit.yml after each manual
  // prod-audit run). Per UI-SPEC §5.4: pass → green; fail → red; absent → silent.
  interface AuditStatus {
    status: 'pass' | 'fail' | 'absent';
    runId?: string;
    timestamp?: string;
    lastVerifiedAt?: string;
    endpoints?: Record<string, 'pass' | 'fail'>;
    durationMs?: number;
  }
  const [auditStatus, setAuditStatus] = useState<AuditStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchAuditStatus = async () => {
      try {
        const res = await fetch('/api/audit-status');
        if (!res.ok) return;
        const data = (await res.json()) as Partial<AuditStatus>;
        if (typeof data?.status !== 'string') return;
        if (!cancelled) setAuditStatus(data as AuditStatus);
      } catch {
        // Network failure — banner stays silent (degrade-open)
      }
    };
    void fetchAuditStatus();
    const id = setInterval(() => {
      void fetchAuditStatus();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Phase 29 Plan 08 D-02 part D — operator pipeline-pin surface removed.
  // The Pin-to-v1/v2/v3 button row, confirm modal, escape-key listener, and
  // their associated state + POST helper are all gone now that Plan 04
  // deleted the underlying override route in events.ts.

  // Phase 28.2 W5 Task 7 — 429 quota alert state. Populated by replay
  // helper; cleared when a subsequent /llm-replay returns 200.
  const [quotaAlert, setQuotaAlert] = useState<{ resetsAt: string } | null>(null);

  // Phase 28.2 W5 Task 7 — replay-quota probe helper. Used as the
  // observable trigger for the 429 alert. Test 28-30 wire fetch spies
  // around this; production callsites issue /llm-replay from elsewhere
  // in the operator-actions block (Task 7.5 + Plan 06 expand).
  // Phase 44 — visible probe result. The probe POSTs groupKey="test", which
  // the server resolves PAST the quota check and then 404s ("not_found") — so a
  // 404 is the SUCCESS signal (request authenticated, quota not exceeded). With
  // no visible result the button read as broken ("nothing happens"); this line
  // makes every outcome legible.
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const replayProbe = async (): Promise<void> => {
    setReplayResult('Probing…');
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
        setReplayResult('Quota exceeded (50/50 in 24h).');
      } else if (res.ok || res.status === 404) {
        // 404 = reached the handler past auth+quota (the "test" group is absent
        // by design); ok = a real group replayed. Both mean quota not exceeded.
        setQuotaAlert(null);
        setReplayResult('✓ Quota OK — probe reached server (not exceeded).');
      } else if (res.status === 401 || res.status === 403) {
        setReplayResult('✗ Auth rejected — re-enter the dashboard password.');
      } else {
        setReplayResult(`✗ Probe failed (HTTP ${res.status}).`);
      }
    } catch {
      setReplayResult('✗ Network error — probe did not reach the server.');
    }
  };

  // Phase 32 Plan 05 (GHOST-04, D-10) — dead-URL prune trigger. Mirrors
  // replayProbe() above but POSTs to /api/events/prune-dead-urls and, on
  // 200, kicks an immediate fetchOpStatus refresh so `prune.deadUrlCount`
  // drops in-place without waiting for the next 30s poll. 429 surfaces
  // through pruneQuotaAlert (50/24h per Bearer per D-15). Network failures
  // degrade-open per the existing operator-actions convention.
  const [pruneQuotaAlert, setPruneQuotaAlert] = useState<{ resetsAt: string } | null>(null);
  // Phase 44 — visible prune result. A 200 with prunedCount:0 (e.g. the count
  // had drifted and the server reconciled it to 0) previously looked identical
  // to a broken button; this line reports exactly what happened.
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const pruneHandler = async (): Promise<void> => {
    setPruneResult('Pruning…');
    try {
      const res = await fetch('/api/events/prune-dead-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...dashboardAuthHeaders(),
        },
        body: JSON.stringify({ trigger: 'manual' }),
      });
      if (res.status === 429) {
        const body = (await res.json()) as { resetsAt?: string };
        setPruneQuotaAlert({ resetsAt: body.resetsAt ?? '' });
        setPruneResult('Quota exceeded (50/50 in 24h).');
      } else if (res.ok) {
        setPruneQuotaAlert(null);
        const body = (await res.json().catch(() => null)) as { prunedCount?: number } | null;
        const n = body?.prunedCount ?? 0;
        setPruneResult(
          n > 0
            ? `✓ Pruned ${n} dead event${n === 1 ? '' : 's'}.`
            : '✓ No prunable events — count reconciled.',
        );
        // MEDIUM-03 resolution — refresh `prune.deadUrlCount` immediately
        // instead of waiting for the 30s polling tick.
        void fetchOpStatus();
      } else if (res.status === 401 || res.status === 403) {
        setPruneResult('✗ Auth rejected — re-enter the dashboard password.');
      } else {
        setPruneResult(`✗ Prune failed (HTTP ${res.status}).`);
      }
    } catch {
      setPruneResult('✗ Network error — prune did not reach the server.');
    }
  };

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

  const renderSparkline = (epName: string) => {
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
          const bg = fetch.ok ? 'var(--color-status-healthy)' : 'var(--color-status-degraded)';
          return <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: bg }} />;
        })}
      </div>
    );
  };

  const renderQualityBlock = (epName: string) => {
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
  // Phase 40 (D-05) — hero rollup derived from already-polled data (no new
  // fetch). Health endpoint counts, last-run outcome (from llmStatus.lastRun,
  // already in scope as a prop — avoids coupling to FlightRecorder's internal
  // fetch), token-budget %, and dead-URL count.
  const heroEndpoints = (() => {
    if (!health) return null;
    const eps = Object.values(health.endpoints);
    return { healthy: eps.filter((e) => e.status === 'healthy').length, total: eps.length };
  })();
  const heroLastRun = llmStatus.lastRun ?? null;
  const heroLastRunOk = heroLastRun ? heroLastRun.error == null : null;
  const heroBudget = (() => {
    const nim = opStatus?.tokenBudget?.providers?.nvidia_nim;
    if (!nim || nim.cap <= 0) return null;
    const ratio = nim.used / nim.cap;
    return { pct: Math.min(100, Math.round(ratio * 100)), ratio };
  })();
  const heroDeadUrls = opStatus?.prune?.deadUrlCount ?? null;

  return (
    <div data-testid="all-apis-tab">
      {/* Phase 40 (D-05) — read-only hero rollup strip. Four fields in
          health → pipeline → cost → data-quality order so the hero reads as a
          table-of-contents for the four groups below. Each field degrades to
          its own muted fallback independently (D-06). */}
      <header
        data-testid="api-health-hero"
        role="status"
        aria-label="API health summary"
        className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2"
      >
        {/* Field 1 — endpoints healthy */}
        {heroEndpoints ? (
          <span className="flex items-center gap-1" data-testid="api-health-hero-endpoints">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: 'var(--color-status-healthy)' }}
            />
            <span className="text-[13px] font-semibold tabular-nums">
              {heroEndpoints.healthy}/{heroEndpoints.total}
            </span>
            <span className="text-[10px] text-white/60">healthy</span>
          </span>
        ) : (
          <MutedPlaceholder testid="api-health-hero-endpoints" reason="no health data" />
        )}
        {/* Field 2 — LLM last run */}
        {heroLastRun ? (
          <span className="flex items-center gap-1" data-testid="api-health-hero-llm">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: heroLastRunOk
                  ? 'var(--color-status-healthy)'
                  : 'var(--color-status-degraded)',
              }}
            />
            <span className="text-[13px] font-semibold">{heroLastRunOk ? 'ok' : 'failed'}</span>
            <span className="text-[10px] tabular-nums text-white/60">
              {heroRelativeTime(heroLastRun.lastRun)}
            </span>
            <span className="text-[10px] text-white/60">last run</span>
          </span>
        ) : (
          <MutedPlaceholder testid="api-health-hero-llm" reason="no recorder data" />
        )}
        {/* Field 3 — budget % of cap */}
        {heroBudget ? (
          <span className="flex items-center gap-1" data-testid="api-health-hero-budget">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  heroBudget.ratio >= 0.95
                    ? 'var(--color-status-degraded)'
                    : heroBudget.ratio >= 0.8
                      ? 'var(--color-status-warning)'
                      : 'var(--color-status-healthy)',
              }}
            />
            <span className="text-[13px] font-semibold tabular-nums">{heroBudget.pct}%</span>
            <span className="text-[10px] text-white/60">of cap</span>
          </span>
        ) : (
          <MutedPlaceholder testid="api-health-hero-budget" reason="no budget data" />
        )}
        {/* Field 4 — dead URLs */}
        {heroDeadUrls != null ? (
          <span className="flex items-center gap-1" data-testid="api-health-hero-deadurls">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  heroDeadUrls > 0 ? 'var(--color-status-degraded)' : 'var(--color-status-healthy)',
              }}
            />
            <span className="text-[13px] font-semibold tabular-nums">{heroDeadUrls}</span>
            <span className="text-[10px] text-white/60">dead URLs</span>
          </span>
        ) : (
          <MutedPlaceholder testid="api-health-hero-deadurls" reason="no prune data" />
        )}
      </header>

      {/* GROUP 1 — Endpoint Health (tier banner + audit banner + states +
          per-endpoint quality table). */}
      <CollapsibleGroup
        slug="endpoint-health"
        title="Endpoint Health"
        collapsed={devApiGroupCollapsed['endpoint-health'] ?? false}
        onToggle={() => toggleDevApiGroup('endpoint-health')}
      >
        {/* Phase 28.2 W5 D-23 block 1 — tier-grouped summary banner. Renders
          a single horizontal row with three colored dots (healthy / degraded
          / unhealthy via CSS-var tokens per UI-SPEC §9) followed by the
          per-tier breakdown. Hidden when health is null (loading / error).
          Spacing values carried forward verbatim (pre-existing chrome). */}
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
                    style={{ backgroundColor: 'var(--color-status-healthy)' }}
                  />
                  {totalHealthy} of {total} healthy
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-status-degraded)' }}
                  />
                  {totalDegraded} degraded
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-status-warning)' }}
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
        {/* Phase 28.2 W6 Plan 06 Task 7 — connectivity audit-result banner.
          Reads /api/audit-status (sidecar `audit:connectivity:last-result`
          populated by .github/workflows/prod-connectivity-audit.yml after
          each manual prod-audit run). Per UI-SPEC §5.4 + §10:
            status === 'pass'   → green banner with copy:
              "All 16 of 16 endpoints connecting (last verified <date> via prod audit)."
              (the literal "All 16 endpoints connecting" verbatim copy is
              also produced when M=N — the verify-gate grep target.)
            status === 'fail'   → red:   "<N> of <M> endpoints failing connectivity audit. See <names>."
            status === 'absent' → silent (placeholder div, empty content). */}
        {(() => {
          if (!auditStatus || auditStatus.status === 'absent') {
            // Silent placeholder. Tests assert empty content; production
            // shows nothing.
            return <div data-testid="audit-result-banner" />;
          }
          const endpoints = auditStatus.endpoints ?? {};
          const total = Object.keys(endpoints).length;
          const failing = Object.entries(endpoints)
            .filter(([, v]) => v === 'fail')
            .map(([k]) => k);
          const ageRefIso = auditStatus.lastVerifiedAt ?? auditStatus.timestamp ?? '';
          const dateStr = ageRefIso ? ageRefIso.slice(0, 10) : 'unknown';
          if (auditStatus.status === 'pass') {
            return (
              <div
                className="mb-2 rounded border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400"
                data-testid="audit-result-banner"
                data-status="pass"
              >
                All {total} of {total} endpoints connecting (last verified {dateStr} via prod
                audit).
              </div>
            );
          }
          // status === 'fail'
          const failCount = failing.length;
          // Strip /api/ prefix for human-readable names ("events" not "/api/events").
          const failNames = failing
            .map((p) => p.replace(/^\/api\//, '').replace(/\/$/, ''))
            .join(', ');
          return (
            <div
              className="mb-2 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
              data-testid="audit-result-banner"
              data-status="fail"
            >
              {failCount} of {total} endpoints failing connectivity audit. See {failNames}.
            </div>
          );
        })()}

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
                                    className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black"
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
      </CollapsibleGroup>

      {/* GROUP 2 — LLM Pipeline (LLMPipelineSection + FlightRecorderBlock +
          the adversarial-eval / prompt-injection robustness row relocated
          from the operator-actions block — it is LLM-eval data). */}
      <CollapsibleGroup
        slug="llm-pipeline"
        title="LLM Pipeline"
        collapsed={devApiGroupCollapsed['llm-pipeline'] ?? false}
        onToggle={() => toggleDevApiGroup('llm-pipeline')}
      >
        {/* Phase 28.2 W5 D-22 — LLMPipelineSection folded in from Overview.
            Heading text "LLM Pipeline" preserved verbatim per UI-SPEC §5.2.
            Testid preserved (regression tests assert it). */}
        <section className="text-[9px]" data-testid="llm-pipeline-section">
          <LLMPipelineSection llmStatus={llmStatus} />
        </section>

        {/* Phase 39 Plan 05 (OBS-FLIGHT-04) — LLM flight recorder relocated up
            into the LLM Pipeline group. Its own Bearer fetch of
            /api/events/llm-history; degrade-open → muted placeholder (Task 3). */}
        <FlightRecorderBlock />

        {/* Phase 40 — adversarial-eval / prompt-injection robustness row moved
            here from operator-actions (it is LLM-eval data, not an operator
            action). Testid preserved. */}
        {opStatus?.advEval && (
          <div className="mt-2 text-[10px] text-text-muted" data-testid="adversarial-eval-row">
            Prompt-injection robustness: {opStatus.advEval.blocked}/{opStatus.advEval.total}
          </div>
        )}
      </CollapsibleGroup>

      {/* GROUP 3 — Budget & Cost (BudgetBlock — token-proximity bars + cost
          shadow USD). */}
      <CollapsibleGroup
        slug="budget-cost"
        title="Budget &amp; Cost"
        collapsed={devApiGroupCollapsed['budget-cost'] ?? false}
        onToggle={() => toggleDevApiGroup('budget-cost')}
      >
        {/* Phase 39 Plan 05 (BUDGET-01/02) — sources the already-polled
            `tokenBudget` field (no new fetch). Degrade-open → muted
            placeholder (Task 3). */}
        <BudgetBlock tokenBudget={opStatus?.tokenBudget ?? null} />
      </CollapsibleGroup>

      {/* GROUP 4 — Operator Actions & Data Quality. Read-only counters STAY
          here (24h count, byBearer, dead-URL count + drill-down, actor-quality,
          429 alerts); the destructive Replay + Prune BUTTONS move into the
          default-closed drawer at the foot of this group (D-02a). */}
      <CollapsibleGroup
        slug="operator-actions"
        title="Operator Actions &amp; Data Quality"
        collapsed={devApiGroupCollapsed['operator-actions'] ?? false}
        onToggle={() => toggleDevApiGroup('operator-actions')}
      >
        {/* Phase 28.2 W5 Task 7 — Operator Actions block (read-only counters +
          alerts). Testid preserved (regression tests assert it). */}
        <section className="text-xs" data-testid="operator-actions">
          {/* Phase 40 (D-06) — group-level muted placeholder when the
            operator-status aggregator is unreachable, so the group body is
            never empty. */}
          {opStatus == null && (
            <MutedPlaceholder
              testid="group-operator-actions-placeholder"
              reason="operator-status unreachable"
            />
          )}

          {/* Phase 28.2 W5 Task 7.5 — Operator Actions live content (AI-SPEC
            §7). Sourced from /api/operator-status; renders only when the
            aggregator returns data. Rows: 24h count, per-Bearer breakdown. */}
          {opStatus && (
            <>
              <div className="text-[10px] text-text-muted" data-testid="operator-actions-24h-count">
                24h actions: {opStatus.audit24h}
              </div>
              {opStatus.byBearer.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {opStatus.byBearer.map((b) => (
                    <div
                      key={b.bearerFingerprint}
                      data-testid={`operator-actions-bearer-row-${b.bearerFingerprint}`}
                      className="text-[10px] text-text-muted"
                    >
                      {b.bearerFingerprint.slice(0, 8)}…: {b.actions} actions / {b.swaps} swaps /{' '}
                      {b.replays} replays
                    </div>
                  ))}
                </div>
              )}
              {/* Phase 40 — the adversarial-eval row relocated to the LLM
                Pipeline group (it is LLM-eval data, not an operator action). */}
            </>
          )}

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

          {/* Phase 29 Plan 08 D-02 part D — Pin-to-v1/v2/v3 + Clear pin
            button row removed. The underlying POST /api/events/llm-pipeline
            endpoint was deleted in Plan 04; the UI buttons would only 404. */}

          {/* Phase 40 (D-02a) — the replay test trigger button relocated into
            the operator-controls drawer below. Its 429 quota alert (above)
            stays in this group near the rest of the read-only surface. */}

          {/* Phase 32 Plan 05 (GHOST-03, GHOST-04, D-10) — dead-URL count +
            drill-down list + Prune {N} dead events button. Sourced from
            /api/operator-status `prune` block (Plan 32-04). Renders only
            when the server returns the optional `prune` field; pre-Plan-04
            deploys silently skip this block. One-click destructive action
            (no confirmation modal per Discretion §3 — mirrors the existing
            replay-test-trigger UX). 429 surfaces through prune-quota-alert;
            200 triggers an immediate fetchOpStatus refresh so the count
            drops in-place. */}
          {opStatus?.prune != null && (
            <>
              <div className="mt-1 text-[10px] text-text-muted" data-testid="dead-url-count">
                Dead URL events: {opStatus.prune.deadUrlCount}
              </div>
              {opStatus.prune.deadUrlSample.length > 0 && (
                <ul
                  className="mt-1 max-h-40 overflow-y-auto text-[10px] text-text-muted/80"
                  data-testid="dead-url-list"
                >
                  {opStatus.prune.deadUrlSample.map((entry) => (
                    <li key={entry.eventId} className="flex items-baseline gap-2 py-0.5">
                      <span className="font-mono text-text-muted/60">{entry.status}</span>
                      <span className="truncate font-mono text-text-muted/40">{entry.eventId}</span>
                      {/* Phase 44 WR-04 — url is string | null; null renders nothing. */}
                      <span className="truncate text-text-muted/70" title={entry.url ?? undefined}>
                        {entry.url}
                      </span>
                    </li>
                  ))}
                  {opStatus.prune.deadUrlCount > opStatus.prune.deadUrlSample.length && (
                    <li
                      className="py-0.5 italic text-text-muted/40"
                      data-testid="dead-url-list-truncated"
                    >
                      … and {opStatus.prune.deadUrlCount - opStatus.prune.deadUrlSample.length} more
                    </li>
                  )}
                </ul>
              )}
              {/* Phase 40 (D-02a) — the Prune button relocated into the
                operator-controls drawer below. The dead-URL count + drill-down
                list stay here (read-only); only the destructive button moves. */}
            </>
          )}

          {/* Phase 33 D-17 — Actor Quality sub-block. Read-only counters +
            drill-down sample. Mounted between the Phase 32 prune block close
            (above) and the pruneQuotaAlert (below) per UI-SPEC §"DOM Mount
            Point". Render gate `opStatus?.actorQuality != null` silently
            skips when a pre-Phase-33 server deploy doesn't carry the field
            (matches Phase 32 D-10 forward-compat). Color tokens come from
            existing @theme CSS vars only — zero new tokens per UI-SPEC
            §Color (D-13 single-source-of-truth contract preserved). */}
          {opStatus?.actorQuality != null && opStatus.actorQuality.totalEvents > 0 && (
            <>
              <div
                className="mt-1 text-[10px] text-text-muted"
                data-testid="actor-quality-row"
                aria-label={`Actor quality counters: ${opStatus.actorQuality.nullActors} null actors, ${opStatus.actorQuality.rawCameoActors} raw CAMEO codes, ${opStatus.actorQuality.ambiguousActors} ambiguous strings, ${opStatus.actorQuality.lowConfidenceActors} low confidence`}
              >
                Actor quality: Null: {opStatus.actorQuality.nullActors} · Raw-CAMEO:{' '}
                {opStatus.actorQuality.rawCameoActors} · Ambiguous:{' '}
                {opStatus.actorQuality.ambiguousActors} · Low-confidence:{' '}
                {opStatus.actorQuality.lowConfidenceActors}
              </div>
              {opStatus.actorQuality.sample.length > 0 && (
                <ul
                  className="mt-1 max-h-40 overflow-y-auto text-[10px] text-text-muted/80"
                  data-testid="actor-quality-list"
                  aria-label="Actor quality drill-down sample (up to 20 events)"
                >
                  {opStatus.actorQuality.sample.map((entry) => {
                    const issueColor =
                      entry.issue === 'null'
                        ? 'text-text-muted/60'
                        : entry.issue === 'raw-cameo' || entry.issue === 'ambiguous'
                          ? 'text-[color:var(--color-faction-disputed)]'
                          : 'text-[color:var(--color-event-other)]';
                    return (
                      <li
                        key={entry.eventId}
                        className="flex items-baseline gap-2 py-0.5"
                        data-testid={`actor-quality-row-${entry.eventId}`}
                      >
                        <span className={`font-mono ${issueColor}`}>{entry.issue}</span>
                        <span className="truncate font-mono text-text-muted/40">
                          {entry.eventId}
                        </span>
                        <span className="truncate text-text-muted/70">
                          {entry.actors.join(', ')}
                        </span>
                      </li>
                    );
                  })}
                  {opStatus.actorQuality.sample.length === 20 && (
                    <li
                      className="py-0.5 italic text-text-muted/40"
                      data-testid="actor-quality-list-truncated"
                    >
                      … and more
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
          {opStatus?.actorQuality != null && opStatus.actorQuality.totalEvents === 0 && (
            <div className="mt-1" data-testid="actor-quality-empty">
              <MutedPlaceholder testid="actor-quality-placeholder" reason="no actor data" />
            </div>
          )}

          {/* Phase 32 Plan 05 — 429 prune-quota alert. Mirrors the existing
            replay-quota-alert above. px-2 py-1 spacing — multiples of 4. */}
          {pruneQuotaAlert && (
            <div
              className="mt-2 mb-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-400"
              data-testid="prune-quota-alert"
            >
              Prune quota reached: 50 of 50 in last 24h. Resets at {pruneQuotaAlert.resetsAt}.
            </div>
          )}

          {/* Phase 40 (D-01/D-02a) — operator-controls drawer trigger at the
            foot of Group 4. Noun-label "Operator Controls" + action-verb
            aria-label for assistive tech. */}
          <div className="mt-4">
            <button
              type="button"
              data-testid="operator-drawer-trigger"
              aria-expanded={isOperatorDrawerOpen}
              aria-controls="operator-drawer"
              aria-label="Open operator controls"
              onClick={toggleOperatorDrawer}
              className="rounded-md border border-white/10 px-2 py-1 text-[10px] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black"
            >
              Operator Controls
            </button>
          </div>

          {/* Phase 40 (D-01/D-02a) — operator-controls DRAWER. Rendered ONLY when
            open so the destructive Replay + Prune buttons are NOT in the
            document until the operator opens it (Regression-Lock assertion 5).
            Scoped Escape closes the drawer and stopPropagation prevents the
            modal's capture-phase Escape (DevApiStatus header :322) from closing
            the whole modal. */}
          {isOperatorDrawerOpen && (
            <div
              id="operator-drawer"
              data-testid="operator-drawer"
              role="region"
              aria-label="Operator controls"
              className="animate-slide-in-right mt-2 rounded-md border border-white/10 bg-black/40 p-4"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setOperatorDrawerOpen(false);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                  Operator Controls
                </span>
                <button
                  type="button"
                  aria-label="Close operator controls"
                  onClick={() => setOperatorDrawerOpen(false)}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60"
                >
                  Close
                </button>
              </div>

              {/* Replay probe — relocated from operator-actions (:1617). Issues
                a /api/events/llm-replay/test probe; never writes to
                events:llm:v3 (server-side dual-gate). */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => void replayProbe()}
                  className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60"
                  data-testid="replay-test-trigger"
                >
                  Run replay probe
                </button>
                <div className="mt-1 text-[10px] text-white/40">
                  Probes the 50/24h replay quota without writing to the event cache.
                </div>
                {replayResult && (
                  <div
                    data-testid="replay-probe-result"
                    role="status"
                    className="mt-1 text-[10px] text-white/70"
                  >
                    {replayResult}
                  </div>
                )}
              </div>

              {/* Prune button — relocated from operator-actions (:1666). Keeps
                its dynamic label + a destructive caption. Its read-only count +
                drill-down list stay in Group 4. */}
              {opStatus?.prune != null && opStatus.prune.deadUrlCount > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void pruneHandler()}
                    className="rounded-md border border-accent-red/40 px-2 py-1 text-xs text-red-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60"
                    data-testid="prune-dead-urls-trigger"
                  >
                    Prune {opStatus.prune.deadUrlCount} dead events
                  </button>
                  <div className="mt-1 text-[10px] text-white/40">
                    Permanently removes events whose primary source URL is dead.
                  </div>
                </div>
              )}

              {/* Phase 44 — prune result lives OUTSIDE the deadUrlCount>0 gate so
                it survives the button vanishing when a successful prune drops the
                count to 0. */}
              {pruneResult && (
                <div
                  data-testid="prune-dead-urls-result"
                  role="status"
                  className="mt-2 text-[10px] text-white/70"
                >
                  {pruneResult}
                </div>
              )}
            </div>
          )}
        </section>
      </CollapsibleGroup>

      {/* Phase 29 Plan 08 D-02 part D — confirm modal removed. The
          pipeline-version pin UI surface is gone now that the underlying
          POST /api/events/llm-pipeline route was deleted in Plan 04. */}
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
/**
 * Phase 45 Plan 03 — progressive-disclosure drill-down (DASH-READ-02).
 *
 * Replicates the `FlightRecorderBlock` run→detail idiom exactly:
 *   - clickable summary row (`flex cursor-pointer items-center gap-2 rounded
 *     px-1 py-0.5 hover:bg-white/5`) with a `▸/▾` caret,
 *   - local transient `useState` expansion (NOT uiStore/localStorage),
 *   - inline L2 expansion with the `mt-1 ml-2 border-l border-white/10 pl-2`
 *     indent.
 *
 * Standard WAI-ARIA disclosure: `aria-expanded` on the trigger flips on toggle,
 * `aria-controls` points at the panel id. Lives entirely INSIDE the existing
 * `role="tabpanel"` container — adds no tablist/tab-id DOM (DASH-READ-04 freeze).
 * Color from the white/N ramp only — no inline hex (DASH-READ-03).
 */
function DisclosureSection({
  title,
  panelId,
  defaultOpen = false,
  testid,
  children,
}: {
  title: string;
  panelId: string;
  defaultOpen?: boolean;
  testid?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={testid}
        className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5 focus-visible:ring focus-visible:ring-white/20"
      >
        <span className="text-white/40">{open ? '▾' : '▸'}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          {title}
        </span>
      </button>
      {open && (
        <div id={panelId} className="mt-1 ml-2 border-l border-white/10 pl-2">
          {children}
        </div>
      )}
    </div>
  );
}

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
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Water Filters
        </span>
        <div className="mt-0.5 text-[9px] italic text-white/30">loading filter stats…</div>
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

  // Phase 45 Plan 03 (DASH-READ-01) — summed rejection buckets as a labeled
  // Reason|Count table. Reason labels are human-readable; the underlying
  // bucket keys are preserved as data-testid suffixes for the render pins.
  const r = filterStats.rejections;
  const rejectionRows: { key: string; label: string; count: number }[] = [
    { key: 'excluded_location', label: 'Excluded location', count: r.excluded_location },
    { key: 'excluded_turkey', label: 'Excluded turkey', count: r.excluded_turkey },
    { key: 'not_notable', label: 'Not notable', count: r.not_notable },
    { key: 'no_name', label: 'No name', count: r.no_name },
    { key: 'no_resolved_name', label: 'No resolved name', count: r.no_resolved_name },
    { key: 'duplicate', label: 'Duplicate', count: r.duplicate },
    { key: 'low_score', label: 'Low score', count: r.low_score },
    { key: 'no_city', label: 'No city', count: r.no_city },
  ];
  const totalRejected = rejectionRows.reduce((a, b) => a + b.count, 0);

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
        Water Filters
      </span>

      {/* Phase 27.3.1 R-08 D-30 — provenance header (strings verbatim, re-toned) */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-semibold text-white/40">Source:</span> {filterStats.source} ·{' '}
        <span className="font-semibold text-white/40">Generated:</span>{' '}
        {relativeTime(filterStats.generatedAt)}
      </div>

      {/* Phase 45 Plan 03 — primary metric: kept % at 13px/600 (one per block) */}
      <div
        className="mt-0.5 text-[13px] font-semibold tabular-nums text-white/80"
        data-testid="water-primary-metric"
      >
        {keepPct}%
      </div>

      {/* Raw vs filtered summary (verbatim) */}
      <div className="mt-0.5 text-[9px] text-white/60">
        {totalRaw} raw → {totalKept} kept ({keepPct}%)
      </div>

      {/* Per-type breakdown — MetricRow Reason|Count (may default open) */}
      <div className="mt-0.5 flex flex-col gap-0.5">
        {typeKeys.map((type) => (
          <MetricRow
            key={type}
            label={type}
            value={`${filterStats.filteredCounts[type] ?? 0} / ${filterStats.rawCounts[type] ?? 0}`}
            data-testid={`water-type-${type}`}
          />
        ))}
      </div>

      {/* Phase 45 Plan 03 — rejection breakdown behind progressive disclosure */}
      <DisclosureSection
        title="Rejections by Type"
        panelId="water-rejections-panel"
        testid="water-rejections-toggle"
      >
        <MetricRow label="Total rejections" value={totalRejected} emphasized />
        {rejectionRows.map((row) => (
          <MetricRow
            key={row.key}
            label={row.label}
            value={row.count}
            data-testid={`water-rejection-${row.key}`}
          />
        ))}
        {Object.entries(filterStats.byTypeRejections).map(([type, buckets]) => (
          <div key={type} className="mt-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
              {type}
            </div>
            <MetricRow label="Excluded location" value={buckets.excluded_location} />
            <MetricRow label="Excluded turkey" value={buckets.excluded_turkey} />
            <MetricRow label="Not notable" value={buckets.not_notable} />
            <MetricRow label="No name" value={buckets.no_name} />
            <MetricRow label="No resolved name" value={buckets.no_resolved_name} />
            <MetricRow label="Duplicate" value={buckets.duplicate} />
            <MetricRow label="Low score" value={buckets.low_score} />
            <MetricRow label="No city" value={buckets.no_city} />
          </div>
        ))}
      </DisclosureSection>

      {/* Phase 27.3.1 R-08 D-28 — per-country admission behind disclosure */}
      {byCountrySorted.length > 0 && (
        <DisclosureSection
          title="By Country"
          panelId="water-country-panel"
          testid="water-country-toggle"
        >
          {byCountrySorted.map(([country, perType]) => (
            <MetricRow
              key={country}
              label={country}
              value={Object.entries(perType)
                .map(([t, n]) => `${t}=${n}`)
                .join(' ')}
            />
          ))}
        </DisclosureSection>
      )}

      {/* Enrichment coverage */}
      <div className="mt-0.5 flex flex-col gap-0.5">
        <MetricRow label="Enriched · capacity" value={filterStats.enrichment.withCapacity} />
        <MetricRow label="Enriched · city" value={filterStats.enrichment.withCity} />
        <MetricRow label="Enriched · river" value={filterStats.enrichment.withRiver} />
      </div>

      {/* Phase 27.3.1 R-08 D-29 — Overpass health rows */}
      {filterStats.overpass.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
        <span className="font-semibold text-white/40">Scores:</span>{' '}
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
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Sites Filters
        </span>
        <div className="mt-0.5 text-[9px] italic text-white/30">loading filter stats…</div>
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

  // Phase 45 Plan 03 (DASH-READ-01) — 4-bucket rejection register as a labeled
  // Reason|Count table. Honors the documented water/sites asymmetry: sites has
  // exactly 4 buckets (no per-type split, no invented buckets — see JSDoc above).
  const sr = filterStats.rejections;
  const rejectionRows: { key: string; label: string; count: number }[] = [
    { key: 'excluded_turkey', label: 'Excluded turkey', count: sr.excluded_turkey },
    { key: 'no_coords', label: 'No coords', count: sr.no_coords },
    { key: 'no_type', label: 'No type', count: sr.no_type },
    { key: 'duplicate', label: 'Duplicate', count: sr.duplicate },
  ];
  const totalRejected = rejectionRows.reduce((a, b) => a + b.count, 0);

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
        Sites Filters
      </span>

      {/* Phase 27.3.1 R-05 D-30 parity — provenance header (strings verbatim, re-toned) */}
      <div className="mt-0.5 text-[9px] text-white/60">
        <span className="font-semibold text-white/40">Source:</span> {filterStats.source} ·{' '}
        <span className="font-semibold text-white/40">Generated:</span>{' '}
        {relativeTime(filterStats.generatedAt)}
      </div>

      {/* Phase 45 Plan 03 — primary metric: kept % at 13px/600 (one per block) */}
      <div
        className="mt-0.5 text-[13px] font-semibold tabular-nums text-white/80"
        data-testid="sites-primary-metric"
      >
        {keepPct}%
      </div>

      {/* Raw vs filtered summary (verbatim) */}
      <div className="mt-0.5 text-[9px] text-white/60">
        {filterStats.rawCount} raw → {filterStats.filteredCount} kept ({keepPct}%)
      </div>

      {/* Per-type breakdown — MetricRow (may default open) */}
      {typeEntries.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
            By Type
          </div>
          <div className="mt-0.5 flex flex-col gap-0.5">
            {typeEntries.map(([type, count]) => (
              <MetricRow key={type} label={type} value={count} data-testid={`sites-type-${type}`} />
            ))}
          </div>
        </>
      )}

      {/* Phase 45 Plan 03 — rejection breakdown behind progressive disclosure */}
      <DisclosureSection
        title="Rejections"
        panelId="sites-rejections-panel"
        testid="sites-rejections-toggle"
      >
        <MetricRow label="Total rejections" value={totalRejected} emphasized />
        {rejectionRows.map((row) => (
          <MetricRow
            key={row.key}
            label={row.label}
            value={row.count}
            data-testid={`sites-rejection-${row.key}`}
          />
        ))}
      </DisclosureSection>

      {/* Phase 27.3.1 R-05 D-28 parity — per-country admission behind disclosure */}
      {byCountrySorted.length > 0 && (
        <DisclosureSection
          title="By Country"
          panelId="sites-country-panel"
          testid="sites-country-toggle"
        >
          {byCountrySorted.map(([country, perType]) => (
            <MetricRow
              key={country}
              label={country}
              value={Object.entries(perType)
                .map(([t, n]) => `${t}=${n}`)
                .join(' ')}
            />
          ))}
        </DisclosureSection>
      )}

      {/* Phase 27.3.1 R-05 D-29 parity — Overpass health rows */}
      {filterStats.overpass.length > 0 && (
        <>
          <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
              {/* Phase 44 WR-06 — sources are LLM-extracted article URLs
                  (externally influenceable). Only render an anchor for
                  http/https schemes; anything else (javascript:, data:, …)
                  renders as inert text instead of a clickable href. */}
              {ev.sources.slice(0, 5).map((u, i) =>
                /^https?:\/\//i.test(u) ? (
                  <a
                    key={u + i}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    [{i + 1}]
                  </a>
                ) : (
                  <span key={u + i} className="text-white/40">
                    [{i + 1}]
                  </span>
                ),
              )}
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
        className="text-[9px] font-semibold uppercase tracking-wider text-white/40 hover:text-white/80"
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          LLM Call Log (0)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No LLM calls yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
  const actorMatchPct =
    typeof evalScore.actorMatchRate === 'number'
      ? Math.round(evalScore.actorMatchRate * 100)
      : null;
  return (
    <div className="mt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
      {actorMatchPct !== null && (
        <div className="mt-0.5 text-[9px] text-white/60" data-testid="eval-actor-match-rate">
          Actor match (Phase 33 ACTOR-04):{' '}
          <span className="text-white/80 tabular-nums">{actorMatchPct}%</span>
        </div>
      )}
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
      <div className="text-[9px] font-semibold uppercase tracking-wider text-red-400">
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
      <span className="font-semibold uppercase tracking-wider text-white/40">Suspect events: </span>
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Routing Trace (last 50)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No routing decisions yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Latency (P50/P95/P99)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No LLM calls yet.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
            <LatencySparkline points={stats.sparkline} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Phase 27.4.3 D-12 §2 — LLM-latency sparkline helper. Inline SVG polyline; min 2 points.
 * Caller decides container height; this scales 0..max → full height.
 * Renamed from `Sparkline` in Phase 45-04 to avoid colliding with the imported
 * `Sparkline` readability atom (src/components/ui/Sparkline.tsx). This local helper
 * stays dedicated to the LLM Latency (P50/P95/P99) widget and keeps its exact look.
 */
function LatencySparkline({ points }: { points: number[] }) {
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Rate-Limit Headroom
        </div>
        <div className="mt-1 text-[9px] text-white/40">No requests this window.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Schema-Strict Failure Rate
        </div>
        <div className="mt-1 text-[9px] text-white/40">No schema rejections.</div>
      </div>
    );
  }
  const totalCalls = (callHistory ?? []).length;
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          Error Taxonomy (today UTC)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No errors today.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
        <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
          v3 Cost Shadow (last 24h)
        </div>
        <div className="mt-1 text-[9px] text-white/40">No tokens billed this window.</div>
      </div>
    );
  }
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
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
 * Phase 44 (D-09/D-10) — module-level mirror of the local `OperatorStatus.prune`
 * shape (which lives inside the DevApiStatus component closure and is therefore
 * unreachable from module-scope block components). Structurally compatible with
 * the local interface, so threading `opStatus?.prune ?? null` type-checks. All
 * fields except the two authoritative totals are optional forward-compat
 * (Phase 32 D-10): older servers pre-dating the Plan 01 D-01 extension omit
 * `countsByStatus` / `evidence` / `lastProbedAt` / `attemptCount`.
 */
type PruneSummary = {
  deadUrlCount: number;
  last24hPrunes: number;
  countsByStatus?: Record<string, number>;
  deadUrlSample: Array<{
    eventId: string;
    status: 'dead-host' | '403' | '404' | 'soft-404';
    // Phase 44 WR-04 — nullable in lockstep with the server's
    // DeadUrlSampleEntry.url (string | null, Phase 43 D-07/CR-01).
    url: string | null;
    evidence?: string | null;
    lastProbedAt?: string;
    attemptCount?: number;
  }>;
};

/**
 * Phase 45 DASH-READ-05 (CONTEXT D-01) — one daily trend sample mirrored from
 * the server's `server/lib/trendHistory.ts` TrendSample shape. Backs the four
 * dashboard trend sparklines (cron freshness ×3 + dead-link count). `cronAgeMs`
 * is the per-cron freshness age (ms) at sample time; `null` means the cron's
 * lastTick key was absent (degrade-open — a stalled cron reads as null/stale,
 * NOT a fabricated 0).
 *
 * Interface/type ONLY at this point (Phase 45 Plan 01 contract lockstep) — the
 * sparkline mount that consumes it is Plan 04. Forward-compat per Phase 32 D-10.
 */
type TrendSample = {
  sampledAt: string;
  cronAgeMs: {
    health: number | null;
    warm: number | null;
    'refresh-events': number | null;
  };
  deadUrlCount: number;
};

/**
 * Phase 46 HARD-01 (46-04) — per-tier rate-limiter telemetry mirrored from the
 * 46-01 server block (`server/routes/operator-status.ts` RateLimiterBlock). The
 * field names are byte-identical to the server shape pinned by
 * `operator-status.test.ts`: each tier carries its `max`/`windowSec` limit
 * config (from `RATE_LIMITER_CONFIG`) + a `recent429` count (today + yesterday
 * UTC-dated `ratelimit:429:{tier}:{date}` sidecars, coerced `Number(raw) || 0`).
 * Forward-compat optional on `OperatorStatus` (Phase 32 D-10) — `null` on the
 * server's per-block degrade-open.
 */
type RateLimiterBlock = {
  tiers: Array<{
    tier: string;
    max: number;
    windowSec: number;
    recent429: number;
  }>;
};

/**
 * Phase 44 (D-09 / EVENTS-TAB-02) — per-liveness-status dead-link state for the
 * events subtab. Follows the verbatim DlqBlock/SuspectBlock block idiom (D-13):
 * `text-[9px]`, `font-semibold uppercase tracking-wider text-white/40` header,
 * `tabular-nums`, `max-h-32 overflow-y-auto` scroll list. Threaded the already-
 * fetched `opStatus.prune` down as a prop (D-10) — NO second fetch.
 *
 * Honest-signal contract (load-bearing):
 *   - `deadUrlCount` (sidecar) is the AUTHORITATIVE terminal-dead total (D-03).
 *   - `countsByStatus` is a SAMPLED tally (≤MAX_SCAN_KEYS=200) — labeled
 *     "of N scanned", NEVER presented as authoritative (D-03).
 *   - `evidence` renders as a PLAIN TEXT React node (default-escaped) — never
 *     via raw-HTML injection (D-11 / T-43-16). Server caps it at ≤200 chars.
 *   - `attemptCount` is the dead-streak depth ("dead ×N consecutive sweeps"),
 *     the honest transition proxy — NOT a true first-seen-dead timestamp (D-02).
 */
const DEAD_LINK_STATUS_COLORS: Record<string, string> = {
  live: 'text-green-300',
  unknown: 'text-amber-300',
  'no-url': 'text-white/40',
  '404': 'text-red-300',
  '403': 'text-red-300',
  'dead-host': 'text-red-300',
  'soft-404': 'text-red-300',
};

function DeadLinkBucketsBlock({ prune }: { prune: PruneSummary }) {
  const buckets = Object.entries(prune.countsByStatus ?? {}).sort((a, b) => b[1] - a[1]);
  const scannedTotal = buckets.reduce((s, [, n]) => s + n, 0);
  const sample = prune.deadUrlSample ?? [];
  return (
    <div className="mt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
        Dead Links
      </div>
      {/* Authoritative total (sidecar) — NOT the summed buckets (D-03). */}
      <div className="mt-1 text-[9px] text-white/60" data-testid="dead-link-authoritative-total">
        Dead URL events: <span className="tabular-nums text-white/80">{prune.deadUrlCount}</span>
        {' · '}pruned <span className="tabular-nums text-white/80">{prune.last24hPrunes}</span> in
        24h
      </div>
      {/* Phase 44 WR-05 — buckets + sample gate on their OWN data presence,
          NOT the deadUrlCount sidecar. The sidecar has a documented
          underflow-to-0 mode (T-32-11); gating scan evidence on it would
          mask the only signal that the sidecar has drifted. A count/sample
          disagreement is now visible instead of hidden (matches the sibling
          API-Health list, which gates on deadUrlSample.length). The
          authoritative-total line above stays sidecar-sourced (D-03). */}
      {/* Per-status SAMPLED buckets — "of N scanned" caveat (D-03). */}
      {buckets.length > 0 && (
        <div className="mt-1" data-testid="dead-link-buckets">
          {buckets.map(([status, n]) => (
            <div
              key={status}
              className="flex items-center gap-1 text-[9px]"
              data-testid={`dead-link-bucket-${status}`}
            >
              <span
                className={`rounded px-1 text-[9px] font-semibold uppercase tracking-wider ${
                  DEAD_LINK_STATUS_COLORS[status] ?? 'text-white/60'
                }`}
              >
                {status}
              </span>
              <span className="tabular-nums text-white/80">{n}</span>
              <span className="ml-auto text-white/30">of {scannedTotal} scanned</span>
            </div>
          ))}
        </div>
      )}
      {/* Drill-down sample rows (≤20) — evidence as TEXT (D-11), relative
          lastProbedAt + dead-streak attemptCount (D-02). */}
      {sample.length > 0 && (
        <div className="mt-1 max-h-32 overflow-y-auto" data-testid="dead-link-sample">
          {sample.map((entry) => (
            <div key={entry.eventId} className="flex items-center gap-1 text-[9px] text-white/60">
              <span
                className={`rounded px-1 text-[9px] font-semibold uppercase tracking-wider ${
                  DEAD_LINK_STATUS_COLORS[entry.status] ?? 'text-white/60'
                }`}
              >
                {entry.status}
              </span>
              {/* Phase 44 WR-04 — url is string | null; null renders nothing. */}
              <span className="truncate text-white/70" title={entry.url ?? undefined}>
                {entry.url}
              </span>
              {entry.evidence ? (
                <span className="truncate text-white/40">{entry.evidence}</span>
              ) : null}
              {typeof entry.attemptCount === 'number' && (
                <span className="tabular-nums text-white/40">dead ×{entry.attemptCount}</span>
              )}
              {entry.lastProbedAt ? (
                <span className="ml-auto tabular-nums text-white/30">
                  {relativeTime(entry.lastProbedAt)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 45 DASH-READ-05 (Plan 04, CONTEXT D-02/D-04/D-05) — the four trend wells
 * for the events subtab. Reads the Plan-01 `dashboard:trends:history` ring threaded
 * down as `trendHistory` (newest-first, ≤30 daily samples) — NO new fetch. Renders
 * 4 labeled wells: 3 per-cron freshness (health / warm / refresh-events) + 1
 * dead-link count, each with the CURRENT value as a 13px/600 primary metric (left)
 * beside a Plan-02 `<Sparkline>` (right).
 *
 * Degrade-open (T-45-10):
 *   - `trendHistory` null/absent/empty → the whole block self-hides (no fabricated
 *     zeros, no false-healthy flatline).
 *   - A series with < 2 points → the Sparkline returns null and the well shows only
 *     the bare current value.
 *
 * Series orientation: trendHistory is newest-first; Sparkline expects oldest→newest,
 * so each derived series is reversed.
 *
 * Degradation thresholds for the D-05 semantic last-point tint (CONTEXT discretion,
 * recorded in the Plan-04 SUMMARY):
 *   - Cron freshness: stale when the latest age > 30h (108_000_000 ms) — every cron
 *     is daily (health 0 0, warm 0 12, refresh-events 0 4), so 24h schedule + 6h
 *     grace. A null age (cron lastTick absent) is treated as 0 in the line (it cannot
 *     fabricate a healthy value — null reads as the floor, and the AGE metric beside
 *     it shows "—"); the tint is driven only by a real measured age crossing 30h.
 *   - Dead-link count: degraded when the latest sample is a NEW HIGH — threshold =
 *     the max of all prior points, thresholdDirection "above". A rising count past
 *     its prior peak tints the "now" point.
 *
 * Color discipline (DASH-READ-03): the tint resolves through the @theme token
 * `var(--color-status-degraded)` (the Sparkline default) — zero inline hex.
 */
const CRON_STALE_MS = 108_000_000; // 30h = daily 24h schedule + 6h grace.

function formatCronAge(ms: number | null): string {
  if (ms == null) return '—';
  const h = ms / 3_600_000;
  if (h >= 1) return `${h.toFixed(1)}h`;
  const m = ms / 60_000;
  return `${Math.round(m)}m`;
}

function TrendWell({
  label,
  series,
  currentDisplay,
  threshold,
  thresholdDirection,
  forceDegraded,
  testid,
}: {
  label: string;
  series: number[];
  currentDisplay: string;
  threshold?: number;
  thresholdDirection?: 'above' | 'below';
  forceDegraded?: boolean;
  testid: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testid}>
      <span className="text-[9px] uppercase tracking-wider text-white/40">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="text-[13px] font-semibold tabular-nums text-white/80"
          data-testid={`${testid}-value`}
        >
          {currentDisplay}
        </span>
        <div className="min-w-0 flex-1">
          <Sparkline
            points={series}
            threshold={threshold}
            thresholdDirection={thresholdDirection}
            forceDegraded={forceDegraded}
            data-testid={`${testid}-spark`}
          />
        </div>
      </div>
    </div>
  );
}

function TrendBlock({ trendHistory }: { trendHistory?: TrendSample[] | null }) {
  // Degrade-open: self-hide when the ring is absent/empty (no fabricated zeros).
  if (trendHistory == null || trendHistory.length === 0) return null;

  // Ring is newest-first; Sparkline wants oldest→newest.
  const chrono = [...trendHistory].reverse();
  const latest = trendHistory[0];

  // Per-cron freshness series (null age → 0 in the line; the AGE metric shows "—").
  const cronSeries = (name: 'health' | 'warm' | 'refresh-events'): number[] =>
    chrono.map((s) => s.cronAgeMs[name] ?? 0);
  const deadSeries = chrono.map((s) => s.deadUrlCount);

  // WR-01: a `null` latest cron age means the cron's lastTick key was absent —
  // the cron is dead/never-ran, the single MOST degraded state. The series maps
  // that null to the `0` floor (freshest-looking), so the numeric threshold can
  // never fire. Force the marker into the degraded tint when the latest age is
  // null so a dead cron reads as degraded at a glance (the AGE text already
  // shows "—"). Driven off the latest sample, not distorting the auto-scale.
  const cronLatestNull = (name: 'health' | 'warm' | 'refresh-events'): boolean =>
    latest.cronAgeMs[name] == null;

  // Dead-link tint threshold: a NEW HIGH past the prior peak (rising = degraded).
  const priorDead = deadSeries.slice(0, -1);
  const deadThreshold = priorDead.length > 0 ? Math.max(...priorDead) : undefined;

  return (
    <div className="mt-2 border-t border-white/10 pt-2" data-testid="events-trend-block">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Trends</div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <TrendWell
          label="CRON · HEALTH"
          series={cronSeries('health')}
          currentDisplay={formatCronAge(latest.cronAgeMs.health)}
          threshold={CRON_STALE_MS}
          thresholdDirection="above"
          forceDegraded={cronLatestNull('health')}
          testid="trend-cron-health"
        />
        <TrendWell
          label="CRON · WARM"
          series={cronSeries('warm')}
          currentDisplay={formatCronAge(latest.cronAgeMs.warm)}
          threshold={CRON_STALE_MS}
          thresholdDirection="above"
          forceDegraded={cronLatestNull('warm')}
          testid="trend-cron-warm"
        />
        <TrendWell
          label="CRON · REFRESH"
          series={cronSeries('refresh-events')}
          currentDisplay={formatCronAge(latest.cronAgeMs['refresh-events'])}
          threshold={CRON_STALE_MS}
          thresholdDirection="above"
          forceDegraded={cronLatestNull('refresh-events')}
          testid="trend-cron-refresh"
        />
        <TrendWell
          label="DEAD LINKS · 30d"
          series={deadSeries}
          currentDisplay={String(latest.deadUrlCount)}
          threshold={deadThreshold}
          thresholdDirection="above"
          testid="trend-dead-links"
        />
      </div>
    </div>
  );
}

/**
 * Phase 27.4.3 Plan 04 — sibling of EventsFiltersSection, gated on
 * schemaVersion === 'v3' && import.meta.env.DEV by the parent render switch.
 * Renders the 7-block v3 observability stack per UI-SPEC §"Component
 * Inventory" + §"Render switch".
 *
 * Block order (per UI-SPEC §"Section headers" lines 169-180):
 *   1. Routing Trace (D-12 §1)
 *   2. Latency P50/P95/P99 (D-12 §2)
 *   3. Rate-Limit Headroom (D-12 §3)
 *   4. Schema-Strict Failure Rate (D-12 §4)
 *   5. Error Taxonomy (D-14)
 *   6. v3 Cost Shadow (D-19)
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
function EventsFiltersSectionV3({
  llmStatus,
  prune,
  trendHistory,
}: {
  llmStatus: LLMStatus;
  prune?: PruneSummary | null;
  // Phase 45 DASH-READ-05 (Plan 04) — the already-fetched dashboard:trends:history
  // ring, threaded from the parent operator-status fetch (no new fetch). Feeds the
  // four trend wells; self-hides when absent (degrade-open / forward-compat).
  trendHistory?: TrendSample[] | null;
}) {
  return (
    <section className="mt-2 border-t border-white/10 pt-2">
      <div className="text-[9px] text-white/60">
        Schema: v3 · Stage: {llmStatus.stage ?? 'idle'}
      </div>
      {/* Phase 45 DASH-READ-05 — trend half: 4 sparkline wells (cron freshness ×3
          + dead-link count) read from opStatus.trendHistory. Self-hides when the
          ring is absent. Sits at the top of the dense block stack so the operator
          sees slow-burn trends before drilling into point-in-time blocks. */}
      <TrendBlock trendHistory={trendHistory} />
      <RoutingTraceBlock trace={llmStatus.routingTrace} />
      <LatencyHistogramBlock latency={llmStatus.latency} />
      <RateLimitHeadroomBlock rateLimit={llmStatus.rateLimit} />
      <SchemaStrictFailureBlock
        schemaFailures={llmStatus.schemaFailures}
        callHistory={llmStatus.callHistory}
      />
      <ErrorTaxonomyBlock taxonomy={llmStatus.errorTaxonomy} />
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

      {/* Phase 44 (EVENTS-TAB-01, D-05) — the 7 v2-era LLM-pipeline blocks,
          mounted PRESENCE-GATED into the production V3 path. The gate lives
          here (not in the block bodies, which declare NonNullable props)
          because each block self-hides when its LLMStatus field is absent —
          NEVER fabricate the legacy composer's `{cerebras:0, groq:0}` /
          `'ok'` zero-defaults (the D-05/D-06 anti-pattern). Under NIM-only,
          `BudgetBarsBlock` self-hides — that is the correct, honest outcome
          (D-06), not a defect. The live token-budget surface is Phase 39's
          `BudgetBlock` in the API-Health tab. WaterfallBlock self-`?? 0`-
          guards every field, so it is render-safe; gated on `stage !== 'idle'`
          for honesty so an idle pipeline doesn't show a zeroed waterfall. */}
      {llmStatus.stage !== 'idle' && <WaterfallBlock llmStatus={llmStatus} />}
      {llmStatus.callHistory && llmStatus.callHistory.length > 0 && (
        <HistogramsBlock
          provenanceCounts={llmStatus.provenanceCounts ?? {}}
          callHistory={llmStatus.callHistory}
        />
      )}
      {llmStatus.callHistory && <CallLogBlock callHistory={llmStatus.callHistory} />}
      {llmStatus.tokenCounters && llmStatus.breakerState && (
        <BudgetBarsBlock
          tokenCounters={llmStatus.tokenCounters}
          breakerState={llmStatus.breakerState}
        />
      )}
      {llmStatus.evalScore && <EvalScoreBlock evalScore={llmStatus.evalScore} />}
      {llmStatus.dlqRecent && <DlqBlock entries={llmStatus.dlqRecent} />}
      {typeof llmStatus.suspectCount === 'number' && (
        <SuspectBlock count={llmStatus.suspectCount} />
      )}

      {/* Phase 44 (D-08) — run-history visibility. FlightRecorderBlock is
          self-contained (own /api/events/llm-history fetch + 30s poll +
          degrade-open). The events tab and the API-Health tab are
          mutually-exclusive activeTab render branches, so this re-mount
          causes NO double fetch. */}
      <FlightRecorderBlock />

      {/* Phase 44 (EVENTS-TAB-02, D-09/D-10) — per-bucket dead-link state, fed
          by the already-fetched opStatus.prune threaded down as a prop. Self-
          hides when `prune` is absent (older server / fetch failure / missing
          Bearer) — degrade-open (D-10). */}
      {prune && <DeadLinkBucketsBlock prune={prune} />}
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
      <span className="font-semibold uppercase tracking-wider text-white/40">Prewarm (D-21)</span>
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
      <span className="font-semibold uppercase tracking-wider text-white/40">
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
      <span className="font-semibold uppercase tracking-wider text-white/40">
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
