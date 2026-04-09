/** Nominatim geocode adapter — reverse (existing) + forward (Phase 27) */

export interface ForwardGeocodedLocation {
  lat: number;
  lng: number;
  displayName: string;
  type: string; // Nominatim place type (city, town, village, etc.)
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
    const res = await fetch(url, {
      headers: { 'User-Agent': 'IranConflictMonitor/1.0 (personal project)' },
    });
    if (!res.ok) return null;
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
