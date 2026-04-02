/** Nominatim reverse geocode adapter with coordinate quantization */

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
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<GeocodedLocation> {
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

    const city =
      data.address?.city ?? data.address?.town ?? data.address?.village;
    const country = data.address?.country;
    const display = data.display_name;

    return { city, country, display };
  } catch {
    return { display: 'Unknown location' };
  }
}
