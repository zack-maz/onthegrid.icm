#!/usr/bin/env node
/**
 * Per-event eval diagnostic. Pure read — does NOT write Redis, does NOT
 * call updateProgress, does NOT trip the D-17 eval-drop trigger.
 *
 * Mirrors runEval()'s resolver-only path so distances match the harness
 * exactly, but logs per-event {distance, provenance, displayName,
 * hierarchy summary} so we can see which provenance branches under-
 * perform and which events miss.
 *
 * Usage: npm run eval:detail
 */
import { loadGroundTruth } from '../server/lib/llmEvalHarness.js';
import { resolveLocation, haversineKm } from '../server/lib/llmResolver.js';
import type { GeocodeProvenance } from '../server/lib/llmSchema.js';

interface EventRow {
  id: string;
  description: string;
  distanceKm: number;
  provenance: GeocodeProvenance | 'ERROR';
  displayName: string;
  truthPrecision: string;
  hierarchy: string;
  error?: string;
}

function summarizeHierarchy(h: {
  country: string | null;
  admin1: string | null;
  city: string | null;
  neighborhood: string | null;
  landmark: string | null;
}): string {
  return [h.landmark, h.neighborhood, h.city, h.admin1, h.country]
    .filter((x): x is string => Boolean(x))
    .join(' / ');
}

function bucket(km: number): string {
  if (km <= 5) return '≤5km';
  if (km <= 20) return '5-20km';
  if (km <= 100) return '20-100km';
  return '>100km';
}

async function main(): Promise<void> {
  const gt = loadGroundTruth();
  if (!gt) {
    console.error('ground-truth file missing or invalid');
    process.exit(1);
  }

  const rows: EventRow[] = [];
  for (const ev of gt.events) {
    try {
      const resolved = await resolveLocation(ev.hierarchy, {
        centroidLat: ev.truth.lat,
        centroidLng: ev.truth.lng,
      });
      rows.push({
        id: ev.id,
        description: ev.description.slice(0, 80),
        distanceKm: haversineKm(resolved.lat, resolved.lng, ev.truth.lat, ev.truth.lng),
        provenance: resolved.provenance,
        displayName: resolved.displayName,
        truthPrecision: ev.truth.precision,
        hierarchy: summarizeHierarchy(ev.hierarchy),
      });
    } catch (err) {
      rows.push({
        id: ev.id,
        description: ev.description.slice(0, 80),
        distanceKm: Number.POSITIVE_INFINITY,
        provenance: 'ERROR',
        displayName: '',
        truthPrecision: ev.truth.precision,
        hierarchy: summarizeHierarchy(ev.hierarchy),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  rows.sort((a, b) => b.distanceKm - a.distanceKm);

  // Bucket counts
  const buckets = { '≤5km': 0, '5-20km': 0, '20-100km': 0, '>100km': 0, ERROR: 0 };
  for (const r of rows) {
    if (r.provenance === 'ERROR') buckets.ERROR++;
    else buckets[bucket(r.distanceKm) as keyof typeof buckets]++;
  }

  // Per-provenance stats
  const provStats = new Map<string, { count: number; sumKm: number; maxKm: number }>();
  for (const r of rows) {
    const key = r.provenance;
    const cur = provStats.get(key) ?? { count: 0, sumKm: 0, maxKm: 0 };
    cur.count++;
    if (Number.isFinite(r.distanceKm)) {
      cur.sumKm += r.distanceKm;
      cur.maxKm = Math.max(cur.maxKm, r.distanceKm);
    }
    provStats.set(key, cur);
  }

  console.log('\n=== Per-event distances (sorted: worst → best) ===\n');
  for (const r of rows) {
    const dist = r.provenance === 'ERROR' ? 'ERROR' : `${r.distanceKm.toFixed(2)}km`.padStart(10);
    const prov = String(r.provenance).padEnd(30);
    console.log(`${r.id}  ${dist}  ${prov}  ${r.hierarchy}`);
    console.log(`         ↪ resolved: ${r.displayName || r.error || '(no displayName)'}`);
    console.log(`         ↪ truth.precision: ${r.truthPrecision}  |  desc: ${r.description}`);
    console.log('');
  }

  console.log('\n=== Bucket summary ===\n');
  console.log(`≤5km     : ${buckets['≤5km']} / ${rows.length}`);
  console.log(`5-20km   : ${buckets['5-20km']} / ${rows.length}`);
  console.log(`20-100km : ${buckets['20-100km']} / ${rows.length}`);
  console.log(`>100km   : ${buckets['>100km']} / ${rows.length}`);
  console.log(`ERROR    : ${buckets.ERROR} / ${rows.length}`);

  console.log('\n=== Per-provenance stats ===\n');
  console.log('provenance                          count   avg km    max km');
  console.log('───────────────────────────────────────────────────────────────');
  for (const [prov, s] of [...provStats.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const avg = s.count > 0 ? (s.sumKm / s.count).toFixed(2) : 'n/a';
    const max = s.maxKm.toFixed(2);
    console.log(
      `${prov.padEnd(36)}${String(s.count).padStart(5)}   ${avg.padStart(7)}   ${max.padStart(7)}`,
    );
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
