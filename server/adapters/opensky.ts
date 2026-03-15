import { config } from '../config.js';
import type { FlightEntity, BoundingBox } from '../types.js';

const OPENSKY_TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_API_URL = 'https://opensky-network.org/api';

// Token cache (25-minute TTL, safe margin under 30-minute expiry)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.opensky.clientId,
    client_secret: config.opensky.clientSecret,
  });

  const res = await fetch(OPENSKY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`OpenSky OAuth2 token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 25 * 60 * 1000, // 25 minutes
  };

  return cachedToken.token;
}

// State vector index mapping per OpenSky API docs:
// [0]=icao24, [1]=callsign, [2]=origin_country, [5]=longitude, [6]=latitude,
// [7]=baro_altitude, [8]=on_ground, [9]=velocity, [10]=true_track, [11]=vertical_rate
function normalizeFlightState(state: unknown[]): FlightEntity | null {
  const lat = state[6] as number | null;
  const lng = state[5] as number | null;

  // Filter out entries with no position (can't render on map)
  if (lat == null || lng == null) return null;

  const icao24 = state[0] as string;
  const callsign = typeof state[1] === 'string' ? state[1].trim() : '';

  return {
    id: `flight-${icao24}`,
    type: 'flight',
    lat,
    lng,
    timestamp: Date.now(),
    label: callsign || icao24,
    data: {
      icao24,
      callsign: callsign || icao24,
      originCountry: (state[2] as string) ?? '',
      velocity: (state[9] as number | null) ?? null,
      heading: (state[10] as number | null) ?? null,
      altitude: (state[7] as number | null) ?? null,
      onGround: (state[8] as boolean) ?? false,
      verticalRate: (state[11] as number | null) ?? null,
    },
  };
}

export async function fetchFlights(bbox: BoundingBox): Promise<FlightEntity[]> {
  const start = Date.now();
  const token = await getOAuthToken();

  const url = `${OPENSKY_API_URL}/states/all?lamin=${bbox.south}&lomin=${bbox.west}&lamax=${bbox.north}&lomax=${bbox.east}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`OpenSky API request failed: ${res.status}`);
  }

  const data = (await res.json()) as { time: number; states: unknown[][] | null };
  const states = data.states ?? [];

  const flights = states
    .map(normalizeFlightState)
    .filter((f): f is FlightEntity => f !== null);

  console.log(`[opensky] fetched ${flights.length} flights in ${Date.now() - start}ms`);
  return flights;
}
