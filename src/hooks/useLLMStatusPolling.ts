import { useState, useEffect, useRef, useCallback } from 'react';

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
