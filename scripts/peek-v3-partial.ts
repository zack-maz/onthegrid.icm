#!/usr/bin/env node
/**
 * Phase 27.4.4 Plan 02 dev-pass scratch helper. Reads the `events:llm:v3:partial`
 * cache (LLMCachePayload envelope written per-batch by the v3 extractor) and
 * projects per-event {precision, provenance, location, reasoning} so we can
 * review extraction quality WHILE the batches are still running.
 *
 * The terminal `events:llm:v3` cache is only written at run end, so the
 * /api/events/llm-status `recentEvents` field stays empty mid-run. This script
 * fills the gap by reading the partial cache directly.
 *
 * Usage:
 *   node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/peek-v3-partial.ts
 *
 * Output: per-event row + bucket summary + per-provenance stats.
 *
 * Safe to delete after Plan 02 dev-pass closes.
 */
import { redis } from '../server/cache/redis.js';

interface PartialEvent {
  schemaVersion?: string;
  groupKey?: string;
  location?: {
    country: string | null;
    admin1: string | null;
    city: string | null;
    neighborhood: string | null;
    landmark: string | null;
    confidence: number;
  } | null;
  type?: string;
  confidence?: number;
  reasoning?: string;
  severity?: string;
  summary?: string;
  casualties?: { killed: number | null; injured: number | null; unknown: boolean };
  sourceCount?: number;
  weaponType?: string | null;
  targetType?: string | null;
}

interface PartialEnvelope {
  events?: PartialEvent[];
  progress?: string; // 'N/M'
  complete?: boolean;
  generatedAt?: number;
}

// Mirrors derivePrecision() from server/lib/llmSchema.ts. Computed here so we
// can review precision distribution from the partial cache (which holds raw
// LLM hierarchies — no derivedPrecision field, that's added post-resolver).
function derivePrecision(
  loc: PartialEvent['location'],
): 'exact' | 'neighborhood' | 'city' | 'region' {
  if (!loc) return 'region';
  if (loc.landmark !== null) return 'exact';
  if (loc.neighborhood !== null) return 'neighborhood';
  if (loc.city !== null) return 'city';
  return 'region';
}

function summarizeHierarchy(loc: PartialEvent['location']): string {
  if (!loc) return '(none)';
  return (
    [loc.landmark, loc.neighborhood, loc.city, loc.admin1, loc.country]
      .filter((x): x is string => Boolean(x))
      .join(' / ') || '(empty hierarchy)'
  );
}

async function main(): Promise<void> {
  const cached = await redis.get<unknown>('events:llm:v3:partial');
  if (!cached) {
    console.log('events:llm:v3:partial is empty — extraction has not flushed any batches yet.');
    return;
  }

  // Cache wrapper stores {data, fetchedAt} — unwrap if needed.
  const inner = (cached as { data?: PartialEnvelope })?.data ?? (cached as PartialEnvelope);
  const events = inner?.events ?? [];
  const progress = inner?.progress ?? '?/?';
  const complete = inner?.complete ?? false;
  const generatedAt = inner?.generatedAt ?? 0;
  const tsIso = generatedAt ? new Date(generatedAt).toISOString() : '?';

  console.log(
    `partial cache: ${events.length} events; progress=${progress}; complete=${complete}; generatedAt=${tsIso}\n`,
  );

  if (events.length === 0) {
    console.log('No events extracted yet (batch 0 in flight).');
    return;
  }

  // Per-event rows. Precision derived inline from hierarchy (same logic as
  // server-side derivePrecision); provenance/coords come post-resolver and
  // are not in the partial cache, so we omit those columns.
  console.log('=== Per-event extraction (last 30) ===\n');
  for (const e of events.slice(-30)) {
    const prec = derivePrecision(e.location);
    const conf = (e.location?.confidence ?? 0).toFixed(2);
    const evConf = (e.confidence ?? 0).toFixed(2);
    const type = (e.type ?? '?').padEnd(9);
    const sev = (e.severity ?? '?').padEnd(8);
    const hier = summarizeHierarchy(e.location);
    console.log(
      `[${prec.padEnd(13)}] type=${type} sev=${sev} locConf=${conf} evConf=${evConf}  ${hier}`,
    );
    if (e.reasoning) console.log(`     ↪ "${e.reasoning.slice(0, 160)}"`);
    console.log('');
  }

  // Aggregates
  const precCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const sevCounts: Record<string, number> = {};
  let lowConfCount = 0;
  for (const e of events) {
    const prec = derivePrecision(e.location);
    precCounts[prec] = (precCounts[prec] ?? 0) + 1;
    const t = e.type ?? 'unknown';
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    const s = e.severity ?? 'unknown';
    sevCounts[s] = (sevCounts[s] ?? 0) + 1;
    if ((e.location?.confidence ?? 1) < 0.5) lowConfCount++;
  }

  console.log('=== Precision distribution (derived from LLM hierarchies) ===');
  for (const [k, v] of Object.entries(precCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((v / events.length) * 100).toFixed(1);
    console.log(`  ${k.padEnd(15)} ${String(v).padStart(4)}  ${pct}%`);
  }

  console.log('\n=== Type distribution ===');
  for (const [k, v] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((v / events.length) * 100).toFixed(1);
    console.log(`  ${k.padEnd(15)} ${String(v).padStart(4)}  ${pct}%`);
  }

  console.log('\n=== Severity distribution ===');
  for (const [k, v] of Object.entries(sevCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((v / events.length) * 100).toFixed(1);
    console.log(`  ${k.padEnd(15)} ${String(v).padStart(4)}  ${pct}%`);
  }

  console.log(`\nLow-confidence (<0.5) location: ${lowConfCount} / ${events.length}`);
  console.log('\nNote: provenance + geocoded coords land in events:llm:v3 (terminal) at run end —');
  console.log('re-run after stage=idle to see the post-resolver picture.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
