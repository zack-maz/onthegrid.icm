// Entity rendering constants for Deck.gl IconLayer configuration

/** RGB color tuples for entity types */
export const ENTITY_COLORS = {
  flight: [34, 197, 94] as const,           // #22c55e green
  flightUnidentified: [234, 179, 8] as const, // #eab308 yellow
  ship: [59, 130, 246] as const,             // #3b82f6 blue
  drone: [239, 68, 68] as const,             // #ef4444 red
  missile: [239, 68, 68] as const,           // #ef4444 red
} as const;

/** Zoom-responsive sizes for entity icons (meter-based with pixel bounds) */
export const ICON_SIZE = {
  flight:  { meters: 2400, minPixels: 15, maxPixels: 96 },
  ship:    { meters: 1800, minPixels: 12, maxPixels: 84 },
  drone:   { meters: 2400, minPixels: 15, maxPixels: 96 },
  missile: { meters: 2400, minPixels: 15, maxPixels: 96 },
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
