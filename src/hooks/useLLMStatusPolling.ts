import { useState, useEffect, useRef, useCallback } from 'react';
import type { GeocodeProvenance } from '@/types/llm';

const ACTIVE_INTERVAL = 5_000;
const IDLE_INTERVAL = 30_000;

export interface LLMRunSummary {
  lastRun: number;
  groupCount: number;
  batchCount: number;
  geocodeCount: number;
  enrichedCount: number;
  durationMs: number;
  error: string | null;
  source?: 'pipeline' | 'dev-file-cache';
  // Phase 27.4 Plan 09 — summary fields surviving cold-start read via Redis.
  // Phase 27.4.3 Plan 02a: schemaVersion widened to include 'v3'.
  schemaVersion?: 'v1' | 'v2' | 'v3';
  tokenCounters?: { cerebras: number; groq: number };
  dlqCount?: number;
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  provenanceCounts?: Record<string, number>;
  suspectCount?: number;
  // Phase 27.4.2 P6 — surface watchdog kill count on cold-start dashboard reads
  watchdogTimeoutCount?: number;

  // ---------------------------------------------------------------------
  // Phase 27.4.3 Plan 02a — A9 mirror of server-side LLMRunSummary v3
  // observability fields. Lands in the SAME COMMIT as the server-side
  // extension per project A9 atomic invariant.
  //
  // All optional + additive — v2 readers ignore unknown fields gracefully.
  // ---------------------------------------------------------------------

  callHistory?: Array<{
    provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    routingReason?: 'primary' | string;
    skipReason?:
      | 'breaker'
      | 'hard_cap'
      | 'no_client'
      | 'rate_limit_window'
      | 'daily_cap'
      | 'watchdog-soft-warn';
  }>;

  routingTrace?: Array<{
    ts: number;
    batch: number;
    provider: 'nvidia_nim' | 'openrouter';
    model: string;
    reason: string;
  }>;

  // NOTE: server-side this field is named `latencyHistogram` on llmProgress; the
  // /llm-status route maps it to `latency` to match this client-facing name.
  // Same data shape minus the `samples` ring buffer (kept server-side only).
  latency?: Record<
    'nvidia_nim' | 'openrouter',
    { p50: number; p95: number; p99: number; sparkline: number[] }
  >;

  rateLimit?: Record<
    'nvidia_nim' | 'openrouter',
    {
      used: number;
      cap: number;
      window: 'minute' | 'day';
      perModel?: Record<string, { used: number; cap: number }>;
    }
  >;

  schemaFailures?: Record<
    'nvidia_nim' | 'openrouter',
    { total: number; malformedJson: number; missingField: number; typeMismatch: number }
  >;

  errorTaxonomy?: Record<
    'nvidia_nim' | 'openrouter',
    Record<
      | 'rate_limit'
      | 'timeout'
      | 'malformed_json'
      | 'schema_fail'
      | 'network'
      | 'upstream_500'
      | 'other',
      number
    >
  >;

  pipelineFlips?: Array<{
    ts: number;
    from: 'v1' | 'v2' | 'v3';
    to: 'v1' | 'v2' | 'v3';
    trigger: string;
    operator: string;
    reason?: string;
  }>;

  costShadow?: { tokensIn: number; tokensOut: number; usd: number };

  recentEvents?: RecentEnrichedEvent[];
}

/**
 * Phase 27.4 Plan 09 B4 — projected shape for the DevApiStatus per-event
 * drill-down. Sourced from /api/events/llm-status (dev-only). Location
 * hierarchy reflects v2 extraction; fields that are not produced by the v2
 * extractor today (tokensIn/tokensOut) are populated as null and the
 * drill-down falls back to the batch-level call-history tokens.
 */
export interface RecentEnrichedEvent {
  groupKey: string;
  location: {
    country: string | null;
    admin1: string | null;
    city: string | null;
    neighborhood: string | null;
    landmark: string | null;
  };
  precision: 'exact' | 'neighborhood' | 'city' | 'region';
  confidence: number;
  reasoning: string;
  weaponType: string | null;
  targetType: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  provenance: GeocodeProvenance;
  sources: string[];
  fetchedAt: number;
  // === Phase 27.4.3 Plan 02a (B-2): populated by Plan 02b lineage helper. ===
  // Plan 04 Task 3 DrillDownRow renders these directly under TS strict mode.
  // Optional because v1/v2 paths predate the lineage helper. A9 mirror of
  // server-side server/lib/llmProgress.ts RecentEnrichedEvent additions —
  // both land in the same atomic commit per project canon.
  reasoningTrace?: string;
  lineageHash?: string;
}

export interface LLMStatus {
  stage: 'idle' | 'grouping' | 'llm-processing' | 'geocoding' | 'done' | 'error';
  startedAt?: number | null;
  completedAt?: number | null;
  totalGroups?: number;
  newGroups?: number;
  totalBatches?: number;
  completedBatches?: number;
  totalGeocodes?: number;
  completedGeocodes?: number;
  enrichedCount?: number;
  errorMessage?: string | null;
  durationMs?: number | null;
  lastRun?: LLMRunSummary | null;

  // Phase 27.4 Plan 09 v2 observability additions (D-15..D-23, D-30..D-36).
  // Phase 27.4.3 Plan 02a: schemaVersion widened to include 'v3'; callHistory
  // provider widened to four providers; v3 routing/latency/error fields
  // added per UI-SPEC §"Data freshness" lines 312-327.
  schemaVersion?: 'v1' | 'v2' | 'v3';
  callHistory?: Array<{
    provider: 'cerebras' | 'groq' | 'nvidia_nim' | 'openrouter';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    /** v3 routing trace: 'primary' for first-try, 'fall_through:<reason>' for cascade hops. */
    routingReason?: 'primary' | string;
    // Synthetic skip entry marker — set when the attempt bypassed the network
    // (breaker paused, daily hard cap reached, no API key configured, or v3
    // rate-limit/daily-cap gate). The Events tab shows these with a distinct
    // badge so "0 enriched" runs are diagnosable instead of silent.
    skipReason?:
      | 'breaker'
      | 'hard_cap'
      | 'no_client'
      | 'rate_limit_window'
      | 'daily_cap'
      | 'watchdog-soft-warn';
  }>;
  tokenCounters?: { cerebras: number; groq: number };
  dlqCount?: number;
  dlqRecent?: Array<{ id: string; reason: string; lastError: string; timestamp: number }>;
  breakerState?: { cerebras: 'ok' | 'paused'; groq: 'ok' | 'paused' };
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  provenanceCounts?: Record<string, number>;
  suspectCount?: number;

  // B4 fix — last 50 enriched events for DrillDownBlock (D-18)
  recentEvents?: RecentEnrichedEvent[];

  // B5 surface — soft-cap pause flag for "Paused — soft cap" badge
  paused?: boolean;

  // ---------------------------------------------------------------------
  // Phase 27.4.3 Plan 02a — A9 mirror of server LLMRunSummary v3 fields.
  // Same atomic commit as server/lib/llmProgress.ts extension. UI-SPEC
  // §"Data freshness" lines 312-327 is the wire contract.
  // ---------------------------------------------------------------------

  routingTrace?: Array<{
    ts: number;
    batch: number;
    provider: 'nvidia_nim' | 'openrouter';
    model: string;
    reason: string;
  }>;

  // NOTE: server-side this field is named `latencyHistogram` on llmProgress; the
  // /llm-status route maps it to `latency` to match this client-facing name.
  // Same data shape minus the `samples` ring buffer (kept server-side only).
  latency?: Record<
    'nvidia_nim' | 'openrouter',
    { p50: number; p95: number; p99: number; sparkline: number[] }
  >;

  rateLimit?: Record<
    'nvidia_nim' | 'openrouter',
    {
      used: number;
      cap: number;
      window: 'minute' | 'day';
      perModel?: Record<string, { used: number; cap: number }>;
    }
  >;

  schemaFailures?: Record<
    'nvidia_nim' | 'openrouter',
    { total: number; malformedJson: number; missingField: number; typeMismatch: number }
  >;

  errorTaxonomy?: Record<
    'nvidia_nim' | 'openrouter',
    Record<
      | 'rate_limit'
      | 'timeout'
      | 'malformed_json'
      | 'schema_fail'
      | 'network'
      | 'upstream_500'
      | 'other',
      number
    >
  >;

  pipelineFlips?: Array<{
    ts: number;
    from: 'v1' | 'v2' | 'v3';
    to: 'v1' | 'v2' | 'v3';
    trigger: string;
    operator: string;
    reason?: string;
  }>;

  costShadow?: { tokensIn: number; tokensOut: number; usd: number };
}

export function useLLMStatusPolling(): LLMStatus {
  const [status, setStatus] = useState<LLMStatus>({ stage: 'idle' });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async (): Promise<LLMStatus> => {
    try {
      const res = await fetch('/api/events/llm-status');
      if (!res.ok) return { stage: 'idle' };
      return (await res.json()) as LLMStatus;
    } catch {
      return { stage: 'idle' };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async (): Promise<void> => {
      const data = await fetchStatus();
      if (cancelled) return;
      setStatus(data);

      const isActive = data.stage !== 'idle' && data.stage !== 'done' && data.stage !== 'error';
      const interval = isActive ? ACTIVE_INTERVAL : IDLE_INTERVAL;

      timeoutRef.current = setTimeout(() => {
        if (!cancelled) void poll();
      }, interval);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [fetchStatus]);

  return status;
}
