/**
 * Phase 45 Plan 02 Task 1 — MetricRow (DASH-READ-01, CONTEXT D-06/D-07).
 *
 * The DASH-READ-01 numeric-scannability workhorse atom, reused across the
 * water / events / sites operator subtabs. A single labeled row:
 *   - left:  small uppercase label  (`text-[9px] uppercase tracking-wider text-white/40`)
 *   - right: right-aligned value     (`text-right tabular-nums`, tone white/60 → white/80)
 *   - optional muted unit appended to the value (`text-white/40`)
 *
 * Separate-file precedent: `FlightRecorderBlock.tsx` / `BudgetBlock.tsx` (D-07).
 * Net-new standalone primitive — NOT wired into DevApiStatus.tsx here (Plans 03/04).
 *
 * Color discipline (CLAUDE.md §Color Tokens + DASH-READ-03 — HARD): ONLY the
 * `white/N` opacity ramp / Tailwind utilities. NO inline hex / rgba. Two weights
 * only ({400, 600}) — never the 700 weight.
 */

export interface MetricRowProps {
  /** Small uppercase label rendered on the left. */
  label: string;
  /** Right-aligned, tabular-nums value. */
  value: string | number;
  /** Optional muted unit appended after the value (e.g. `ms`, `%`). */
  unit?: string;
  /** Emphasize the value tone: text-white/60 (default) → text-white/80. */
  emphasized?: boolean;
  'data-testid'?: string;
}

export function MetricRow({
  label,
  value,
  unit,
  emphasized = false,
  'data-testid': testId,
}: MetricRowProps) {
  const valueTone = emphasized ? 'text-white/80' : 'text-white/60';

  return (
    <div className="flex items-baseline justify-between gap-2" data-testid={testId}>
      <span className="text-[9px] uppercase tracking-wider text-white/40">{label}</span>
      <span
        className={`text-right tabular-nums ${valueTone}`}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        {value}
        {unit != null ? (
          <span className="ml-1 text-white/40" data-testid={testId ? `${testId}-unit` : undefined}>
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}
