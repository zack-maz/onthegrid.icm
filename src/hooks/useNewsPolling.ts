import { useEffect, useRef } from 'react';
import { useNewsStore } from '@/stores/newsStore';
import type { NewsCluster, CacheResponse } from '@/types/entities';

export const NEWS_POLL_INTERVAL = 900_000;

export function useNewsPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setNewsData = useNewsStore((s) => s.setNewsData);
  const setError = useNewsStore((s) => s.setError);
  const setLoading = useNewsStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    const fetchNews = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/news');
        if (cancelled) return;
        if (!res.ok) throw new Error(`News API ${res.status}`);
        const data: CacheResponse<NewsCluster[]> = await res.json();
        setNewsData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setNewsData, setError, setLoading]);
}
