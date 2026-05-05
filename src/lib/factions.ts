/**
 * Faction assignment system for Middle East political boundaries.
 * Maps countries to alliance blocs by ISO A3 code.
 */
export type Faction = 'us' | 'iran' | 'neutral';

/**
 * ISO A3 code -> faction mapping.
 * Only non-neutral countries are listed; all others default to 'neutral'.
 */
export const FACTION_ASSIGNMENTS: Record<string, Faction> = {
  // US-aligned
  ISR: 'us',
  SAU: 'us',
  ARE: 'us',
  BHR: 'us',
  JOR: 'us',
  KWT: 'us',
  EGY: 'us',
  // Iran-aligned
  IRN: 'iran',
  SYR: 'iran',
  YEM: 'iran',
};

// Phase 28.1 W6 D-13 — faction hex strings sourced from src/lib/colorBridge.ts
// which reads --color-faction-* CSS @theme vars at module load. Single source
// of truth at the @theme level. Note: COLOR_FACTION_DISPUTED_HEX is exported
// by the bridge but not consumed here — Faction type has 3 values
// (us/iran/neutral); disputed-territory styling is owned by the
// political-disputed GeoJSON layer (Phase 24 PoliticalOverlay), not by
// FACTION_COLORS.
import {
  COLOR_FACTION_US_ALIGNED_HEX,
  COLOR_FACTION_IRAN_ALIGNED_HEX,
  COLOR_FACTION_NEUTRAL_HEX,
} from '@/lib/colorBridge';

/** Faction display colors (muted military palette). */
export const FACTION_COLORS: Record<Faction, string> = {
  us: COLOR_FACTION_US_ALIGNED_HEX,
  iran: COLOR_FACTION_IRAN_ALIGNED_HEX,
  neutral: COLOR_FACTION_NEUTRAL_HEX,
};

/** Look up faction for a country by ISO A3 code. Returns 'neutral' for unlisted countries. */
export function getFaction(isoA3: string): Faction {
  return FACTION_ASSIGNMENTS[isoA3] ?? 'neutral';
}
