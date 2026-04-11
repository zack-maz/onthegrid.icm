// Entity rendering constants for Deck.gl IconLayer configuration

/** RGB color tuples for entity types */
export const ENTITY_COLORS = {
  flight: [234, 179, 8] as const, // #eab308 yellow
  flightUnidentified: [255, 255, 100] as const, // #ffff64 shiny bright yellow
  ship: [167, 139, 250] as const, // #a78bfa violet-400
  airstrike: [255, 59, 48] as const, // #ff3b30 bright red
  on_ground: [180, 50, 20] as const, // #b43214 dark burnt red
  explosion: [255, 95, 25] as const, // #ff5f19 vibrant orange-red
  targeted: [139, 30, 30] as const, // #8b1e1e dark crimson
  other: [190, 170, 168] as const, // #beaaa8 gray with red tint
  siteHealthy: [34, 197, 94] as const, // #22c55e green
  siteAttacked: [249, 115, 22] as const, // #f97316 orange
} as const;

/** CSS hex color strings for toggle row dots */
export const ENTITY_DOT_COLORS = {
  flights: '#eab308',
  ships: '#a78bfa',
  airstrikes: '#ff3b30',
  on_ground: '#b43214',
  explosion: '#ff5f19',
  targeted: '#8b1e1e',
  other: '#beaaa8',
  ground: '#eab308',
  unidentified: '#ffff64',
  siteHealthy: '#22c55e',
  siteAttacked: '#f97316',
} as const;

/** CSS hex color strings for site subtype filter buttons */
export const SITE_SUBTYPE_COLORS: Record<string, string> = {
  nuclear: '#a855f7',
  naval: '#3b82f6',
  oil: '#f59e0b',
  airbase: '#64748b',
  port: '#8b5cf6',
} as const;

/** CSS hex color strings for water facility type filter buttons */
export const WATER_TYPE_COLORS: Record<string, string> = {
  dam: '#3b82f6',
  reservoir: '#06b6d4',
  desalination: '#8b5cf6',
  treatment_plant: '#14b8a6',
} as const;

/** Zoom-responsive sizes for entity icons (meter-based with pixel bounds) */
export const ICON_SIZE = {
  flight: { meters: 1000, minPixels: 16, maxPixels: 100 },
  ship: { meters: 1000, minPixels: 16, maxPixels: 100 },
  airstrike: { meters: 2500, minPixels: 22, maxPixels: 160 },
  on_ground: { meters: 1500, minPixels: 16, maxPixels: 120 },
  explosion: { meters: 2500, minPixels: 22, maxPixels: 160 },
  targeted: { meters: 2200, minPixels: 20, maxPixels: 140 },
  other: { meters: 1500, minPixels: 16, maxPixels: 120 },
  site: { meters: 1500, minPixels: 16, maxPixels: 50 },
} as const;

/** Pulse animation config for unidentified flights */
export const PULSE_CONFIG = {
  minOpacity: 0.3,
  maxOpacity: 1.0,
  periodMs: 800,
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
