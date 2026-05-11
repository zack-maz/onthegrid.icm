import { useUIStore } from '@/stores/uiStore';

/**
 * Phase 27.4.4 Plan 02 — Client-side dashboard auth helpers.
 *
 * The DevApiStatus dashboard renders unconditionally in dev (via the
 * existing `import.meta.env.DEV` short-circuit). In prod it renders only
 * when a valid Bearer token is stored in localStorage; the operator
 * enters the password once via the DashboardAuthModal, the token persists
 * across reloads.
 *
 * Server side (server/middleware/dashboardAuth.ts) bypasses auth in dev
 * (NODE_ENV !== 'production') and requires a constant-time-compared
 * Bearer match in prod.
 *
 * The token is the operator's `DASHBOARD_PASSWORD` env value pasted
 * verbatim. localStorage XSS exposure is acceptable for an operator
 * dashboard — same trust boundary as the dev surface it replaces.
 */

const STORAGE_KEY = 'dashboard:auth-key';

function getDashboardKey(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setDashboardKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // localStorage unavailable (private mode); session-only auth survives
    // the React tree but not a reload — acceptable.
  }
}

export function hasDashboardKey(): boolean {
  return getDashboardKey() !== null;
}

/**
 * True when the dashboard surfaces (DevApiStatus modal,
 * DevApiStatusTrigger) should render. Dev short-circuit preserves the
 * pre-Plan-02 UX; prod requires a stored Bearer token.
 *
 * Read at call-site, never cached — localStorage can change in another
 * tab and React state would not reflect it without a polling effect.
 * The cost of a localStorage read on render is negligible.
 */
export function shouldRenderDashboard(): boolean {
  return import.meta.env.DEV || hasDashboardKey();
}

/**
 * Reactive variant of `shouldRenderDashboard()`. Subscribes to the auth
 * modal's open state via uiStore so the consuming component re-renders
 * when the modal closes — which is exactly when localStorage may have
 * flipped from unauthenticated → authenticated (or vice versa on a key
 * clear). Without this subscription, the parent component would observe
 * a stale call-time read because plain `localStorage.setItem` does not
 * trigger React re-renders. Phase 28.2 W6 hotfix — symptom was "auth
 * accepted, dashboard never appears" because AppShell never re-rendered
 * after `setDashboardKey` write completed.
 *
 * Use this in any component that mounts auth-gated children. The
 * non-hook `shouldRenderDashboard()` is still appropriate inside
 * components that already subscribe to a relevant uiStore slice (e.g.
 * `DevApiStatus` reads `isDevApiStatusOpen` and re-renders on its own).
 */
export function useShouldRenderDashboard(): boolean {
  // Subscribe so any open/close transition forces a re-render. The
  // returned value is intentionally unused — we only need the dependency.
  useUIStore((s) => s.isDashboardAuthOpen);
  return shouldRenderDashboard();
}

/**
 * Returns headers to include on auth-required dashboard fetches. In dev
 * the server middleware bypasses auth so the absent header is fine; in
 * prod the stored Bearer token is sent. Caller may spread the result
 * into a `fetch()` `headers` object.
 */
export function dashboardAuthHeaders(): Record<string, string> {
  const key = getDashboardKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/**
 * Validates a candidate password against the server. Used by the
 * DashboardAuthModal to confirm the operator's input before persisting
 * to localStorage. Returns true on 200, false otherwise.
 *
 * The probe endpoint is GET /api/dashboard/auth-check.
 */
export async function probeDashboardKey(candidate: string): Promise<boolean> {
  try {
    const res = await fetch('/api/dashboard/auth-check', {
      headers: { Authorization: `Bearer ${candidate}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
