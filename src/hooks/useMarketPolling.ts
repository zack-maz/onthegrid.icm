import { useEffect, useRef } from 'react';
import { useMarketStore } from '@/stores/marketStore';
import type { MarketQuote, CacheResponse } from '@/types/entities';

export const MARKET_POLL_INTERVAL = 300_000; // 5 minutes

export function useMarketPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const range = useMarketStore((s) => s.range);
  const setMarketData = useMarketStore((s) => s.setMarketData);
  const setError = useMarketStore((s) => s.setError);
  const setLoading = useMarketStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    const fetchMarkets = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/markets?range=${range}`);
        if (cancelled) return;
        if (!res.ok) throw new Error(`Markets API ${res.status}`);
        const data: CacheResponse<MarketQuote[]> = await res.json();
        setMarketData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [range, setMarketData, setError, setLoading]);
}
