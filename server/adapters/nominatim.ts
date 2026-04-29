/** Nominatim geocode adapter — reverse (existing) + forward (Phase 27) */

import { ME_VIEWBOX, ME_COUNTRY_CODES } from '../lib/meBounds.js';

// Phase 27.4.4 Plan 02 dev-pass: hard timeout on Nominatim fetches.
//
// Without this, a TCP connection that's accepted but never returns hangs the
// fetch indefinitely — and since geocodeEnrichedEventsV3 awaits resolveLocation
// per-event without a per-event try/catch, one bad request blocks the entire
// 392-event loop. Observed live in dev: 5 of 392 geocoded in 17 minutes, then
// fully frozen. 10s is generous (Nominatim direct curl returns in <1s) but
// covers the worst case where the public Nominatim instance is throttling.
//
// Env override: NOMINATIM_FETCH_TIMEOUT_MS (defaults to 10000).
const NOMINATIM_FETCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.NOMINATIM_FETCH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
})();

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOMINATIM_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface ForwardGeocodedLocation {
  lat: number;
  lng: number;
  displayName: string;
  type: string; // Nominatim place type (city, town, village, etc.)
  /**
   * Phase 27.4 D-04: Nominatim returns an `address` object when the query
   * includes `addressdetails=1`. Used by the 2-pass verify reranker (Plan 05)
   * to show candidate country/admin1/city to the LLM.
   */
  address?: {
    country_code?: string;
    country?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    [key: string]: string | undefined;
  };
}

/**
 * Forward-geocode a place name via OpenStreetMap Nominatim Search API.
 *
 * Returns the top result as { lat, lng, displayName, type }, or null on failure.
 * Rate limit: callers must enforce 1 req/s (Nominatim usage policy).
 */
export async function forwardGeocode(
  placeName: string,
  countryCode?: string,
): Promise<ForwardGeocodedLocation | null> {
  const params = new URLSearchParams({
    q: placeName,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'en',
  });
  if (countryCode) params.set('countrycodes', countryCode);

  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'IranConflictMonitor/1.0 (personal project)' },
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
      type: data[0].type ?? 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Phase 27.4 D-02/D-03/D-04: Middle-East-constrained forward geocode with
 * structured POI support + top-N candidate mode.
 *
 * Every call is constrained by D-02 (countrycodes + viewbox from meBounds.ts)
 * unless explicitly overridden by opts.countrycodes / opts.viewbox.
 * Hard-coded defaults prevent resolver-bypass attacks — viewbox and
 * countrycodes must be server-owned, not user-configurable (threat model).
 *
 * Returns an array (length 0..limit) — never a single object — so the
 * 2-pass verify path (Plan 05) can pass top-5 candidates to the LLM.
 *
 * amenity and q are mutually exclusive per Nominatim API; when opts.amenity
 * is present, placeName is ignored.
 */
export async function forwardGeocodeConstrained(
  placeName: string,
  opts: {
    countrycodes?: string;
    viewbox?: readonly [number, number, number, number];
    bounded?: boolean;
    limit?: number;
    addressdetails?: boolean;
    amenity?: string;
  } = {},
): Promise<ForwardGeocodedLocation[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    'accept-language': 'en',
    limit: String(opts.limit ?? 1),
  });

  // amenity/q mutual exclusion (D-03).
  if (opts.amenity) {
    params.set('amenity', opts.amenity);
  } else {
    params.set('q', placeName);
  }

  // D-02 viewbox + countrycodes constraint (hard-coded defaults).
  params.set('countrycodes', opts.countrycodes ?? ME_COUNTRY_CODES);
  const viewbox = opts.viewbox ?? ME_VIEWBOX;
  params.set('viewbox', viewbox.join(','));
  if (opts.bounded ?? true) params.set('bounded', '1');

  if (opts.addressdetails) params.set('addressdetails', '1');

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'IranConflictMonitor/1.0 (personal project)' },
    });
    if (!res || !res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data.map((d) => {
      const dd = d as {
        lat?: string | number;
        lon?: string | number;
        display_name?: string;
        type?: string;
        address?: ForwardGeocodedLocation['address'];
      };
      return {
        lat: typeof dd.lat === 'string' ? parseFloat(dd.lat) : Number(dd.lat ?? 0),
        lng: typeof dd.lon === 'string' ? parseFloat(dd.lon) : Number(dd.lon ?? 0),
        displayName: dd.display_name ?? '',
        type: dd.type ?? 'unknown',
        ...(dd.address ? { address: dd.address } : {}),
      } satisfies ForwardGeocodedLocation;
    });
  } catch {
    return [];
  }
}

export interface GeocodedLocation {
  city?: string;
  country?: string;
  display?: string;
}

/**
 * Reverse-geocode a coordinate pair via OpenStreetMap Nominatim.
 *
 * Coordinates are quantized to 2 decimal places (~1km precision) before the
 * request, reducing unique cache keys upstream.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodedLocation> {
  const qLat = Math.round(lat * 100) / 100;
  const qLon = Math.round(lon * 100) / 100;

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${qLat}&lon=${qLon}&zoom=10&accept-language=en`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IranConflictMonitor/1.0 (personal project)',
      },
    });

    if (!res.ok) {
      return { display: 'Unknown location' };
    }

    const data = await res.json();

    const city = data.address?.city ?? data.address?.town ?? data.address?.village;
    const country = data.address?.country;
    const display = data.display_name;

    return { city, country, display };
  } catch {
    return { display: 'Unknown location' };
  }
}
