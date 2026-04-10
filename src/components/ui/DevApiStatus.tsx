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
import { useLLMStatusPolling } from '@/hooks/useLLMStatusPolling';
import type { LLMStatus } from '@/hooks/useLLMStatusPolling';

/** Stuck threshold: no update in 2 minutes while still 'loading' */
const STUCK_THRESHOLD_MS = 120_000;

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

function effectiveStatus(status: string, count: number, lastFetch: number | null): string {
  if (status === 'loading' && lastFetch && Date.now() - lastFetch > STUCK_THRESHOLD_MS)
    return 'stuck';
  if (status === 'loading' && !lastFetch) return 'init';
  if (status === 'connected' && count === 0) return 'empty';
  return status;
}

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

/* ---------- LLM Pipeline Section ---------- */

function LLMPipelineSection({ llmStatus }: { llmStatus: LLMStatus }) {
  const { stage } = llmStatus;

  if (stage === 'idle' && !llmStatus.lastRun) {
    return <span className="text-white/30">No LLM runs yet</span>;
  }

  if (stage === 'idle' && llmStatus.lastRun) {
    const lr = llmStatus.lastRun;
    return (
      <div className="space-y-0.5">
        <div className="text-white/50">
          Last run: {formatAge(lr.lastRun)} ago, {lr.enrichedCount} enriched, {lr.geocodeCount}{' '}
          geocoded
        </div>
        <div className="text-white/30">
          Duration: {formatDuration(lr.durationMs)}
          {lr.error ? <span className="ml-1 text-red-400">Error: {lr.error}</span> : null}
        </div>
      </div>
    );
  }

  const stageColors: Record<string, string> = {
    grouping: '#60a5fa',
    'llm-processing': '#a78bfa',
    geocoding: '#22c55e',
    done: '#22c55e',
    error: '#ef4444',
  };

  const stageLabels: Record<string, string> = {
    grouping: 'Grouping',
    'llm-processing': 'LLM Processing',
    geocoding: 'Geocoding',
    done: 'Done',
    error: 'Error',
  };

  if (stage === 'done') {
    return (
      <div className="space-y-0.5">
        <span style={{ color: stageColors[stage] }}>{stageLabels[stage]}</span>
        <span className="ml-1 text-white/40">
          {llmStatus.enrichedCount ?? 0} enriched in {formatDuration(llmStatus.durationMs)}
        </span>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="space-y-0.5">
        <span style={{ color: stageColors[stage] }}>{stageLabels[stage]}</span>
        {llmStatus.errorMessage ? (
          <span className="ml-1 text-red-400">{llmStatus.errorMessage}</span>
        ) : null}
      </div>
    );
  }

  // Active stages: grouping, llm-processing, geocoding
  return (
    <div className="space-y-0.5">
      <div>
        <span style={{ color: stageColors[stage] ?? '#60a5fa' }}>
          {stageLabels[stage] ?? stage}
        </span>
        <span className="ml-1 text-white/40">Elapsed: {formatElapsed(llmStatus.startedAt)}</span>
      </div>
      {stage === 'llm-processing' && (
        <div className="text-white/50">
          Batches: {llmStatus.completedBatches ?? 0}/{llmStatus.totalBatches ?? 0}
        </div>
      )}
      {stage === 'geocoding' && (
        <div className="text-white/50">
          Geocoding: {llmStatus.completedGeocodes ?? 0}/{llmStatus.totalGeocodes ?? 0}
        </div>
      )}
      {stage === 'grouping' && (
        <div className="text-white/50">
          Groups: {llmStatus.totalGroups ?? 0} total, {llmStatus.newGroups ?? 0} new
        </div>
      )}
    </div>
  );
}

/* ---------- Main Component ---------- */

/**
 * Dev-only API status overlay. Shows connection status, data counts,
 * response times, success rates, poll countdowns, error indicators,
 * data quality metrics, LLM pipeline progress, and copy diagnostics.
 * Only renders when import.meta.env.DEV is true.
 */
export function DevApiStatus() {
  // Tick every 2s to update ages and countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const [collapsed, setCollapsed] = useState(true);
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

  const water = useWaterStore(
    useShallow((s) => ({
      status: s.connectionStatus,
      count: s.facilities.length,
      lastFetch: null as number | null,
      lastError: s.lastError,
      nextPollAt: s.nextPollAt,
      recentFetches: s.recentFetches,
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
      ...water,
      isOneShot: true,
      quality: `${water.count} facilities`,
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

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-2 left-2 z-[9999] rounded px-2 py-1 font-mono text-[10px] text-white/70 hover:text-white"
        style={{ backgroundColor: hasIssue ? 'rgba(239,68,68,0.8)' : 'rgba(0,0,0,0.5)' }}
      >
        API {hasIssue ? '!' : '~'}
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-2 left-2 z-[9999] rounded-md border border-white/10 bg-black/85 p-2 font-mono text-[10px] text-white/80 backdrop-blur-sm"
      style={{ minWidth: 420 }}
    >
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          API Status
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void copyDiagnostics()}
            className="text-white/40 hover:text-white"
            title="Copy diagnostics JSON"
            data-testid="copy-diagnostics"
          >
            {copyFeedback ? (
              <span className="text-green-400">Copied!</span>
            ) : (
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
            )}
          </button>
          <button onClick={() => setCollapsed(true)} className="text-white/40 hover:text-white">
            x
          </button>
        </div>
      </div>

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
    </div>
  );
}
