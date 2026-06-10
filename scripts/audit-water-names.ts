#!/usr/bin/env tsx
// CLI audit for non-Latin water-facility names (WATER-LATIN-01, Phase 38 Plan 04).
//
// A READ-ONLY audit that quantifies HOW MANY water facilities are dropped by the
// overpass-water Latin-label admission gate (overpass-water.ts:836 →
// `hasLatinLabel`) purely because their only name is non-Latin (Arabic / Persian
// / Hebrew), and buckets the rejected names per Unicode script. The counts
// VALIDATE the romanize() reset-bar quality (Task 1) before the adapter lock-in
// (Task 2 injects romanize BEFORE this gate so these facilities stop dropping).
//
// Per D-07 the audit is strictly non-destructive — it reads `water:facilities:v4`
// via cacheGetSafe only and NEVER writes back (no cacheSet / redis.set).
//
// Usage:
//   npm run audit:water                              # read live water:facilities:v4
//   npx tsx scripts/audit-water-names.ts --snapshot s.json   # read a captured snapshot
//   npx tsx scripts/audit-water-names.ts -o water-names-audit.json
//   npx tsx scripts/audit-water-names.ts --help

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasLatinLabel } from '../server/adapters/overpass-water.js';

import type { WaterFacilityType } from '../server/types.js';

// ----------------------------------------------------------------------------
// Pure logic (exported for unit testing — no Redis I/O lives here).
// ----------------------------------------------------------------------------

export type NameScript = 'latin' | 'arabic' | 'hebrew';

/** The minimal facility shape the audit needs (tags + classification). */
export interface NameAuditFacility {
  osmId: number;
  facilityType: WaterFacilityType;
  tags: Record<string, string>;
}

// Unicode block ranges (RESEARCH WATER-LATIN-01). Expressed with \u escapes
// (NOT literal RTL glyphs) so the source carries no irregular-whitespace / RTL
// control marks (eslint no-irregular-whitespace):
//   Arabic (incl. Persian)  U+0600-U+06FF, supplement U+0750-U+077F,
//                           extended-A U+08A0-U+08FF, presentation forms
//                           U+FB50-U+FDFF / U+FE70-U+FEFF
//   Hebrew                  U+0590-U+05FF, presentation forms U+FB1D-U+FB4F
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Classify a name string by its dominant non-Latin Unicode block. Hebrew is
 * checked first (disjoint range), then Arabic; anything with no recognized
 * non-Latin block is `latin` (includes digit-only / empty names).
 */
export function classifyScript(name: string): NameScript {
  if (HEBREW_RE.test(name)) return 'hebrew';
  if (ARABIC_RE.test(name)) return 'arabic';
  return 'latin';
}

export interface NameAuditReport {
  generatedAt: string;
  total: number;
  /** Facilities the Latin-label gate would REJECT (non-desal, no Latin name). */
  gateRejectedCount: number;
  /** Count of REJECTED facilities bucketed by the script of their `name` tag. */
  byScript: Record<NameScript, number>;
  /** Up to N sample rejected names per script for eyeballing. */
  samples: Record<NameScript, string[]>;
}

const MAX_SAMPLES_PER_SCRIPT = 10;

/**
 * Assemble the per-script rejection report (pure — no I/O).
 *
 * A facility is "gate-rejected" when it is NOT desalination (desal is gate-exempt
 * per D-03) AND `hasLatinLabel(tags)` is false. Each rejected facility's `name`
 * tag is bucketed by Unicode script.
 */
export function buildNameAuditReport(facilities: NameAuditFacility[]): NameAuditReport {
  const byScript: Record<NameScript, number> = { latin: 0, arabic: 0, hebrew: 0 };
  const samples: Record<NameScript, string[]> = { latin: [], arabic: [], hebrew: [] };
  let gateRejectedCount = 0;

  for (const f of facilities) {
    // Desalination bypasses the Latin-label gate (D-03) — not a rejection.
    if (f.facilityType === 'desalination') continue;
    if (hasLatinLabel(f.tags)) continue;

    gateRejectedCount++;
    const name = f.tags['name'] ?? f.tags['name:en'] ?? f.tags['operator'] ?? '';
    const script = classifyScript(name);
    byScript[script]++;
    if (samples[script].length < MAX_SAMPLES_PER_SCRIPT && name) {
      samples[script].push(name);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    total: facilities.length,
    gateRejectedCount,
    byScript,
    samples,
  };
}

/** Human-readable summary printer (analog of audit-events.ts printSummary). */
export function printSummary(report: NameAuditReport): void {
  console.log('\n--- Water Facility Name Audit (WATER-LATIN-01) ---');
  console.log(`Generated:        ${report.generatedAt}`);
  console.log(`Total facilities: ${report.total}`);
  console.log(`Gate-rejected (non-Latin, non-desal): ${report.gateRejectedCount}`);
  console.log('\nRejected names by script:');
  console.log(`  arabic (incl. Persian): ${report.byScript.arabic}`);
  console.log(`  hebrew:                 ${report.byScript.hebrew}`);
  console.log(`  latin (unclassified):   ${report.byScript.latin}`);
  for (const script of ['arabic', 'hebrew'] as const) {
    if (report.samples[script].length > 0) {
      console.log(`\n  sample ${script} names:`);
      for (const n of report.samples[script]) console.log(`    ${n}`);
    }
  }
}

// ----------------------------------------------------------------------------
// CLI shell (I/O lives here; only runs when invoked directly, not on import).
// ----------------------------------------------------------------------------

interface CliArgs {
  help: boolean;
  outputPath: string;
  snapshotPath: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let help = false;
  let outputPath = 'water-names-audit.json';
  let snapshotPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    } else if (args[i] === '-o' || args[i] === '--output') {
      outputPath = args[i + 1] ?? outputPath;
      i++;
    } else if (args[i] === '--snapshot') {
      snapshotPath = args[i + 1] ?? null;
      i++;
    }
  }

  return { help, outputPath, snapshotPath };
}

const HELP_TEXT = `
audit-water-names — WATER-LATIN-01 non-Latin name audit (READ-ONLY, non-destructive)

Counts how many water facilities the Latin-label admission gate
(overpass-water.ts:836) drops because their only name is non-Latin, and buckets
the rejected names per Unicode script (Arabic incl. Persian / Hebrew). Sizes the
romanize() reset-bar validation before the Task-2 adapter lock-in.

Usage:
  tsx scripts/audit-water-names.ts [options]

Options:
  -o, --output <path>   Write the JSON report here (default water-names-audit.json)
  --snapshot <path>     Read facilities from a captured JSON snapshot
                        (an array of WaterFacility-like objects, or { facilities: [...] })
                        instead of live Redis
  -h, --help            Show this help

The audit NEVER writes to Redis (D-07).
`;

/**
 * The audit needs the RAW OSM tags to re-run hasLatinLabel. The live
 * water:facilities:v4 cache stores NORMALIZED WaterFacility objects (already
 * past the gate), so the live path reconstructs a best-effort tag bag from
 * label/operator. For a faithful pre-gate audit, pass a --snapshot of raw
 * Overpass elements ({ facilities: [{ osmId, facilityType, tags }] }).
 */
interface RawSnapshotEntry {
  osmId?: number;
  id?: string;
  facilityType: WaterFacilityType;
  tags?: Record<string, string>;
  label?: string;
  operator?: string;
}

function toAuditFacility(entry: RawSnapshotEntry): NameAuditFacility {
  const tags =
    entry.tags ??
    ({
      ...(entry.label ? { name: entry.label } : {}),
      ...(entry.operator ? { operator: entry.operator } : {}),
    } as Record<string, string>);
  return {
    osmId: entry.osmId ?? (entry.id ? parseInt(entry.id.replace(/\D/g, ''), 10) || 0 : 0),
    facilityType: entry.facilityType,
    tags,
  };
}

/** Read the live normalized corpus from Redis, degrading to empty on failure. */
async function loadFromRedis(): Promise<NameAuditFacility[]> {
  try {
    const { cacheGetSafe } = await import('../server/cache/redis.js');
    const res = await cacheGetSafe<RawSnapshotEntry[]>('water:facilities:v4', 0);
    return (res?.data ?? []).map(toAuditFacility);
  } catch (err) {
    console.error(
      'Live Redis unavailable — degrading to empty corpus. Pass --snapshot <file> to audit a capture.',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/** Read a captured snapshot file (array or { facilities: [...] }). */
function loadFromSnapshot(snapshotPath: string): NameAuditFacility[] {
  const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as
    | RawSnapshotEntry[]
    | { facilities?: RawSnapshotEntry[] };
  const entries = Array.isArray(raw) ? raw : (raw.facilities ?? []);
  return entries.map(toAuditFacility);
}

async function main(): Promise<void> {
  const { help, outputPath, snapshotPath } = parseArgs(process.argv);

  if (help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const facilities = snapshotPath ? loadFromSnapshot(snapshotPath) : await loadFromRedis();

  if (facilities.length === 0) {
    console.error(
      'No facilities in corpus (live Redis empty/unavailable or empty snapshot). ' +
        'Report will reflect an empty corpus. Note: the live cache stores POST-gate ' +
        'facilities, so use --snapshot of raw Overpass elements for a faithful pre-gate audit.',
    );
  }

  const report = buildNameAuditReport(facilities);

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.error(`Report written to ${path.resolve(outputPath)}`);

  printSummary(report);
  process.exit(0);
}

// Only run the CLI when executed directly (so test imports never trigger Redis I/O).
const isDirectRun =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
}
