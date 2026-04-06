import { RateLimitError } from '../types.js';
import type { FlightEntity } from '../types.js';
import { IRAN_CENTER, ADSB_RADIUS_NM } from '../config.js';
import { normalizeAircraft } from './adsb-v2-normalize.js';
import type { AdsbResponse } from './adsb-v2-normalize.js';
import { log } from '../lib/logger.js';

const BASE_URL = 'https://api.adsb.lol';
const FETCH_TIMEOUT = 10_000;

export async function fetchFlights(): Promise<FlightEntity[]> {
  const start = Date.now();

  const url = `${BASE_URL}/v2/lat/${IRAN_CENTER.lat}/lon/${IRAN_CENTER.lon}/dist/${ADSB_RADIUS_NM}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });

  if (res.status === 429) {
    throw new RateLimitError('adsb.lol rate limit exceeded');
  }

  if (!res.ok) {
    throw new Error(`adsb.lol API error: ${res.status}`);
  }

  const data = (await res.json()) as AdsbResponse;
  const aircraft = data.ac ?? [];

  const flights = aircraft
    .map(normalizeAircraft)
    .filter((f): f is FlightEntity => f !== null);

  log({ level: 'info', message: `[adsb.lol] fetched ${flights.length} flights in ${Date.now() - start}ms` });
  return flights;
}
