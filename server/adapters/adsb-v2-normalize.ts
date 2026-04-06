import type { FlightEntity } from '../types.js';
import {
  KNOTS_TO_MS,
  FEET_TO_METERS,
  FPM_TO_MS,
} from '../config.js';
import { icaoToCountry } from '../lib/icaoCountry.js';

export interface AdsbAircraft {
  hex: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  gs?: number; // knots
  track?: number; // degrees
  baro_rate?: number; // feet/min
  r?: string; // registration
  dbFlags?: number; // bitfield: 1=military
}

export interface AdsbResponse {
  ac: AdsbAircraft[] | null;
  msg: string;
  now: number;
  total: number;
}

export function normalizeAircraft(ac: AdsbAircraft): FlightEntity | null {
  if (ac.lat == null || ac.lon == null) return null;

  const onGround = ac.alt_baro === 'ground';
  const callsign = typeof ac.flight === 'string' ? ac.flight.trim() : '';
  const cleanHex = ac.hex.replace(/^~/, '');

  return {
    id: `flight-${cleanHex}`,
    type: 'flight',
    lat: ac.lat,
    lng: ac.lon,
    timestamp: Date.now(),
    label: callsign || ac.hex,
    data: {
      icao24: ac.hex,
      callsign: callsign || ac.hex,
      originCountry: icaoToCountry(ac.hex),
      velocity: ac.gs != null ? ac.gs * KNOTS_TO_MS : null,
      heading: ac.track ?? null,
      altitude: typeof ac.alt_baro === 'number' ? ac.alt_baro * FEET_TO_METERS : null,
      onGround,
      verticalRate: ac.baro_rate != null ? ac.baro_rate * FPM_TO_MS : null,
      unidentified: callsign === '',
    },
  };
}
