/**
 * Water stress color interpolation and composite health formula.
 *
 * Color ramp: dark purple (extreme stress, health=0) -> light blue (healthy, health=1)
 * 4 stops for smooth gradient across the range.
 */

import type { WaterStressIndicators } from '../../server/types';

// Re-export for convenience
export type { WaterStressIndicators };

// ---------- Color Stops ----------

/** 4-stop gradient: dark purple -> dark blue -> medium blue -> light blue */
export const STRESS_COLORS: [number, number, number][] = [
  [40, 20, 60],      // health=0: dark purple (extreme stress) -- visible on dark terrain
  [30, 58, 138],     // health=0.33: dark blue
  [59, 130, 200],    // health=0.66: medium blue
  [125, 211, 252],   // health=1.0: light blue (healthy)
];

// ---------- Color Interpolation ----------

/**
 * Map a 0-1 health value to an RGBA color tuple.
 * Linearly interpolates across the 4 color stops.
 * Clamps input to [0, 1].
 */
export function stressToRGBA(
  health: number,
  alpha = 200,
): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, health));
  const segment = t * (STRESS_COLORS.length - 1);
  const i = Math.floor(segment);
  const f = segment - i;
  const c0 = STRESS_COLORS[Math.min(i, STRESS_COLORS.length - 1)];
  const c1 = STRESS_COLORS[Math.min(i + 1, STRESS_COLORS.length - 1)];
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
    alpha,
  ];
}

// ---------- Composite Health ----------

/**
 * Combine WRI Aqueduct baseline stress with precipitation anomaly
 * into a single 0-1 health score.
 *
 * Baseline dominates (75%), precipitation adjusts (25%).
 *
 * @param bwsScore - WRI baseline water stress score (0-5, 0=low stress, 5=extreme)
 * @param precipAnomalyRatio - Ratio of actual/normal precipitation (<1 = drier, >1 = wetter)
 * @returns 0-1 health score (0=worst, 1=best)
 */
export function compositeHealth(
  bwsScore: number,
  precipAnomalyRatio: number,
): number {
  // Normalize baseline stress to 0-1 health (inverted: 0=extreme stress -> 0 health)
  const baselineHealth = 1 - bwsScore / 5;

  // Precipitation modifier: wetter = healthier, drier = worse
  // Clamp to [-0.25, +0.25] range
  const precipModifier = Math.max(
    -0.25,
    Math.min(0.25, (precipAnomalyRatio - 1.0) * 0.5),
  );

  // Composite: clamp to [0, 1]
  return Math.max(0, Math.min(1, baselineHealth + precipModifier));
}

// ---------- BWS Label ----------

/**
 * Map a WRI baseline water stress score (0-5) to a human-readable label.
 */
export function bwsScoreToLabel(score: number): string {
  if (score < 1) return 'Low';
  if (score < 2) return 'Low-Medium';
  if (score < 3) return 'Medium-High';
  if (score < 4) return 'High';
  return 'Extremely High';
}

// ---------- Legend ----------

/** Color stops for legend registration */
export const WATER_STRESS_LEGEND_STOPS: { color: string; label: string }[] = [
  { color: '#28143c', label: 'Extreme Stress' },
  { color: '#1e3a8a', label: '' },
  { color: '#3b82c8', label: '' },
  { color: '#7dd3fc', label: 'Healthy' },
];
