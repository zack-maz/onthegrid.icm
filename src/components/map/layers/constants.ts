// Entity rendering constants for Deck.gl IconLayer configuration

/** RGB color tuples for entity types */
export const ENTITY_COLORS = {
  flight: [234, 179, 8] as const,            // #eab308 yellow
  flightUnidentified: [239, 68, 68] as const, // #ef4444 red
  ship: [156, 163, 175] as const,            // #9ca3af gray
  drone: [239, 68, 68] as const,             // #ef4444 red
  missile: [239, 68, 68] as const,           // #ef4444 red
} as const;

/** CSS hex color strings for toggle row dots */
export const ENTITY_DOT_COLORS = {
  flights: '#eab308',
  ships: '#9ca3af',
  drones: '#ef4444',
  missiles: '#ef4444',
  ground: '#eab308',
  unidentified: '#ef4444',
  news: '#60a5fa',
} as const;

/** Zoom-responsive sizes for entity icons (meter-based with pixel bounds) */
export const ICON_SIZE = {
  flight:  { meters: 8000, minPixels: 24, maxPixels: 160 },
  ship:    { meters: 8000, minPixels: 24, maxPixels: 160 },
  drone:   { meters: 8000, minPixels: 24, maxPixels: 160 },
  missile: { meters: 8000, minPixels: 24, maxPixels: 160 },
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
