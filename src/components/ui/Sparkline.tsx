/**
 * Phase 45 Plan 02 Task 2 — Sparkline (DASH-READ-05, CONTEXT D-04/D-05/D-07).
 *
 * The new ~30-point inline-SVG trend line primitive for the operator dashboard
 * (dead-link count + per-cron freshness rings, Plan 04). A SEPARATE, richer file
 * from the existing in-file `Sparkline` (DevApiStatus.tsx:3235) and the 10-dot
 * API-Health "recent-fetch" sparkline — neither of those is touched here.
 *
 * Geometry (copied from the in-file baseline): viewBox 0 0 100 100,
 * preserveAspectRatio none, xStep = 100/(n-1), y = 100 - (v/max)*100.
 * Self-hides (`return null`) below 2 points — degrade-open until the ring fills;
 * the caller shows the bare current value.
 *
 * Color (CONTEXT D-05): neutral stroke + semantic last point. The whole line
 * draws in ONE muted token (`text-white/40` on the SVG → `stroke="currentColor"`);
 * ONLY the latest point tints to a semantic @theme token (default
 * `var(--color-status-degraded)`) when the latest value crosses `threshold` per
 * `thresholdDirection`. Otherwise the marker is neutral (currentColor).
 *
 * Color discipline (CLAUDE.md §Color Tokens + DASH-READ-03 — HARD): every color
 * resolves through the white-opacity ramp / a `var(--color-*)` @theme token.
 * Zero inline hex / rgba literals (T-45-04 mitigation; grep-gated in acceptance).
 */

export interface SparklineProps {
  /** Trend samples oldest→newest (~30). Renders nothing below 2 points. */
  points: number[];
  /** Degradation threshold for the semantic last-point tint. */
  threshold?: number;
  /** Which side of `threshold` counts as degraded. Default `above`. */
  thresholdDirection?: 'above' | 'below';
  /**
   * Semantic @theme token (a `var(--color-*)` string) used to tint the last
   * point on threshold cross. Default `var(--color-status-degraded)`.
   */
  semanticToken?: string;
  /**
   * Phase 45 WR-01 — force the last point into the degraded tint regardless of
   * `threshold`/`thresholdDirection`. Used when the latest sample is semantically
   * "most degraded" but maps to a numeric value (e.g. a dead/absent cron whose
   * `null` age is plotted as the `0` floor) that the threshold would otherwise
   * read as healthy. Does NOT distort the auto-scaled line — only the marker.
   */
  forceDegraded?: boolean;
  /** Tailwind height class for the SVG. Default `h-4`. */
  height?: string;
  'data-testid'?: string;
}

export function Sparkline({
  points,
  threshold,
  thresholdDirection = 'above',
  semanticToken = 'var(--color-status-degraded)',
  forceDegraded = false,
  height = 'h-4',
  'data-testid': testId,
}: SparklineProps) {
  // Degrade-open: render nothing until the ring has at least 2 samples.
  if (points.length < 2) return null;

  const max = Math.max(...points, 1);
  const xStep = 100 / (points.length - 1);
  const coords = points.map((v, i) => ({ x: i * xStep, y: 100 - (v / max) * 100 }));
  const pathPoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  const latest = points[points.length - 1];
  // WR-01: `forceDegraded` short-circuits the numeric threshold so a latest
  // sample that is semantically "most degraded" (e.g. dead cron → null → 0 floor)
  // still tints, instead of reading as the healthy floor.
  const crossed =
    forceDegraded ||
    (threshold != null &&
      (thresholdDirection === 'above' ? latest > threshold : latest < threshold));

  const last = coords[coords.length - 1];
  // Neutral (currentColor) unless the latest sample crossed into degradation.
  const markerFill = crossed ? semanticToken : 'currentColor';

  return (
    <svg
      className={`${height} w-full text-white/40`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      data-testid={testId}
    >
      <polyline points={pathPoints} fill="none" stroke="currentColor" strokeWidth="2" />
      <circle
        cx={last.x}
        cy={last.y}
        r={crossed ? 4 : 2.5}
        fill={markerFill}
        data-testid={testId ? `${testId}-last` : undefined}
      />
    </svg>
  );
}
