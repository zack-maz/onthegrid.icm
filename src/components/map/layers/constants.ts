// Entity rendering constants for Deck.gl IconLayer configuration

/** RGB color tuples for entity types */
export const ENTITY_COLORS = {
  flight: [234, 179, 8] as const,            // #eab308 yellow
  flightUnidentified: [185, 28, 28] as const,  // #b91c1c darker red
  ship: [156, 163, 175] as const,            // #9ca3af gray
  airstrike: [255, 59, 48] as const,         // #ff3b30 red
  groundCombat: [239, 68, 68] as const,      // #ef4444 red
  targeted: [139, 30, 30] as const,          // #8b1e1e dark red
  otherConflict: [239, 68, 68] as const,    // #ef4444 red
} as const;

/** CSS hex color strings for toggle row dots */
export const ENTITY_DOT_COLORS = {
  flights: '#eab308',
  ships: '#9ca3af',
  airstrikes: '#ff3b30',
  groundCombat: '#ef4444',
  targeted: '#8b1e1e',
  otherConflict: '#ef4444',
  ground: '#eab308',
  unidentified: '#b91c1c',
} as const;

/** Zoom-responsive sizes for entity icons (meter-based with pixel bounds) */
export const ICON_SIZE = {
  flight:        { meters: 8000, minPixels: 24, maxPixels: 160 },
  ship:          { meters: 8000, minPixels: 24, maxPixels: 160 },
  airstrike:     { meters: 8000, minPixels: 24, maxPixels: 160 },
  groundCombat:  { meters: 8000, minPixels: 24, maxPixels: 160 },
  targeted:      { meters: 8000, minPixels: 24, maxPixels: 160 },
  otherConflict: { meters: 8000, minPixels: 24, maxPixels: 160 },
} as const;

/** Pulse animation config for unidentified flights */
export const PULSE_CONFIG = {
  minOpacity: 0.7,
  maxOpacity: 1.0,
  periodMs: 2000,
} as const;

/** Altitude ceiling for opacity mapping (meters) */
const ALT_CEILING = 13000;
/** Minimum opacity at ground level */
const MIN_OPACITY = 0.6;
/** Maximum opacity at ceiling */
const MAX_OPACITY = 1.0;

/**
 * Maps altitude to opacity. Linear from 0m=0.6 to 13000m=1.0.
 * null or <=0 returns 0.6. Above ceiling clamps to 1.0.
 */
export function altitudeToOpacity(altitude: number | null): number {
  if (altitude === null || altitude <= 0) {
    return MIN_OPACITY;
  }
  if (altitude >= ALT_CEILING) {
    return MAX_OPACITY;
  }
  return MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * (altitude / ALT_CEILING);
}
