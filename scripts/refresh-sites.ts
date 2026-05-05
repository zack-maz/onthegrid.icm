#!/usr/bin/env node
/**
 * Phase 27.3.1 R-05 — manual refresh script for the committed sites
 * snapshot (`src/data/sites.json`).
 *
 * Runs the full server-side fetch pipeline (`fetchSites()` → classify +
 * Turkey spatial filter + byCountry/byType tally + Overpass telemetry)
 * and writes the resulting pre-normalized SiteEntity[] as a committed
 * JSON snapshot. The runtime route reads this file as the cold-start
 * floor (tier 2: Redis → snapshot → Overpass refresh gate) so Overpass
 * is NEVER on a synchronous user-request path in production (R-07).
 *
 * Usage:  npm run refresh:sites
 *
 * Intended cadence: run when you want fresh data. Commit the diff for
 * review before merging. NOT run as part of CI — Overpass rate limits
 * make a fresh refresh take 30–60 seconds.
 *
 * Model: mirrors scripts/refresh-water-facilities.ts.
 */

import { writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchSites } from '../server/adapters/overpass.js';

import type { SiteEntity } from '../server/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/data');
const OUT_PATH = resolve(OUT_DIR, 'sites.json');
const TMP_PATH = resolve(OUT_DIR, 'sites.json.tmp');

/**
 * Round lat/lng to 6 decimal places (~0.1m precision). OSM data is inherently
 * ~1m accurate, so 6 decimals is plenty and keeps committed-diff noise small.
 * Matches refresh-water-facilities.ts exactly.
 */
function roundCoord(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function main(): Promise<void> {
  console.log('=== Refreshing sites snapshot ===');
  console.log(`Output: ${OUT_PATH}`);
  console.log('');

  const start = Date.now();

  console.log('[1/2] Fetching from Overpass (single query, 5 site types)...');
  const { sites, stats } = await fetchSites();
  const fetchMs = Date.now() - start;
  console.log(`  → ${sites.length} sites admitted (Overpass fetch: ${fetchMs}ms)`);
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`    ${type}: ${count}`);
  }
  console.log('');

  // R-05 security guard (T-27.3.1.07-01 mitigation): drop operator field if it
  // contains an email pattern. OSM's operator is normally a company name,
  // but untrusted input means we defensively scrub — the snapshot is committed
  // to a public repo. Same rationale as the water refresh script.
  let scrubbed = 0;
  for (const s of sites) {
    if (s.operator && /@[\w.]+/.test(s.operator)) {
      console.warn(`  ⚠ dropping operator with email pattern on ${s.id}: ${s.operator}`);
      delete s.operator;
      scrubbed++;
    }
  }
  if (scrubbed > 0) console.log(`  → scrubbed ${scrubbed} operator field(s) with email patterns`);

  console.log('[2/2] Writing snapshot...');

  // Sort sites by id for deterministic diff order. Round lat/lng to 6dp to
  // keep diff noise low. Use one generatedAt consistent across top level +
  // stats.generatedAt.
  const generatedAt = new Date().toISOString();
  const sortedSites: SiteEntity[] = [...sites]
    .map((s) => ({ ...s, lat: roundCoord(s.lat), lng: roundCoord(s.lng) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const snapshot = {
    generatedAt,
    sites: sortedSites,
    stats: {
      ...stats,
      source: 'snapshot' as const,
      generatedAt,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });

  // Atomic write: tempfile + rename. If the process crashes mid-write, the
  // old file stays intact instead of leaving a partial JSON. Pretty-print
  // (2-space) + EOF newline so PR diffs are reviewable.
  const jsonStr = JSON.stringify(snapshot, null, 2) + '\n';
  writeFileSync(TMP_PATH, jsonStr);
  renameSync(TMP_PATH, OUT_PATH);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);
  console.log(`  → ${sortedSites.length} sites written (${sizeKB} KB, ${elapsed}s total)`);
  console.log('');

  // Per-type + byCountry + Overpass-health summary (matches water refresh output).
  console.log('=== Summary ===');
  console.log(`generatedAt: ${generatedAt}`);
  console.log(`rawCount: ${stats.rawCount}`);
  console.log(`filteredCount: ${stats.filteredCount}`);
  console.log(`By type:`);
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`  ${type.padEnd(10)}: ${count}`);
  }
  console.log('');
  console.log(`Rejection buckets:`);
  for (const [k, v] of Object.entries(stats.rejections)) {
    if (v > 0) console.log(`  ${k.padEnd(18)}: ${v}`);
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
      `  ${record.facilityType.padEnd(10)} ${record.mirror.padEnd(8)} ` +
        `status=${record.status} ${record.durationMs}ms attempts=${record.attempts} ${outcome}`,
    );
  }
  console.log('');
  console.log(`✓ Snapshot written to ${OUT_PATH}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the diff: git diff src/data/sites.json | head -50');
  console.log('  2. Spot-check site counts per type');
  console.log('  3. Commit: git add src/data/sites.json && git commit -m ...');
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
