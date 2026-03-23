export { WAR_START } from '../../server/constants.js';

import type { Granularity } from '@/stores/filterStore';

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
