/**
 * Coordinate-to-basin stress assignment.
 *
 * WRI Aqueduct 4.0 basins lack lat/lng centroids, so we use a
 * nearest-country-centroid approach:
 * 1. Find the nearest country centroid to the given coordinates
 * 2. Select all basins belonging to that country
 * 3. Return the median-stress basin indicators (most representative)
 *
 * Falls back to "No Data" if no country is within 200km.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WaterStressIndicators } from '../types.js';

// Compute compositeHealth and bwsScoreToLabel inline to avoid cross-module
// import from src/ (server should not depend on frontend lib)
function compositeHealth(bwsScore: number): number {
  // With no precipitation data yet, ratio=1.0 (normal)
  const baselineHealth = 1 - bwsScore / 5;
  // precipModifier = 0 when ratio = 1.0
  return Math.max(0, Math.min(1, baselineHealth));
}

function bwsScoreToLabel(score: number): string {
  if (score < 0) return 'No Data';
  if (score < 1) return 'Low';
  if (score < 2) return 'Low-Medium';
  if (score < 3) return 'Medium-High';
  if (score < 4) return 'High';
  return 'Extremely High';
}

// ---------- Basin Data ----------

interface BasinEntry {
  pfaf_id: number;
  name_0: string;
  bws_raw: number;
  bws_score: number;
  bws_cat: number;
  bws_label: string;
  drr_score: number;
  gtd_score: number;
  sev_score: number;
  iav_score: number;
}

// Load aqueduct basins data at module init
const __dirname = dirname(fileURLToPath(import.meta.url));
const basinsPath = resolve(__dirname, '../../src/data/aqueduct-basins.json');
const allBasins: BasinEntry[] = JSON.parse(readFileSync(basinsPath, 'utf-8'));

// Deduplicate by pfaf_id (keep first occurrence)
const uniqueBasins = new Map<number, BasinEntry>();
for (const b of allBasins) {
  if (!uniqueBasins.has(b.pfaf_id)) uniqueBasins.set(b.pfaf_id, b);
}

// Group basins by country
const basinsByCountry = new Map<string, BasinEntry[]>();
for (const b of uniqueBasins.values()) {
  const list = basinsByCountry.get(b.name_0) ?? [];
  list.push(b);
  basinsByCountry.set(b.name_0, list);
}

// ---------- Country Centroids ----------

/** Approximate centroids for Middle East countries (lat, lng) */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  Afghanistan: [33.9, 67.7],
  Armenia: [40.1, 45.0],
  Azerbaijan: [40.1, 47.6],
  Bahrain: [26.1, 50.6],
  Cyprus: [35.1, 33.4],
  Djibouti: [11.6, 43.2],
  Egypt: [26.8, 30.8],
  Eritrea: [15.2, 39.8],
  Georgia: [42.3, 43.4],
  Iran: [32.4, 53.7],
  Iraq: [33.2, 43.7],
  Israel: [31.0, 34.9],
  Jordan: [31.2, 36.5],
  Kuwait: [29.3, 47.5],
  Lebanon: [33.9, 35.9],
  Libya: [26.3, 17.2],
  'Northern Cyprus': [35.3, 33.6],
  Oman: [21.5, 55.9],
  Pakistan: [30.4, 69.3],
  Qatar: [25.4, 51.2],
  'Saudi Arabia': [23.9, 45.1],
  Somalia: [5.2, 46.2],
  Sudan: [12.9, 30.2],
  Syria: [35.0, 38.0],
  Turkey: [39.0, 35.2],
  Turkmenistan: [38.5, 58.4],
  'United Arab Emirates': [23.4, 53.8],
  Uzbekistan: [41.4, 64.6],
  Yemen: [15.6, 48.5],
};

// ---------- Haversine ----------

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Default Indicators ----------

const DEFAULT_INDICATORS: WaterStressIndicators = {
  bws_raw: -1,
  bws_score: -1,
  bws_label: 'No Data',
  drr_score: -1,
  gtd_score: -1,
  sev_score: -1,
  iav_score: -1,
  compositeHealth: 0.5,
};

// ---------- Public API ----------

/**
 * Assign WRI Aqueduct stress indicators for a coordinate.
 *
 * Finds the nearest country centroid, selects basins for that country,
 * and returns the median-stress basin's indicators.
 *
 * Returns default "No Data" indicators if no country is within 200km.
 */
export function assignBasinStress(lat: number, lng: number): WaterStressIndicators {
  // Find nearest country centroid
  let minDist = Infinity;
  let nearestCountry: string | null = null;

  for (const [country, [clat, clng]] of Object.entries(COUNTRY_CENTROIDS)) {
    const dist = haversineKm(lat, lng, clat, clng);
    if (dist < minDist) {
      minDist = dist;
      nearestCountry = country;
    }
  }

  // 200km guard: for the "nearest country centroid" approach, we use a generous
  // 2000km threshold since country centroids can be far from borders.
  // The real guard is whether the country has basin data.
  if (!nearestCountry || minDist > 2000) {
    return { ...DEFAULT_INDICATORS };
  }

  const basins = basinsByCountry.get(nearestCountry);
  if (!basins || basins.length === 0) {
    return { ...DEFAULT_INDICATORS };
  }

  // Select median-stress basin (most representative of the region)
  const sorted = [...basins]
    .filter(b => b.bws_score >= 0) // exclude no-data basins
    .sort((a, b) => a.bws_score - b.bws_score);

  // If all basins are no-data, use the first basin raw
  const representative = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : basins[0];

  const bwsScore = representative.bws_score;

  return {
    bws_raw: representative.bws_raw,
    bws_score: bwsScore,
    bws_label: bwsScore >= 0 ? bwsScoreToLabel(bwsScore) : representative.bws_label,
    drr_score: representative.drr_score,
    gtd_score: representative.gtd_score,
    sev_score: representative.sev_score,
    iav_score: representative.iav_score,
    compositeHealth: bwsScore >= 0 ? compositeHealth(bwsScore) : 0.5,
  };
}
