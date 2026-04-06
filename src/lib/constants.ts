import type { Granularity } from '@/stores/filterStore';

/**
 * War start timestamp -- Feb 28, 2026 00:00 UTC.
 *
 * Defined here (not imported from server/) to keep the frontend tier
 * independent of server modules. Must stay in sync with `WAR_START` in
 * `server/config.ts`. Both share an identical Date.UTC expression so
 * accidental drift is easy to spot.
 */
export const WAR_START = Date.UTC(2026, 1, 28);

export const STEP_MS: Record<Granularity, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

export function snapToStep(ts: number, step: number): number {
  return Math.floor(ts / step) * step;
}

/** Per-granularity slider lookback: minute=1h, hour=24h, day=full history (null) */
export const LOOKBACK_MS: Record<Granularity, number | null> = {
  minute: 60 * 60 * 1000,
  hour: 24 * 60 * 60 * 1000,
  day: null,
};
