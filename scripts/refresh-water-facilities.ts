#!/usr/bin/env node
/**
 * Phase 27.3.1 R-04 — manual refresh script for the committed water
 * facilities snapshot (`src/data/water-facilities.json`).
 *
 * Runs the full server-side fetch pipeline (Overpass → classify → compound
 * gate → enrichment → basin stress) and writes the resulting pre-enriched
 * WaterFacility[] as a committed JSON snapshot. The runtime route reads
 * this file as the cold-start floor (tier 3: Redis → devFileCache →
 * snapshot → Overpass) so Overpass is NEVER on a synchronous user-request
 * path in production (R-07 invariant).
 *
 * Usage:  npm run refresh:water
 *
 * Intended cadence: run when you want fresh data. Commit the diff for
 * review before merging. NOT run as part of CI — Overpass rate limits
 * make a fresh refresh take ~45–90 seconds.
 *
 * Phase 27.3.1 Plan 10 (G1 follow-up): the `labelUnnamedFacilities`
 * reverse-geocoding step has been REMOVED from this pipeline. Post-G1
 * `hasName(tags)` tightening rejects all wikidata-only unnamed
 * facilities into the `no_name` bucket, so nothing reaches the generic
 * "Dam"/"Reservoir" fallback the labeler was designed to rewrite. This
 * cuts ~2–3 minutes from the previous refresh runtime (139 unnamed
 * facilities × ~1.05s Nominatim rate limit). The non-Latin-only-name
 * edge case is handled client-side by GENERIC_TYPE_RE in
 * src/lib/waterLabel.ts.
 *
 * Model: mirrors scripts/extract-rivers.ts / scripts/extract-aqueduct-basins.ts.
 */

import { writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchWaterFacilities } from '../server/adapters/overpass-water.js';

import type { WaterFacility } from '../server/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/data');
const OUT_PATH = resolve(OUT_DIR, 'water-facilities.json');
const TMP_PATH = resolve(OUT_DIR, 'water-facilities.json.tmp');

/**
 * Round lat/lng to 6 decimal places (~0.1m precision). OSM data is inherently
 * ~1m accurate, so 6 decimals is plenty and keeps committed-diff noise small.
 */
function roundCoord(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function main(): Promise<void> {
  console.log('=== Refreshing water facility snapshot ===');
  console.log(`Output: ${OUT_PATH}`);
  console.log('');

  const start = Date.now();

  console.log('[1/2] Fetching from Overpass (3 queries: dams, reservoirs, desalination)...');
  const { facilities: raw, stats } = await fetchWaterFacilities();
  const fetchMs = Date.now() - start;
  console.log(`  → ${raw.length} facilities admitted (Overpass fetch: ${fetchMs}ms)`);
  for (const [type, count] of Object.entries(stats.filteredCounts)) {
    const rawCount = stats.rawCounts[type] ?? 0;
    console.log(`    ${type}: ${count} kept / ${rawCount} raw`);
  }

  // R-04 security guard (T-27.3.1.05-01 mitigation): drop the operator field
  // if it happens to contain an email pattern. OSM's operator tag is normally
  // a company name, but untrusted user input means we can't rule out edge
  // cases — the snapshot is committed to a public repo, so scrubbing is
  // cheap insurance.
  //
  // Phase 27.3.1 Plan 10: the intermediate `labelUnnamedFacilities` step has
  // been removed; the scrub now operates directly on `raw`.
  let scrubbed = 0;
  for (const f of raw) {
    if (f.operator && /@[\w.]+/.test(f.operator)) {
      console.warn(`  ⚠ dropping operator with email pattern on ${f.id}: ${f.operator}`);
      delete f.operator;
      scrubbed++;
    }
  }
  if (scrubbed > 0) console.log(`  → scrubbed ${scrubbed} operator field(s) with email patterns`);

  console.log('');
  console.log('[2/2] Writing snapshot...');

  // Sort facilities by id for deterministic diff order. Round lat/lng to
  // 6dp to keep diff noise low. Use a generated-at timestamp consistent
  // across the top level and the stats sub-object.
  const generatedAt = new Date().toISOString();
  const sortedFacilities: WaterFacility[] = [...raw]
    .map((f) => ({ ...f, lat: roundCoord(f.lat), lng: roundCoord(f.lng) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const snapshot = {
    generatedAt,
    facilities: sortedFacilities,
    stats: {
      ...stats,
      source: 'snapshot' as const,
      generatedAt,
    },
  };

  // Ensure output directory exists (defensive — src/data is usually present)
  mkdirSync(OUT_DIR, { recursive: true });

  // Atomic write: write to tempfile then rename. If the process crashes
  // mid-write, the old file stays intact instead of leaving a partial JSON.
  // Pretty-print (2-space) so PR diffs are reviewable.
  const jsonStr = JSON.stringify(snapshot, null, 2) + '\n';
  writeFileSync(TMP_PATH, jsonStr);
  renameSync(TMP_PATH, OUT_PATH);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);
  console.log(
    `  → ${sortedFacilities.length} facilities written (${sizeKB} KB, ${elapsed}s total)`,
  );
  console.log('');

  // Per-type summary matches the observability we already expose in
  // DevApiStatus (R-08 D-28 byCountry + D-31 byTypeRejections).
  console.log('=== Summary ===');
  console.log(`generatedAt: ${generatedAt}`);
  console.log(`Facility counts (kept / raw):`);
  for (const [type, count] of Object.entries(stats.filteredCounts)) {
    const rawCount = stats.rawCounts[type] ?? 0;
    console.log(`  ${type.padEnd(15)}: ${count} / ${rawCount}`);
  }
  console.log('');
  console.log('Rejection buckets (by type):');
  for (const [type, buckets] of Object.entries(stats.byTypeRejections)) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(buckets)) if (v > 0) parts.push(`${k}=${v}`);
    console.log(`  ${type.padEnd(15)}: ${parts.join(' ') || '(none)'}`);
  }
  console.log('');
  console.log(`Top countries (admitted):`);
  const countryTotals: [string, number][] = Object.entries(stats.byCountry)
    .map(([country, byType]) => {
      const total = Object.values(byType).reduce((s, n) => s + n, 0);
      return [country, total] as [string, number];
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [country, total] of countryTotals) {
    const byType = stats.byCountry[country] ?? {};
    const breakdown = Object.entries(byType)
      .map(([t, n]) => `${t}=${n}`)
      .join(' ');
    console.log(`  ${country.padEnd(25)} (${total}): ${breakdown}`);
  }
  console.log('');
  console.log(`Overpass health:`);
  for (const record of stats.overpass) {
    const outcome = record.ok ? 'OK  ' : 'FAIL';
    console.log(
      `  ${record.facilityType.padEnd(15)} ${record.mirror.padEnd(8)} ` +
        `status=${record.status} ${record.durationMs}ms attempts=${record.attempts} ${outcome}`,
    );
  }
  console.log('');
  console.log(`✓ Snapshot written to ${OUT_PATH}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the diff: git diff src/data/water-facilities.json | head -100');
  console.log('  2. Spot-check facility counts and sample labels');
  console.log('  3. Commit: git add src/data/water-facilities.json && git commit -m ...');
}

main().catch((err) => {
  console.error(err);
  // Best-effort tempfile cleanup on failure
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch {
    /* swallow */
  }
  process.exit(1);
});
