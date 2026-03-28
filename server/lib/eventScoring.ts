// Event confidence scoring and Goldstein sanity checks for GDELT events

import type { ConflictEventEntity, ConflictEventType } from '../types.js';

/**
 * Expected Goldstein scale ceilings per ConflictEventType.
 * Events with Goldstein scores exceeding ceiling+3 get reclassified
 * to the downgrade target (or left unchanged if no downgrade).
 */
export const GOLDSTEIN_CEILINGS: Record<
  ConflictEventType,
  { ceiling: number; downgrade: ConflictEventType | null }
> = {
  mass_violence: { ceiling: -7, downgrade: 'assault' },
  wmd: { ceiling: -7, downgrade: 'assault' },
  airstrike: { ceiling: -5, downgrade: 'shelling' },
  bombing: { ceiling: -5, downgrade: 'shelling' },
  ground_combat: { ceiling: -4, downgrade: 'assault' },
  shelling: { ceiling: -4, downgrade: 'assault' },
  assassination: { ceiling: -3, downgrade: 'assault' },
  abduction: { ceiling: -3, downgrade: 'assault' },
  assault: { ceiling: -1, downgrade: null },
  blockade: { ceiling: -1, downgrade: 'assault' },
  ceasefire_violation: { ceiling: -1, downgrade: 'assault' },
};

/**
 * Cross-check assigned ConflictEventType against Goldstein scale.
 *
 * - Goldstein = 0 or positive: skip (unknown/data error)
 * - If Goldstein exceeds type ceiling by more than 3 points (less negative
 *   than expected), reclassify to downgrade target.
 * - Returns a new entity if reclassified, same reference if unchanged.
 */
export function applyGoldsteinSanity(entity: ConflictEventEntity): ConflictEventEntity {
  const { goldsteinScale } = entity.data;

  // Skip if Goldstein is 0 (missing/invalid) or positive (data error on conflict codes)
  if (goldsteinScale === 0 || goldsteinScale > 0) {
    return entity;
  }

  const entry = GOLDSTEIN_CEILINGS[entity.type];
  if (!entry || entry.downgrade === null) {
    return entity;
  }

  // diff = goldsteinScale - ceiling
  // e.g., goldstein=-1, ceiling=-5 --> diff = -1 - (-5) = 4
  // If diff > 3, the score is much less negative than expected --> reclassify
  const diff = goldsteinScale - entry.ceiling;
  if (diff > 3) {
    return {
      ...entity,
      type: entry.downgrade,
    };
  }

  return entity;
}

/**
 * Compute a 0-1 composite confidence score for a GDELT event.
 *
 * Five weighted signals:
 * - Media coverage (0.30): log2 of mentions normalized to 50
 * - Source diversity (0.20): log2 of sources normalized to 15
 * - Actor specificity (0.20): both actors = 1.0, one = 0.5, none = 0.0
 * - Geo precision (0.15): precise = 1.0, centroid = 0.3
 * - Goldstein consistency (0.15): 1.0 if within expected range, linear decay outside, 0.5 if unknown
 */
export function computeEventConfidence(
  entity: ConflictEventEntity,
  geoPrecision: 'precise' | 'centroid',
): number {
  const { numMentions, numSources, actor1, actor2, goldsteinScale } = entity.data;

  // Signal 1: Media coverage (weight 0.30)
  const mentions = numMentions ?? 1;
  const mediaCoverage = Math.min(1, Math.log2(mentions + 1) / Math.log2(50));

  // Signal 2: Source diversity (weight 0.20)
  const sources = numSources ?? 1;
  const sourceDiversity = Math.min(1, Math.log2(sources + 1) / Math.log2(15));

  // Signal 3: Actor specificity (weight 0.20)
  const hasActor1 = actor1.trim().length > 0;
  const hasActor2 = actor2.trim().length > 0;
  const actorSpecificity = hasActor1 && hasActor2 ? 1.0 : hasActor1 || hasActor2 ? 0.5 : 0.0;

  // Signal 4: Geo precision (weight 0.15)
  const geoPrecisionSignal = geoPrecision === 'precise' ? 1.0 : 0.3;

  // Signal 5: Goldstein consistency (weight 0.15)
  let goldsteinConsistency: number;
  if (goldsteinScale === 0 || goldsteinScale > 0) {
    // Unknown or data error -- neutral
    goldsteinConsistency = 0.5;
  } else {
    const entry = GOLDSTEIN_CEILINGS[entity.type];
    if (!entry) {
      goldsteinConsistency = 0.5;
    } else {
      const diff = goldsteinScale - entry.ceiling;
      if (diff <= 0) {
        // Within expected range (more negative than ceiling)
        goldsteinConsistency = 1.0;
      } else {
        // Linear decay: 1.0 at diff=0, 0.0 at diff=6
        goldsteinConsistency = Math.max(0, 1.0 - diff / 6);
      }
    }
  }

  // Weighted sum
  return (
    0.30 * mediaCoverage +
    0.20 * sourceDiversity +
    0.20 * actorSpecificity +
    0.15 * geoPrecisionSignal +
    0.15 * goldsteinConsistency
  );
}
