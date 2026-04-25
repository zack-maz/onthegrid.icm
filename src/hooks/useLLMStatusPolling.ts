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
  // Phase 27.4 Plan 09 — summary fields surviving cold-start read via Redis
  schemaVersion?: 'v1' | 'v2';
  tokenCounters?: { cerebras: number; groq: number };
  dlqCount?: number;
  evalScore?: { within5km: number; within20km: number; within100km: number; total: number };
  provenanceCounts?: Record<string, number>;
  suspectCount?: number;
  // Phase 27.4.2 P6 — surface watchdog kill count on cold-start dashboard reads
  watchdogTimeoutCount?: number;
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

  // Phase 27.4 Plan 09 v2 observability additions (D-15..D-23, D-30..D-36):
  schemaVersion?: 'v1' | 'v2';
  callHistory?: Array<{
    provider: 'cerebras' | 'groq';
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    ok: boolean;
    batchSize: number;
    timestamp: number;
    // Synthetic skip entry marker — set when the attempt bypassed the network
    // (breaker paused, daily hard cap reached, or no API key configured). The
    // Events tab shows these with a distinct badge so "0 enriched" runs are
    // diagnosable instead of silent.
    skipReason?: 'breaker' | 'hard_cap' | 'no_client';
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
