import { useEffect, useRef, useState } from 'react';

import { setDashboardKey, probeDashboardKey } from '@/lib/dashboardAuth';
import { useUIStore } from '@/stores/uiStore';

/**
 * Phase 27.4.4 Plan 02 — Dashboard auth modal.
 *
 * Renders a single password input. On submit, probes
 * `GET /api/dashboard/auth-check` with the candidate as a Bearer token. If
 * 200, persists the candidate to localStorage and opens DevApiStatus
 * (which now sees `hasDashboardKey() === true`). If non-200, surfaces
 * "Invalid password" without leaking timing or distinguishing 401 vs 503.
 *
 * Modal renders unconditionally — the wrapper is harmless when closed
 * (returns null). Open state is owned by uiStore.isDashboardAuthOpen and
 * is session-scoped (no localStorage persistence by design).
 *
 * Escape closes; Enter submits. Submit is debounced via in-flight ref so
 * a held Enter can't queue overlapping probes.
 */
export function DashboardAuthModal() {
  const isOpen = useUIStore((s) => s.isDashboardAuthOpen);
  const close = useUIStore((s) => s.closeDashboardAuth);
  const openDevApiStatus = useUIStore((s) => s.openDevApiStatus);

  const [candidate, setCandidate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state on open + autofocus the input.
  useEffect(() => {
    if (isOpen) {
      setCandidate('');
      setError(null);
      setSubmitting(false);
      // Defer focus until the input has mounted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Escape closes — capture-phase to win over the DevApiStatus listener
  // (matches the DevApiStatus pattern; this modal is at the same z-layer).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [isOpen, close]);

  if (!isOpen) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (candidate.length === 0) {
      setError('Password required');
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await probeDashboardKey(candidate);
    if (!ok) {
      setSubmitting(false);
      setError('Invalid password');
      return;
    }
    setDashboardKey(candidate);
    setSubmitting(false);
    close();
    openDevApiStatus();
  }

  return (
    <div
      data-testid="dashboard-auth-modal"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Click on backdrop closes; click on inner card stops propagation.
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="w-[360px] rounded-lg border border-border bg-surface-overlay p-5 shadow-xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-text-primary">Dashboard access</h2>
        <p className="mb-3 text-xs text-text-muted">
          Enter the dashboard password to view pipeline observability and trigger replay. The key
          persists across reloads on this device.
        </p>
        <input
          ref={inputRef}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={candidate}
          onChange={(e) => {
            setCandidate(e.target.value);
            if (error) setError(null);
          }}
          placeholder="DASHBOARD_PASSWORD"
          className="mb-2 w-full rounded-md border border-border bg-black/20 px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
          aria-invalid={error !== null}
          aria-describedby={error ? 'dashboard-auth-error' : undefined}
          data-testid="dashboard-auth-input"
        />
        {error && (
          <p
            id="dashboard-auth-error"
            className="mb-2 font-mono text-[11px] text-red-400"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || candidate.length === 0}
            className="rounded-md bg-accent-blue/20 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50"
            data-testid="dashboard-auth-submit"
          >
            {submitting ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </form>
    </div>
  );
}
