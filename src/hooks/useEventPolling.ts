import { useEffect, useRef } from 'react';
import { useEventStore } from '@/stores/eventStore';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

export const EVENT_POLL_INTERVAL = 900_000;

export function useEventPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setEventData = useEventStore((s) => s.setEventData);
  const setError = useEventStore((s) => s.setError);
  const setLoading = useEventStore((s) => s.setLoading);
  const recordFetch = useEventStore((s) => s.recordFetch);
  const setNextPollAt = useEventStore((s) => s.setNextPollAt);

  useEffect(() => {
    let cancelled = false;

    const fetchEvents = async (): Promise<void> => {
      if (cancelled) return;
      const start = Date.now();
      try {
        const res = await fetch('/api/events');
        if (cancelled) return;
        if (!res.ok) {
          const msg = `Events API ${res.status}`;
          setError(msg);
          recordFetch(false, Date.now() - start);
          return;
        }
        const data: CacheResponse<ConflictEventEntity[]> = await res.json();
        setEventData(data);
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
      const nextTs = Date.now() + EVENT_POLL_INTERVAL;
      setNextPollAt(nextTs);
      timeoutRef.current = setTimeout(async () => {
        await fetchEvents();
        schedulePoll();
      }, EVENT_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setNextPollAt(null);
      } else {
        fetchEvents().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    setLoading();
    fetchEvents().then(schedulePoll);

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
  }, [setEventData, setError, setLoading, recordFetch, setNextPollAt]);
}
