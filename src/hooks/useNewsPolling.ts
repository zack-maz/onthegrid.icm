import { useEffect, useRef } from 'react';
import { useNewsStore } from '@/stores/newsStore';
import type { NewsCluster, CacheResponse } from '@/types/entities';

export const NEWS_POLL_INTERVAL = 900_000;

export function useNewsPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNewsData = useNewsStore((s) => s.setNewsData);
  const setError = useNewsStore((s) => s.setError);
  const setLoading = useNewsStore((s) => s.setLoading);
  const recordFetch = useNewsStore((s) => s.recordFetch);
  const setNextPollAt = useNewsStore((s) => s.setNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchNews = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();
      try {
        const res = await fetch('/api/news');
        if (cancelled) return;
        if (!res.ok) {
          const msg = `News API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<NewsCluster[]> = await res.json();
        setNewsData(data);
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
      const nextTs = Date.now() + NEWS_POLL_INTERVAL;
      setNextPollAt(nextTs);
      timeoutRef.current = setTimeout(async () => {
        await fetchNews();
        schedulePoll();
      }, NEWS_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setNextPollAt(null);
      } else {
        fetchNews().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    setLoading();
    fetchNews().then(schedulePoll);

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
  }, [setNewsData, setError, setLoading, recordFetch, setNextPollAt]);
}
