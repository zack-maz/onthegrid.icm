/**
 * Open-Meteo precipitation adapter.
 *
 * Fetches 30-day precipitation totals and computes anomaly ratios
 * for water facility locations. Batches requests to stay under
 * Open-Meteo API limits (100 locations per request).
 */

import { log } from '../lib/logger.js';

export interface PrecipitationData {
  lat: number;
  lng: number;
  last30DaysMm: number;
  anomalyRatio: number;
  updatedAt: number;
}

/** Approximate regional monthly precipitation normals (mm) */
const REGIONAL_NORMALS_MM: Record<string, number> = {
  arid: 20,    // Arabian Peninsula, central Iran, Sahara
  fertile: 50, // Fertile Crescent, coastal areas, Turkey
};

/**
 * Estimate the regional monthly normal precipitation for a coordinate.
 * Fertile Crescent: lat 30-40, lng 35-50 (Iraq, Syria, SE Turkey, Lebanon)
 * Everything else: arid default (20mm/month).
 */
function estimateNormalMm(lat: number, lng: number): number {
  if (lat >= 30 && lat <= 40 && lng >= 35 && lng <= 50) {
    return REGIONAL_NORMALS_MM.fertile;
  }
  return REGIONAL_NORMALS_MM.arid;
}

const BATCH_SIZE = 100;
const TIMEOUT_MS = 30_000;

interface OpenMeteoDailyResponse {
  daily: {
    time: string[];
    precipitation_sum: (number | null)[];
  };
}

/**
 * Fetch 30-day precipitation data for a list of locations.
 *
 * Batches into groups of 100 to stay under Open-Meteo API limits.
 * Returns empty array on failure (graceful degradation).
 */
export async function fetchPrecipitation(
  locations: { lat: number; lng: number }[],
): Promise<PrecipitationData[]> {
  if (locations.length === 0) return [];

  try {
    const results: PrecipitationData[] = [];

    // Split into batches of BATCH_SIZE
    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
      const batch = locations.slice(i, i + BATCH_SIZE);
      const lats = batch.map(l => l.lat.toFixed(2)).join(',');
      const lngs = batch.map(l => l.lng.toFixed(2)).join(',');

      const url =
        `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${lats}&longitude=${lngs}&` +
        `daily=precipitation_sum&past_days=30&forecast_days=0&timezone=UTC`;

      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!res.ok) {
          log({ level: 'warn', message: `[open-meteo-precip] Batch ${Math.floor(i / BATCH_SIZE)} returned ${res.status}, skipping` });
          continue;
        }

        const json = await res.json();

        // Open-Meteo returns array for multi-location, single object for 1 location
        const responses: OpenMeteoDailyResponse[] = Array.isArray(json) ? json : [json];

        for (let j = 0; j < responses.length; j++) {
          const loc = batch[j];
          const data = responses[j];
          if (!data?.daily?.precipitation_sum) continue;

          const total = data.daily.precipitation_sum.reduce(
            (sum: number, v: number | null) => sum + (v ?? 0),
            0,
          );

          const normalMm = estimateNormalMm(loc.lat, loc.lng);
          const anomalyRatio = normalMm > 0 ? total / normalMm : 1.0;

          results.push({
            lat: loc.lat,
            lng: loc.lng,
            last30DaysMm: Math.round(total * 10) / 10, // 1 decimal
            anomalyRatio: Math.round(anomalyRatio * 100) / 100, // 2 decimals
            updatedAt: Date.now(),
          });
        }
      } catch (batchErr) {
        log({ level: 'warn', message: `[open-meteo-precip] Batch ${Math.floor(i / BATCH_SIZE)} failed: ${(batchErr as Error).message}, skipping` });
        continue;
      }
    }

    log({ level: 'info', message: `[open-meteo-precip] Fetched precipitation for ${results.length} locations` });
    return results;
  } catch (err) {
    log({ level: 'warn', message: `[open-meteo-precip] Failed: ${(err as Error).message}` });
    return [];
  }
}
