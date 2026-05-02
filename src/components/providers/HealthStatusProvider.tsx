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
 * The raw context handle. Exported (not just internally used) so component
 * tests can construct a stubbed provider via
 * `<HealthStatusContext.Provider value={...}>` without having to set up
 * fake timers + global fetch mocks. Production code should always go
 * through `<HealthStatusProvider>` + `useHealthStatusContext()`.
 */
export const HealthStatusContext = createContext<HealthStatusContextValue | null>(null);

export function HealthStatusProvider({ children }: { children: ReactNode }): JSX.Element {
  const value = useHealthStatus();
  return <HealthStatusContext.Provider value={value}>{children}</HealthStatusContext.Provider>;
}

/**
 * Consumer hook. Throws a clear error if invoked outside `<HealthStatusProvider>`.
 * The HealthBanner + DevApiStatus "All APIs" tab body both call this.
 */
export function useHealthStatusContext(): HealthStatusContextValue {
  const ctx = useContext(HealthStatusContext);
  if (ctx === null) {
    throw new Error(
      'useHealthStatusContext must be used within HealthStatusProvider — ' +
        'the AppShell tree is the canonical mount point.',
    );
  }
  return ctx;
}
