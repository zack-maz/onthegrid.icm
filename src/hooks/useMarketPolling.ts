import { useEffect, useRef } from 'react';
import { useMarketStore } from '@/stores/marketStore';
import type { MarketQuote, CacheResponse } from '@/types/entities';

// Phase 28.1 W5 D-12 — env-tunable markets polling cadence. Default preserves
// pre-W5 behavior (5min poll, matches Yahoo Finance refresh cadence). NOTE:
// the amended W5 plan listed default 60000 — the actual pre-W5 runtime value
// was 300000ms; preserved verbatim per "byte-identical default" contract.
export const MARKET_POLL_INTERVAL = Number(import.meta.env.VITE_POLL_MARKETS_MS ?? 300_000);

export function useMarketPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMarketStore((s) => s.range);
  const setMarketData = useMarketStore((s) => s.setMarketData);
  const setError = useMarketStore((s) => s.setError);
  const setLoading = useMarketStore((s) => s.setLoading);
  const recordFetch = useMarketStore((s) => s.recordFetch);
  const setNextPollAt = useMarketStore((s) => s.setNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchMarkets = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();
      try {
        const res = await fetch(`/api/markets?range=${range}`);
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Markets API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<MarketQuote[]> = await res.json();
        setMarketData(data);
        recordFetch(true, Date.now() - start);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
          recordFetch(false, Date.now() - start);
        }
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      const nextTs = Date.now() + MARKET_POLL_INTERVAL;
      setNextPollAt(nextTs);
      timeoutRef.current = setTimeout(async () => {
        await fetchMarkets();
        schedulePoll();
      }, MARKET_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setNextPollAt(null);
      } else {
        fetchMarkets().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    setLoading();
    fetchMarkets().then(schedulePoll);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setNextPollAt(null);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [range, setMarketData, setError, setLoading, recordFetch, setNextPollAt]);
}
