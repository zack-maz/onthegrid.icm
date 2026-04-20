import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFlightStore } from '@/stores/flightStore';
import { useShipStore } from '@/stores/shipStore';
import { useEventStore } from '@/stores/eventStore';
import { useSiteStore } from '@/stores/siteStore';
import { useNewsStore } from '@/stores/newsStore';
import { useMarketStore } from '@/stores/marketStore';
import { useWeatherStore } from '@/stores/weatherStore';
import { useWaterStore } from '@/stores/waterStore';
import { useUIStore } from '@/stores/uiStore';
import { useLayerStore } from '@/stores/layerStore';
import { useFilterStore } from '@/stores/filterStore';
import { useLLMStatusPolling } from '@/hooks/useLLMStatusPolling';
import type { LLMStatus } from '@/hooks/useLLMStatusPolling';
import { effectiveStatus } from '@/lib/apiStatus';

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

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 flex-1 rounded-full bg-white/10">
        <div
          className="h-1 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: '#a78bfa' }}
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
    <div className="flex items-center gap-0.5">
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
          <div key={s} className="flex items-center gap-0.5">
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

/* ---------- Overview Tab (API table + LLM Pipeline, Plan 12 G6) ---------- */

function DevApiStatusOverviewTab({
  rows,
  llmStatus,
  expandedRow,
  setExpandedRow,
}: {
  rows: ApiRow[];
  llmStatus: LLMStatus;
  expandedRow: string | null;
  setExpandedRow: (s: string | null) => void;
}) {
  return (
    <>
      {/* Table */}
      <table className="w-full">
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
            const isExpanded = expandedRow === r.name;
            return (
              <tr
                key={r.name}
                className="cursor-pointer hover:bg-white/5"
                onClick={() => setExpandedRow(isExpanded ? null : r.name)}
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

      {/* Expanded error / quality detail */}
      {expandedRow &&
        (() => {
          const row = rows.find((r) => r.name === expandedRow);
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

      {/* LLM Pipeline Progress */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">
          LLM Pipeline
        </span>
        <div className="mt-0.5 text-[9px]">
          <LLMPipelineSection llmStatus={llmStatus} />
        </div>
      </div>
    </>
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

  // Phase 27.3.1 HUMAN-UAT Gap 1 — tab visibility gated on layer toggles.
  // Water tab only when the water visualization layer is active; Sites tab
  // only when the showSites filter toggle is on. Overview stays unconditional.
  const showWaterTab = useLayerStore((s) => s.activeLayers.has('water'));
  const showSitesTab = useFilterStore((s) => s.showSites);

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

  // If the currently active tab gets hidden because the user toggled off the
  // corresponding layer, snap back to Overview so the body does not render empty.
  useEffect(() => {
    if (activeTab === 'water' && !showWaterTab) setTab('overview');
    else if (activeTab === 'sites' && !showSitesTab) setTab('overview');
  }, [activeTab, showWaterTab, showSitesTab, setTab]);

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
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setTab('overview')}
              indicator={hasIssue ? 'red' : undefined}
              testid="tab-overview"
            >
              Overview
            </TabButton>
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
          {activeTab === 'overview' && (
            <DevApiStatusOverviewTab
              rows={rows}
              llmStatus={llmStatus}
              expandedRow={expandedRow}
              setExpandedRow={setExpandedRow}
            />
          )}
          {activeTab === 'water' && showWaterTab && <WaterFiltersSection />}
          {activeTab === 'sites' && showSitesTab && <SitesFiltersSection />}
        </div>
      </div>
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
        nn={filterStats.rejections.not_notable} nname={filterStats.rejections.no_name}{' '}
        nores={filterStats.rejections.no_resolved_name} dup=
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
