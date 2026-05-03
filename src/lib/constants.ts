import type { Granularity } from '@/stores/filterStore';

/**
 * War start timestamp -- Feb 28, 2026 00:00 UTC.
 *
 * Phase 28.1 W5 D-11: re-exported from `@/lib/domain` (the canonical
 * client-tier home for domain-definitional constants). The previous in-line
 * definition was consolidated to remove a third copy of the value. Drift
 * across the client/server boundary is enforced by the parity tests in
 * `src/__tests__/domain.test.ts`.
 */
export { WAR_START } from '@/lib/domain';

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
