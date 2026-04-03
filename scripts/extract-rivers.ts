/**
 * One-time script to extract Middle East river line features from Natural Earth 10m data.
 *
 * Downloads the Natural Earth 10m rivers+lake centerlines shapefile,
 * filters to 6 named conflict-relevant rivers, applies Douglas-Peucker
 * simplification, and writes a compact GeoJSON file.
 *
 * Usage: npx tsx scripts/extract-rivers.ts
 *
 * Output: src/data/rivers.json
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream, unlinkSync } from 'fs';
import { join } from 'path';
import { createUnzip } from 'zlib';
import { pipeline } from 'stream/promises';
import * as shapefile from 'shapefile';

// ---------- Types ----------

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// ---------- Config ----------

const TARGET_RIVERS = [
  'Tigris',
  'Euphrates',
  'Nile',
  'Jordan',
  'Karun',
  'Litani',
];

const NE_URLS = [
  'https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.zip',
  'https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/physical/ne_10m_rivers_lake_centerlines.zip',
];

const SIMPLIFY_EPSILON = 0.05; // degrees (~5km)

// Middle East bounding box for geographic validation
const ME_BBOX = { latMin: 0, latMax: 50, lngMin: 20, lngMax: 80 };

/**
 * Manual river data for rivers not in Natural Earth 10m dataset.
 * Coordinates from well-known geographic reference points.
 */
const MANUAL_RIVERS: GeoJSONFeature[] = [
  // Karun River — Iran's largest river, flows from Zagros Mountains to Shatt al-Arab
  {
    type: 'Feature',
    properties: { name: 'Karun', scalerank: 5 },
    geometry: {
      type: 'LineString',
      coordinates: [
        [50.07, 32.42],  // Source area in Zagros Mountains (Bakhtiari region)
        [50.15, 32.30],
        [50.28, 32.15],
        [50.35, 32.05],
        [50.42, 31.90],
        [50.50, 31.75],
        [50.55, 31.60],
        [50.45, 31.45],
        [50.35, 31.32],
        [50.15, 31.20],
        [49.95, 31.15],
        [49.75, 31.05],
        [49.55, 31.00],
        [49.35, 30.95],
        [49.15, 30.90],
        [48.95, 30.85],
        [48.80, 30.75],
        [48.70, 30.65],
        [48.60, 30.55],
        [48.50, 30.45],  // Ahvaz area
        [48.42, 30.40],
        [48.35, 30.38],
        [48.25, 30.42],
        [48.15, 30.48],
        [48.05, 30.55],
        [47.95, 30.60],
        [47.90, 30.65],
        [47.85, 30.80],
        [47.80, 30.90],  // Confluence with Shatt al-Arab
      ],
    },
  },
  // Litani River — Lebanon's longest river
  {
    type: 'Feature',
    properties: { name: 'Litani', scalerank: 7 },
    geometry: {
      type: 'LineString',
      coordinates: [
        [36.08, 34.00],  // Source near Baalbek in Bekaa Valley
        [36.05, 33.90],
        [36.00, 33.80],
        [35.95, 33.70],
        [35.90, 33.60],
        [35.85, 33.50],
        [35.80, 33.40],  // Central Bekaa
        [35.72, 33.35],
        [35.65, 33.32],
        [35.55, 33.30],
        [35.48, 33.32],  // Bend toward west
        [35.42, 33.35],
        [35.38, 33.30],
        [35.35, 33.25],
        [35.32, 33.20],  // Toward Mediterranean
      ],
    },
  },
];

// ---------- Utilities ----------

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function roundCoords(coords: unknown, decimals: number): unknown {
  if (typeof coords === 'number') return roundTo(coords, decimals);
  if (Array.isArray(coords)) return coords.map((c) => roundCoords(c, decimals));
  return coords;
}

/** Perpendicular distance from point to line segment */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lineLenSq = dx * dx + dy * dy;
  if (lineLenSq === 0) {
    const pdx = point[0] - lineStart[0];
    const pdy = point[1] - lineStart[1];
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }
  const t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lineLenSq;
  const tc = Math.max(0, Math.min(1, t));
  const projX = lineStart[0] + tc * dx;
  const projY = lineStart[1] + tc * dy;
  const pdx = point[0] - projX;
  const pdy = point[1] - projY;
  return Math.sqrt(pdx * pdx + pdy * pdy);
}

/** Ramer-Douglas-Peucker line simplification */
function simplifyLine(points: number[][], epsilon: number): number[][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0] as [number, number];
  const end = points[points.length - 1] as [number, number];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i] as [number, number], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyLine(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyLine(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

/** Simplify coordinates for LineString or MultiLineString */
function simplifyCoords(
  type: string,
  coords: unknown,
  epsilon: number,
): unknown {
  if (type === 'LineString') {
    return simplifyLine(coords as number[][], epsilon);
  }
  if (type === 'MultiLineString') {
    return (coords as number[][][]).map((line) => simplifyLine(line, epsilon));
  }
  return coords;
}

// ---------- Geographic Validation ----------

/** Check if a feature's coordinates fall within the Middle East bounding box */
function isInMiddleEast(feature: GeoJSONFeature): boolean {
  let hasCoordInBbox = false;
  function walk(c: unknown): void {
    if (hasCoordInBbox) return;
    if (typeof c === 'number') return;
    if (!Array.isArray(c)) return;
    if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const lng = c[0] as number;
      const lat = c[1] as number;
      if (lng >= ME_BBOX.lngMin && lng <= ME_BBOX.lngMax &&
          lat >= ME_BBOX.latMin && lat <= ME_BBOX.latMax) {
        hasCoordInBbox = true;
      }
      return;
    }
    for (const child of c) walk(child);
  }
  walk(feature.geometry.coordinates);
  return hasCoordInBbox;
}

// ---------- Download ----------

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'IranConflictMonitor/1.0 (academic-research)' },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('No response body');

  const fileStream = createWriteStream(dest);
  // @ts-expect-error Node ReadableStream -> Readable conversion
  await pipeline(res.body, fileStream);
  console.log(`Downloaded to: ${dest}`);
}

async function downloadAndExtractZip(urls: string[], tmpDir: string): Promise<string> {
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = join(tmpDir, 'rivers.zip');

  for (const url of urls) {
    try {
      await downloadFile(url, zipPath);
      return zipPath;
    } catch (err) {
      console.log(`Failed: ${(err as Error).message}`);
    }
  }

  throw new Error('All download URLs failed');
}

// ---------- ZIP Extraction ----------

async function extractShapefilesFromZip(zipPath: string, tmpDir: string): Promise<string> {
  // Use adm-zip for ZIP decompression (already installed in project)
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  let shpBaseName = '';
  for (const entry of entries) {
    const name = entry.entryName;
    if (name.endsWith('.shp') || name.endsWith('.dbf') || name.endsWith('.prj') || name.endsWith('.shx')) {
      const outPath = join(tmpDir, name.split('/').pop()!);
      zip.extractEntryTo(entry, tmpDir, false, true);
      if (name.endsWith('.shp')) {
        shpBaseName = outPath;
      }
    }
  }

  if (!shpBaseName) throw new Error('No .shp file found in ZIP');
  console.log(`Extracted shapefile: ${shpBaseName}`);
  return shpBaseName;
}

// ---------- Main ----------

async function main() {
  const outDir = join(process.cwd(), 'src', 'data');
  const tmpDir = join(process.cwd(), '.tmp-rivers');
  mkdirSync(outDir, { recursive: true });

  try {
    // Step 1: Download Natural Earth rivers shapefile
    console.log('=== Downloading Natural Earth 10m Rivers ===');
    const zipPath = await downloadAndExtractZip(NE_URLS, tmpDir);

    // Step 2: Extract shapefiles from ZIP
    console.log('\n=== Extracting Shapefiles ===');
    const shpPath = await extractShapefilesFromZip(zipPath, tmpDir);

    // Step 3: Parse shapefile to GeoJSON features
    console.log('\n=== Parsing Shapefile ===');
    const features: GeoJSONFeature[] = [];
    const source = await shapefile.open(shpPath);
    let result = await source.read();
    while (!result.done) {
      features.push(result.value as GeoJSONFeature);
      result = await source.read();
    }
    console.log(`Total features in shapefile: ${features.length}`);

    // Log all unique river names for debugging
    const allNames = new Set<string>();
    for (const f of features) {
      const name = (f.properties.name || f.properties.name_en || f.properties.NAME || '') as string;
      if (name) allNames.add(name);
    }
    console.log(`Unique named features: ${allNames.size}`);

    // Step 4: Filter to target rivers (with geographic validation)
    console.log('\n=== Filtering to Target Rivers ===');
    const matchedFeatures: GeoJSONFeature[] = [];
    const foundRivers = new Set<string>();

    for (const f of features) {
      const name = (f.properties.name || f.properties.name_en || f.properties.NAME || '') as string;
      if (!name) continue;

      const nameLower = name.toLowerCase().trim();
      for (const target of TARGET_RIVERS) {
        if (nameLower.includes(target.toLowerCase())) {
          // Geographic validation: ensure the feature is in the Middle East region
          // (prevents matching rivers with same name in other continents)
          if (!isInMiddleEast(f)) {
            console.log(`  Skipped: "${name.trim()}" (matched "${target}" but outside Middle East bbox)`);
            break;
          }
          matchedFeatures.push(f);
          foundRivers.add(target);
          console.log(`  Found: "${name.trim()}" (matched "${target}") - ${f.geometry.type}`);
          break;
        }
      }
    }

    // Add manual rivers for any that are missing from Natural Earth
    for (const manual of MANUAL_RIVERS) {
      const riverName = manual.properties.name as string;
      if (!foundRivers.has(riverName)) {
        console.log(`  Adding manual: "${riverName}" (not in Natural Earth 10m)`);
        matchedFeatures.push(manual);
        foundRivers.add(riverName);
      }
    }

    // Step 5: Merge features for the same river into MultiLineStrings if needed
    console.log('\n=== Merging Multi-Part Rivers ===');
    const riverMap = new Map<string, GeoJSONFeature[]>();
    for (const f of matchedFeatures) {
      const name = (f.properties.name || f.properties.name_en || '') as string;
      const matched = TARGET_RIVERS.find((t) =>
        name.toLowerCase().includes(t.toLowerCase()),
      );
      if (matched) {
        const existing = riverMap.get(matched) ?? [];
        existing.push(f);
        riverMap.set(matched, existing);
      }
    }

    const mergedFeatures: GeoJSONFeature[] = [];
    for (const [riverName, riverFeatures] of riverMap) {
      if (riverFeatures.length === 1) {
        // Single feature — keep as-is, normalize properties
        const f = riverFeatures[0];
        mergedFeatures.push({
          type: 'Feature',
          properties: {
            name: riverName,
            scalerank: (f.properties.scalerank ?? f.properties.SCALERANK ?? 3) as number,
          },
          geometry: f.geometry,
        });
      } else {
        // Multiple features — merge into MultiLineString
        const allLines: number[][] = [];
        let scalerank = 10;
        for (const f of riverFeatures) {
          const sr = (f.properties.scalerank ?? f.properties.SCALERANK ?? 3) as number;
          if (sr < scalerank) scalerank = sr;

          if (f.geometry.type === 'LineString') {
            allLines.push(f.geometry.coordinates as unknown as number[]);
          } else if (f.geometry.type === 'MultiLineString') {
            for (const line of f.geometry.coordinates as unknown as number[][]) {
              allLines.push(line);
            }
          }
        }
        mergedFeatures.push({
          type: 'Feature',
          properties: { name: riverName, scalerank },
          geometry: {
            type: 'MultiLineString',
            coordinates: allLines as unknown,
          },
        });
        console.log(`  ${riverName}: merged ${riverFeatures.length} features into MultiLineString`);
      }
    }

    // Step 6: Simplify and round coordinates
    console.log('\n=== Simplifying Geometry ===');
    for (const f of mergedFeatures) {
      const before = JSON.stringify(f.geometry.coordinates).length;
      f.geometry.coordinates = simplifyCoords(
        f.geometry.type,
        f.geometry.coordinates,
        SIMPLIFY_EPSILON,
      );
      f.geometry.coordinates = roundCoords(f.geometry.coordinates, 3);
      const after = JSON.stringify(f.geometry.coordinates).length;
      console.log(`  ${f.properties.name}: ${before} -> ${after} chars (${((1 - after / before) * 100).toFixed(0)}% reduction)`);
    }

    // Step 7: Write output
    const output: GeoJSONCollection = {
      type: 'FeatureCollection',
      features: mergedFeatures,
    };

    const outPath = join(outDir, 'rivers.json');
    const jsonStr = JSON.stringify(output);
    writeFileSync(outPath, jsonStr);

    const sizeKB = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);
    console.log(`\n=== Output ===`);
    console.log(`Rivers found: ${[...foundRivers].join(', ')}`);
    console.log(`Rivers missing: ${TARGET_RIVERS.filter((r) => !foundRivers.has(r)).join(', ') || 'none'}`);
    console.log(`Features: ${mergedFeatures.length}`);
    console.log(`File size: ${sizeKB} KB`);
    console.log(`Output: ${outPath}`);

    if (parseFloat(sizeKB) > 200) {
      console.warn(`\nWARNING: File size ${sizeKB} KB exceeds 200 KB target`);
    }

    // Check missing rivers
    const missing = TARGET_RIVERS.filter((r) => !foundRivers.has(r));
    if (missing.length > 0) {
      console.warn(`\nWARNING: Missing rivers: ${missing.join(', ')}`);
      console.log('These rivers may need alternate names or manual addition.');
    }
  } finally {
    // Cleanup temp directory
    try {
      const { rmSync } = await import('fs');
      rmSync(tmpDir, { recursive: true, force: true });
      console.log('\nCleaned up temp files.');
    } catch {
      console.log('\nNote: temp directory cleanup failed (non-critical).');
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
