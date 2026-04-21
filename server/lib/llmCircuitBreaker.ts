/**
 * Phase 27.4 D-31: Provider circuit breaker.
 *
 * Sliding window on the last 10 calls per provider. Trips for 5 minutes
 * when error rate > 30%. Module-level mutable state survives warm starts
 * on Vercel Fluid Compute; cold starts reset (worst case: 10 calls to
 * rebuild the window, inside the retry budget).
 *
 * No Redis persistence — breaker is advisory; D-29 graceful degradation
 * guarantees fall-through to next provider or raw GDELT.
 */

export type Provider = 'cerebras' | 'groq';
type Outcome = 'ok' | 'err';

interface BreakerState {
  outcomes: Outcome[]; // bounded to 10
  pausedUntil: number | null; // epoch ms; null = not paused
}

const WINDOW_SIZE = 10;
const ERROR_RATE_THRESHOLD = 0.3;
const PAUSE_DURATION_MS = 5 * 60_000;

const state: Record<Provider, BreakerState> = {
  cerebras: { outcomes: [], pausedUntil: null },
  groq: { outcomes: [], pausedUntil: null },
};

export function record(provider: Provider, outcome: Outcome): void {
  const s = state[provider];
  s.outcomes.push(outcome);
  if (s.outcomes.length > WINDOW_SIZE) s.outcomes.shift();
  if (s.outcomes.length === WINDOW_SIZE) {
    const errs = s.outcomes.filter((o) => o === 'err').length;
    if (errs / WINDOW_SIZE > ERROR_RATE_THRESHOLD) {
      s.pausedUntil = Date.now() + PAUSE_DURATION_MS;
      // Reset window so we don't re-trip immediately on the next err.
      s.outcomes = [];
    }
  }
}

export function isAvailable(provider: Provider): boolean {
  const s = state[provider];
  if (s.pausedUntil && Date.now() < s.pausedUntil) return false;
  if (s.pausedUntil && Date.now() >= s.pausedUntil) s.pausedUntil = null;
  return true;
}

export function getBreakerState(): Record<Provider, 'ok' | 'paused'> {
  return {
    cerebras: isAvailable('cerebras') ? 'ok' : 'paused',
    groq: isAvailable('groq') ? 'ok' : 'paused',
  };
}

/** Test-only: reset internal state between tests. Do not call in production. */
export function __resetBreakerForTests(): void {
  state.cerebras = { outcomes: [], pausedUntil: null };
  state.groq = { outcomes: [], pausedUntil: null };
}
