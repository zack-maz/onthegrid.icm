import { createContext, useContext, type ReactNode } from 'react';

import { useHealthStatus, type UseHealthStatusValue } from '@/hooks/useHealthStatus';

/**
 * Phase 28.1 W2 — React context wrapper around `useHealthStatus()`.
 *
 * Calls `useHealthStatus()` exactly once and exposes the value to all
 * descendants. `HealthBanner` + `DevApiStatus` "All APIs" tab MUST consume
 * via `useHealthStatusContext()` — direct `useHealthStatus()` calls in
 * those components would double the `/api/health` poll load (one fetch
 * per minute becomes two).
 *
 * The single-poll invariant is enforced by Task 5b's audit grep:
 *   `grep -rEn "useHealthStatus\(\)" src/` → must return exactly one
 *   in-app call site (this file).
 */

type HealthStatusContextValue = UseHealthStatusValue;

/**
 * Default value returned when `useHealthStatusContext` is invoked outside a
 * `<HealthStatusProvider>` wrap. In production this never happens (AppShell
 * always wraps the tree), but the fallback keeps unit tests that mount
 * `<DevApiStatus />` or `<HealthBanner />` directly from blowing up if they
 * forget the wrapper. The fallback is also the right operator-UX answer —
 * a degenerate render with no health data is preferable to a thrown error.
 *
 * The single-poll invariant is enforced by Task 5b's audit grep, NOT by
 * a runtime throw here:
 *   `grep -rEn "useHealthStatus\(\)" src/` → must return exactly one
 *   in-app call site (HealthStatusProvider.tsx).
 */
const DEFAULT_VALUE: HealthStatusContextValue = {
  health: null,
  loading: false,
  error: null,
  lastSuccessAt: null,
};

/**
 * The raw context handle. Exported (not just internally used) so component
 * tests can construct a stubbed provider via
 * `<HealthStatusContext.Provider value={...}>` without having to set up
 * fake timers + global fetch mocks. Production code should always go
 * through `<HealthStatusProvider>` + `useHealthStatusContext()`.
 *
 * Default value is the empty `DEFAULT_VALUE`; when production AppShell
 * mounts <HealthStatusProvider>, that wrapper overrides via Provider value.
 */
export const HealthStatusContext = createContext<HealthStatusContextValue>(DEFAULT_VALUE);

export function HealthStatusProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useHealthStatus();
  return <HealthStatusContext.Provider value={value}>{children}</HealthStatusContext.Provider>;
}

/**
 * Consumer hook. Returns the context value. Outside a provider wrap, returns
 * `DEFAULT_VALUE` (safe-default: health=null, loading=false, error=null) so
 * unit tests rendering DevApiStatus / HealthBanner without a provider
 * degrade gracefully rather than throwing.
 */
export function useHealthStatusContext(): HealthStatusContextValue {
  return useContext(HealthStatusContext);
}
