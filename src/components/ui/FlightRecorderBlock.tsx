/**
 * Phase 39 Plan 05 Task 2 — FlightRecorderBlock (OBS-FLIGHT-04).
 *
 * Functional 3-level "scrub the flight recorder" drill-down for the operator
 * console (UI-SPEC §B). Mounts as a top-level section inside
 * `DevApiStatusAllApisTab`.
 *
 * Data: its OWN Bearer fetch of `GET /api/events/llm-history` (Plan 04) with
 * `dashboardAuthHeaders()`, on mount + the host 30s poll cadence. Degrade-open:
 * a non-200 / throw clears the data so the block hides entirely (mirrors the
 * host `fetchOpStatus` idiom).
 *
 * Three levels (local transient React state — mirrors the host expand-row
 * pattern, NOT persisted):
 *   L1 RUNS  — newest-first run list: outcome badge, runId + relative start,
 *              batch ProgressBar, token spend, eval score.
 *   L2 CALLS — selected run's calls (filtered by runId) + provenance / DLQ /
 *              watchdog one-line aggregate sub-strips.
 *   L3 CALL  — single call detail in the host copyable code-panel modal idiom.
 *
 * GA-1 deferrals (Phase 40): rich filters (outcome dropdown / date range),
 * polished prompt-copy niceties, final tab/subtab placement. Baseline only:
 * operator CAN read a single call's detail.
 *
 * Color discipline (CLAUDE.md + UI-SPEC §Color — HARD): ONLY `accent-{blue,red,
 * green,yellow}` + the `white/N` ramp. NO entity `--color-*` tokens.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { dashboardAuthHeaders } from '@/lib/dashboardAuth';

// ---------------------------------------------------------------------------
// Client render types — mirror the Plan-01 server shapes
// (`server/lib/llmProgress.ts` RunHistoryEntry / CallHistoryEntry). Kept local
// to the client bundle (the server module is not importable here); structural
// drift would surface as a render mismatch (threat T-39-05-T mitigation).
// ---------------------------------------------------------------------------

type RunOutcome =
  | 'running'
  | 'completed'
  | 'watchdog_aborted'
  | 'breaker_paused'
  | 'budget_hit'
  | 'error';

/**
 * Server eval shape (Phase 39 WR-05). Mirrors the resolver-accuracy harness
 * output `server/lib/llmEvalHarness.ts EvalScore` / `LLMPipelineProgress['evalScore']`:
 * cumulative accuracy buckets at 5/20/100 km plus the ground-truth `total`.
 * There is NO `.score` key — the prior client type (`{ score?: number }`) was a
 * fiction that never matched the wire contract, so the eval pill never rendered.
 * `number | null` legacy members are tolerated for forward/backward compat.
 */
interface ServerEvalScore {
  within5km: number;
  within20km: number;
  within100km: number;
  total: number;
  actorMatchRate?: number | null;
}

interface RunHistoryEntry {
  runId: string;
  startedAt: string;
  completedAt: string | null;
  outcome: RunOutcome;
  batchCount: number;
  batchesCompleted: number;
  batchesFailed: number;
  tokenSpend: { nvidia_nim: number };
  evalScore?: ServerEvalScore | number | null;
  dlqDelta: number;
  watchdogTimeouts: number;
  durationMs: number;
  pipelineVersion: 'v3';
}

interface CallHistoryEntry {
  provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  ok: boolean;
  batchSize: number;
  timestamp: number;
  retryAfterMs?: number | null;
  runId: string;
  batchIndex: number;
}

// ---------------------------------------------------------------------------
// Outcome → badge semantics (UI-SPEC §Color outcome table). running=blue,
// completed=green, partial=yellow, timeout/error=red. The server outcome union
// is mapped onto the three accent bands.
// ---------------------------------------------------------------------------

type OutcomeBand = 'running' | 'success' | 'partial' | 'error';

function outcomeBand(run: RunHistoryEntry): OutcomeBand {
  if (run.outcome === 'running') return 'running';
  if (run.outcome === 'completed') {
    // A completed run with failed batches / DLQ delta reads as "partial".
    return run.batchesFailed > 0 || run.dlqDelta > 0 ? 'partial' : 'success';
  }
  // watchdog_aborted / breaker_paused / budget_hit / error → red
  return 'error';
}

const OUTCOME_PILL_CLASS: Record<OutcomeBand, string> = {
  running: 'bg-accent-blue/20 text-accent-blue',
  success: 'bg-accent-green/20 text-accent-green',
  partial: 'bg-accent-yellow/20 text-accent-yellow',
  error: 'bg-accent-red/20 text-accent-red',
};

const OUTCOME_LABEL: Record<RunOutcome, string> = {
  running: 'RUNNING',
  completed: 'SUCCESS',
  watchdog_aborted: 'TIMEOUT',
  breaker_paused: 'ERROR',
  budget_hit: 'ERROR',
  error: 'ERROR',
};

/**
 * Phase 39 WR-01 — badge TEXT keyed off the derived band, not the raw outcome.
 * A `completed` run with failed batches / DLQ growth resolves to the `partial`
 * band (yellow) — its badge must read `PARTIAL`, not `SUCCESS` (UI-SPEC §B run
 * outcome labels). The server `RunOutcome` union has no `partial` member (it is
 * a client-derived classification), so the label can only come from the band.
 */
function outcomeLabel(run: RunHistoryEntry): string {
  const band = outcomeBand(run);
  if (band === 'partial') return 'PARTIAL';
  return OUTCOME_LABEL[run.outcome];
}

const OUTCOME_BAR_FILL: Record<OutcomeBand, string> = {
  running: 'bg-accent-blue',
  success: 'bg-accent-green',
  partial: 'bg-accent-yellow',
  error: 'bg-accent-red',
};

/** Relative-age formatter (mirrors the host `formatAge`/`freshnessText` idiom). */
function relativeAge(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '--';
  const ms = Date.now() - t;
  if (ms < 1_000) return 'now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

/**
 * Phase 39 WR-05 — primary accuracy metric for the eval pill, aligned to the
 * REAL server eval shape. The harness's primary deploy-gate radius is 20 km
 * (CLAUDE.md eval-gate `within20km / total >= 0.8`), so we render that ratio as
 * a 0..1 fraction. Degrade-open: a missing object, a zero/absent total, or a
 * pre-existing bare-number score all collapse to null → the pill hides (never
 * a crash, never a fabricated value).
 */
function normalizeEvalScore(evalScore: RunHistoryEntry['evalScore']): number | null {
  if (evalScore == null) return null;
  // Legacy / forward-compat: a bare numeric score is already a fraction.
  if (typeof evalScore === 'number') return Number.isFinite(evalScore) ? evalScore : null;
  // Real server shape: cumulative accuracy at 20 km over the ground-truth total.
  if (typeof evalScore.within20km === 'number' && typeof evalScore.total === 'number') {
    if (evalScore.total <= 0) return null; // no ground-truth → "not populated"
    return evalScore.within20km / evalScore.total;
  }
  return null;
}

/** Eval score → accent class (green ≥0.95 / yellow ≥0.80 / red below). */
function evalScoreClass(score: number): string {
  if (score >= 0.95) return 'text-accent-green';
  if (score >= 0.8) return 'text-accent-yellow';
  return 'text-accent-red';
}

interface HistoryResponse {
  runs: RunHistoryEntry[];
  calls: CallHistoryEntry[];
}

export function FlightRecorderBlock() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallHistoryEntry | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/events/llm-history', {
        headers: { ...dashboardAuthHeaders() },
      });
      if (!res.ok) return; // non-200 → keep prior/null state (degrade-open)
      const json = (await res.json()) as Partial<HistoryResponse>;
      // Defensive shape check — hide on a non-history body rather than crash.
      if (!Array.isArray(json?.runs) || !Array.isArray(json?.calls)) return;
      setData(json as HistoryResponse);
    } catch {
      // Network failure — block hides gracefully (degrade-open).
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
    const id = setInterval(() => {
      void fetchHistory();
    }, 30_000);
    return () => {
      clearInterval(id);
    };
  }, [fetchHistory]);

  // Calls for the selected run (L2). Filtered client-side by runId.
  const selectedCalls = useMemo(() => {
    if (!data || selectedRunId == null) return [];
    return data.calls.filter((c) => c.runId === selectedRunId);
  }, [data, selectedRunId]);

  // L2 aggregate sub-strips (UI-SPEC §B Level 2).
  const callAggregates = useMemo(() => {
    const provenance = new Map<string, number>();
    let dlqGroups = 0;
    let timeouts = 0;
    for (const c of selectedCalls) {
      provenance.set(c.provider, (provenance.get(c.provider) ?? 0) + 1);
      if (!c.ok) dlqGroups += 1;
      if (c.retryAfterMs != null && c.retryAfterMs > 0) timeouts += 1;
    }
    return { provenance: Array.from(provenance.entries()), dlqGroups, timeouts };
  }, [selectedCalls]);

  // Degrade-open: no data → block hides entirely (UI-SPEC degraded-state table).
  if (data == null) return null;

  const runs = data.runs;

  return (
    <section className="mt-4 px-3 py-2 text-xs" data-testid="flight-recorder">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
        FLIGHT RECORDER
      </div>

      {/* L1 — RUNS (newest-first) */}
      <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/40">RUNS</div>
      {runs.length === 0 ? (
        <div className="mt-1 text-[10px] text-white/30" data-testid="flight-recorder-empty">
          No runs recorded yet
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {runs.map((run) => {
            const band = outcomeBand(run);
            const isSelected = selectedRunId === run.runId;
            const score = normalizeEvalScore(run.evalScore);
            const batchPct =
              run.batchCount > 0
                ? Math.min(100, Math.round((run.batchesCompleted / run.batchCount) * 100))
                : 0;
            return (
              <div key={run.runId} data-testid={`flight-recorder-run-${run.runId}`}>
                <div
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                  onClick={() => {
                    setSelectedRunId(isSelected ? null : run.runId);
                    setSelectedCall(null);
                  }}
                  data-testid={`flight-recorder-run-row-${run.runId}`}
                >
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${OUTCOME_PILL_CLASS[band]}`}
                  >
                    {outcomeLabel(run)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/60">
                    {run.runId.slice(0, 8)}
                  </span>
                  <span className="shrink-0 text-[8px] text-white/40 tabular-nums">
                    {relativeAge(run.startedAt)}
                  </span>
                  {/* batch progress bar */}
                  <div className="h-1 min-w-8 flex-1 rounded-full bg-white/10">
                    <div
                      className={`h-1 rounded-full transition-all duration-500 ${OUTCOME_BAR_FILL[band]}`}
                      style={{ width: `${batchPct}%` }}
                      data-testid={`flight-recorder-batch-bar-${run.runId}`}
                    />
                  </div>
                  <span className="shrink-0 text-[8px] text-white/40 tabular-nums">
                    {run.batchesCompleted}/{run.batchCount} groups
                  </span>
                  <span className="shrink-0 text-[8px] text-white/40 tabular-nums">
                    {run.tokenSpend.nvidia_nim} tok
                  </span>
                  {score != null && (
                    <span
                      className={`shrink-0 text-[8px] tabular-nums ${evalScoreClass(score)}`}
                      data-testid={`flight-recorder-eval-${run.runId}`}
                      title="Resolver accuracy within 20km of ground truth"
                    >
                      eval {(score * 100).toFixed(0)}% @20km
                    </span>
                  )}
                </div>

                {/* L2 — CALLS for the selected run (inline expansion) */}
                {isSelected && (
                  <div className="mt-1 ml-2 border-l border-white/10 pl-2">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/40">
                      CALLS
                    </div>
                    {selectedCalls.length === 0 ? (
                      <div
                        className="mt-1 text-[10px] text-white/30"
                        data-testid={`flight-recorder-calls-empty-${run.runId}`}
                      >
                        No calls recorded for this run
                      </div>
                    ) : (
                      <>
                        <div className="mt-1 flex flex-col gap-0.5">
                          {selectedCalls.map((call, idx) => {
                            // per-call timing bar normalized against the slowest
                            // call in the set (visual relative weight, h-1.5).
                            const maxDur = Math.max(1, ...selectedCalls.map((c) => c.durationMs));
                            const durPct = Math.min(
                              100,
                              Math.round((call.durationMs / maxDur) * 100),
                            );
                            return (
                              <div
                                key={`${call.runId}-${call.batchIndex}-${idx}`}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5"
                                onClick={() => setSelectedCall(call)}
                                data-testid={`flight-recorder-call-row-${run.runId}-${idx}`}
                              >
                                <span className="shrink-0 text-[10px] font-mono text-white/60 tabular-nums">
                                  #{call.batchIndex}
                                </span>
                                <div className="h-1.5 min-w-8 flex-1 rounded-full bg-white/10">
                                  <div
                                    className={`h-1.5 rounded-full ${call.ok ? 'bg-accent-green' : 'bg-accent-red'}`}
                                    style={{ width: `${durPct}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-[8px] text-white/40 tabular-nums">
                                  {call.durationMs}ms
                                </span>
                                <span className="shrink-0 text-[8px] text-white/40">
                                  {call.provider}
                                </span>
                                <span
                                  className={`shrink-0 text-[8px] ${call.ok ? 'text-accent-green' : 'text-accent-red'}`}
                                >
                                  {call.ok ? '●' : '✕'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {/* aggregate one-line sub-strips */}
                        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-white/40">
                          <div>
                            Provenance:{' '}
                            {callAggregates.provenance
                              .map(([path, n]) => `${path} ×${n}`)
                              .join(' · ') || '--'}
                          </div>
                          <div className={callAggregates.dlqGroups > 0 ? 'text-accent-yellow' : ''}>
                            DLQ: {callAggregates.dlqGroups} groups
                          </div>
                          <div className={callAggregates.timeouts > 0 ? 'text-accent-red' : ''}>
                            Timeouts: {callAggregates.timeouts}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* L3 — single-call drill-down (copyable code-panel modal idiom) */}
      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </section>
  );
}

/**
 * Level 3 — single-call detail in the host copyable code-panel modal idiom
 * (`font-mono text-[10px]`, `Copied!` affordance, `bg-black/85` backdrop).
 *
 * Note: the Plan-01 `CallHistoryEntry` ring carries call TELEMETRY (provider /
 * model / tokens / timing / ok / runId / batchIndex), not the raw prompt+response
 * text. Per GA-1 the baseline requirement is that the operator CAN read a single
 * call's record; this panel renders the full available call record as copyable
 * JSON. A richer prompt/response surface (if the call ring is later widened to
 * carry prompt text) is a Phase 40 enhancement.
 */
function CallDetailModal({ call, onClose }: { call: CallHistoryEntry; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => JSON.stringify(call, null, 2), [call]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available.
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--z-modal)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Flight recorder call detail"
      data-testid="flight-recorder-call-modal"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="flight-recorder-call-backdrop"
      />
      <div className="relative flex w-[min(92vw,720px)] max-h-[85vh] flex-col rounded-lg border border-white/10 bg-black/85 font-mono text-[10px] text-white/80 shadow-xl backdrop-blur-sm">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-black/85 px-4 py-3 backdrop-blur-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
            Call detail · #{call.batchIndex}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
              data-testid="flight-recorder-call-copy"
            >
              Copy
            </button>
            {copied && <span className="text-[10px] text-accent-green">Copied!</span>}
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5"
              aria-label="Close call detail"
            >
              ✕
            </button>
          </div>
        </header>
        <pre className="overflow-auto px-4 py-3 text-[10px] leading-relaxed text-white/70">
          {text}
        </pre>
      </div>
    </div>
  );
}
