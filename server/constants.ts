import type { BoundingBox } from './types.js';

/** Start of the US-Iran war — earliest date for historical event data */
export const WAR_START = Date.UTC(2026, 1, 28); // Feb 28, 2026 00:00Z

// Greater Middle East + Mediterranean + Arabian Sea
// Covers full visible map area for ship/event subscriptions
export const IRAN_BBOX: BoundingBox = {
  south: 0.0,
  north: 50.0,
  west: 20.0,
  east: 80.0,
};

// ADS-B Exchange/adsb.lol center point for radius query (centered on region)
export const IRAN_CENTER = { lat: 28.0, lon: 45.0 } as const;
export const ADSB_RADIUS_NM = 1200;

// ADS-B Exchange polling interval: 10K requests/month / 30 days => ~260s per poll
export const ADSB_POLL_INTERVAL = 260_000;

// Unit conversion constants (ADS-B Exchange uses imperial units)
export const KNOTS_TO_MS = 0.514444;
export const FEET_TO_METERS = 0.3048;
export const FPM_TO_MS = 0.00508; // feet per minute to meters per second

// Cache TTL values per data source (milliseconds)
export const CACHE_TTL = {
  flights: 10_000, // 10s -- OpenSky polling interval
  adsbFlights: 260_000, // 260s -- same as ADS-B Exchange poll interval
  adsblolFlights: 30_000, // 30s -- adsb.lol community API (respectful polling)
  ships: 0, // N/A for WebSocket push
  events: 900_000, // 15min -- GDELT updates every 15 minutes
} as const;
