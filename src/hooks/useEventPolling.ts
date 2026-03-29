import { useEffect, useRef } from 'react';
import { useEventStore } from '@/stores/eventStore';
import type { ConflictEventEntity, CacheResponse } from '@/types/entities';

export const EVENT_POLL_INTERVAL = 900_000;

export function useEventPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setEventData = useEventStore((s) => s.setEventData);
  const setError = useEventStore((s) => s.setError);
  const setLoading = useEventStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    const fetchEvents = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/events');
        if (cancelled) return;
        if (!res.ok) throw new Error(`Events API ${res.status}`);
        const data: CacheResponse<ConflictEventEntity[]> = await res.json();
        setEventData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setEventData, setError, setLoading]);
}
