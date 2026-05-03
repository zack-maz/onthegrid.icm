// Entity rendering constants for Deck.gl IconLayer configuration.
//
// Phase 28.1 W6 D-13 — color blocks (ENTITY_COLORS RGBA tuples + ENTITY_DOT_COLORS
// hex strings) source from src/lib/colorBridge.ts which reads CSS @theme vars
// from src/styles/app.css at module load. Single source of truth for entity
// colors lives in the @theme block; this file's color blocks are a typed view
// over the bridge values for deck.gl consumers. Size blocks (ICON_SIZE,
// PULSE_CONFIG, altitudeToOpacity) stay as TS literals — they are deck.gl
// rendering props, not styling, per CONTEXT D-13.

import {
  COLOR_FLIGHT,
  COLOR_FLIGHT_UNIDENTIFIED,
  COLOR_SHIP,
  COLOR_EVENT_AIRSTRIKE,
  COLOR_EVENT_ON_GROUND,
  COLOR_EVENT_EXPLOSION,
  COLOR_EVENT_TARGETED,
  COLOR_EVENT_OTHER,
  COLOR_SITE_HEALTHY,
  COLOR_SITE_ATTACKED,
  COLOR_FLIGHT_HEX,
  COLOR_FLIGHT_UNIDENTIFIED_HEX,
  COLOR_SHIP_HEX,
  COLOR_EVENT_AIRSTRIKE_HEX,
  COLOR_EVENT_ON_GROUND_HEX,
  COLOR_EVENT_EXPLOSION_HEX,
  COLOR_EVENT_TARGETED_HEX,
  COLOR_EVENT_OTHER_HEX,
  COLOR_SITE_HEALTHY_HEX,
  COLOR_SITE_ATTACKED_HEX,
} from '@/lib/colorBridge';

/** RGB color tuples for entity types (sourced from CSS @theme via colorBridge) */
export const ENTITY_COLORS = {
  flight: COLOR_FLIGHT,
  flightUnidentified: COLOR_FLIGHT_UNIDENTIFIED,
  ship: COLOR_SHIP,
  airstrike: COLOR_EVENT_AIRSTRIKE,
  on_ground: COLOR_EVENT_ON_GROUND,
  explosion: COLOR_EVENT_EXPLOSION,
  targeted: COLOR_EVENT_TARGETED,
  other: COLOR_EVENT_OTHER,
  siteHealthy: COLOR_SITE_HEALTHY,
  siteAttacked: COLOR_SITE_ATTACKED,
} as const;

/** CSS hex color strings for toggle row dots (sourced from CSS @theme via colorBridge) */
export const ENTITY_DOT_COLORS = {
  flights: COLOR_FLIGHT_HEX,
  ships: COLOR_SHIP_HEX,
  airstrikes: COLOR_EVENT_AIRSTRIKE_HEX,
  on_ground: COLOR_EVENT_ON_GROUND_HEX,
  explosion: COLOR_EVENT_EXPLOSION_HEX,
  targeted: COLOR_EVENT_TARGETED_HEX,
  other: COLOR_EVENT_OTHER_HEX,
  ground: COLOR_FLIGHT_HEX,
  unidentified: COLOR_FLIGHT_UNIDENTIFIED_HEX,
  siteHealthy: COLOR_SITE_HEALTHY_HEX,
  siteAttacked: COLOR_SITE_ATTACKED_HEX,
  // waterAttacked stays as a literal — Phase 27 water palette is not
  // covered by W6 D-13 (which targets entity/event/site/faction/ethnic only).
  waterAttacked: '#2d0a4e',
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
} as const;

/** Zoom-responsive sizes for entity icons (meter-based with pixel bounds) */
export const ICON_SIZE = {
  flight: { meters: 1000, minPixels: 16, maxPixels: 100 },
  ship: { meters: 1000, minPixels: 16, maxPixels: 100 },
  airstrike: { meters: 2000, minPixels: 22, maxPixels: 180 },
  on_ground: { meters: 1200, minPixels: 18, maxPixels: 150 },
  explosion: { meters: 2000, minPixels: 22, maxPixels: 180 },
  targeted: { meters: 1800, minPixels: 20, maxPixels: 160 },
  other: { meters: 1200, minPixels: 18, maxPixels: 150 },
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
