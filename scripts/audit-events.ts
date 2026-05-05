#!/usr/bin/env tsx
// CLI audit dump script for GDELT event pipeline
// Usage:
//   npx tsx scripts/audit-events.ts              # Dump cached events from Redis
//   npx tsx scripts/audit-events.ts --fresh       # Backfill from WAR_START and dump all events
//   npx tsx scripts/audit-events.ts --fresh -o audit.json --sample-rate 4

import fs from 'node:fs';
import path from 'node:path';

import type { AuditRecord } from '../server/lib/eventAudit.js';

// WAR_START: Feb 28, 2026
const WAR_START = Date.UTC(2026, 1, 28);

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let fresh = false;
  let outputPath = 'audit-events.json';
  let sampleRate = 8;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fresh') {
      fresh = true;
    } else if (args[i] === '-o' || args[i] === '--output') {
      outputPath = args[i + 1] ?? outputPath;
      i++;
    } else if (args[i] === '--sample-rate') {
      sampleRate = parseInt(args[i + 1], 10) || sampleRate;
      i++;
    }
  }

  return { fresh, outputPath, sampleRate };
}

function printSummary(records: AuditRecord[]) {
  const accepted = records.filter((r) => r.status === 'accepted');
  const rejected = records.filter((r) => r.status === 'rejected');

  // Count rejection reasons
  const reasonCounts: Record<string, number> = {};
  for (const r of rejected) {
    const reason = r.pipelineTrace.rejectionReason ?? 'unknown';
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }

  console.log('\n--- Audit Summary ---');
  console.log(`Total records:  ${records.length}`);
  console.log(`Accepted:       ${accepted.length}`);
  console.log(`Rejected:       ${rejected.length}`);

  if (Object.keys(reasonCounts).length > 0) {
    console.log('\nRejection breakdown:');
    const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted) {
      console.log(`  ${reason}: ${count}`);
    }
  }
}

async function runCachedMode(outputPath: string) {
  // Dynamic import to avoid loading Redis at parse time
  const { cacheGet } = await import('../server/cache/redis.js');
  type CachedEvent = { id: string; [key: string]: unknown };

  console.error('Fetching cached events from Redis (events:gdelt)...');

  const cached = await cacheGet<CachedEvent[]>('events:gdelt', 0);
  if (!cached || !cached.data || cached.data.length === 0) {
    console.error('No cached events found. Try --fresh to backfill from WAR_START.');
    process.exit(1);
  }

  console.error(`Found ${cached.data.length} cached events (accepted only).`);

  // Wrap cached events in minimal AuditRecord format
  const records: AuditRecord[] = cached.data.map((event: CachedEvent) => ({
    id: event.id,
    status: 'accepted' as const,
    event,
    pipelineTrace: {
      phaseA: {
        rootCode: true,
        cameoExclusion: true,
        middleEast: true,
        geoValid: true,
        minSources: true,
        actorCountry: true,
      },
      phaseB: {
        originalType: event.type,
        reclassified: false,
        geoPrecision: event.data?.geoPrecision ?? 'precise',
        confidenceSubScores: {
          mediaCoverage: 0,
          sourceDiversity: 0,
          actorSpecificity: 0,
          geoPrecisionSignal: 0,
          goldsteinConsistency: 0,
          cameoSpecificity: 0,
        },
        finalConfidence: event.data?.confidence ?? 0,
        passedThreshold: true,
      },
    },
    rawGdeltColumns: {},
  }));

  // Pretty-print for cached mode (smaller dataset)
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
  console.error(`Written to ${path.resolve(outputPath)}`);

  printSummary(records);
}

async function runFreshMode(outputPath: string, sampleRate: number) {
  const { backfillEventsWithTrace } = await import('../server/adapters/gdelt.js');

  const daysSinceWarStart = Math.ceil((Date.now() - WAR_START) / (24 * 60 * 60 * 1000));
  console.error(
    `Backfilling ${daysSinceWarStart} days since WAR_START (Feb 28, 2026) with ${sampleRate}/day sampling...`,
  );

  const records = await backfillEventsWithTrace(daysSinceWarStart, sampleRate);

  // Stream-friendly JSON write for large datasets
  const ws = fs.createWriteStream(outputPath);
  ws.write('[\n');
  for (let i = 0; i < records.length; i++) {
    ws.write(JSON.stringify(records[i]));
    if (i < records.length - 1) ws.write(',\n');
    else ws.write('\n');
  }
  ws.write(']\n');
  ws.end();

  await new Promise<void>((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  console.error(`Written to ${path.resolve(outputPath)}`);
  printSummary(records);
}

async function main() {
  const { fresh, outputPath, sampleRate } = parseArgs(process.argv);

  if (fresh) {
    await runFreshMode(outputPath, sampleRate);
  } else {
    await runCachedMode(outputPath);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
