import type { ConflictEventEntity, ConflictEventType } from '../../server/types';

export type SeverityLevel = 'high' | 'medium' | 'low';

/** High/Medium/Low thresholds for the static score */
export const HIGH_THRESHOLD = 50;
export const MEDIUM_THRESHOLD = 15;

/**
 * Type-based severity weights for conflict event types.
 * Higher weight = more severe/newsworthy event type.
 */
export const TYPE_WEIGHTS: Record<ConflictEventType, number> = {
  airstrike: 10,
  explosion: 8,
  targeted: 8,
  on_ground: 6,
  other: 3,
};

/**
 * Source tier severity multiplier.
 * Tier 1 (gold) boosts score, Tier 3 (bronze) demotes score.
 * Default (Tier 2 / unknown) is neutral.
 */
export const SOURCE_TIER_MULTIPLIER: Record<number, number> = {
  1: 1.5,
  2: 1.0,
  3: 0.7,
};

// Phase 28.1 W5 D-12 — env-tunable recency-decay half-life for severity
// scoring. Default 24h matches the pre-W5 runtime behavior.
//
// Note: CLAUDE.md "Notification Center (Phase 17)" historically said
// "halfLife = 6h" — that was doc drift; the 24h scale here is authoritative.
// CLAUDE.md is updated in this same wave (W5 Task 3).
const HALF_LIFE_HOURS = Number(import.meta.env.VITE_SEVERITY_HALF_LIFE_HOURS ?? 24);

/**
 * Compute a severity score for a conflict event.
 *
 * Formula: typeWeight * log2(1 + mentions) * log2(1 + sources) * recencyDecay
 *
 * - Type weight: based on event type (airstrike=10, blockade=2, etc.)
 * - Mentions/sources: logarithmic scaling to dampen outliers
 * - Recency decay: 1 / (1 + ageHours / HALF_LIFE_HOURS) — default ~24h half-life
 *
 * Returns a positive number. Higher = more severe/urgent.
 */
export function computeSeverityScore(event: ConflictEventEntity): number {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = event.data.numMentions ?? 1;
  const sources = event.data.numSources ?? 1;

  const ageMs = Math.max(0, Date.now() - event.timestamp);
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyDecay = 1 / (1 + ageHours / HALF_LIFE_HOURS);

  const tierMultiplier = SOURCE_TIER_MULTIPLIER[event.data.sourceTier ?? 2] ?? 1.0;

  return (
    typeWeight * Math.log2(1 + mentions) * Math.log2(1 + sources) * recencyDecay * tierMultiplier
  );
}

/**
 * Classify severity for filtering purposes (no recency decay).
 * Uses typeWeight * log2(1 + mentions) * log2(1 + sources).
 */
export function classifySeverity(event: ConflictEventEntity): SeverityLevel {
  const typeWeight = TYPE_WEIGHTS[event.type] ?? 3;
  const mentions = event.data.numMentions ?? 1;
  const sources = event.data.numSources ?? 1;
  const tierMultiplier = SOURCE_TIER_MULTIPLIER[event.data.sourceTier ?? 2] ?? 1.0;
  const score = typeWeight * Math.log2(1 + mentions) * Math.log2(1 + sources) * tierMultiplier;
  if (score > HIGH_THRESHOLD) return 'high';
  if (score > MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}
