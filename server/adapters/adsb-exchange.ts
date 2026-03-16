import { RateLimitError } from '../types.js';
import type { FlightEntity } from '../types.js';
import { IRAN_CENTER, ADSB_RADIUS_NM } from '../constants.js';
import { normalizeAircraft } from './adsb-v2-normalize.js';
import type { AdsbResponse } from './adsb-v2-normalize.js';

const RAPIDAPI_HOST = 'adsbexchange-com1.p.rapidapi.com';

export async function fetchFlights(): Promise<FlightEntity[]> {
  const start = Date.now();
  const apiKey = process.env.ADSB_EXCHANGE_API_KEY;

  if (!apiKey) {
    throw new Error('ADSB_EXCHANGE_API_KEY environment variable is not set');
  }

  const url = `https://${RAPIDAPI_HOST}/v2/lat/${IRAN_CENTER.lat}/lon/${IRAN_CENTER.lon}/dist/${ADSB_RADIUS_NM}/`;

  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
  });

  if (res.status === 429) {
    throw new RateLimitError('ADS-B Exchange rate limit exceeded');
  }

  if (!res.ok) {
    throw new Error(`ADS-B Exchange API error: ${res.status}`);
  }

  const data = (await res.json()) as AdsbResponse;
  const aircraft = data.ac ?? [];

  const flights = aircraft
    .map(normalizeAircraft)
    .filter((f): f is FlightEntity => f !== null);

  console.log(`[adsb-exchange] fetched ${flights.length} flights in ${Date.now() - start}ms`);
  return flights;
}
