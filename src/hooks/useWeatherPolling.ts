import { useEffect, useRef } from 'react';
import { useWeatherStore } from '@/stores/weatherStore';
import type { WeatherGridPoint } from '@/stores/weatherStore';

export const WEATHER_POLL_INTERVAL = 1_800_000; // 30 minutes

interface CacheResponse<T> {
  data: T;
  stale: boolean;
  lastFresh: number;
}

export function useWeatherPolling(): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setWeatherData = useWeatherStore((s) => s.setWeatherData);
  const setError = useWeatherStore((s) => s.setError);
  const setLoading = useWeatherStore((s) => s.setLoading);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async (): Promise<void> => {
      if (cancelled) return;

      try {
        setLoading();
        const res = await fetch('/api/weather');
        if (cancelled) return;
        const data: CacheResponse<WeatherGridPoint[]> = await res.json();
        setWeatherData(data);
      } catch {
        if (!cancelled) setError();
      }
    };

    const schedulePoll = (): void => {
      if (cancelled) return;
      timeoutRef.current = setTimeout(async () => {
        await fetchWeather();
        schedulePoll();
      }, WEATHER_POLL_INTERVAL);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        fetchWeather().then(schedulePoll);
      }
    };

    // Initial fetch then start polling
    fetchWeather().then(schedulePoll);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setWeatherData, setError, setLoading]);
}
